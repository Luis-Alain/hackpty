import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePhoneLifecycle } from '../scripts/validate-phone-lifecycle.js';

// Invented schema fixture only: this file never establishes physical evidence.
function fixture() {
  const receipt = { deviceId: 'test-device', transferId: 'test-transfer', encounterId: 'test-encounter', captureId: 'test-capture', sha256: 'a'.repeat(64), receivedAt: new Date(3000).toISOString() };
  const events: any[] = [];
  const add = (type: string, extra: any = {}) => events.push({ sequence: events.length + 1, type, observedAt: new Date(1000 + events.length).toISOString(), processSessionId: 'process-after-restart', apkSha256: 'f'.repeat(64), ...extra });
  add('capture_encrypted', { processSessionId: 'capture-process', queueCiphertextSha256: 'b'.repeat(64) });
  add('queue_reopened', { imageSha256Verified: true, queueCiphertextSha256: 'c'.repeat(64) });
  add('send_started', { attemptId: 'wrong-certificate' });
  add('tls_pin_rejected', { attemptId: 'wrong-certificate' });
  add('send_failed_queue_retained', { attemptId: 'wrong-certificate', failureKind: 'certificate', queueCiphertextSha256: 'd'.repeat(64) });
  add('send_started', { attemptId: 'interrupted' });
  add('tls_pin_verified', { attemptId: 'interrupted' });
  add('send_failed_queue_retained', { attemptId: 'interrupted', failureKind: 'network', queueCiphertextSha256: 'e'.repeat(64), interruption: { method: 'native-mid-upload-disconnect', bytesWritten: 4096, totalBytes: 8192, byteCountMethod: 'application-output-stream-write-and-flush' } });
  add('send_started', { attemptId: 'success' });
  add('tls_pin_verified', { attemptId: 'success' });
  add('matching_receipt_received', { attemptId: 'success', receipt });
  add('photo_replaced_by_encrypted_receipt', { attemptId: 'success', photoPresent: false, receiptPersisted: true, receipt });
  const report: any = { schemaVersion: 1, kind: 'native-android-transfer-lifecycle', platform: 'android', provenance: 'native-camera-capture', binding: { ...receipt, imageSha256: receipt.sha256 }, build: { packageName: 'tech.adwen.psyrec.capture', versionName: '0.1.0', versionCode: 1, apkSha256: 'f'.repeat(64) }, events };
  return { report, receipt };
}
test('phone gate accepts a complete bound observation schema without claiming the invented fixture as evidence', () => {
  const { report, receipt } = fixture();
  assert.equal(validatePhoneLifecycle(report, receipt).status, 'passed');
});
test('phone gate rejects missing, simulated, stale and disconnected lifecycle observations', () => {
  const mutations: Record<string, (value: ReturnType<typeof fixture>) => void> = {
    'missing lifecycle': v => { v.report = undefined; },
    'instrumentation is not camera capture': v => { v.report.provenance = 'synthetic-instrumentation'; },
    'another image': v => { v.report.binding.imageSha256 = '0'.repeat(64); },
    'another encounter': v => { v.report.binding.encounterId = 'other'; },
    'missing installed build': v => { v.report.build.apkSha256 = ''; },
    'mixed installed builds': v => { v.report.events[1].apkSha256 = '0'.repeat(64); },
    'no process restart': v => { v.report.events[1].processSessionId = 'capture-process'; },
    'reopened photo integrity failed': v => { v.report.events[1].imageSha256Verified = false; },
    'missing encrypted reopen': v => { delete v.report.events[1].queueCiphertextSha256; },
    'certificate error not retained': v => { v.report.events[4].failureKind = 'network'; },
    'unbound certificate attempt': v => { v.report.events[4].attemptId = 'other'; },
    'connection error before upload': v => { v.report.events[7].interruption.bytesWritten = 0; },
    'full upload is not interrupted upload': v => { v.report.events[7].interruption.bytesWritten = 8192; },
    'missing byte measurement method': v => { delete v.report.events[7].interruption.byteCountMethod; },
    'no retained ciphertext after interruption': v => { delete v.report.events[7].queueCiphertextSha256; },
    'retry not pinned': v => { v.report.events[9].attemptId = 'other'; },
    'mismatched receipt': v => { v.report.events[10].receipt = { ...v.receipt, captureId: 'other' }; },
    'replacement receipt differs': v => { v.report.events[11].receipt = { ...v.receipt, captureId: 'other' }; },
    'receipt not persisted': v => { v.report.events[11].receiptPersisted = false; },
    'photo not removed': v => { v.report.events[11].photoPresent = true; },
    'deletion not bound to receipt': v => { v.report.events[11].attemptId = 'other'; },
    'replacement from another process': v => { v.report.events[11].processSessionId = 'other-process'; },
    'reuse attempt ID': v => { v.report.events[5].attemptId = 'success'; },
    'queue activity after deletion': v => { v.report.events.push({ ...v.report.events[1], sequence: 13, observedAt: new Date(2000).toISOString() }); },
    'missing native sequence': v => { v.report.events[1].sequence = 1; },
    'unordered time': v => { v.report.events[10].observedAt = new Date(0).toISOString(); },
    'duplicate deletion': v => { v.report.events.push({ ...v.report.events[11], sequence: 13 }); },
    'deleted before receipt': v => { const end = v.report.events.splice(10, 2); v.report.events.push(end[1], end[0]); v.report.events.forEach((e, i) => { e.sequence = i + 1; e.observedAt = new Date(1000 + i).toISOString(); }); },
  };
  for (const [name, mutate] of Object.entries(mutations)) {
    const value = fixture(); mutate(value);
    assert.throws(() => validatePhoneLifecycle(value.report, value.receipt), /Phone lifecycle evidence:/, name);
  }
});
