import type { VaultState } from './types.js';
import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';

export class Vault {
  path: string;
  key: Buffer | null;
  salt: Buffer | null;
  state: VaultState | null;
  constructor(path: string) { this.path = path; this.key = null; this.salt = null; this.state = null; }
  async exists() { try { await readFile(this.path); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } }
  async unlock(passphrase, create = false) {
    if (typeof passphrase !== 'string' || passphrase.length < 10 || passphrase.length > 256) throw new Error('Use a vault passphrase of 10–256 characters.');
    if (this.key) throw new Error('Lock the current vault first.');
    let envelope;
    try { envelope = JSON.parse(await readFile(this.path, 'utf8')); }
    catch (e) {
      if (e.code !== 'ENOENT' || !create) throw new Error(e.code === 'ENOENT' ? 'No vault exists yet. Choose Create vault.' : 'The vault could not be read.');
      this.salt = randomBytes(16);
      this.key = scryptSync(passphrase, this.salt, 32);
      this.state = { version: 1, patients: [], encounters: [], records: [], devices: [], transfers: [], runs: [] };
      try { await this.save(this.state); } catch (error) { this.lock(); throw error; }
      return this.state;
    }
    let key;
    try {
      if (envelope.version !== 1 || envelope.kdf !== 'scrypt' || envelope.cipher !== 'aes-256-gcm') throw new Error('version');
      const salt = Buffer.from(envelope.salt, 'base64');
      if (salt.length !== 16) throw new Error('salt');
      key = scryptSync(passphrase, salt, 32);
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
      decipher.setAAD(Buffer.from('psyrec-vault-v1'));
      decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
      const clear = Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()]);
      const state = JSON.parse(clear.toString('utf8')); clear.fill(0);
      if (state.version !== 1 || !Array.isArray(state.patients) || !Array.isArray(state.records) || !Array.isArray(state.encounters) || !Array.isArray(state.devices) || !Array.isArray(state.transfers) || (state.runs !== undefined && !Array.isArray(state.runs)) || (state.phoneEvidence !== undefined && !Array.isArray(state.phoneEvidence)) || (state.queryRuns !== undefined && !Array.isArray(state.queryRuns)) || (state.goldTranscriptions !== undefined && !Array.isArray(state.goldTranscriptions))) throw new Error('format');
      this.key = key; this.salt = salt; this.state = state;
      return state;
    } catch { key?.fill(0); throw new Error('Incorrect passphrase or damaged vault. No data was changed.'); }
  }
  async save(nextState: VaultState) {
    if (!this.key) throw new Error('Vault is locked.');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from('psyrec-vault-v1'));
    const clear = Buffer.from(JSON.stringify(nextState));
    const data = Buffer.concat([cipher.update(clear), cipher.final()]); clear.fill(0);
    const envelope = { version: 1, kdf: 'scrypt', cipher: 'aes-256-gcm', salt: this.salt.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const temporary = this.path + '.' + randomBytes(8).toString('hex') + '.tmp';
    try {
      const { open } = await import('node:fs/promises');
      const handle = await open(temporary, 'wx', 0o600);
      try { await handle.writeFile(JSON.stringify(envelope)); await handle.sync(); } finally { await handle.close(); }
      await rename(temporary, this.path);
      this.state = nextState;
    } finally { await rm(temporary, { force: true }); }
  }
  lock() { this.key?.fill(0); this.key = null; this.salt = null; this.state = null; }
}
