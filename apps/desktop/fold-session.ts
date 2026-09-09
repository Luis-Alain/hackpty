import type { BrowserWindow } from 'electron';

/** Bootstrap only a fresh synthetic session after the human creates its vault.
 * The human enters the passphrase, captures paper, reviews source and approves.
 * No password is embedded in code, environment variables or launch arguments. */
export async function prepareFoldSession(window: BrowserWindow, address: string) {
  const js = (source: string) => window.webContents.executeJavaScript(source, true);
  const wait = async (condition: string, attempts = 200) => {
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (window.isDestroyed()) throw new Error('Synthetic Fold setup was closed.');
      if (await js(condition)) return;
      const error = await js(`document.getElementById('notice').className==='error' ? document.getElementById('notice').textContent : ''`);
      if (error) throw new Error(error);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Synthetic Fold setup timed out.');
  };
  const initial = await js(`window.psyrec.call('status')`);
  if (initial.exists) throw new Error('Fresh Fold preparation refuses an existing vault. Use the fresh-session launcher.');
  window.show(); window.focus();
  // The human may leave the launch screen ready while printing the fixture.
  // Do not time out waiting for their passphrase or copy it into this process.
  while (await js(`document.getElementById('workspace').hidden`)) {
    if (window.isDestroyed()) throw new Error('Synthetic Fold setup was closed.');
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  await wait(`!document.getElementById('workspace').hidden && !document.getElementById('alias').disabled`);
  const snapshot = await js(`window.psyrec.call('snapshot')`);
  if (snapshot.patients.length || snapshot.encounters.length || snapshot.records.length) throw new Error('Fresh Fold setup found existing records and stopped without changing them.');
  for (const alias of ['SYNTHETIC ISOLATION CHECK', 'SYNTHETIC PRINTED DEMO-001']) {
    await js(`document.getElementById('alias').value=${JSON.stringify(alias)};document.getElementById('patientForm').requestSubmit()`);
    await wait(`!document.getElementById('newEncounter').disabled && document.getElementById('patient').selectedOptions[0]?.textContent === ${JSON.stringify(alias)}`);
  }
  await js(`document.getElementById('newEncounter').click()`);
  await wait(`!document.getElementById('pairPhone').disabled`);
  await js(`document.getElementById('pairPhone').click()`);
  await wait(`document.getElementById('pairDialog').open`);
  await js(`document.getElementById('lanAddress').value=${JSON.stringify(address)}`);
  await js(`document.getElementById('createInvite').click()`);
  await wait(`!document.getElementById('pairQr').hidden`);
  return { ready: true, endpoint: `https://${address}:9443`, fixtureId: 'DEMO-001', intendedSourceMedium: 'paper', observedSourceMedium: null, inferenceStarted: false, observerEnabled: true, humanReviewPending: true };
}
