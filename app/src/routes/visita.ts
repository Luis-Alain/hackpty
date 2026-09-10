import { Hono } from 'hono';
import { obtenerModeloLLM } from '../provider/llmCache.js';
import { obtenerModeloEmbedding } from '../provider/embedCache.js';
import { extraerEstructura, derivarResultado, CAMPOS_ORDEN, type CampoNombre } from '../rag/extraction.js';
import { generarPreguntas, parsearRespuesta } from '../rag/followup.js';
import { embedTexto, resumenDe } from '../rag/embeddings.js';
import * as visitaRepo from '../db/visitaRepository.js';
import * as repo from '../db/repository.js';
import { MODALIDADES } from '../validation/referenceLists.js';
import { buscarDuplicados } from '../validation/duplicateCheck.js';
import { registrar } from '../metrics/performanceLog.js';
import type { CamposExtraidos, ExtraccionResultado } from '../types/record.js';

export const visitaRouter = new Hono();

function leerExtraccion(visita: { extraccion_json: string | null }): ExtraccionResultado | null {
  if (!visita.extraccion_json) return null;
  try {
    return JSON.parse(visita.extraccion_json) as ExtraccionResultado;
  } catch {
    return null;
  }
}

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

visitaRouter.post('/api/visita/:id/preguntas', async (c) => {
  try {
    const visitaId = Number(c.req.param('id'));
    if (!Number.isInteger(visitaId)) {
      return c.json({ error: 'id de visita inválido' }, 400);
    }
    const visita = visitaRepo.obtenerVisita(visitaId);
    if (!visita) {
      return c.json({ error: 'Visita no encontrada' }, 404);
    }
    const resultado = leerExtraccion(visita);
    if (!resultado) {
      return c.json({ error: 'Primero llama a /extraer para esta visita' }, 400);
    }

    const preguntas = generarPreguntas(resultado.campos);
    return c.json({ preguntas });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

interface RespuestasBody {
  respuestas?: Array<{ campo: CampoNombre; respuesta: string | null }>;
}

visitaRouter.post('/api/visita/:id/respuestas', async (c) => {
  try {
    const visitaId = Number(c.req.param('id'));
    if (!Number.isInteger(visitaId)) {
      return c.json({ error: 'id de visita inválido' }, 400);
    }
    const visita = visitaRepo.obtenerVisita(visitaId);
    if (!visita) {
      return c.json({ error: 'Visita no encontrada' }, 404);
    }
    const resultado = leerExtraccion(visita);
    if (!resultado) {
      return c.json({ error: 'Primero llama a /extraer para esta visita' }, 400);
    }

    const body: RespuestasBody = await c.req.json();
    if (!Array.isArray(body.respuestas)) {
      return c.json({ error: 'respuestas debe ser un array' }, 400);
    }

    const campos = { ...resultado.campos } as CamposExtraidos;
    for (const r of body.respuestas) {
      if (!r || !CAMPOS_ORDEN.includes(r.campo)) continue;
      campos[r.campo] = parsearRespuesta(r.campo, r.respuesta) as any;
    }

    const actualizado = derivarResultado(campos);
    visitaRepo.guardarExtraccion(visitaId, JSON.stringify(actualizado));

    return c.json(actualizado);
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

interface DuplicadosBody {
  cliente?: string;
  pais?: string;
  modalidad?: string;
  marca?: string;
  modelo?: string;
  cantidad?: number;
  antiguedad?: number;
}

visitaRouter.post('/api/visita/:id/duplicados', async (c) => {
  try {
    const visitaId = Number(c.req.param('id'));
    if (!Number.isInteger(visitaId)) {
      return c.json({ error: 'id de visita inválido' }, 400);
    }
    if (!visitaRepo.obtenerVisita(visitaId)) {
      return c.json({ error: 'Visita no encontrada' }, 404);
    }

    const body: DuplicadosBody = await c.req.json();
    const existentes = repo.todosLosRegistros(1000);
    const resultado = buscarDuplicados(
      {
        cliente: body.cliente ?? null,
        pais: body.pais ?? null,
        modalidad: body.modalidad ?? null,
        marca: body.marca ?? null,
        modelo: body.modelo ?? null,
        cantidad: body.cantidad ?? null,
        antiguedad: body.antiguedad ?? null,
      },
      existentes
    );

    return c.json({
      duplicados: resultado.slice(0, 3).map((d) => ({
        registro_id: d.registro.id,
        cliente: d.registro.cliente,
        pais: d.registro.pais,
        modalidad: d.registro.modalidad,
        marca: d.registro.marca,
        modelo: d.registro.modelo,
        antiguedad: d.registro.antiguedad,
        p: d.p,
        veredicto: d.veredicto,
      })),
    });
  } catch (e) {
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
  mergeConId?: number;
}

const ORDEN_CONFIANZA: Record<string, number> = {
  Confirmed: 3,
  Reported: 2,
  Estimated: 1,
  Unknown: 0,
};

// Combina un registro existente con datos nuevos: solo llena campos que estaban
// vacíos, y solo sube el estado de confianza (nunca lo degrada con datos más débiles).
function combinarConExistente(existente: repo.Registro, nuevo: GuardarBody, estadoNuevo: string) {
  return {
    cliente: existente.cliente || nuevo.cliente || existente.cliente,
    ciudad: existente.ciudad ?? nuevo.ciudad ?? null,
    pais: existente.pais || nuevo.pais || existente.pais,
    modalidad: existente.modalidad || nuevo.modalidad || existente.modalidad,
    cantidad: existente.cantidad ?? nuevo.cantidad ?? null,
    marca: existente.marca ?? nuevo.marca ?? null,
    modelo: existente.modelo ?? nuevo.modelo ?? null,
    antiguedad: existente.antiguedad ?? nuevo.antiguedad ?? null,
    estado:
      ORDEN_CONFIANZA[estadoNuevo] > ORDEN_CONFIANZA[existente.estado]
        ? estadoNuevo
        : existente.estado,
  };
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

    let existente: repo.Registro | undefined;
    if (body.mergeConId != null) {
      existente = repo.obtenerRegistro(body.mergeConId);
      if (!existente) {
        return c.json({ error: `No existe registro ${body.mergeConId} para combinar` }, 400);
      }
    }

    const datosFinal = existente
      ? combinarConExistente(existente, body, estado)
      : {
          cliente: body.cliente,
          ciudad: body.ciudad ?? null,
          pais: body.pais,
          modalidad: body.modalidad,
          cantidad: body.cantidad ?? null,
          marca: body.marca ?? null,
          modelo: body.modelo ?? null,
          antiguedad: body.antiguedad ?? null,
          estado,
        };

    const resumen = await resumenDe(datosFinal);

    const modeloEmbed = await obtenerModeloEmbedding();
    const embeddingVector = await embedTexto(modeloEmbed.modelId, resumen);
    const embeddingBuffer = Buffer.from(embeddingVector.buffer);

    let registroId: number;
    if (existente) {
      repo.actualizarRegistro(existente.id, { ...datosFinal, resumen, embedding: embeddingBuffer });
      registroId = existente.id;
    } else {
      registroId = repo.crearRegistro({
        ...datosFinal,
        fuente: 'visita',
        colaborador: body.colaborador ?? null,
        timestamp: new Date().toISOString(),
        resumen,
        embedding: embeddingBuffer,
      });
    }

    visitaRepo.completarVisita(visitaId, registroId);

    registrar({
      stage: 'visita_guardar',
      status: 'ok',
      visita_id: visitaId,
      registro_id: registroId,
      estado: datosFinal.estado,
      merged: Boolean(existente),
      end_to_end_ms: Math.round(performance.now() - t0),
    });

    return c.json(
      {
        registro_id: registroId,
        estado: datosFinal.estado,
        message: existente ? 'Registro combinado con uno existente' : 'Registro guardado exitosamente',
      },
      201
    );
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
