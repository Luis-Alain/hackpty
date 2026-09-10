// Codifica muestras PCM (Float32, -1..1) capturadas en vivo como WAV de 16 bits.
//
// No usamos MediaRecorder + AudioContext.decodeAudioData(): decodeAudioData()
// falla de forma intermitente con "EncodingError: Unable to decode audio data"
// sobre blobs producidos por MediaRecorder, porque el WebM grabado en vivo no
// incluye Duration/Cues en el header (problema documentado de Chromium, no
// depende del códec de audio en sí). Capturar PCM directamente durante la
// grabación evita ese round-trip de codificar/decodificar por completo.
export function crearWavDesdeFloat32(muestras: Float32Array, sampleRate: number): Blob {
  const bytesPorMuestra = 2; // PCM de 16 bits
  const dataSize = muestras.length * bytesPorMuestra;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  escribirString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  escribirString(view, 8, 'WAVE');
  escribirString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // tamaño del chunk fmt
  view.setUint16(20, 1, true); // formato = PCM
  view.setUint16(22, 1, true); // 1 canal (mono)
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPorMuestra, true); // byte rate
  view.setUint16(32, bytesPorMuestra, true); // block align
  view.setUint16(34, 16, true); // bits por muestra
  escribirString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < muestras.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, muestras[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

function escribirString(view: DataView, offset: number, texto: string) {
  for (let i = 0; i < texto.length; i++) view.setUint8(offset + i, texto.charCodeAt(i));
}
