import type { BrowserWindow } from 'electron';
import type { PsyRecService } from '../../packages/core/service.js';

/** Diagnostic observations only. Never reviews, drafts, approves or changes a
 * clinical field. All recorded text remains inside the existing encrypted vault. */
export class PhysicalObserver {
  failed = false;
  private generation = 0;
  private stopping = false;
  private pending: Promise<void> = Promise.resolve();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private views = new Set<Promise<void>>();
  constructor(private service: PsyRecService, private window: BrowserWindow) {}

  async drain() { await this.pending; }

  async checkpoint() {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    const results = await Promise.allSettled([...this.views]);
    if (results.some(result => result.status === 'rejected')) this.failed = true;
    await this.view().catch(() => { this.failed = true; });
    await this.pending;
    return { generation: this.generation, failed: this.failed };
  }

  beginLock() {
    this.stopping = true;
    this.generation++;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }

  private record(event: string, details: Record<string, unknown>) {
    const job = this.pending.then(() => this.service.recordPhysicalObservation(event, details));
    this.pending = job.catch(() => { this.failed = true; });
    return job;
  }

  private scheduleView() {
    if (this.stopping) return;
    const generation = this.generation;
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      if (generation === this.generation) void this.view().catch(() => { this.failed = true; });
    }, 750);
    this.timers.add(timer);
  }

  async input(value: unknown) {
    if (!value || typeof value !== 'object' || !this.service.vault.state || this.stopping) return;
    const event = value as Record<string, unknown>;
    const allowed = ['attestPrintedSource', 'extract', 'reviewSource', 'confirmCorrection', 'cancelCorrection', 'draft', 'confirmApproval', 'approve', 'lock', 'patient', 'historyToggle', 'showSuperseded'];
    if (!allowed.includes(String(event.control)) || !['click', 'change'].includes(String(event.eventType)) || typeof event.trusted !== 'boolean' || typeof event.approvalChecked !== 'boolean') return;
    for (const name of ['sourceText', 'draftText', 'patientId', 'encounterId']) if (typeof event[name] !== 'string' || String(event[name]).length > 30000) return;
    if (event.control === 'attestPrintedSource') {
      const encounter = this.service.state().encounters.find(e => e.id === event.encounterId && e.patientId === event.patientId);
      if (!encounter?.capture) return;
      const binding = { patientId: encounter.patientId, encounterId: encounter.id, captureId: encounter.capture.id, sha256: encounter.capture.sha256 };
      await this.record('renderer-input', { ...event, ...binding });
      if (event.trusted === true) {
        await this.record('printed-source-attestation', {
          actor: 'human', method: 'physical-paper-observation', fixtureId: 'DEMO-001', sourceMedium: 'paper', observedAt: new Date().toISOString(), ...binding,
        });
      }
    } else await this.record('renderer-input', event);
    this.scheduleView();
  }

  async operation(method: string, result: unknown) {
    if (!this.service.vault.state || !['unlock', 'extract', 'reviewSource', 'generateDraft', 'approve'].includes(method)) return;
    if (method === 'unlock') this.stopping = false;
    await this.record('operation-completed', { method, result });
    if (method === 'unlock' || method === 'approve') {
      // The IPC response must return before the renderer can refresh its view.
      this.scheduleView();
    }
  }

  view() {
    const job = this.captureView();
    this.views.add(job);
    void job.then(() => this.views.delete(job), () => { this.views.delete(job); this.failed = true; });
    return job;
  }

  private async captureView() {
    if (this.stopping || !this.service.vault.state || this.window.isDestroyed()) return;
    const generation = this.generation;
    const details = await this.window.webContents.executeJavaScript(`({
      patientId: document.getElementById('patient').value,
      encounterStatus: document.getElementById('encounterStatus').textContent,
      historyText: document.getElementById('historyRecords').textContent,
      historyVisible: !document.getElementById('history').hidden,
      approvedText: document.getElementById('draftText').value,
      approvedReadOnly: document.getElementById('draftText').readOnly
    })`);
    if (!this.stopping && generation === this.generation && this.service.vault.state) {
      const records = this.service.state().records.filter(r => r.patientId === details.patientId && !r.supersededAt);
      await this.record('renderer-view', { ...details, canonicalApprovedRecords: records.map(r => ({ id: r.id, encounterId: r.encounterId, text: r.text })) });
    }
  }

  async lockPurge() {
    this.beginLock();
    await this.pending;
    if (!this.service.vault.state || this.window.isDestroyed()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
    const details = await this.window.webContents.executeJavaScript(`({
      workspaceHidden: document.getElementById('workspace').hidden,
      fields: ['sourceText','draftText','alias','passphrase','queryQuestion','goldText'].every(id=>document.getElementById(id).value===''),
      content: ['patient','encounters','historyRecords','metrics','consequenceText','pairStatus','encounterTitle','encounterStatus','revision','sourceState','draftLink','queryAnswer','queryCoverage','queryMetrics','goldStatus','goldScore'].every(id=>document.getElementById(id).textContent===''),
      images: ['sourceImage','pairQr'].every(id=>!document.getElementById(id).hasAttribute('src'))
    })`);
    if (this.service.vault.state) await this.record('lock-renderer-purge', details);
  }
}
