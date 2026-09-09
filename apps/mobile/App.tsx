import React, { useEffect, useRef, useState } from 'react';
import { AppState, Button, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as SecureStore from 'expo-secure-store';
import { CameraHandle, Credentials, NativeCamera, Pending, Transfer, parseInvitation } from './src/transfer';

const credentialKey = 'psyrec-paired-pc-v1';
const secureOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [scanning, setScanning] = useState(false);
  const [preview, setPreview] = useState(false);
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Loading encrypted capture queue…');
  const camera = useRef<CameraHandle>(null);
  const operation = useRef(false);
  const refresh = async () => setPending(await Transfer.pending());
  useEffect(() => {
    (async () => {
      try {
        const saved = await SecureStore.getItemAsync(credentialKey, secureOptions);
        if (saved) setCredentials(JSON.parse(saved));
        await refresh(); setStatus('Ready. Unlock the PC vault and select the intended encounter.');
      } catch { setStatus('Encrypted capture storage could not be opened. Keep app data intact for recovery.'); }
    })();
    const subscription = AppState.addEventListener('change', state => { setActive(state === 'active'); if (state !== 'active') { setPreview(false); setScanning(false); } });
    return () => subscription.remove();
  }, []);
  async function perform(work: () => Promise<void>) {
    if (operation.current) return;
    operation.current = true; setBusy(true);
    try { await work(); } catch (error) { setStatus(error instanceof Error ? error.message : 'Operation failed. Encrypted pending captures are retained.'); }
    finally { operation.current = false; setBusy(false); }
  }
  async function pair(data: string) {
    if (operation.current) return;
    setScanning(false);
    await perform(async () => {
      if ((await Transfer.pending()).length) throw new Error('Finish sending pending captures before pairing another encounter. Original retry credentials must be preserved.');
      const invite = parseInvitation(data);
      setStatus('Authenticating the PC certificate from the scanned QR…');
      const result = JSON.parse(await Transfer.pair(invite.endpoint, invite.certificateFingerprint, invite.secret));
      if (result.encounterId !== invite.encounterId || typeof result.deviceId !== 'string' || typeof result.token !== 'string') throw new Error('PC pairing response was invalid.');
      const next: Credentials = { version: 1, endpoint: invite.endpoint, certificateFingerprint: invite.certificateFingerprint,
        encounterId: result.encounterId, deviceId: result.deviceId, token: result.token };
      await SecureStore.setItemAsync(credentialKey, JSON.stringify(next), secureOptions);
      setCredentials(next); setStatus('Paired to the selected PC encounter. Capture the printed synthetic English note.');
    });
  }
  async function capture() {
    await perform(async () => {
      if (!credentials || !camera.current) throw new Error('Pair and open the camera first.');
      await camera.current.capture(credentials.encounterId);
      setPreview(false); await refresh(); setStatus('Photo encrypted on this phone. Send it to the paired PC.');
    });
  }
  async function send(item: Pending) {
    await perform(async () => {
      if (!credentials) throw new Error('Pair with the original PC encounter first.');
      setStatus('Sending over pinned TLS. Keep the PC vault unlocked.');
      await Transfer.send(credentials.endpoint, credentials.certificateFingerprint, credentials.deviceId, credentials.token, credentials.encounterId, item.transferId);
      await refresh(); setStatus('PC confirmed a matching durable encrypted receipt. Phone queue copy removed. Continue source review on the PC.');
    });
  }
  if (!active) return <SafeAreaView style={styles.page}><Text style={styles.title}>PsyRec Capture locked</Text></SafeAreaView>;
  return <SafeAreaView style={styles.page}><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.title}>PsyRec Capture</Text>
    <Text>Printed synthetic English clinician notes · Local PC inference</Text>
    <Text accessibilityLiveRegion="polite" style={styles.status}>{status}</Text>
    {!permission?.granted && <Button title="Allow camera for QR and note capture" onPress={() => void requestPermission()} />}
    {credentials && <View style={styles.card}><Text>Paired PC: {credentials.endpoint}</Text><Text>Encounter: {credentials.encounterId}</Text><Text>Verify this encounter on the PC before capture.</Text></View>}
    <Button title={credentials ? 'Pair another PC encounter' : 'Scan PC pairing QR'} disabled={busy || !permission?.granted || preview || pending.length > 0} onPress={() => setScanning(!scanning)} />
    {pending.length > 0 && <Text>Finish pending transfers before pairing another encounter. The original device credentials are retained for safe retries.</Text>}
    {scanning && <><Text>Scan only the QR shown on your own unlocked PsyRec PC.</Text><CameraView style={styles.camera} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={({ data }) => void pair(data)} /></>}
    {credentials && !scanning && <Button title={preview ? 'Close camera' : 'Photograph printed note'} disabled={busy || !permission?.granted || pending.some(x => x.encounterId === credentials.encounterId)} onPress={() => setPreview(!preview)} />}
    {preview && <><NativeCamera ref={camera} style={styles.camera} /><Text>Fill the frame with one printed page. Check focus, lighting and orientation.</Text><Button title="Capture and encrypt" disabled={busy} onPress={() => void capture()} /></>}
    <Text style={styles.subtitle}>Encrypted pending captures ({pending.length})</Text>
    {pending.map(item => <View key={item.transferId} style={styles.card}><Text>Captured {new Date(item.createdAt).toLocaleString()}</Text><Text>Encounter: {item.encounterId}</Text>
      <Button title="Send / retry safely" disabled={busy || !credentials || item.encounterId !== credentials.encounterId} onPress={() => void send(item)} />
      {item.encounterId !== credentials?.encounterId && <Text>Pair to this capture’s original encounter to send it.</Text>}</View>)}
    <Text>Interrupted sends remain encrypted for retry. A matching PC receipt is required before a queued capture is removed. Photos are never written to the gallery.</Text>
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: '#f2f5f9' }, content: { padding: 20, paddingTop: 42, gap: 16 }, title: { fontSize: 29, fontWeight: '700', color: '#152a46' }, subtitle: { fontSize: 19, fontWeight: '600' }, status: { padding: 15, backgroundColor: '#dcebf8', lineHeight: 22 }, card: { padding: 15, backgroundColor: '#fff', gap: 10 }, camera: { height: 380, borderRadius: 8 } });
