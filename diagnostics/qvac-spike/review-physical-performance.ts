import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import path from 'node:path';
import { assertCompleteMetrics } from '../../packages/runtime/metrics.js';

// Default verification uses published, portable artifacts and never writes.
// Explicit publication reads only the independently reviewed synthetic local
// candidate, never a vault or the earlier mixed-provenance source.
const root=process.cwd(),output=path.join(root,'artifacts/evidence');
const publishReviewedLocal=process.argv.includes('--publish-reviewed-local');
const candidatePath=publishReviewedLocal?path.join(root,'.local/desktop-workflow/physical-provisional.json'):path.join(output,'physical-fold-exploratory-provisional.json');
const photoPath=publishReviewedLocal?path.join(root,'.local/desktop-workflow/physical-synthetic-SYN-HW-002.jpg'):path.join(output,'physical-synthetic-SYN-HW-002.jpg');
const screenshotPath=publishReviewedLocal?path.join(root,'.local/desktop-workflow/assisted-approved-history.png'):path.join(output,'physical-assisted-approved-history.png');
const candidate=JSON.parse(await readFile(candidatePath,'utf8'));
// A later unrelated capture must receive a fresh visual review, never inherit
// the claims below merely by using the same filename or fixture label.
const visualReviewBinding={
  photoSha256:'f3245fb4a5351ca20c56e95dac6fdf01e017a9db8fb03d6c80c438c842ad451f',
  screenshotSha256:'52e62626b5a95664bc929587489353db712c1f1055ebbbc42dee73a6016be731',
  runIds:['47ebf707-8140-4372-8245-6c3b2f3362db','5112c4f6-6b86-471f-9add-40a95749ced6'],
  approvedSha256:'d663a4126f1bd090c348cf435b479a211eb75a91a1861189c5694b405c3c0b28',
};
const networkFile='physical-network-observation-1788979224270.json';
const network=JSON.parse(await readFile(path.join(output,networkFile),'utf8'));
const hash=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
const step=(name:string)=>{const found=candidate.steps.filter(s=>s.operation===name);assert.equal(found.length,1);return found[0].evidence;};
assert.equal(candidate.syntheticOnly,true);assert.equal(step('paired-fold-photo-received').fixtureId,'SYN-HW-002');
const photo=await readFile(photoPath),screenshot=await readFile(screenshotPath);
assert.equal(hash(photo),visualReviewBinding.photoSha256,'A different photo requires a new independent visual review.');
assert.equal(hash(screenshot),visualReviewBinding.screenshotSha256,'A different screenshot requires a new independent visual review.');
assert.deepEqual(candidate.runs.map(run=>run.metrics.runId),visualReviewBinding.runIds);
assert.equal(candidate.approval.approvedSha256,visualReviewBinding.approvedSha256);
const receipt=step('paired-fold-photo-received').receipt;assert.equal(hash(photo),receipt.sha256);
assert.equal(candidate.runs.length,2);
const bindings=candidate.runs.map(run=>{
  assertCompleteMetrics(run.metrics);assert.equal(run.metrics.sdkVersion,'0.18.2');assert.equal(run.metrics.native.backendDevice,'gpu');
  assert.equal(hash(run.outputText),run.metrics.output.sha256);assert.equal(run.encounterId,receipt.encounterId);
  const process=network.processes.find(p=>p.processId===run.metrics.runtime.processId&&p.role==='inference-worker-tree');assert.ok(process);
  assert.ok(Date.parse(network.startedAt)<=Date.parse(run.metrics.startedAt)&&Date.parse(network.endedAt)>=Date.parse(run.metrics.endedAt));
  assert.ok(Date.parse(process.firstSeen)<=Date.parse(run.metrics.endedAt)&&Date.parse(process.lastSeen)>=Date.parse(run.metrics.startedAt));
  return {operation:run.operation,runId:run.metrics.runId,processId:process.processId,metricsGate:'passed',exactOutputHashVerified:true,networkProcessBindingVerified:true,native:run.metrics.native,loadMs:run.metrics.loadMs,completionWallMs:run.metrics.durationMs,appTimeToFirstContentMs:run.metrics.timings.timeToFirstContent.value};
});
const extraction=candidate.runs.find(r=>r.operation==='extract'),draft=candidate.runs.find(r=>r.operation==='draft');assert.ok(extraction&&draft);
assert.equal(extraction.metrics.request.attachment.sha256,receipt.sha256);assert.equal(extraction.outputText,candidate.source.extracted);
assert.equal(draft.outputText,step('real-bounded-draft').text);assert.equal(draft.metrics.request.sourceId,`${draft.encounterId}:${draft.sourceRevision}`);
assert.equal(step('source-correction-review').sourceRevision,draft.sourceRevision);
assert.equal(step('source-correction-review').correctedSha256,hash(candidate.source.corrected));
const expectedPrompt=`Source reference: ${draft.metrics.request.sourceId}\n\nBEGIN REVIEWED SOURCE\n${candidate.source.corrected}\nEND REVIEWED SOURCE\n\nOrganize this source into a concise draft without adding facts. /no_think`;
assert.equal(draft.metrics.request.history.find(m=>m.role==='user').content,expectedPrompt);
const inputs=candidate.physicalObservations.filter(o=>o.event==='renderer-input'&&o.details.trusted===true&&o.details.encounterId===draft.encounterId);
const sourceReview=inputs.find(o=>['reviewSource','confirmCorrection'].includes(o.details.control)&&o.details.sourceText===candidate.source.corrected);assert.ok(sourceReview);
const approval=inputs.find(o=>o.details.control==='approve'&&o.details.approvalChecked===true&&o.details.draftText===candidate.approval.exactText);assert.ok(approval);
assert.equal(hash(candidate.approval.exactText),candidate.approval.approvedSha256);assert.equal(candidate.approval.approvedSha256,candidate.approval.reloadedSha256);
assert.ok(Date.parse(extraction.metrics.endedAt)<Date.parse(draft.metrics.startedAt));
assert.equal(network.errors.length,0);assert.equal(network.inferenceSocketObservations.length,0);
const published=structuredClone(candidate);delete published.finalObservedStatus.addresses;delete published.finalObservedStatus.receiver;
published.publicationRedactions=['Environment private-LAN addresses and receiver removed from finalObservedStatus. No model, load configuration, exact prompt, token counter, TTFT, throughput, output text or observer failure data changed.'];
assert.deepEqual(published.runs,candidate.runs);
assert.ok(!/https?:\/\/(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(JSON.stringify(published)));
assert.ok(!/"(?:secret|token|tokenHash|passphrase|imageBase64)"\s*:/.test(JSON.stringify(published)));
if(publishReviewedLocal){
  await writeFile(path.join(output,'physical-fold-exploratory-provisional.json'),JSON.stringify(published,null,2));
  await copyFile(photoPath,path.join(output,'physical-synthetic-SYN-HW-002.jpg'));
  await copyFile(screenshotPath,path.join(output,'physical-assisted-approved-history.png'));
}
const review={schemaVersion:1,synthetic:true,checkedAt:new Date().toISOString(),reviewer:'Dedicated runtime/performance evidence agent',scope:'Independent measurement/output/receipt/human-approval binding for a real Fold capture of known AI-generated SYN-HW-002; not complete physical workflow acceptance',workflowStatus:'provisional-not-accepted',sourceMedium:'unconfirmed',primaryPrintedNoteAcceptance:'not-established',sourcePhoto:{file:'physical-synthetic-SYN-HW-002.jpg',sha256:receipt.sha256,independentlyVisuallyReviewed:true,quality:'Known NOT A REAL PATIENT/SYN-HW-002 content. Top training header partly cropped and omitted by extraction. Clinical body, missing sleep duration, negation and follow-up are preserved; line breaks collapsed. No new clinical facts observed.'},candidate:'physical-fold-exploratory-provisional.json',bindings,chainChecks:{phoneReceiptImageDigestAndEncounterMatchActualExtraction:true,exactRawOutputsMatchNativeDigests:true,reviewedSourceMatchesExactDraftPromptAndRevision:true,trustedSourceReviewAt:sourceReview.at,trustedExactApprovalAt:approval.at,approvedAndReloadedTextDigestsMatch:true,assistantNavigationLabeledSeparately:true},network:{file:networkFile,samples:network.samples,inferenceSocketObservations:0,workerProcessIds:bindings.map(b=>b.processId),actualRunTimestampsSequential:true,enforcedIsolation:false,scope:'Sampled worker/native subtrees showed no sockets. Desktop private-LAN TLS9443 receiver sockets are separate. Short-lived sockets between samples may be missed.'},remainingGaps:candidate.limitations,retainedFailureStatus:{physicalObservationFailed:candidate.physicalObservationFailed,failedSteps:candidate.steps.filter(s=>s.passed!==true).map(s=>s.operation),nativePhoneAssertions:step('paired-fold-photo-received')},screenshots:{file:'physical-assisted-approved-history.png',independentlyVisuallyReviewed:true,scope:'Known synthetic approved text and selected-patient history after assistant navigation; no QR or private source visible.'}};
if(publishReviewedLocal)await writeFile(path.join(output,'physical-performance-binding-review.json'),JSON.stringify({...review,visualReviewBinding},null,2));
else {
  const existingReview=JSON.parse(await readFile(path.join(output,'physical-performance-binding-review.json'),'utf8'));
  assert.deepEqual(existingReview.visualReviewBinding,visualReviewBinding,'Published review must retain the exact visually reviewed media/run binding.');
}
console.log(JSON.stringify({mode:publishReviewedLocal?'explicit-reviewed-publication':'read-only-published-verification',workflowStatus:review.workflowStatus,bindings,failedSteps:review.retainedFailureStatus.failedSteps},null,2));
