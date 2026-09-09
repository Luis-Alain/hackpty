import { createServer, type Server } from 'node:https';
import { X509Certificate } from 'node:crypto';
import selfsigned from 'selfsigned';
import { MAX_IMAGE_BYTES, PsyRecService } from '../core/service.js';

export class CaptureServer {
  server: Server | null = null;
  fingerprint = '';
  attempts = new Map<string, { since: number; count: number }>();
  constructor(private service: PsyRecService, private directory: string) {}
  async start(host: string, port = 9443) {
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
        if (req.method !== 'POST' || !['/pair', '/captures'].includes(req.url ?? '')) return reply(404, { error: 'Unknown endpoint.' });
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
        const limit = req.url === '/pair' ? 2048 : Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 4096;
        let size = 0; const parts: Buffer[] = [];
        for await (const chunk of req) {
          size += chunk.length;
          if (size > limit) { reply(413, { error: 'Capture exceeds 8 MB.' }); req.destroy(); return; }
          parts.push(chunk);
        }
        const body = JSON.parse(Buffer.concat(parts).toString('utf8'));
        if (req.url === '/pair') return reply(200, await this.service.pair(body.secret, body.deviceName));
        if (typeof body.image !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.image)) return reply(400, { error: 'Invalid capture encoding.' });
        const receipt = await this.service.receiveCapture({ deviceId: body.deviceId, token: req.headers.authorization?.replace(/^Bearer /, ''), transferId: body.transferId, encounterId: body.encounterId, bytes: Buffer.from(body.image, 'base64') });
        reply(200, receipt);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Request rejected.';
        reply(400, { error: message.startsWith('Unexpected') ? 'Invalid request.' : message });
      }
    });
    server.requestTimeout = 30000; server.headersTimeout = 10000; server.timeout = 30000;
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, host, () => { server.off('error', reject); resolve(); }); });
    this.server = server;
    const address = server.address();
    return { endpoint: `https://${host}:${typeof address === 'object' ? address!.port : port}`, certificateFingerprint: this.fingerprint };
  }
  async stop() { const server = this.server; this.server = null; if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } }
}
