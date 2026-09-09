// Sellado Ed25519 de actas: quien captura firma con la llave de su nodo; cualquiera verifica
// sin servidor ni modelo. Solo crypto de Node: sin dependencias.
import { generateKeyPairSync, createPrivateKey, createPublicKey, sign, verify, createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// JSON canónico: llaves ordenadas en todos los niveles, sin espacios. Así el hash no depende
// del orden en que se armó el objeto.
export function canonico(v) {
  if (Array.isArray(v)) return '[' + v.map(canonico).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonico(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
export const huella = obj => createHash('sha256').update(canonico(obj)).digest('hex');

// Llave del nodo: se crea la primera vez y se guarda en PEM (fuera de git).
export function llaveNodo(ruta = process.env.LLAVE_NODO ?? 'datos/llave-nodo.pem') {
  if (!existsSync(ruta)) {
    const { privateKey } = generateKeyPairSync('ed25519');
    mkdirSync(dirname(ruta), { recursive: true });
    writeFileSync(ruta, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  }
  const privada = createPrivateKey(readFileSync(ruta));
  const publica = createPublicKey(privada).export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');
  return { privada, publica };
}

// sellar(): devuelve una copia del objeto con su sello. El hash cubre todo menos el sello.
export function sellar(obj, llave, { firmante } = {}) {
  const { sello: _, ...cuerpo } = obj;
  const hash = huella(cuerpo);
  const firma = sign(null, Buffer.from(hash, 'hex'), llave.privada).toString('base64');
  return { ...cuerpo, sello: { alg: 'ed25519', hash, firma, publica: llave.publica, firmante: firmante ?? null, ts: new Date().toISOString() } };
}

// verificar(): recalcula el hash y comprueba la firma con la llave pública que viaja en el sello.
export function verificar(sellado) {
  const { sello, ...cuerpo } = sellado ?? {};
  if (!sello?.hash || !sello?.firma || !sello?.publica) return { valido: false, motivo: 'sin sello' };
  if (huella(cuerpo) !== sello.hash) return { valido: false, motivo: 'el contenido cambió después de sellar' };
  const der = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(sello.publica, 'hex')]);
  const ok = verify(null, Buffer.from(sello.hash, 'hex'), createPublicKey({ key: der, format: 'der', type: 'spki' }), Buffer.from(sello.firma, 'base64'));
  return ok ? { valido: true, publica: sello.publica, firmante: sello.firmante } : { valido: false, motivo: 'la firma no corresponde a la llave' };
}
