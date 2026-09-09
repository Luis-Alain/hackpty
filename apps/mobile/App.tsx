import React, { useEffect, useRef, useState } from 'react';
import { AppState, Platform, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as SecureStore from 'expo-secure-store';
import { CameraHandle, Credentials, NativeCamera, Pending, Transfer, parseInvitation } from './src/transfer';
import { Action, Disclosure, Header, Notice, SetupStep, color, NoticeValue, ui } from './src/capture-ui';

const credentialKey = 'psyrec-paired-pc-v1';
const secureOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const nativeCertificateMismatch = 'Paired PC certificate does not match.';
const legacyObservationMissing = 'This capture predates native lifecycle evidence. No history has been reconstructed.';

function isCertificateMismatch(message: string): boolean {
  return message === nativeCertificateMismatch;
}

function isLegacyObservationMissing(message: string): boolean {
  return message === legacyObservationMissing || message.endsWith('\n' + legacyObservationMissing) || message.endsWith(': ' + legacyObservationMissing);
}

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [storageReady, setStorageReady] = useState(false);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [completed, setCompleted] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [preview, setPreview] = useState(false);
  const [syncedEncounterId, setSyncedEncounterId] = useState<string | null>(null);
  const [legacyEvidenceEncounterId, setLegacyEvidenceEncounterId] = useState<string | null>(null);
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showChecks, setShowChecks] = useState(false);
  const [showConnection, setShowConnection] = useState(false);
  const [status, setStatus] = useState<NoticeValue>({
    tone: 'info',
    title: 'Capture state',
    body: 'Loading encrypted capture queue…',
  });

  const { width } = useWindowDimensions();
  const coverScreen = width >= 700;
  const topInset = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0;
  const camera = useRef<CameraHandle>(null);
  const operation = useRef(false);

  const setNotice = (title: string, body: string, tone: NoticeValue['tone'] = 'info') =>
    setStatus({ tone, title, body });

  const refreshPending = async () => {
    setPending(await Transfer.pending());
  };

  useEffect(() => {
    (async () => {
      try {
        const saved = await SecureStore.getItemAsync(credentialKey, secureOptions);
        if (saved) {
          const restored: Credentials = JSON.parse(saved);
          setCredentials(restored);
          const restoredCompleted = await Transfer.completed(restored.encounterId);
          setCompleted(restoredCompleted);
          setSyncedEncounterId(Platform.OS === 'android' ? null : restored.encounterId);
          setLegacyEvidenceEncounterId(null);
          if (Platform.OS === 'android' && restoredCompleted) {
            setNotice(
              'Observations sync needed',
              'This encounter has a durable receipt. Retry saving observations before pairing another encounter.',
            );
          } else {
            setNotice('Ready', 'A clear record starts with the source.');
          }
        } else {
          setNotice('Ready', 'A clear record starts with the source.');
          setLegacyEvidenceEncounterId(null);
        }

        await refreshPending();
        setStorageReady(true);
      } catch {
        setNotice('Storage failure', 'Encrypted capture storage could not be opened. Keep app data intact for recovery.', 'error');
      }
    })();

    const subscription = AppState.addEventListener('change', state => {
      setActive(state === 'active');
      if (state !== 'active') {
        setPreview(false);
        setScanning(false);
      }
    });

    return () => subscription.remove();
  }, []);

  function setFailure(error: unknown, fallback: string) {
    if (error instanceof Error && isCertificateMismatch(error.message)) {
      setStatus({ tone: 'error', title: 'Pairing failed', body: error.message });
      return;
    }

    const body = error instanceof Error ? error.message : fallback;
    setStatus({ tone: 'error', title: 'Action failed', body });
  }

  async function perform(work: () => Promise<void>) {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    try {
      await work();
    } catch (error) {
      setFailure(error, 'Operation failed. Encrypted pending captures are retained.');
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }

  const needsObservationSync =
    Platform.OS === 'android' &&
    !!credentials &&
    completed &&
    syncedEncounterId !== credentials.encounterId &&
    legacyEvidenceEncounterId !== credentials.encounterId;
  const hasPending = pending.length > 0;
  const mainHeadline = hasPending
    ? 'Your photo is still safe here.'
    : completed
      ? 'Saved on your PC.'
      : credentials
        ? 'Photograph the printed note.'
        : 'A clear record. Starts with the source.';

  async function openPairingScanner() {
    if (!permission?.granted || operation.current || busy || !storageReady) return;

    if (scanning) {
      setScanning(false);
      setNotice('Pairing', 'Stopped pairing scan.');
      return;
    }

    await perform(async () => {
      const items = await Transfer.pending();
      if (items.length > 0) {
        throw new Error('Finish sending pending captures before pairing another encounter. Original retry credentials must be preserved.');
      }
      if (needsObservationSync) {
        throw new Error('Retry saving transfer observations before pairing another encounter.');
      }
      setPending(items);
      setScanning(true);
      setNotice('Pairing', 'Scan only the QR shown on your unlocked PsyRec PC.');
    });
  }

  async function pair(data: string) {
    if (operation.current || !permission?.granted || !storageReady) return;

    setScanning(false);
    await perform(async () => {
      const items = await Transfer.pending();
      if (items.length > 0) {
        throw new Error('Finish sending pending captures before pairing another encounter. Original retry credentials must be preserved.');
      }
      if (needsObservationSync) {
        throw new Error('Retry saving transfer observations before pairing another encounter.');
      }

      const invite = parseInvitation(data);
      setNotice('Pairing', 'Authenticating the PC certificate from scanned QR…');
      const result = JSON.parse(await Transfer.pair(invite.endpoint, invite.certificateFingerprint, invite.secret));
      if (
        result.encounterId !== invite.encounterId ||
        typeof result.deviceId !== 'string' ||
        typeof result.token !== 'string'
      ) {
        throw new Error('PC pairing response was invalid.');
      }

      const next: Credentials = {
        version: 1,
        endpoint: invite.endpoint,
        certificateFingerprint: invite.certificateFingerprint,
        encounterId: result.encounterId,
        deviceId: result.deviceId,
        token: result.token,
      };
      await SecureStore.setItemAsync(credentialKey, JSON.stringify(next), secureOptions);
      const restoredCompleted = await Transfer.completed(next.encounterId);
      setCredentials(next);
      setCompleted(restoredCompleted);
      setSyncedEncounterId(Platform.OS === 'android' ? null : next.encounterId);
      setNotice('Paired', 'Paired to the selected PC encounter. Capture the printed synthetic English note.', 'success');
      await refreshPending();
    });
  }

  async function capture() {
    await perform(async () => {
      if (!credentials || !camera.current) {
        throw new Error('Pair and open the camera first.');
      }
      if (completed) {
        throw new Error('This encounter is already complete. Pair next only after sync on Android.');
      }
      await camera.current.capture(credentials.encounterId);
      setPreview(false);
      await refreshPending();
      setNotice('Capture encrypted', 'Photo encrypted on this phone. Send it to the paired PC.');
    });
  }

  async function send(item: Pending) {
    await perform(async () => {
      if (!credentials) {
        throw new Error('Pair with the original PC encounter first.');
      }

      if (Platform.OS === 'android') {
        setSyncedEncounterId(null);
      }

      setNotice('Send', 'Sending over pinned TLS. Keep the PC vault unlocked.');
      await Transfer.send(
        credentials.endpoint,
        credentials.certificateFingerprint,
        credentials.deviceId,
        credentials.token,
        credentials.encounterId,
        item.transferId,
      );

      const nextCompleted = await Transfer.completed(credentials.encounterId);
      setCompleted(nextCompleted);
      await refreshPending();

      if (!nextCompleted) {
        setNotice('Send queued', 'Upload remains pending. Keep retrying until the PC confirms the receipt.');
        return;
      }

      if (Transfer.syncEvidence) {
        try {
          await Transfer.syncEvidence(
            credentials.endpoint,
            credentials.certificateFingerprint,
            credentials.deviceId,
            credentials.token,
            credentials.encounterId,
          );
          setSyncedEncounterId(credentials.encounterId);
          setNotice('Transfer synced', 'PC confirmed matching receipt and saved native transfer observations.');
        } catch {
          setSyncedEncounterId(null);
          setNotice('Receipt confirmed', 'PC confirmed matching receipt. Photo removed. Retry saving observations before pairing next encounter.', 'info');
        }
      } else {
        if (Platform.OS === 'android') {
          setSyncedEncounterId(credentials.encounterId);
        }
        setNotice('Receipt received', 'PC confirmed the matching durable encrypted receipt. Continue source review on the PC.', 'success');
      }
    });
  }

  async function verifyPending(item: Pending, mode: 'wrong-certificate' | 'interrupted-upload') {
    await perform(async () => {
      if (!credentials || !Transfer.verifyPending) {
        throw new Error('Android native verification is unavailable.');
      }

      setNotice(
        'Synthetic check',
        mode === 'wrong-certificate'
          ? 'Checking rejection of an intentionally incorrect certificate pin…'
          : 'Interrupting a real partial encrypted upload before completion…',
      );

      const result = JSON.parse(await Transfer.verifyPending(
        credentials.endpoint,
        credentials.certificateFingerprint,
        credentials.deviceId,
        credentials.token,
        credentials.encounterId,
        item.transferId,
        mode,
      ));

      await refreshPending();
      if (!result.queueRetained || !(result.rejected || result.interrupted)) {
        throw new Error('Verification did not establish queue retention. Keep app data intact for review.');
      }

      if (mode === 'wrong-certificate' && result.rejected) {
        setNotice('Verification', 'Incorrect certificate rejected. The pending photo remains encrypted for retry.', 'success');
      } else if (mode === 'interrupted-upload' && result.interrupted) {
        setNotice('Verification', 'Partial upload interrupted. The pending photo remains encrypted. Retry safely to complete it.', 'success');
      } else {
        throw new Error('Verification did not establish queue retention. Keep app data intact for review.');
      }
    });
  }

  async function syncObservations() {
    await perform(async () => {
      if (!credentials || !Transfer.syncEvidence) {
        throw new Error('Android native observations are unavailable.');
      }

      try {
        await Transfer.syncEvidence(
          credentials.endpoint,
          credentials.certificateFingerprint,
          credentials.deviceId,
          credentials.token,
          credentials.encounterId,
        );
        setSyncedEncounterId(credentials.encounterId);
        setLegacyEvidenceEncounterId(null);
        await refreshPending();
        setNotice('Observations synced', 'PC acknowledged encrypted native transfer observations for this matching receipt.', 'success');
      } catch (error) {
        if (error instanceof Error && isLegacyObservationMissing(error.message)) {
          setLegacyEvidenceEncounterId(credentials.encounterId);
          setSyncedEncounterId(null);
          await refreshPending();
          setNotice('Observations unavailable', 'Not recorded by the earlier app.');
          return;
        }
        throw error;
      }
    });
  }

  return (
    <SafeAreaView style={[styles.page, Platform.OS === 'android' ? { paddingTop: topInset } : undefined]}>
      <Header />
      {!active ? (
        <View style={styles.lockState}>
          <Text style={styles.lockTitle}>PsyRec Capture locked</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, coverScreen && styles.contentWide]}>
          <Text style={styles.title}>{mainHeadline}</Text>
          <Notice value={status} />

          {!permission?.granted && <Action label="Allow camera for QR and note capture" onPress={() => void requestPermission()} />}

          {(!hasPending && !completed) ? (
            <Action
              label={scanning ? 'Stop QR scan' : credentials ? 'Pair another PC encounter' : 'Scan PC pairing QR'}
              onPress={() => void openPairingScanner()}
              disabled={busy || !permission?.granted || preview || !storageReady || needsObservationSync}
            />
          ) : null}

          {scanning ? (
            <View style={styles.panel}>
              <Text style={ui.body}>Scan only the QR shown on your unlocked PsyRec PC.</Text>
              <CameraView
                style={styles.camera}
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={({ data }) => void pair(data)}
              />
            </View>
          ) : null}

          {!scanning && credentials ? (
            <Disclosure
              title="Connection details"
              expanded={showConnection}
              onToggle={() => setShowConnection((open) => !open)}
            >
              <Text style={ui.body}>Paired PC: {credentials.endpoint}</Text>
              <Text style={ui.body}>Encounter: {credentials.encounterId}</Text>
            </Disclosure>
          ) : null}

          {hasPending ? (
            <View>
              {Platform.OS === 'android' && (
                <Action
                  secondary
                  label={showChecks ? 'Hide synthetic verification steps' : 'Synthetic verification steps'}
                  disabled={busy}
                  onPress={() => setShowChecks((open) => !open)}
                />
              )}

              <Text style={styles.subtitle}>Encrypted pending captures ({pending.length})</Text>
              <Text style={styles.note}>Interrupted sends stay encrypted for retry. Matching receipt is required before a queued capture is removed.</Text>

              {pending.map((item) => (
                <View key={item.transferId} style={styles.card}>
                  <Text style={ui.body}>Captured {new Date(item.createdAt).toLocaleString()}</Text>
                  <Text style={ui.body}>Encounter: {item.encounterId}</Text>

                  {item.encounterId === credentials?.encounterId ? (
                    <Action
                      label="Retry safely"
                      onPress={() => void send(item)}
                      disabled={busy || !storageReady}
                    />
                  ) : (
                    <Text style={styles.note}>Pair to this capture’s original encounter to send it.</Text>
                  )}

                  {showChecks ? (
                    <View style={styles.actions}>
                      <Action
                        secondary
                        label="Verify incorrect certificate rejection"
                        disabled={busy || !credentials || item.encounterId !== credentials.encounterId}
                        onPress={() => void verifyPending(item, 'wrong-certificate')}
                      />
                      <Action
                        secondary
                        label="Verify interrupted upload"
                        disabled={busy || !credentials || item.encounterId !== credentials.encounterId}
                        onPress={() => void verifyPending(item, 'interrupted-upload')}
                      />
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          ) : completed ? (
            <View>
              <View style={styles.card}>
                <Text style={ui.body}>Durable receipt: {completed ? 'Confirmed' : 'Pending'}</Text>
                {Platform.OS === 'android' ? (
                  <Text style={ui.body}>
                    Observations: {legacyEvidenceEncounterId === credentials?.encounterId ? 'Not recorded by the earlier app' : needsObservationSync ? 'Not yet confirmed' : 'Synced and saved on PC'}
                  </Text>
                ) : (
                  <Text style={ui.body}>Observations: Not recorded on this platform.</Text>
                )}
                <Text style={styles.note}>Check the source. Approve the exact record.</Text>
              </View>

              {needsObservationSync && (
                <Action
                  label="Retry saving transfer observations"
                  disabled={busy || !storageReady}
                  onPress={() => void syncObservations()}
                />
              )}

              <Action
                secondary
                label="Pair next PC encounter"
                onPress={() => void openPairingScanner()}
                disabled={busy || !storageReady || !permission?.granted || needsObservationSync}
              />
            </View>
          ) : credentials ? (
            <View>
              <Text style={styles.subtitle}>Ready to capture.</Text>
              {preview ? (
                <View>
                  <NativeCamera ref={camera} style={styles.camera} />
                  <Text style={styles.note}>Fill the frame with one printed page. Check focus, lighting and orientation.</Text>
                  <Action
                    label="Capture and encrypt"
                    onPress={() => void capture()}
                    disabled={!storageReady || !permission?.granted || busy}
                  />
                  <Action
                    secondary
                    label="Close camera"
                    onPress={() => setPreview(false)}
                    disabled={busy}
                  />
                </View>
              ) : (
                <Action
                  label="Open camera"
                  onPress={() => setPreview(true)}
                  disabled={!storageReady || !permission?.granted || busy}
                />
              )}
            </View>
          ) : (
            <View>
              <SetupStep number="01" title="Start with the source">
                Open your unlocked PC vault and pair to the encounter QR.
              </SetupStep>
              <SetupStep number="02" title="Take the note image">
                Photograph the printed synthetic English note at steady lighting.
              </SetupStep>
              <SetupStep number="03" title="Send to the PC source">
                Wait for the matching receipt before taking another capture.
              </SetupStep>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  actions: { marginTop: 8, gap: 8 },
  page: {
    flex: 1,
    backgroundColor: color.canvas,
  },
  content: {
    paddingHorizontal: 14,
    gap: 16,
    paddingBottom: 40,
  },
  contentWide: {
    maxWidth: 740,
    alignSelf: 'center',
    width: '100%',
  },
  card: {
    padding: 15,
    backgroundColor: color.white,
    borderColor: color.line,
    borderWidth: 1,
    borderRadius: 11,
    gap: 8,
  },
  panel: {
    gap: 10,
  },
  title: {
    color: color.ink,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '600',
    letterSpacing: -0.7,
  },
  subtitle: {
    color: color.ink,
    fontSize: 20,
    lineHeight: 30,
    fontWeight: '600',
  },
  note: {
    color: color.muted,
    fontSize: 14,
    lineHeight: 22,
  },
  camera: {
    height: 360,
    borderRadius: 8,
  },
  lockState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: color.canvas,
  },
  lockTitle: {
    color: color.ink,
    fontSize: 24,
    fontWeight: '600',
  },
});
