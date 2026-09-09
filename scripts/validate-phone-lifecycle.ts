import type { CaptureReceipt, PhoneLifecycleEvidence, PhoneLifecycleEvent } from '../packages/contracts/index.js';

const digest = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const identifier = (value: unknown) => typeof value === 'string' && value.length > 0;
const timestamp = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const receiptMatches = (actual: any, expected: CaptureReceipt) => actual && ['deviceId', 'transferId', 'encounterId', 'captureId', 'sha256', 'receivedAt'].every(k => actual[k] === expected[k]);

/** This release's primary device is the observed SM-F966B, not any Android phone. */
export function isPrimaryFoldDevice(device: PhoneLifecycleEvidence['device']): boolean {
  return typeof device?.manufacturer === 'string' && device.manufacturer.trim().toLowerCase() === 'samsung' &&
    typeof device?.model === 'string' && device.model.trim().toUpperCase() === 'SM-F966B';
}

/** Validates observed native lifecycle, not a source review or physical-paper attestation.
 * Stream byte counts describe application writes/flushes, not packet capture. */
export function validatePhoneLifecycle(report: PhoneLifecycleEvidence, receipt: CaptureReceipt, options: { primaryFold?: boolean } = {}) {
  const need = (ok: unknown, message: string) => { if (!ok) throw new Error(`Phone lifecycle evidence: ${message}`); };
  need(report?.schemaVersion === 1 && report.kind === 'native-android-transfer-lifecycle' && report.platform === 'android', 'native Android report required');
  need(report.provenance === 'native-camera-capture', 'synthetic instrumentation cannot establish the photographed-note workflow');
  need(receipt && ['deviceId', 'transferId', 'encounterId', 'captureId'].every(k => identifier(receipt[k])) && digest(receipt.sha256) && timestamp(receipt.receivedAt), 'canonical durable capture receipt required');
  const binding = report.binding;
  need(binding && ['deviceId', 'transferId', 'encounterId', 'captureId'].every(k => binding[k] === receipt[k]) && binding.imageSha256 === receipt.sha256, 'report must bind the exact received photo and encounter');
  need(report.build?.packageName === 'tech.adwen.psyrec.capture' && identifier(report.build.versionName) && Number.isInteger(report.build.versionCode) && report.build.versionCode > 0 && digest(report.build.apkSha256), 'measured installed Android build identity required');
  const device = report.device;
  need(device && [device.manufacturer, device.model].every(value => typeof value === 'string' && value.trim().length > 0 && value.length <= 100), 'measured native manufacturer and model required; legacy reports cannot acquire hardware identity retrospectively');
  if (options.primaryFold) need(isPrimaryFoldDevice(device), 'primary Fold requires the observed Samsung SM-F966B; replacement Android evidence remains separate');
  const events = report.events;
  need(Array.isArray(events) && events.length > 0 && events.length <= 256, 'bounded native observations required');
  const eventTypes = new Set(['capture_encrypted', 'queue_reopened', 'send_started', 'tls_pin_verified', 'tls_pin_rejected', 'send_failed_queue_retained', 'receipt_rejected_queue_retained', 'matching_receipt_received', 'photo_replaced_by_encrypted_receipt']);
  let previous = -Infinity;
  for (const [index, event] of events.entries()) {
    need(event && event.sequence === index + 1 && timestamp(event.observedAt) && Date.parse(event.observedAt) >= previous && identifier(event.processSessionId) && event.apkSha256 === report.build.apkSha256 && eventTypes.has(event.type), 'invalid, missing or unordered native observation');
    previous = Date.parse(event.observedAt);
    if (event.type !== 'capture_encrypted' && event.type !== 'queue_reopened') need(identifier(event.attemptId), 'transfer attempt identity required');
  }
  const exactlyOne = (type: PhoneLifecycleEvent['type']) => {
    const matches = events.filter(e => e.type === type);
    need(matches.length === 1, `exactly one ${type} observation required`);
    return matches[0];
  };
  const attempts = events.filter(e => e.type === 'send_started').map(e => e.attemptId);
  need(new Set(attempts).size === attempts.length, 'send attempt IDs must be unique');
  const capture = exactlyOne('capture_encrypted');
  need(capture.sequence === 1 && digest(capture.queueCiphertextSha256), 'fresh camera capture must be observed as encrypted queue ciphertext');
  const received = exactlyOne('matching_receipt_received');
  const replaced = exactlyOne('photo_replaced_by_encrypted_receipt');
  need(receiptMatches(received.receipt, receipt) && receiptMatches(replaced.receipt, receipt) && replaced.sequence > received.sequence && replaced.attemptId === received.attemptId && replaced.processSessionId === received.processSessionId && replaced.sequence === events.length && replaced.photoPresent === false && replaced.receiptPersisted === true, 'photo removal must follow the matching receipt and persist encrypted receipt metadata');
  need(events.some(e => e.type === 'queue_reopened' && e.sequence > capture.sequence && e.sequence < received.sequence && e.processSessionId !== capture.processSessionId && e.imageSha256Verified === true && digest(e.queueCiphertextSha256)), 'encrypted pending photo must reopen after a new native process session');

  const startFor = (event: PhoneLifecycleEvent) => events.find(e => e.type === 'send_started' && e.attemptId === event.attemptId && e.processSessionId === event.processSessionId && e.sequence < event.sequence);
  const verifiedBefore = (event: PhoneLifecycleEvent) => events.find(e => e.type === 'tls_pin_verified' && e.attemptId === event.attemptId && e.processSessionId === event.processSessionId && e.sequence < event.sequence && startFor(e));
  need(startFor(received) && verifiedBefore(received), 'successful retry must use the pinned native TLS send path');
  const rejected = events.find(e => e.type === 'tls_pin_rejected' && e.sequence < received.sequence && startFor(e) && events.some(retained => retained.type === 'send_failed_queue_retained' && retained.attemptId === e.attemptId && retained.processSessionId === e.processSessionId && retained.sequence > e.sequence && retained.sequence < received.sequence && retained.failureKind === 'certificate' && digest(retained.queueCiphertextSha256)));
  need(rejected && rejected.attemptId !== received.attemptId, 'wrong certificate must be rejected and the same encrypted queue retained before retry');
  const interrupted = events.find(e => {
    const detail = e.interruption;
    return e.type === 'send_failed_queue_retained' && e.failureKind === 'network' && e.sequence < received.sequence && e.attemptId !== received.attemptId && digest(e.queueCiphertextSha256) && verifiedBefore(e) &&
      detail?.method === 'native-mid-upload-disconnect' && detail.byteCountMethod === 'application-output-stream-write-and-flush' &&
      Number.isInteger(detail.bytesWritten) && Number.isInteger(detail.totalBytes) && detail.bytesWritten > 0 && detail.bytesWritten < detail.totalBytes;
  });
  need(interrupted, 'interrupted nonempty partial upload and encrypted retention before retry required');
  need(startFor(received)!.sequence > interrupted!.sequence && startFor(received)!.sequence > rejected!.sequence, 'successful retry must start after the observed failure checks');
  need(!events.some(e => ['tls_pin_rejected', 'send_failed_queue_retained', 'receipt_rejected_queue_retained'].includes(e.type) && e.attemptId === received.attemptId), 'successful attempt cannot also report a failed transfer');
  return { status: 'passed', scope: 'Native Android lifecycle bound to this camera photo and durable receipt', apkSha256: report.build.apkSha256, device: { manufacturer: device.manufacturer, model: device.model }, transferId: receipt.transferId };
}
