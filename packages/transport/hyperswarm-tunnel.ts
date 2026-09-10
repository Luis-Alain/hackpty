import { connect, type Socket } from 'node:net';
import { networkInterfaces } from 'node:os';
import Hyperswarm from 'hyperswarm';

export interface HyperswarmTunnelOptions {
  /** Must be loopback or an IP currently assigned to this computer. TLS authorization stays inside. */
  targetHost: string;
  targetPort: number;
  /** Derive with domain separation from the encrypted vault identity; never publish this seed. */
  seed: Uint8Array;
  maxConnections?: number;
  idleTimeoutMs?: number;
  connectionTimeoutMs?: number;
  /** Limits slow trickle clients as well as idle clients. */
  maxConnectionLifetimeMs?: number;
  /** Override only for an explicitly configured private DHT or isolated tests. */
  bootstrap?: string[];
  /** Ownership transfers to this tunnel: stop() destroys the injected DHT too. */
  dht?: any;
}

interface TunnelConnection { close(): void; closed: Promise<void> }

/** Opaque TLS-over-Noise transport. No payload inspection, storage, or receipt generation. */
export class HyperswarmTunnel {
  private swarm: any = null;
  private stopping: Promise<void> | null = null;
  private connections = new Set<TunnelConnection>();
  get activeConnections() { return this.connections.size; }

  async start(options: HyperswarmTunnelOptions): Promise<{ publicKey: string }> {
    if (this.swarm || this.stopping) throw new Error('Stop the current Hyperswarm tunnel before starting another.');
    const localAddresses = Object.values(networkInterfaces()).flat().filter(Boolean).map(address => address!.address);
    if (!['127.0.0.1', '::1', ...localAddresses].includes(options.targetHost)) throw new Error('Hyperswarm target must be an IP assigned to this computer.');
    if (!Number.isInteger(options.targetPort) || options.targetPort < 1 || options.targetPort > 65535) throw new Error('Invalid Hyperswarm target port.');
    if (!(options.seed instanceof Uint8Array) || options.seed.byteLength !== 32) throw new Error('Hyperswarm seed must contain 32 bytes.');
    const maxConnections = options.maxConnections ?? 4;
    const idleTimeoutMs = options.idleTimeoutMs ?? 30_000;
    const connectionTimeoutMs = options.connectionTimeoutMs ?? 10_000;
    const lifetimeMs = options.maxConnectionLifetimeMs ?? 120_000;
    for (const [label, value, maximum] of [
      ['connection limit', maxConnections, 32], ['idle timeout', idleTimeoutMs, 300_000],
      ['connection timeout', connectionTimeoutMs, 60_000], ['connection lifetime', lifetimeMs, 600_000]
    ] as const) {
      if (!Number.isInteger(value) || value < 1 || value > maximum) throw new Error(`Invalid Hyperswarm ${label}.`);
    }
    const seed = Buffer.from(options.seed);
    let swarm: any;
    try {
      swarm = new Hyperswarm({ seed, bootstrap: options.bootstrap, dht: options.dht,
        maxPeers: maxConnections, maxClientConnections: 0, maxServerConnections: maxConnections,
        firewall: () => this.connections.size >= maxConnections });
    } finally { seed.fill(0); }
    this.swarm = swarm;
    // Lifecycle errors must never become uncaught events or reveal transport details in logs.
    const onError = () => { void this.stop().catch(() => {}); };
    swarm.on('error', onError);
    swarm.dht.on('error', onError);
    swarm.on('connection', (remote: any) => {
      remote.on('error', () => {});
      if (this.swarm !== swarm || this.stopping || this.connections.size >= maxConnections) { remote.destroy(); return; }
      this.forward(remote, options.targetHost, options.targetPort, idleTimeoutMs, connectionTimeoutMs, lifetimeMs);
    });
    let timer: ReturnType<typeof setTimeout>;
    try {
      await Promise.race([swarm.listen(), new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Hyperswarm listen timed out.')), connectionTimeoutMs);
      })]);
      if (this.swarm !== swarm || this.stopping) throw new Error('Hyperswarm tunnel stopped during startup.');
      return { publicKey: Buffer.from(swarm.keyPair.publicKey).toString('hex') };
    } catch (error) {
      await this.stop();
      throw error;
    } finally { clearTimeout(timer!); }
  }

  private forward(remote: any, host: string, port: number, idleMs: number, connectMs: number, lifetimeMs: number) {
    const local: Socket = connect({ host, port });
    let closed = false;
    let resolveClosed: () => void;
    let remaining = 2;
    const onClosed = () => { if (--remaining === 0) { this.connections.delete(entry); resolveClosed(); } };
    const entry: TunnelConnection = { close: () => {
      if (closed) return;
      closed = true;
      clearTimeout(connectTimer); clearTimeout(lifetimeTimer);
      local.setTimeout(0);
      // streamx has no unpipe(); destroying both ends cancels both pipes.
      remote.destroy(); local.destroy();
    }, closed: new Promise<void>(resolve => { resolveClosed = resolve; }) };
    const connectTimer = setTimeout(entry.close, connectMs);
    const lifetimeTimer = setTimeout(entry.close, lifetimeMs);
    connectTimer.unref(); lifetimeTimer.unref();
    this.connections.add(entry);
    remote.once('close', () => { entry.close(); onClosed(); });
    local.once('close', () => { entry.close(); onClosed(); });
    remote.on('error', entry.close); local.on('error', entry.close);
    local.setTimeout(idleMs, entry.close);
    local.once('connect', () => {
      clearTimeout(connectTimer);
      if (closed) return;
      local.setNoDelay(true);
      // Both implementations honor writable backpressure. TLS stays end-to-end with the receiver.
      remote.pipe(local); local.pipe(remote);
    });
  }

  async stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    const swarm = this.swarm;
    if (!swarm) return;
    this.swarm = null;
    const connections = [...this.connections];
    for (const connection of connections) connection.close();
    this.stopping = (async () => {
      try {
        await Promise.all([swarm.destroy({ force: true }), ...connections.map(connection => connection.closed)]);
      } finally {
        // The caller retains its own seed; only our Noise secret material is cleared here.
        swarm.keyPair.secretKey.fill(0);
      }
    })();
    try { await this.stopping; } finally { this.stopping = null; }
  }
}



