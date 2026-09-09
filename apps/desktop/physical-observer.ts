import type { BrowserWindow } from 'electron';
import type { PsyRecService } from '../../packages/core/service.js';

/** Diagnostic observations only. Never reviews, drafts, approves or changes a
 * clinical field. All recorded text remains inside the existing encrypted vault. */
export class PhysicalObserver {
  failed = false;
  constructor(private service: PsyRecService, private window: BrowserWindow) {}

  async input(value: unknown) {
    if (!value || typeof value !== 'object' || !this.service.vault.state) return;
    const event = value as Record<string, unknown>;
    const allowed = ['extract', 'reviewSource', 'confirmCorrection', 'cancelCorrection', 'draft', 'confirmApproval', 'approve', 'lock', 'patient', 'historyToggle', 'showSuperseded'];
    if (!allowed.includes(String(event.control)) || !['click', 'change'].includes(String(event.eventType)) || typeof event.trusted !== 'boolean' || typeof event.approvalChecked !== 'boolean') return;
    for (const name of ['sourceText', 'draftText', 'patientId', 'encounterId']) if (typeof event[name] !== 'string' || String(event[name]).length > 30000) return;
    await this.service.recordPhysicalObservation('renderer-input', event);
    setTimeout(() => { void this.view().catch(() => { this.failed = true; }); }, 750);
  }

  async operation(method: string, result: unknown) {
    if (!this.service.vault.state || !['unlock', 'extract', 'reviewSource', 'generateDraft', 'approve'].includes(method)) return;
    await this.service.recordPhysicalObservation('operation-completed', { method, result });
    if (method === 'unlock' || method === 'approve') {
      // The IPC response must return before the renderer can refresh its view.
      setTimeout(() => { void this.view().catch(() => { this.failed = true; }); }, 750);
    }
  }

  async view() {
    if (!this.service.vault.state || this.window.isDestroyed()) return;
    const details = await this.window.webContents.executeJavaScript(`({
      patientId: document.getElementById('patient').value,
      encounterStatus: document.getElementById('encounterStatus').textContent,
      historyText: document.getElementById('historyRecords').textContent,
      historyVisible: !document.getElementById('history').hidden,
      approvedText: document.getElementById('draftText').value,
      approvedReadOnly: document.getElementById('draftText').readOnly
    })`);
    if (this.service.vault.state) {
      const records = this.service.state().records.filter(r => r.patientId === details.patientId && !r.supersededAt);
      await this.service.recordPhysicalObservation('renderer-view', { ...details, canonicalApprovedRecords: records.map(r => ({ id: r.id, encounterId: r.encounterId, text: r.text })) });
    }
  }

  async lockPurge() {
    if (!this.service.vault.state || this.window.isDestroyed()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
    const details = await this.window.webContents.executeJavaScript(`({
      workspaceHidden: document.getElementById('workspace').hidden,
      fields: ['sourceText','draftText','alias','passphrase'].every(id=>document.getElementById(id).value===''),
      content: ['patient','encounters','historyRecords','metrics','consequenceText','pairStatus','encounterTitle','encounterStatus'].every(id=>document.getElementById(id).textContent===''),
      images: ['sourceImage','pairQr'].every(id=>!document.getElementById(id).hasAttribute('src'))
    })`);
    if (this.service.vault.state) await this.service.recordPhysicalObservation('lock-renderer-purge', details);
  }
}
