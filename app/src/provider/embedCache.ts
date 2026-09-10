// Cache compartido del modelo de embeddings. Debe ser un modelo de tipo
// "llamacpp-embedding" — el modelo de completion (LLM) NO soporta embed().
import { EMBEDDINGGEMMA_300M_Q4_0 } from '@qvac/sdk';
import { cargar, type LoadedModel } from './bigModel.js';

let modeloCache: LoadedModel | null = null;
let cargaPromesa: Promise<LoadedModel> | null = null;

export async function obtenerModeloEmbedding(): Promise<LoadedModel> {
  if (modeloCache) return modeloCache;
  if (!cargaPromesa) {
    cargaPromesa = cargar({
      modelSrc: EMBEDDINGGEMMA_300M_Q4_0,
      etiqueta: 'EmbeddingGemma-300M-Q4_0',
      hardware: 'laptop',
      device: 'gpu',
      tipo: 'embedding',
    }).then((m) => {
      modeloCache = m;
      return m;
    });
  }
  return cargaPromesa;
}
