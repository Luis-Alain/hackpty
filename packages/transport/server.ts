import { createServer, type Server } from 'node:https';
import { X509Certificate, createHash } from 'node:crypto';
import { HyperswarmTunnel, type HyperswarmTunnelOptions } from './hyperswarm-tunnel.js';
import selfsigned from 'selfsigned';
import { MAX_IMAGE_BYTES, PsyRecService } from '../core/service.js';
import { MobileHistoryAccessError } from '../core/mobile-history.js';

export class CaptureServer {
  server: Server | null = null;
  fingerprint = '';
  private p2p: HyperswarmTunnel | null = null;
  private p2pKey: string | null = null;
  private p2pStarting: Promise<string> | null = null;
  private transportEpoch = 0;
  attempts = new Map<string, { since: number; count: number }>();
  constructor(private service: PsyRecService, private directory: string) {}
  async start(host: string, port = 9443) {
    const generation = this.transportEpoch;
    if (this.server) throw new Error('Stop the current receiver before starting another.');
    let identity = this.service.getTransportIdentity();
    if (!identity) {
      const pems = selfsigned.generate([{ name: 'commonName', value: 'PsyRec local capture' }], { keySize: 2048, days: 30, algorithm: 'sha256' });
      identity = { key: pems.private, cert: pems.cert };
      await this.service.saveTransportIdentity(identity);
    }
    const cert = new X509Certificate(identity.cert);
    if (Date.parse(cert.validTo) <= Date.now()) throw new Error('Capture certificate expired. Rotate the encrypted vault identity and pair again.');
    this.fingerprint = cert.fingerprint256.replaceAll(':', '').toLowerCase();
    const server = createServer({ key: identity.key, cert: identity.cert, minVersion: 'TLSv1.2', maxHeaderSize: 4096 }, async (req, res) => {
      res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
      const reply = (status, body) => { if (!res.destroyed) { res.writeHead(status); res.end(JSON.stringify(body)); } };
      try {
        if (req.method !== 'POST' || !['/pair', '/captures', '/phone-evidence', '/history'].includes(req.url ?? '')) return reply(404, { error: 'Unknown endpoint.' });
        if (!this.service.vault.state) return reply(423, { error: 'PC vault is locked. Unlock and retry.' });
        if (req.headers['content-type'] !== 'application/json') return reply(415, { error: 'JSON required.' });
        const peer = req.socket.remoteAddress ?? 'unknown';
        if (req.url === '/pair') {
          const a = this.attempts.get(peer);
          const next = !a || Date.now() - a.since > 60000 ? { since: Date.now(), count: 1 } : { ...a, count: a.count + 1 };
          this.attempts.set(peer, next);
          if (this.attempts.size > 256) this.attempts.delete(this.attempts.keys().next().value!);
          if (next.count > 10) return reply(429, { error: 'Too many pairing attempts. Try again in one minute.' });
        }
        const limit = req.url === '/pair' || req.url === '/history' ? 2048 : req.url === '/phone-evidence' ? 128 * 1024 : Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 4096;
        let size = 0; const parts: Buffer[] = [];
        for await (const chunk of req) {
          size += chunk.length;
          if (size > limit) { reply(413, { error: req.url === '/history' ? 'History request exceeds 2 KB.' : 'Capture exceeds 8 MB.' }); req.destroy(); return; }
          parts.push(chunk);
        }
        const body = JSON.parse(Buffer.concat(parts).toString('utf8'));
        if (req.url === '/history') {
          if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).sort().join(',') !== 'deviceId,encounterId') return reply(400, { error: 'History request is invalid.' });
          return reply(200, this.service.mobileHistory({ deviceId: body.deviceId, encounterId: body.encounterId, token: req.headers.authorization?.replace(/^Bearer /, '') }));
        }
        if (req.url === '/pair') return reply(200, await this.service.pair(body.secret, body.deviceName));
        if (req.url === '/phone-evidence') return reply(200, await this.service.receivePhoneEvidence({ deviceId: body.deviceId, token: req.headers.authorization?.replace(/^Bearer /, ''), transferId: body.transferId, encounterId: body.encounterId, evidence: body.evidence }));
        if (typeof body.image !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.image)) return reply(400, { error: 'Invalid capture encoding.' });
        const receipt = await this.service.receiveCapture({ deviceId: body.deviceId, token: req.headers.authorization?.replace(/^Bearer /, ''), transferId: body.transferId, encounterId: body.encounterId, bytes: Buffer.from(body.image, 'base64') });
        reply(200, receipt);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Request rejected.';
        if (req.url === '/history' && !this.service.vault.state) return reply(423, { error: 'PC vault is locked. Unlock and retry.' });
        if (error instanceof MobileHistoryAccessError) return reply(403, { error: message });
        reply(400, { error: message.startsWith('Unexpected') ? 'Invalid request.' : message });
      }
    });
    server.requestTimeout = 30000; server.headersTimeout = 10000; server.timeout = 30000;
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, host, () => { server.off('error', reject); resolve(); }); });
    if (generation !== this.transportEpoch || !this.service.vault.state) {
      server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
      throw new Error('Vault session changed during receiver startup.');
    }
    this.server = server;
    const address = server.address();
    return { endpoint: `https://${host}:${typeof address === 'object' ? address!.port : port}`, certificateFingerprint: this.fingerprint };
  }
  /** Start only when the user selects P2P; local TLS tests and offline mode never join a DHT. */
  async startHyperswarm(options: Pick<HyperswarmTunnelOptions, 'bootstrap' | 'dht'> = {}): Promise<string> {
    if (this.p2pKey) return this.p2pKey;
    if (this.p2pStarting) return this.p2pStarting;
    const listener = this.server;
    const address = listener?.address();
    const identity = this.service.getTransportIdentity();
    if (!listener || !address || typeof address === 'string' || !identity || !this.service.vault.state)
      throw new Error('Unlock the vault and start its receiver before Hyperswarm pairing.');
    const generation = this.transportEpoch;
    const tunnel = new HyperswarmTunnel();
    this.p2p = tunnel;
    const seed = createHash('sha256').update('psyrec-hyperswarm-tls-identity-v1\0').update(identity.key).digest();
    this.p2pStarting = (async () => {
      try {
        const result = await tunnel.start({ targetHost: address.address, targetPort: address.port, seed, ...options });
        if (generation !== this.transportEpoch || !this.service.vault.state || this.server !== listener) {
          await tunnel.stop(); throw new Error('Vault session changed during Hyperswarm setup.');
        }
        this.p2pKey = result.publicKey;
        return result.publicKey;
      } catch {
        await tunnel.stop();
        if (this.p2p === tunnel) this.p2p = null;
        throw new Error('Hyperswarm is unavailable. Retry, or explicitly choose Local Wi-Fi for offline transfer.');
      } finally { seed.fill(0); }
    })();
    try { return await this.p2pStarting; } finally { this.p2pStarting = null; }
  }
  async stop() {
    this.transportEpoch++;
    const p2p = this.p2p, server = this.server;
    this.p2p = null; this.p2pKey = null; this.server = null;
    // Stop accepting application requests immediately, even if Noise shutdown fails.
    const tlsClosed = server ? new Promise<void>(resolve => {
      server.closeAllConnections(); server.close(() => resolve());
    }) : Promise.resolve();
    const results = await Promise.allSettled([tlsClosed, Promise.resolve().then(() => p2p?.stop())]);
    const failure = results.find(result => result.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
  }
}
