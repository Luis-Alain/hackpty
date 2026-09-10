import { AppState } from 'react-native';
import { Worklet } from 'react-native-bare-kit';
import b4a from 'b4a';

type Binding = { endpoint: string; certificateFingerprint: string; hyperswarmPublicKey?: string };
type NativeRoutes = {
  requireTunnel?: (endpoint: string, pin: string) => number;
  registerTunnel?: (endpoint: string, pin: string, port: number, ticket: number) => void;
  clearTunnel?: () => void;
  useLocalNetwork?: (endpoint: string, pin: string) => void;
};
const bindings = new Map<string, Binding>();
let epoch = 0;
let sessionEpoch = 0;
let selectedBinding = "";
let active: { worklet: Worklet; binding: Binding } | null = null;
let routeApi: NativeRoutes | null = null;
let sequence: Promise<unknown> = Promise.resolve();

function key(endpoint: string) { return endpoint.replace(/\/$/, ''); }

/** Called for a validated QR and for restored SecureStore credentials. Does not send data. */
export function configureHyperswarm(binding: Binding) {
  if (binding.hyperswarmPublicKey !== undefined && !/^[a-f0-9]{64}$/.test(binding.hyperswarmPublicKey))
    throw new Error('Invalid Hyperswarm peer key. Scan a new PC pairing QR.');
  if (!bindings.has(key(binding.endpoint)) && bindings.size >= 64)
    throw new Error('Too many paired peers in this app session. Restart the app.');
  const identity = JSON.stringify([key(binding.endpoint), binding.certificateFingerprint, binding.hyperswarmPublicKey ?? null]);
  if (identity !== selectedBinding) { closeHyperswarm(); selectedBinding = identity; }
  bindings.set(key(binding.endpoint), { ...binding });
}

export function closeHyperswarm() {
  sessionEpoch++;
  disposeTunnel();
}
function disposeTunnel() {
  epoch++;
  routeApi?.clearTunnel?.();
  const previous = active;
  active = null;
  // No application payload enters this IPC channel; terminating closes the TCP/Noise sockets.
  previous?.worklet.terminate();
}
AppState.addEventListener('change', state => { if (state !== 'active') closeHyperswarm(); });

async function ensureTunnel(binding: Binding, native: NativeRoutes) {
  if (AppState.currentState !== 'active') throw new Error('Open the app to connect to the paired PC.');
  if (!binding.hyperswarmPublicKey) {
    if (active) disposeTunnel();
    native.useLocalNetwork?.(binding.endpoint, binding.certificateFingerprint);
    return;
  }
  if (!native.requireTunnel || !native.registerTunnel || !native.clearTunnel)
    throw new Error('This app build does not support Hyperswarm. Update the Android app.');
  if (active?.binding.endpoint === binding.endpoint
      && active.binding.certificateFingerprint === binding.certificateFingerprint
      && active.binding.hyperswarmPublicKey === binding.hyperswarmPublicKey) return;
  disposeTunnel();
  routeApi = native;
  const generation = epoch;
  // Mark before worklet creation, so failures never silently send over the LAN.
  const ticket = native.requireTunnel(binding.endpoint, binding.certificateFingerprint);
  const worklet = new Worklet();
  active = { worklet, binding };
  try {
    const port = await new Promise<number>((resolve, reject) => {
      let response = '';
      const timer = setTimeout(() => finish(new Error('Hyperswarm setup timed out. Retry the connection.')), 15000);
      function finish(error?: Error, port?: number) {
        clearTimeout(timer);
        worklet.IPC.removeListener('data', onData);
        worklet.IPC.removeListener('error', onError);
        worklet.IPC.removeListener('close', onClose);
        if (error) reject(error); else resolve(port!);
      }
      function onError() { finish(new Error('Hyperswarm connection could not start.')); }
      function onClose() { finish(new Error('Hyperswarm connection closed. Retry while the app is open.')); }
      function onData(chunk: unknown) {
        if (!(chunk instanceof Uint8Array)) { finish(new Error('Invalid Hyperswarm control response.')); return; }
        response += b4a.toString(chunk);
        if (response.length > 2048) { finish(new Error('Invalid Hyperswarm setup response.')); return; }
        const end = response.indexOf('\n');
        if (end < 0) return;
        try {
          const result = JSON.parse(response.slice(0, end));
          if (result.ready !== true || !Number.isInteger(result.port) || result.port < 1024 || result.port > 65535) throw new Error();
          finish(undefined, result.port);
        } catch { finish(new Error('Hyperswarm connection could not start.')); }
      }
      worklet.IPC.on('data', onData);
      worklet.IPC.on('error', onError);
      worklet.IPC.on('close', onClose);
      try {
        // Generated from the checked-in worker source by scripts/bundle-hyperswarm.cjs.
        const bundle = require('../p2p/worker.bundle.js');
        worklet.start('psyrec-hyperswarm.bundle', bundle);
        worklet.IPC.write(b4a.from(JSON.stringify({ type: 'start', publicKey: binding.hyperswarmPublicKey }) + '\n'));
      } catch { finish(new Error('Hyperswarm bundle is unavailable in this build.')); }
    });
    if (generation !== epoch || AppState.currentState !== 'active') throw new Error('Hyperswarm setup interrupted. Retry while the app is open.');
    native.registerTunnel(binding.endpoint, binding.certificateFingerprint, port, ticket);
    worklet.IPC.on('error', () => { if (active?.worklet === worklet) closeHyperswarm(); });
    worklet.IPC.on('close', () => { if (active?.worklet === worklet) closeHyperswarm(); });
  } catch (error) {
    if (active?.worklet === worklet) closeHyperswarm();
    throw error;
  }
}

/** Preserve the native methods and signatures; only network calls acquire the selected tunnel. */
export function withHyperswarm<T extends NativeRoutes>(native: T): T {
  routeApi = native;
  const wrapped = Object.create(native);
  for (const method of ['pair', 'send', 'verifyPending', 'syncEvidence', 'historySync']) {
    const invoke = (native as any)[method];
    if (!invoke) continue;
    wrapped[method] = (...args: any[]) => {
      const binding = bindings.get(key(args[0]));
      // Capture the exact selected pairing when queued, rather than using a later QR.
      const selected = binding && { ...binding };
      const started = sessionEpoch;
      const run = sequence.catch(() => {}).then(async () => {
        if (started !== sessionEpoch || AppState.currentState !== 'active') throw new Error('Connection interrupted. Retry while the app is open.');
        if (!selected) throw new Error('Pairing transport is not initialized. Reopen the app or scan the PC QR.');
        await ensureTunnel(selected, native);
        if (started !== sessionEpoch || AppState.currentState !== 'active') throw new Error('Connection selection changed. Retry the operation.');
        return invoke(...args);
      });
      sequence = run.catch(() => {});
      return run;
    };
  }
  return wrapped;
}

