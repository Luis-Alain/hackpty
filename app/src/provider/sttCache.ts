// Cache del modelo de transcripción de voz (STT).
//
// El registro de QVAC solo tiene una variante "tiny" (la más pequeña y menos
// precisa) específica de español (WHISPER_SPANISH_TINY_Q8_0); no existe una
// "base"/"small" en español. Los Whisper multilingües genéricos (entrenados
// en ~680k horas de audio en ~96 idiomas, incluyendo bastante español) superan
// en precisión a un "tiny" especializado simplemente por tener más parámetros,
// así que usamos WHISPER_SMALL_Q8_0 forzando idioma='es' vía modelConfig en
// vez del "tiny" en español.
import { WHISPER_SMALL_Q8_0 } from '@qvac/sdk';
import { cargar, type LoadedModel } from './bigModel.js';

let modeloCache: LoadedModel | null = null;
let cargaPromesa: Promise<LoadedModel> | null = null;

export async function obtenerModeloSTT(): Promise<LoadedModel> {
  if (modeloCache) return modeloCache;
  if (!cargaPromesa) {
    cargaPromesa = cargar({
      modelSrc: WHISPER_SMALL_Q8_0,
      etiqueta: 'Whisper-Small-Q8_0',
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
