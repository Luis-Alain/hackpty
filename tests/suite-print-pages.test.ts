import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { sha256, FROZEN_SUITE_HASHES, RECOMMENDED_CAMERA_PICKS } from '../diagnostics/qvac-spike/ocr-fixtures/print/suite/generate-suite-pages.js';

const root = process.cwd();
const outDir = (...parts: string[]) => path.join(root, 'diagnostics/qvac-spike/ocr-fixtures/print/suite', ...parts);
const unescapeHtml = (s: string) => s.replaceAll('&gt;', '>').replaceAll('&lt;', '<').replaceAll('&amp;', '&');

async function loadSuites() {
  const suites = [];
  for (const file of Object.keys(FROZEN_SUITE_HASHES)) {
    const bytes = await readFile(path.join(root, 'diagnostics/qvac-spike/chart-review/suite', file));
    assert.equal(sha256(bytes), FROZEN_SUITE_HASHES[file as keyof typeof FROZEN_SUITE_HASHES], `${file} frozen hash`);
    suites.push(JSON.parse(bytes.toString('utf8')));
  }
  return suites;
}

test('suite print manifest matches on-disk files and frozen suite hashes', async () => {
  const manifest = JSON.parse(await readFile(outDir('manifest.json'), 'utf8'));
  assert.equal(manifest.syntheticOnly, true);
  for (const [source, hash] of Object.entries(manifest.generatedFrom)) {
    const bytes = await readFile(path.join(root, source as string));
    assert.equal(sha256(bytes), hash, `generatedFrom ${source}`);
  }
  assert.equal(manifest.files.length, 44); // 20 current + 23 historical + INDEX
  for (const entry of manifest.files) {
    const bytes = await readFile(outDir(entry.file));
    assert.equal(sha256(bytes), entry.sha256, `${entry.file} manifest hash`);
  }
});

test('every suite case has a current page whose pre block is the verbatim record text', async () => {
  const suites = await loadSuites();
  const manifest = JSON.parse(await readFile(outDir('manifest.json'), 'utf8'));
  const cases = suites.flatMap((s: any) => s.cases.map((c: any) => ({ suite: s, case: c })));
  assert.equal(cases.length, 20);
  for (const { suite, case: c } of cases) {
    const entry = manifest.files.find((f: any) => f.caseId === c.id && f.kind === 'current');
    assert.ok(entry, `${c.id} has a current page`);
    assert.equal(entry.split, suite.split);
    assert.equal(entry.characters, c.current.text.length);
    assert.equal(entry.sourceDate, c.current.sourceDate);
    const html = await readFile(outDir(entry.file), 'utf8');
    const pre = unescapeHtml(html.match(/<pre>([\s\S]*?)<\/pre>/)![1]);
    assert.equal(pre, c.current.text, `${c.id} current page text verbatim`);
    assert.ok(html.includes(`SYNTHETIC — ${c.id} — current visit ${c.current.sourceDate} — for the PsyRec camera workflow`), `${c.id} footer`);
  }
});

test('historical pages preserve listed order and mark superseded and wrong-patient records', async () => {
  const suites = await loadSuites();
  const manifest = JSON.parse(await readFile(outDir('manifest.json'), 'utf8'));
  for (const { case: c } of suites.flatMap((s: any) => s.cases.map((c: any) => ({ suite: s, case: c })))) {
    for (const [index, record] of c.historical.entries() as [number, any][]) {
      const entry = manifest.files.find((f: any) => f.caseId === c.id && f.file === `${c.id}-h${index + 1}.html`);
      assert.ok(entry, `${c.id} h${index + 1} exists`);
      const expectedKind = record.superseded ? 'superseded' : record.patientId !== c.patient.patientId ? 'wrong-patient' : 'historical';
      assert.equal(entry.kind, expectedKind, `${c.id} h${index + 1} kind`);
      assert.equal(entry.recordId, record.recordId);
      const html = await readFile(outDir(entry.file), 'utf8');
      const pre = unescapeHtml(html.match(/<pre>([\s\S]*?)<\/pre>/)![1]);
      assert.equal(pre, record.text, `${c.id} h${index + 1} text verbatim`);
      if (expectedKind === 'superseded') assert.ok(html.includes('SUPERSEDED — enter as the original, then supersede in the app'));
      if (expectedKind === 'wrong-patient') assert.ok(html.includes('record of another synthetic patient — planted trap'));
    }
  }
  // Known special cases: CR-14 has a superseded original, CR-13 a wrong-patient record, CR-16 a >6000-char history.
  assert.equal(manifest.files.filter((f: any) => f.kind === 'superseded').length, 1);
  assert.equal(manifest.files.filter((f: any) => f.kind === 'wrong-patient').length, 1);
  assert.ok(manifest.files.find((f: any) => f.caseId === 'CR-16' && f.kind === 'historical').characters > 6000);
});

test('INDEX.html lists every case and the reviewer-recommended camera picks', async () => {
  const index = await readFile(outDir('INDEX.html'), 'utf8');
  const suites = await loadSuites();
  for (const { case: c } of suites.flatMap((s: any) => s.cases.map((c: any) => ({ suite: s, case: c })))) {
    assert.ok(index.includes(`<td>${c.id}</td>`), `INDEX lists ${c.id}`);
    assert.ok(index.includes(`${c.id}-current.html`), `INDEX names ${c.id} current page`);
  }
  for (const pick of RECOMMENDED_CAMERA_PICKS) assert.ok(index.includes(pick), `INDEX recommends ${pick}`);
});
