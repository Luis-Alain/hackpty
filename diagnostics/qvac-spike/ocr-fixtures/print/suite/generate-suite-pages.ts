import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Generates printable one-page-per-record A4 sheets for every case of the
 * frozen chart-review suite (draft-v1.json held-out, dev-v1.json dev), for the
 * physical Fold camera workflow. The suite JSON files are read-only: their
 * sha256 is verified against the frozen values recorded in
 * diagnostics/qvac-spike/chart-review/suite/REVIEW-LOG.md section 4 and the
 * generator refuses to run if either differs. Record text is emitted verbatim
 * (HTML-escaped only). Long records may span pages; the browser paginates.
 *
 * Run from a cell-local compile only:
 *   node .local/cells/<X>/dist/diagnostics/qvac-spike/ocr-fixtures/print/suite/generate-suite-pages.js
 */
export const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

export const FROZEN_SUITE_HASHES = {
  'draft-v1.json': '2d4c67a9ea326cb69e510ae4f3378fcdcfc31088c96c8698accb869aa6d37a84',
  'dev-v1.json': 'e6a2b4d27d3b98dd89234ac90a5a858f3f87b879d21f2a832d25d5df48f2899a',
} as const;

const SUITE_DIR = 'diagnostics/qvac-spike/chart-review/suite';
const OUT_DIR = 'diagnostics/qvac-spike/ocr-fixtures/print/suite';

const escapeHtml = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

const STYLE = `body{font-family:Arial,sans-serif;margin:1.5cm;color:#111;background:white}
pre{font:13pt/1.6 Arial,sans-serif;white-space:pre-wrap}
.footer{font-size:9pt;margin-top:1.5cm;border-top:1px solid #aaa;padding-top:0.5em;color:#444}
@media print{@page{size:A4;margin:1.5cm}body{margin:0}}`;

function page(title: string, text: string, footer: string): string {
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
${STYLE}
</style>
<pre>${escapeHtml(text)}</pre>
<p class="footer">${escapeHtml(footer)}</p>
</html>
`;
}

export interface SuiteCaseHistorical { recordId: string; encounterId: string; sourceDate: string; text: string; superseded: boolean; patientId: string; }
export interface SuiteCase { id: string; split: string; category: string; title: string; patient: { patientId: string; alias: string }; current: { encounterId: string; sourceDate: string; text: string }; historical: SuiteCaseHistorical[]; }
interface SuiteFile { suiteId: string; split: string; frozen: boolean; cases: SuiteCase[]; }

export type PageKind = 'current' | 'historical' | 'superseded' | 'wrong-patient';
export interface PageManifestEntry { file: string; sha256: string; caseId: string | null; kind: PageKind | 'index'; split: string | null; recordId: string | null; sourceDate: string | null; characters: number | null; }

const kindOf = (casePatient: string, record: SuiteCaseHistorical): PageKind =>
  record.superseded ? 'superseded' : record.patientId !== casePatient ? 'wrong-patient' : 'historical';

function footerFor(caseId: string, kind: PageKind, record: SuiteCaseHistorical | null, sourceDate: string, historyIndex?: number): string {
  if (kind === 'current') return `SYNTHETIC — ${caseId} — current visit ${sourceDate} — for the PsyRec camera workflow`;
  const base = `SYNTHETIC — ${caseId} — approved history h${historyIndex} (${record!.recordId}, ${sourceDate})`;
  if (kind === 'superseded') return `${base} — SUPERSEDED — enter as the original, then supersede in the app`;
  if (kind === 'wrong-patient') return `${base} — record of another synthetic patient — planted trap`;
  return `${base} — enter as approved history in the app`;
}

export const RECOMMENDED_CAMERA_PICKS = ['CR-09', 'CR-13', 'CR-14', 'CR-15', 'CR-06', 'CR-04', 'CR-05', 'CR-02'] as const;

function indexPage(suites: { file: string; suite: SuiteFile }[], pages: PageManifestEntry[]): string {
  const rows = suites.flatMap(({ suite }) => suite.cases.map(c => {
    const current = pages.find(p => p.caseId === c.id && p.kind === 'current');
    const history = pages.filter(p => p.caseId === c.id && p.kind !== 'current');
    const historyList = history.map(h => `${h.file} (h${history.indexOf(h) + 1}, ${h.kind}${h.sourceDate ? `, ${h.sourceDate}` : ''})`).join('<br>') || 'none';
    return `<tr><td>${c.id}</td><td>${escapeHtml(suite.split)}</td><td>${escapeHtml(c.category)}</td><td>${escapeHtml(c.title)}</td><td>photograph ${current?.file ?? '?'}</td><td>${historyList}</td></tr>`;
  })).join('\n');
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>PsyRec chart-review suite print pages — INDEX</title>
<style>
body{font-family:Arial,sans-serif;margin:1.5cm;color:#111;background:white;font-size:11pt}
table{border-collapse:collapse}td,th{border:1px solid #999;padding:0.3em 0.6em;vertical-align:top;text-align:left}
.footer{font-size:9pt;margin-top:1.5cm;border-top:1px solid #aaa;padding-top:0.5em;color:#444}
</style>
<h1>Chart-review suite print pages — INDEX</h1>
<p>One sheet per record. Photograph the <b>current</b> page of a case with the Fold app; enter the h1..hn pages as approved history in listed order (superseded pages: enter as the original, then supersede in the app). Every page is synthetic and not a real patient.</p>
<p><b>Reviewer-recommended camera picks:</b> ${RECOMMENDED_CAMERA_PICKS.join(', ')}.</p>
<table>
<tr><th>Case</th><th>Split</th><th>Category</th><th>Title</th><th>Photograph (current)</th><th>Enter as approved history</th></tr>
${rows}
</table>
<p class="footer">SYNTHETIC — chart-review suite print index — generated from frozen draft-v1.json + dev-v1.json</p>
</html>
`;
}

