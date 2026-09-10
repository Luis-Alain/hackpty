import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { assertCompleteMetrics } from '../../packages/runtime/metrics.js';
import { SCORING_METHODS, scoreTranscription, type ClinicalRule } from '../../packages/runtime/transcription-scoring.js';

/**
 * Offline scorer for archived OCR evaluation outputs. Performs NO inference:
 * it scores retained evidence files written by ocr-evaluation.ts against the
 * manifest reference (authored ground truth for printed bitmaps, blinded human
 * transcription for paper photos), with the same output/metrics binding checks
 * as transcription-score.ts.
 *
 * Usage: node ocr-score.js <run-id>
 * Output: artifacts/evidence/ocr-score-<run-id>.json (flag 'wx')
 */
export const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

export type OcrMedium = 'printed-bitmap' | 'paper-photo' | 'handwriting-style';
export interface OcrFixture {
  id: string; noteId: string; medium: OcrMedium; file: string; sha256: string | null;
  status: 'ready' | 'awaiting-capture';
  groundTruth: string | null; humanTranscription: string | null; referenceMethod: string;
  split: 'development' | 'held-out'; rules: ClinicalRule[];
}
export interface OcrManifest { schemaVersion: number; syntheticOnly: boolean; printSources: { noteId: string; file: string; sha256: string }[]; fixtures: OcrFixture[]; }

export async function loadOcrManifest(root = process.cwd()): Promise<OcrManifest> {
  const manifest: OcrManifest = JSON.parse(await readFile(path.join(root, 'diagnostics/qvac-spike/ocr-fixtures/manifest.json'), 'utf8'));
  if (manifest.schemaVersion !== 1 || manifest.syntheticOnly !== true) throw new Error('Unexpected OCR fixture manifest.');
  const ids = new Set<string>(), splitByNote = new Map<string, string>();
  for (const fixture of manifest.fixtures) {
    if (ids.has(fixture.id)) throw new Error(`Duplicate OCR fixture id ${fixture.id}.`);
    ids.add(fixture.id);
    if (!['printed-bitmap', 'paper-photo', 'handwriting-style'].includes(fixture.medium)) throw new Error(`Unexpected medium for ${fixture.id}.`);
    if (!['development', 'held-out'].includes(fixture.split)) throw new Error(`Unexpected split for ${fixture.id}.`);
    const prior = splitByNote.get(fixture.noteId);
    if (prior && prior !== fixture.split) throw new Error(`Note ${fixture.noteId} spans multiple splits; all media of one note must share a split.`);
    splitByNote.set(fixture.noteId, fixture.split);
    if (!Array.isArray(fixture.rules) || !fixture.rules.length) throw new Error(`Fixture ${fixture.id} requires clinical rules.`);
  }
  return manifest;
}

/** The only admissible scoring references: authored ground truth or a saved blinded human transcription. */
export function fixtureReference(fixture: OcrFixture): string | null {
  if (typeof fixture.groundTruth === 'string' && fixture.groundTruth.trim()) return fixture.groundTruth;
  if (typeof fixture.humanTranscription === 'string' && fixture.humanTranscription.trim()) return fixture.humanTranscription;
  return null;
}

export function mimeForFixture(fixture: OcrFixture): 'image/png' | 'image/jpeg' {
  const extension = path.extname(fixture.file).toLowerCase();
  if (extension === '.png') return 'image/png';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  throw new Error(`Unsupported fixture image type for ${fixture.id}.`);
}

/** Pure scoring of one archived output double against a reference; no evidence binding. */
export function scoreOutput(reference: string, output: string, rules: ClinicalRule[]) {
  return scoreTranscription(reference, output, rules);
}

