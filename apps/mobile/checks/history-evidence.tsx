import React, { useEffect, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { registerRootComponent } from 'expo';
import { historyRuntime } from '../src/history-runtime';
import { Transfer, type Credentials } from '../src/transfer';
import type { MobileHistorySnapshot } from '../../../packages/contracts/mobile-history';

// Only history-evidence.init.gradle selects this entry. It never imports App,
// reads SecureStore, pairs a peer, fetches history, or opens the capture queue.
const text = 'SYNTHETIC HISTORY CHECK: The recorded favorite color is cobalt blue.';
const question = 'What favorite color is recorded?';
const credentials: Credentials = {
  version: 1, endpoint: 'https://10.0.0.1:9443', certificateFingerprint: 'a'.repeat(64),
  deviceId: '00000000-0000-4000-8000-000000000013',
  encounterId: '00000000-0000-4000-8000-000000000014', token: 'SYNTHETIC_UNUSED_TOKEN',
};
const snapshot: MobileHistorySnapshot = {
  version: 1, snapshotId: '00000000-0000-4000-8000-000000000012', syncedAt: '2026-09-09T00:00:00.000Z',
  binding: { deviceId: credentials.deviceId, encounterId: credentials.encounterId },
  patient: { id: '00000000-0000-4000-8000-000000000011', alias: 'SYNTHETIC FIXTURE ONLY' },
  records: [{ id: '00000000-0000-4000-8000-000000000015', patientId: '00000000-0000-4000-8000-000000000011',
    encounterId: credentials.encounterId, sourceRevision: 1, approvedAt: '2026-09-09T00:00:00.000Z', text, sourceText: text }],
  coverage: { totalRecords: 1, includedRecords: 1, partial: false },
};
let started = false;
function HistoryEvidenceCheck() {
  const [status, setStatus] = useState('Synthetic phone-local history check. Preparing bundled model.');
  useEffect(() => {
    let mounted = true;
    const stop = () => {
      Transfer.historyLock?.();
      void historyRuntime.lock().catch(() => { if (mounted) setStatus('FAILED: worker shutdown was not confirmed.'); });
    };
    const listener = AppState.addEventListener('change', value => { if (value !== 'active') stop(); });
    if (!started) {
      started = true;
      void (async () => {
        try {
          await historyRuntime.prepare();
          if (!historyRuntime.ready) throw new Error('Model did not become ready.');
          if (mounted) setStatus('Verified model loaded. Running one synthetic source lookup.');
          const answer = await historyRuntime.ask(snapshot, question, credentials);
          if (answer.passages.length !== 1 || answer.passages[0].recordId !== snapshot.records[0].id
            || answer.passages[0].sourceRevision !== 1 || answer.passages[0].field !== 'text'
            || text.slice(answer.passages[0].start, answer.passages[0].end) !== text) {
            throw new Error('The synthetic source was not selected exactly.');
          }
          await historyRuntime.lock();
          if (mounted) setStatus('PASSED: real synthetic lookup saved. Instrumentation verifies the encrypted journal and measured values.');
        } catch (error) {
          const reason = error instanceof Error ? error.message : 'The synthetic runtime check failed.';
          let closeFailure = '';
          await historyRuntime.lock().catch(() => { closeFailure = ' Worker shutdown was not confirmed.'; });
          if (mounted) setStatus('FAILED: ' + reason + closeFailure);
        }
      })();
    }
    return () => { mounted = false; listener.remove(); stop(); };
  }, []);
  return <View style={{ padding: 28, paddingTop: 72 }}><Text accessibilityLabel="history-evidence-status">{status}</Text></View>;
}
registerRootComponent(HistoryEvidenceCheck);