export async function generateSuitePages(root = process.cwd()) {
  const suites: { file: string; suite: SuiteFile }[] = [];
  for (const file of Object.keys(FROZEN_SUITE_HASHES) as (keyof typeof FROZEN_SUITE_HASHES)[]) {
    const bytes = await readFile(path.join(root, SUITE_DIR, file));
    const actual = sha256(bytes);
    if (actual !== FROZEN_SUITE_HASHES[file]) throw new Error(`Frozen suite ${file} sha256 mismatch: expected ${FROZEN_SUITE_HASHES[file]}, got ${actual}. The suite is read-only; refusing to generate pages from a changed file.`);
    const suite: SuiteFile = JSON.parse(bytes.toString('utf8'));
    if (suite.frozen !== true) throw new Error(`Suite ${file} is not frozen; refusing to generate print pages.`);
    suites.push({ file, suite });
  }
  const outDir = path.join(root, OUT_DIR);
  await mkdir(outDir, { recursive: true });
  const pages: PageManifestEntry[] = [];
  const emit = async (name: string, html: string, entry: Omit<PageManifestEntry, 'file' | 'sha256'>) => {
    await writeFile(path.join(outDir, name), html);
    pages.push({ file: name, sha256: sha256(html), ...entry });
  };
  for (const { suite } of suites) {
    for (const c of suite.cases) {
      await emit(`${c.id}-current.html`, page(`PsyRec suite ${c.id} current visit`, c.current.text, footerFor(c.id, 'current', null, c.current.sourceDate)),
        { caseId: c.id, kind: 'current', split: suite.split, recordId: null, sourceDate: c.current.sourceDate, characters: c.current.text.length });
      for (const [index, record] of c.historical.entries()) {
        const kind = kindOf(c.patient.patientId, record);
        await emit(`${c.id}-h${index + 1}.html`, page(`PsyRec suite ${c.id} history h${index + 1}`, record.text, footerFor(c.id, kind, record, record.sourceDate, index + 1)),
          { caseId: c.id, kind, split: suite.split, recordId: record.recordId, sourceDate: record.sourceDate, characters: record.text.length });
      }
    }
  }
  await emit('INDEX.html', indexPage(suites, pages), { caseId: null, kind: 'index', split: null, recordId: null, sourceDate: null, characters: null });
  const manifest = {
    schemaVersion: 1,
    syntheticOnly: true,
    purpose: 'Printable pages for photographing/entering frozen chart-review suite cases in the real camera workflow. Demonstration and human-benefit evidence only, never held-out accuracy (see README.md).',
    generatedFrom: Object.fromEntries(Object.entries(FROZEN_SUITE_HASHES).map(([file, hash]) => [path.join(SUITE_DIR, file), hash])),
    recommendedCameraPicks: [...RECOMMENDED_CAMERA_PICKS],
    files: pages,
  };
  await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  const current = pages.filter(p => p.kind === 'current').length, historical = pages.filter(p => p.kind !== 'current' && p.kind !== 'index').length;
  console.log(JSON.stringify({ outDir: OUT_DIR, currentPages: current, historicalPages: historical, index: 1, totalFiles: pages.length }));
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await generateSuitePages();
