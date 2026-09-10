// Cache del modelo de OCR (extracción de texto de fotos de etiquetas/placas).
// OCR_LATIN cubre español/portugués/inglés (detector CRAFT derivado automáticamente).
import { OCR_LATIN } from '@qvac/sdk';
import { cargar, type LoadedModel } from './bigModel.js';

let modeloCache: LoadedModel | null = null;
let cargaPromesa: Promise<LoadedModel> | null = null;

export async function obtenerModeloVision(): Promise<LoadedModel> {
  if (modeloCache) return modeloCache;
  if (!cargaPromesa) {
    cargaPromesa = cargar({
      modelSrc: OCR_LATIN,
      etiqueta: 'OCR-Latin',
      hardware: 'laptop',
      device: 'gpu',
      tipo: 'vision',
    }).then((m) => {
      modeloCache = m;
      return m;
    });
  }
  return cargaPromesa;
}
