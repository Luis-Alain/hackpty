import type { BrowserWindow } from 'electron';

/** Prepare a synthetic physical-device session using the same visible UI handlers.
 * The clinician performs photo review, source confirmation and exact approval. */
export async function prepareFoldSession(window: BrowserWindow, address: string) {
  const js = (source: string) => window.webContents.executeJavaScript(source, true);
  const wait = async (condition: string) => {
    for (let attempt = 0; attempt < 200; attempt++) {
      if (await js(condition)) return;
      const error = await js(`document.getElementById('notice').className==='error' ? document.getElementById('notice').textContent : ''`);
      if (error) throw new Error(error);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Synthetic Fold setup timed out.');
  };
  const initial = await js(`window.psyrec.call('status')`);
  await wait(`document.getElementById('unlock').textContent.includes(${JSON.stringify(initial.exists ? 'Unlock' : 'Create')})`);
  await js(`document.getElementById('passphrase').value='synthetic-fold-review-passphrase';document.getElementById('unlock').click()`);
  await wait(`!document.getElementById('workspace').hidden`);
  let snapshot = await js(`window.psyrec.call('snapshot')`);
  if (!snapshot.patients.length) {
    await js(`document.getElementById('alias').value='SYNTHETIC FOLD DEMO';document.getElementById('patientForm').requestSubmit()`);
    await wait(`!document.getElementById('newEncounter').disabled`);
    await js(`document.getElementById('newEncounter').click()`);
    await wait(`!document.getElementById('pairPhone').disabled`);
    snapshot = await js(`window.psyrec.call('snapshot')`);
  } else {
    await wait(`!document.getElementById('newEncounter').disabled`);
    await js(`document.querySelector('#encounters button').click()`);
    await wait(`!document.getElementById('newEncounter').disabled`);
  }
  const received = snapshot.encounters.some(e => e.capture);
  if (!received) {
    await js(`document.getElementById('pairPhone').click()`);
    await wait(`document.getElementById('pairDialog').open`);
    await js(`document.getElementById('lanAddress').value=${JSON.stringify(address)}`);
    await js(`document.getElementById('createInvite').click()`);
    await wait(`!document.getElementById('pairQr').hidden`);
  }
  window.show(); window.focus();
  return { ready: true, endpoint: `https://${address}:9443`, syntheticOnly: true, inferenceStarted: false, receivedCapturePreserved: received, observerEnabled: true };
}
