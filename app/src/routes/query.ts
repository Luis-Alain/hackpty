import { Hono } from 'hono';
import { cargar, completar, descargar } from '../provider/bigModel.js';
import { embedTexto } from '../rag/embeddings.js';
import { Retriever } from '../rag/retrieval.js';
import * as repo from '../db/repository.js';
import { LLAMA_3_2_1B_INST_Q4_0 } from '@qvac/sdk';

export const queryRouter = new Hono();

let modeloCache: any = null;

async function obtenerModelo() {
  if (modeloCache) return modeloCache;
  modeloCache = await cargar({
    modelSrc: LLAMA_3_2_1B_INST_Q4_0,
    etiqueta: 'Llama-3.2-1B-Instruct-Q4_0',
    hardware: 'laptop',
    device: 'gpu',
    ctx: 2048,
  });
  return modeloCache;
}

queryRouter.post('/api/query', async (c) => {
  try {
    const body = await c.req.json();
    const pregunta: string = body.pregunta;

    if (!pregunta || typeof pregunta !== 'string') {
      return c.json({ error: 'pregunta debe ser string' }, { status: 400 });
    }
    if (pregunta.length > 10240) {
      return c.json({ error: 'pregunta muy larga (max 10KB)' }, { status: 400 });
    }
    if (!pregunta.trim()) {
      return c.json({ error: 'pregunta no puede estar vacía' }, { status: 400 });
    }

    const registros = repo.todosLosRegistros(1000);
    if (registros.length === 0) {
      return c.json({
        texto: 'No hay registros en la base de datos para consultar.',
        fuentes: [],
      });
    }

    const registrosConBuffer = registros.map((r) => ({
      id: r.id,
      embedding: r.embedding || Buffer.alloc(0),
    }));
    const retriever = new Retriever(registrosConBuffer);

    const modelo = await obtenerModelo();
    const preguntaEmbedding = await embedTexto(modelo.modelId, pregunta);

    const topK = 5;
    const candidatos = retriever.buscar(preguntaEmbedding, topK);

    if (candidatos.length === 0) {
      return c.json({
        texto: 'No encuentro registros relevantes para esa pregunta.',
        fuentes: [],
      });
    }

    const contextoDatos = candidatos
      .map((cand) => {
        const reg = registros.find((r) => r.id === cand.id);
        return reg
          ? `ID ${reg.id}: ${reg.cliente}, ${reg.pais}. ${reg.modalidad} ${reg.marca ?? ''}. Edad: ${reg.antiguedad ?? 'desconocida'}. Estado: ${reg.estado}.`
          : '';
      })
      .join('\n');

    const systemPrompt = `Eres un asistente que responde preguntas sobre una base de datos de equipos médicos. Responde en el idioma de la pregunta. Sé conciso y factual.`;
    const userMessage = `Contexto:\n${contextoDatos}\n\nPregunta: ${pregunta}\n\nResponde basándote SOLO en el contexto anterior.`;

    const { texto } = await completar(modelo, {
      history: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      maxTokens: 300,
      temperature: 0.3,
    });

    return c.json({
      texto: texto.trim(),
      fuentes: candidatos.map((cand) => {
        const reg = registros.find((r) => r.id === cand.id);
        return {
          id: cand.id,
          cliente: reg?.cliente ?? 'desconocido',
          score: cand.score,
        };
      }),
    });
  } catch (e) {
    console.error('Query error:', e);
    return c.json(
      {
        error: String(e),
        texto: null,
        fuentes: [],
      },
      { status: 500 }
    );
  }
});

queryRouter.get('/api/query/health', async (c) => {
  try {
    await obtenerModelo();
    return c.json({ status: 'ready', modelo: 'Llama-3.2-1B cargado' });
  } catch (e) {
    return c.json({ status: 'error', error: String(e) }, { status: 503 });
  }
});