export function scoreOcrEvidence(fixture: OcrFixture, imageBytes: Buffer, evidence: any) {
  if (evidence?.synthetic !== true || typeof evidence.result?.text !== 'string') throw new Error('Only retained reviewed synthetic outputs may be scored.');
  if (evidence.fixtureId !== fixture.id) throw new Error(`Evidence fixture ${evidence.fixtureId} does not match manifest fixture ${fixture.id}.`);
  const reference = fixtureReference(fixture);
  if (!reference) throw new Error(`Fixture ${fixture.id} has no scoring reference (no ground truth, no human transcription).`);
  const { metrics, text } = evidence.result;
  if (metrics?.request?.attachment?.sha256 !== sha256(imageBytes) || metrics.request.attachment.bytes !== imageBytes.length) throw new Error('The scored output must bind the exact fixture image bytes.');
  if (metrics.output?.sha256 !== sha256(text) || metrics.output.characters !== text.length) throw new Error('The scored output must bind the retained raw text.');
  assertCompleteMetrics(metrics);
  if (metrics.operation !== 'extract') throw new Error('Only extraction runs are OCR evidence.');
  return { fixtureId: fixture.id, noteId: fixture.noteId, medium: fixture.medium, split: fixture.split, referenceSha256: sha256(reference), referenceMethod: fixture.referenceMethod, imageSha256: sha256(imageBytes), runId: metrics.runId, metricsGate: 'passed', rawOutputSha256: metrics.output.sha256, rawOutput: text, metrics, score: scoreOutput(reference, text, fixture.rules) };
}

export function summarizeOcrScores(cases: ReturnType<typeof scoreOcrEvidence>[]) {
  const aggregate = (kind: 'wer' | 'cer') => { const totals = cases.reduce((a, c) => { for (const k of ['referenceUnits', 'outputUnits', 'substitutions', 'deletions', 'insertions', 'errors']) a[k] += c.score[kind][k]; return a; }, { referenceUnits: 0, outputUnits: 0, substitutions: 0, deletions: 0, insertions: 0, errors: 0 }); return { ...totals, rate: totals.errors / totals.referenceUnits }; };
  return { caseCount: cases.length, wer: aggregate('wer'), cer: aggregate('cer'), exactMatches: cases.filter(c => c.score.exactTextMatch).length, clinicalRules: cases.flatMap(c => c.score.clinical).length, failedClinicalRules: cases.flatMap(c => c.score.clinical).filter(c => !c.passed).length };
}

export async function scoreArchivedOcr(runId: string, root = process.cwd()) {
  if (!/^[a-zA-Z0-9-]+$/.test(runId)) throw new Error('Use a plain run id: [a-zA-Z0-9-]+.');
  const manifest = await loadOcrManifest(root);
  const outcomes = [], missing = [];
  for (const fixture of manifest.fixtures) {
    const evidenceFile = path.join(root, 'artifacts/evidence', `ocr-${runId}-${fixture.id}.json`);
    const bytes = await readFile(evidenceFile).catch(() => null);
    if (!bytes) { missing.push(fixture.id); continue; }
    const imageBytes = await readFile(path.join(root, 'diagnostics/qvac-spike/ocr-fixtures', fixture.file));
    const result = scoreOcrEvidence(fixture, imageBytes, JSON.parse(bytes.toString('utf8')));
    outcomes.push({ ...result, archivedFile: path.relative(root, evidenceFile), archivedFileSha256: sha256(bytes) });
  }
  if (!outcomes.length) throw new Error(`No archived OCR evidence found for run ${runId}. Missing: ${missing.join(', ') || 'none'}.`);
  const heldOut = outcomes.some(c => c.split === 'held-out');
  return { schemaVersion: 1, synthetic: true, classification: heldOut ? 'ocr-fixture-scores-including-held-out' : 'ocr-fixture-scores-development', heldOut, releaseAccepted: false, physicalWorkflowAccepted: false, createdAt: new Date().toISOString(), runId, scope: 'Archived OCR extraction outputs scored offline against manifest references. No new inference, no patient data, no release or physical-workflow acceptance.', methods: SCORING_METHODS, summary: summarizeOcrScores(outcomes), missingFixtures: missing, cases: outcomes };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const runId = process.argv[2];
  if (!runId) throw new Error('Usage: node ocr-score.js <run-id>');
  const report = await scoreArchivedOcr(runId);
  const output = path.join(process.cwd(), 'artifacts/evidence', `ocr-score-${runId}.json`);
  await writeFile(output, JSON.stringify(report, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ file: output, classification: report.classification, summary: report.summary, missing: report.missingFixtures, cases: report.cases.map(c => ({ id: c.fixtureId, wer: c.score.wer.rate, cer: c.score.cer.rate, failedRules: c.score.clinical.filter(r => !r.passed).map(r => r.id) })) }));
}
