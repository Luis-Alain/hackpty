// Cache compartido del modelo LLM principal (extracción, follow-up, RAG generation)
// para evitar cargarlo por separado en cada ruta.
import { LLAMA_3_2_1B_INST_Q4_0 } from '@qvac/sdk';
import { cargar, type LoadedModel } from './bigModel.js';

let modeloCache: LoadedModel | null = null;
let cargaPromesa: Promise<LoadedModel> | null = null;

export async function obtenerModeloLLM(): Promise<LoadedModel> {
  if (modeloCache) return modeloCache;
  if (!cargaPromesa) {
    cargaPromesa = cargar({
      modelSrc: LLAMA_3_2_1B_INST_Q4_0,
      etiqueta: 'Llama-3.2-1B-Instruct-Q4_0',
      hardware: 'laptop',
      device: 'gpu',
      ctx: 2048,
    }).then((m) => {
      modeloCache = m;
      return m;
    });
  }
  return cargaPromesa;
}
