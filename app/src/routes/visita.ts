import { Hono } from 'hono';
import { obtenerModeloLLM } from '../provider/llmCache.js';
import { obtenerModeloEmbedding } from '../provider/embedCache.js';
import { extraerEstructura } from '../rag/extraction.js';
import { embedTexto, resumenDe } from '../rag/embeddings.js';
import * as visitaRepo from '../db/visitaRepository.js';
import * as repo from '../db/repository.js';
import { MODALIDADES } from '../validation/referenceLists.js';
import { registrar } from '../metrics/performanceLog.js';

export const visitaRouter = new Hono();

const MAX_OBSERVACION_BYTES = 10 * 1024; // 10KB, mismo límite que /api/query

visitaRouter.post('/api/visita/nueva', (c) => {
  try {
    const visitaId = visitaRepo.crearVisita();
    return c.json({ visita_id: visitaId, estado: 'en_progreso' }, 201);
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

visitaRouter.post('/api/visita/:id/extraer', async (c) => {
  const t0 = performance.now();
  try {
    const visitaId = Number(c.req.param('id'));
    if (!Number.isInteger(visitaId)) {
      return c.json({ error: 'id de visita inválido' }, 400);
    }
    const visita = visitaRepo.obtenerVisita(visitaId);
    if (!visita) {
      return c.json({ error: 'Visita no encontrada' }, 404);
    }

    const body = await c.req.json();
    const observacion: string = body.observacion;

    if (!observacion || typeof observacion !== 'string' || !observacion.trim()) {
      return c.json({ error: 'observacion debe ser un string no vacío' }, 400);
    }
    if (Buffer.byteLength(observacion, 'utf8') > MAX_OBSERVACION_BYTES) {
      return c.json({ error: 'observacion muy larga (max 10KB)' }, 400);
    }

    visitaRepo.actualizarObservacion(visitaId, observacion);

    const modelo = await obtenerModeloLLM();
    const resultado = await extraerEstructura(modelo, observacion);

    visitaRepo.guardarExtraccion(visitaId, JSON.stringify(resultado));

    registrar({
      stage: 'visita_extraer',
      status: 'ok',
      visita_id: visitaId,
      completeness: resultado.completeness,
      estado_global: resultado.estadoGlobal,
      end_to_end_ms: Math.round(performance.now() - t0),
    });

    return c.json(resultado);
  } catch (e) {
    registrar({
      stage: 'visita_extraer',
      status: 'error',
      error: String(e),
      end_to_end_ms: Math.round(performance.now() - t0),
    });
    return c.json({ error: String(e) }, 500);
  }
});

interface GuardarBody {
  cliente?: string;
  ciudad?: string;
  pais?: string;
  modalidad?: string;
  cantidad?: number;
  marca?: string;
  modelo?: string;
  antiguedad?: number;
  estado?: string;
  colaborador?: string;
}

visitaRouter.post('/api/visita/:id/guardar', async (c) => {
  const t0 = performance.now();
  try {
    const visitaId = Number(c.req.param('id'));
    if (!Number.isInteger(visitaId)) {
      return c.json({ error: 'id de visita inválido' }, 400);
    }
    const visita = visitaRepo.obtenerVisita(visitaId);
    if (!visita) {
      return c.json({ error: 'Visita no encontrada' }, 404);
    }
    if (visita.estado_visita === 'completada') {
      return c.json({ error: 'Esta visita ya fue guardada', registro_id: visita.registro_id }, 409);
    }

    const body: GuardarBody = await c.req.json();

    if (!body.cliente || typeof body.cliente !== 'string') {
      return c.json({ error: 'cliente es requerido' }, 400);
    }
    if (!body.pais || typeof body.pais !== 'string') {
      return c.json({ error: 'pais es requerido' }, 400);
    }
    if (!body.modalidad || !MODALIDADES.includes(body.modalidad)) {
      return c.json({ error: `modalidad debe ser una de: ${MODALIDADES.join(', ')}` }, 400);
    }
    const estado = body.estado && ['Confirmed', 'Reported', 'Estimated', 'Unknown'].includes(body.estado)
      ? body.estado
      : 'Unknown';

    const resumen = await resumenDe({
      modalidad: body.modalidad,
      marca: body.marca ?? null,
      modelo: body.modelo ?? null,
      cliente: body.cliente,
      ciudad: body.ciudad ?? null,
      pais: body.pais,
      antiguedad: body.antiguedad ?? null,
      estado,
    });

    const modeloEmbed = await obtenerModeloEmbedding();
    const embeddingVector = await embedTexto(modeloEmbed.modelId, resumen);
    const embeddingBuffer = Buffer.from(embeddingVector.buffer);

    const registroId = repo.crearRegistro({
      cliente: body.cliente,
      ciudad: body.ciudad ?? null,
      pais: body.pais,
      modalidad: body.modalidad,
      cantidad: body.cantidad ?? null,
      marca: body.marca ?? null,
      modelo: body.modelo ?? null,
      antiguedad: body.antiguedad ?? null,
      fuente: 'visita',
      estado,
      colaborador: body.colaborador ?? null,
      timestamp: new Date().toISOString(),
      resumen,
      embedding: embeddingBuffer,
    });

    visitaRepo.completarVisita(visitaId, registroId);

    registrar({
      stage: 'visita_guardar',
      status: 'ok',
      visita_id: visitaId,
      registro_id: registroId,
      estado,
      end_to_end_ms: Math.round(performance.now() - t0),
    });

    return c.json({ registro_id: registroId, estado, message: 'Registro guardado exitosamente' }, 201);
  } catch (e) {
    registrar({
      stage: 'visita_guardar',
      status: 'error',
      error: String(e),
      end_to_end_ms: Math.round(performance.now() - t0),
    });
    return c.json({ error: String(e) }, 500);
  }
});
