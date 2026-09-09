import type { CaptureReceipt, PhoneLifecycleEvidence } from '../contracts/index.js';

const hash = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const text = (value: unknown, max = 100) => typeof value === 'string' && value.length > 0 && value.length <= max;
const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const object = (value: unknown): value is Record<string, any> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const keys = (value: Record<string, any>, allowed: string[]) => Object.keys(value).every(key => allowed.includes(key));
const need = (ok: unknown) => { if (!ok) throw new Error('Phone evidence schema or durable receipt binding is invalid.'); };

export function stablePhoneEvidence(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stablePhoneEvidence).join(',') + ']';
  if (object(value)) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stablePhoneEvidence(value[key])).join(',') + '}';
  return JSON.stringify(value);
}

/** Structural/authenticated storage gate. Lifecycle acceptance remains separate. */
export function validateStoredPhoneEvidence(value: unknown, receipt: CaptureReceipt): asserts value is PhoneLifecycleEvidence {
  need(object(value));
  const evidence = value as Record<string, any>;
  need(keys(evidence, ['schemaVersion', 'kind', 'platform', 'provenance', 'binding', 'build', 'events']));
  need(evidence.schemaVersion === 1 && evidence.kind === 'native-android-transfer-lifecycle' && evidence.platform === 'android');
  need(['native-camera-capture', 'synthetic-instrumentation'].includes(evidence.provenance));
  const binding = evidence.binding;
  need(object(binding) && keys(binding, ['transferId', 'encounterId', 'imageSha256', 'deviceId', 'captureId']));
  need(binding.transferId === receipt.transferId && binding.encounterId === receipt.encounterId && binding.deviceId === receipt.deviceId && binding.captureId === receipt.captureId && binding.imageSha256 === receipt.sha256);
  const build = evidence.build;
  need(object(build) && keys(build, ['packageName', 'versionName', 'versionCode', 'apkSha256']));
  need(text(build.packageName, 200) && text(build.versionName, 100) && Number.isSafeInteger(build.versionCode) && build.versionCode >= 1 && hash(build.apkSha256));
  need(Array.isArray(evidence.events) && evidence.events.length <= 512);
  const eventTypes = ['capture_encrypted', 'queue_reopened', 'send_started', 'tls_pin_verified', 'tls_pin_rejected', 'send_failed_queue_retained', 'receipt_rejected_queue_retained', 'matching_receipt_received', 'photo_replaced_by_encrypted_receipt'];
  let previousTime = -Infinity;
  for (const [index, event] of evidence.events.entries()) {
    need(object(event) && keys(event, ['sequence', 'type', 'observedAt', 'processSessionId', 'attemptId', 'queueCiphertextSha256', 'failureKind', 'interruption', 'receipt', 'photoPresent', 'receiptPersisted', 'imageSha256Verified', 'apkSha256']));
    need(event.sequence === index + 1 && eventTypes.includes(event.type) && date(event.observedAt) && text(event.processSessionId) && hash(event.apkSha256));
    const timestamp = Date.parse(event.observedAt);
    need(timestamp >= previousTime); previousTime = timestamp;
    if (event.attemptId !== undefined) need(text(event.attemptId));
    if (event.queueCiphertextSha256 !== undefined) need(hash(event.queueCiphertextSha256));
    if (event.failureKind !== undefined) need(['network', 'certificate', 'receipt', 'other'].includes(event.failureKind));
    for (const key of ['photoPresent', 'receiptPersisted', 'imageSha256Verified']) if (event[key] !== undefined) need(typeof event[key] === 'boolean');
    if (event.interruption !== undefined) {
      const interruption = event.interruption;
      need(object(interruption) && keys(interruption, ['method', 'bytesWritten', 'totalBytes', 'byteCountMethod']));
      need(interruption.method === 'native-mid-upload-disconnect' && interruption.byteCountMethod === 'application-output-stream-write-and-flush');
      need(Number.isSafeInteger(interruption.bytesWritten) && Number.isSafeInteger(interruption.totalBytes) && interruption.bytesWritten >= 0 && interruption.totalBytes > 0 && interruption.bytesWritten <= interruption.totalBytes);
    }
    if (event.receipt !== undefined) {
      const observed = event.receipt;
      need(object(observed) && keys(observed, ['deviceId', 'transferId', 'encounterId', 'captureId', 'sha256', 'receivedAt', 'duplicate']));
      need(observed.deviceId === receipt.deviceId && observed.transferId === receipt.transferId && observed.encounterId === receipt.encounterId && observed.captureId === receipt.captureId && observed.sha256 === receipt.sha256 && observed.receivedAt === receipt.receivedAt);
      if (observed.duplicate !== undefined) need(typeof observed.duplicate === 'boolean');
    }
  }
  need(Buffer.byteLength(JSON.stringify(evidence), 'utf8') <= 256 * 1024);
}
