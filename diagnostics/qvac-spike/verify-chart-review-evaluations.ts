import { readFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { assertCompleteMetrics } from '../../packages/runtime/metrics.js';
import { chartReviewHistory, chartReviewResponseFormat } from '../../packages/runtime/chart-review-prompts.js';
import { scoreChartReviewCase, scoreChartReviewSuite } from './chart-review-scoring.js';
import { bindChartReviewPacket, extractChartReviewJson, D8_CONFIGS } from './chart-review-evaluation.js';
import { assertProtocolModel } from './query-evidence-bindings.js';
import { sha256 } from './transcription-cases.js';

// Cell A step A5/A6: read-only verifier for chart-review evaluation records. Recomputes
// packet bindings, scores and aggregates; checks protocol, model and output bindings
// and all mandatory metrics. Structured D8 configurations carry runtime RunMetrics;
// unstructured (thinking, no grammar) configurations carry direct-SDK records whose
// bindings are checked here field by field. Never converts failures to success.
//
// Fix round 3 (verify3-glm.txt / verify3-evidence.txt SS3): packages/runtime/worker.ts
// used to drop the stopReason key entirely on the structured (i)/(iii) runtime-review path
// whenever the SDK supplied none (`...(final.stopReason?{stopReason:...}:{})`), while this
// verifier's key-presence assertion existed only on the unstructured (ii)/(iv) direct-SDK
// path. worker.ts now always writes `stopReason:final.stopReason??null`, so the key is
// present on every record produced after the fix. This verifier now asserts key presence
// on the structured path too, but only for records the harness marks as produced after the
// fix: protocol.stopReasonKeyGuaranteed === true, or a promptTemplateVersion strictly newer
// than 'psyrec-chart-review-v4' (the version in force when the defect was found). Records
// that predate the fix (protocol.stopReasonKeyGuaranteed unset/false and promptVersion <= v4,
// e.g. the four final held-out runs already retained under this prompt version) print a
// warning naming the gap instead of failing, per FIX-ROUND-3.md item 2 -- they are retained
// unchanged and their reported numbers are unaffected (undefined and null score identically
// as "not truncated"; see CHART-REVIEW-EVALUATION.md's "Evidence completeness note").
const [prefix] = process.argv.slice(2);
if (!prefix || path.dirname(prefix).replaceAll('\\', '/') !== 'artifacts/evidence' || !path.basename(prefix).startsWith('chart-review-')) throw new Error('Verification only reads chart-review prefixes inside reviewed synthetic artifacts/evidence.');
const json = async (file: string) => JSON.parse(await readFile(file, 'utf8'));
const root = process.cwd();
// Trailing "-vN" version number, or 0 if the pattern is absent (never higher than an
// unversioned string, so an unrecognized version is treated as no newer than the baseline).
const promptVersionNumber = (version: unknown): number => { const match = /-v(\d+)$/.exec(String(version)); return match ? Number(match[1]) : 0; };
const STOP_REASON_FIX_BASELINE_VERSION = promptVersionNumber('psyrec-chart-review-v4');

const protocol = await json(`${prefix}-protocol.json`);
const protocolSha256 = sha256(await readFile(`${prefix}-protocol.json`));
assert.equal(protocol.synthetic, true);
assert.equal(protocol.releaseAccepted, false);
assert.ok(protocol.d8 && protocol.d8.label, 'protocol must carry its D8 configuration');
assert.deepEqual(protocol.d8, (D8_CONFIGS as Record<string, unknown>)[protocol.d8.label], 'protocol D8 configuration drifted from the frozen table');
const suiteBytes = await readFile(path.join(root, protocol.suiteFile));
assert.equal(protocol.suiteSha256, sha256(suiteBytes));
const suite = JSON.parse(suiteBytes.toString('utf8'));
assert.equal(protocol.promptModuleSha256, sha256(await readFile(path.join(root, 'packages', 'runtime', 'chart-review-prompts.ts'))));
assert.equal(protocol.queryModuleSha256, sha256(await readFile(path.join(root, 'packages', 'runtime', 'prompts.ts'))));
// See header comment: only records the harness marks as post-fix are held to the strict
// key-presence assertion on the structured path.
const stopReasonKeyGuaranteed = protocol.stopReasonKeyGuaranteed === true || promptVersionNumber(protocol.promptVersion) > STOP_REASON_FIX_BASELINE_VERSION;

const scores = [];
for (const fixture of protocol.cases) {
  const entry = suite.cases.find((candidate: any) => candidate.id === fixture.id);
  assert.ok(entry, `suite case ${fixture.id} missing`);
  assert.deepEqual(fixture.packet, bindChartReviewPacket(entry, suite.evidenceBudgetChars), `packet binding changed for ${fixture.id}`);
  assert.deepEqual(fixture.reviewHistory, chartReviewHistory(fixture.packet));
  assert.deepEqual(fixture.reviewResponseFormat, chartReviewResponseFormat(fixture.packet));
  const packetIds = ['C1', ...fixture.packet.historical.map((h: any) => h.evidenceId)];
  const record = await json(`${prefix}-${fixture.id}.json`);
  assert.equal(record.synthetic, true);
  assert.equal(record.releaseAccepted, false);
  assert.equal(record.protocolSha256, protocolSha256);
  assert.equal(record.goldConfirmedByHuman, protocol.goldConfirmedByHuman);
  assert.equal(record.d8, protocol.d8.label);
  assert.deepEqual(record.packet, fixture.packet);
  if (record.status === 'succeeded') {
    if (protocol.d8.structured) {
      const metrics = record.review.metrics;
      assert.equal(record.review.mode, 'runtime-review-operation');
      assertCompleteMetrics(metrics);
      assertProtocolModel(metrics, protocol.modelManifest, 'review');
      assert.equal(metrics.operation, 'review');
      assert.equal(metrics.request.promptTemplateVersion, protocol.promptVersion);
      assert.deepEqual(metrics.request.history, fixture.reviewHistory);
      assert.deepEqual(metrics.request.responseFormat, fixture.reviewResponseFormat);
      assert.deepEqual(metrics.modelDetails.loadConfig, protocol.loadConfiguration);
      assert.equal(metrics.output.sha256, sha256(record.review.text));
      assert.equal(metrics.output.characters, record.review.text.length);
      assert.equal(typeof metrics.output.thinking?.textLength, 'number');
      if (stopReasonKeyGuaranteed) {
        assert.ok('stopReason' in metrics.output, 'stopReason key must be present (null when the SDK supplied none)');
      } else if (!('stopReason' in metrics.output)) {
        console.warn(`WARNING: ${fixture.id} predates the worker.ts stopReason key-presence fix (fix round 3): protocol.promptVersion=${protocol.promptVersion}, stopReasonKeyGuaranteed not set. Key is absent from metrics.output; retained unchanged per FIX-ROUND-3.md item 2.`);
      }
      assert.deepEqual(record.score, scoreChartReviewCase(entry, packetIds, record.review.text, metrics.output.stopReason), `score mismatch for ${fixture.id}`);
    } else {
      const review = record.review;
      assert.equal(review.mode, 'direct-sdk-thinking');
      assert.deepEqual(review.request.history, fixture.reviewHistory);
      assert.equal(review.request.responseFormat, null, 'unstructured runs must not apply the grammar');
      assert.deepEqual(review.request.generationParams, {temp: 0, seed: 42, predict: protocol.d8.predict, reasoning_budget: protocol.d8.reasoningBudget});
      assert.equal(review.request.promptTemplateVersion, protocol.promptVersion);
      assert.equal(review.request.captureThinking, true);
      assert.equal(review.output.sha256, sha256(review.text));
      assert.equal(review.output.characters, review.text.length);
      assert.match(review.output.rawFullTextSha256, /^[a-f0-9]{64}$/);
      assert.ok('stopReason' in review.output, 'stopReason key must be present (null when the SDK supplied none)');
      assert.equal(typeof review.output.thinking?.textLength, 'number');
      assert.equal(typeof review.output.thinking?.deltaCount, 'number');
      for (const key of ['promptTokens', 'generatedTokens', 'emittedTokens']) assert.equal(typeof review.native?.[key], 'number', `native.${key}`);
      assert.ok(['cpu', 'gpu'].includes(review.native?.backendDevice));
      assert.equal(typeof review.timings?.nativeTimeToFirstToken?.value, 'number');
      assert.equal(typeof review.timings?.nativeThroughput?.value, 'number');
      assert.equal(review.model.sha256, protocol.verifiedAssets[0].sha256);
      assert.equal(review.model.constant, protocol.verifiedAssets[0].constant);
      assert.deepEqual(review.loadConfig, protocol.loadConfiguration);
      assert.equal(review.extraction.firstPassValid, extractChartReviewJson(review.text).ok, `extraction mismatch for ${fixture.id}`);
      assert.deepEqual(record.score, scoreChartReviewCase(entry, packetIds, review.text, review.output.stopReason ?? undefined), `score mismatch for ${fixture.id}`);
    }
    if (record.query) {
      if (record.query.failed) {
        assert.equal(record.score.casePassed, false);
      } else {
        assertCompleteMetrics(record.query.metrics);
        assertProtocolModel(record.query.metrics, protocol.modelManifest, 'query');
        assert.equal(record.query.metrics.operation, 'query');
        assert.equal(record.query.metrics.output.sha256, sha256(record.query.text));
      }
    }
  } else {
    assert.ok(record.failure, `failed case ${fixture.id} must retain failure evidence`);
    assert.equal(record.score.casePassed, false);
  }
  scores.push(record.score);
}
const summary = await json(`${prefix}-summary.json`);
assert.equal(summary.protocolSha256, protocolSha256);
assert.equal(summary.goldConfirmedByHuman, protocol.goldConfirmedByHuman);
assert.equal(summary.d8, protocol.d8.label);
assert.deepEqual(summary.scores, scoreChartReviewSuite(scores));
assert.equal(summary.completed, protocol.cases.every((fixture: any) => scores[protocol.cases.indexOf(fixture)] !== undefined) && summary.cases.every((entry: any) => entry.status === 'succeeded'));
console.log(JSON.stringify({
  status: 'passed-evidence-bindings', id: protocol.id, modelLabel: protocol.modelLabel, d8: protocol.d8.label, split: protocol.split,
  goldConfirmedByHuman: protocol.goldConfirmedByHuman, casesChecked: scores.length,
  scores: summary.scores, targetsMet: summary.targetsMet,
  scope: 'Verifies exact retained synthetic outputs, packet bindings, frozen protocol, D8 configuration, scoring and all mandatory native metrics. Does not convert failures to success or certify a clinical workflow.'
}));
