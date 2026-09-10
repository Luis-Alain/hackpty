// Cache del modelo de transcripción de voz (STT). Modelo específico de español
// para mejor precisión en el caso de uso (colaboradores hablando en español).
import { WHISPER_SPANISH_TINY_Q8_0 } from '@qvac/sdk';
import { cargar, type LoadedModel } from './bigModel.js';

let modeloCache: LoadedModel | null = null;
let cargaPromesa: Promise<LoadedModel> | null = null;

export async function obtenerModeloSTT(): Promise<LoadedModel> {
  if (modeloCache) return modeloCache;
  if (!cargaPromesa) {
    cargaPromesa = cargar({
      modelSrc: WHISPER_SPANISH_TINY_Q8_0,
      etiqueta: 'Whisper-Spanish-Tiny-Q8_0',
      hardware: 'laptop',
      device: 'gpu',
      tipo: 'stt',
      idioma: 'es',
    }).then((m) => {
      modeloCache = m;
      return m;
    });
  }
  return cargaPromesa;
}
