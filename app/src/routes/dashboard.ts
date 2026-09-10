import { Hono } from 'hono';
import * as repo from '../db/repository.js';
import { calcularConfianza, calcularUrgenciaRenovacion } from '../validation/confianza.js';

export const dashboardRouter = new Hono();

// Registro + su score de confianza (completitud + estado + frescura), sin
// exponer el campo binario `embedding` (no sirve al frontend y es pesado).
function conConfianza(r: repo.Registro) {
  const { embedding, ...resto } = r;
  const c = calcularConfianza(r);
  return {
    ...resto,
    confianza: c.score,
    confianzaComponentes: c.componentes,
    diasDesdeActualizacion: c.diasDesdeActualizacion,
    alertaFrescura: c.alertaFrescura,
  };
}

dashboardRouter.get('/api/dashboard/registros', (c) => {
  try {
    const registros = repo.todosLosRegistros(100);
    return c.json(registros.map(conConfianza));
  } catch (e) {
    return c.json({ error: String(e) }, { status: 500 });
  }
});

dashboardRouter.get('/api/dashboard/alertas', (c) => {
  try {
    const registros = repo.todosLosRegistros(1000).map(conConfianza).filter((r) => r.alertaFrescura);
    registros.sort((a, b) => b.diasDesdeActualizacion - a.diasDesdeActualizacion);
    return c.json(registros);
  } catch (e) {
    return c.json({ error: String(e) }, { status: 500 });
  }
});

dashboardRouter.get('/api/dashboard/agregado', (c) => {
  try {
    const por = c.req.query('por') || 'pais';
    let resultado;
    switch (por) {
      case 'estado':
        resultado = repo.agregadoPorEstado();
        break;
      case 'modalidad':
        resultado = repo.agregadoPorModalidad();
        break;
      case 'pais':
      default:
        resultado = repo.agregadoPorPais();
        break;
    }
    return c.json({ agregado: resultado, por });
  } catch (e) {
    return c.json({ error: String(e) }, { status: 500 });
  }
});

dashboardRouter.get('/api/dashboard/renovaciones', (c) => {
  try {
    const registros = repo
      .registrosParaRenovacion()
      .map((r) => {
        const renovacion = calcularUrgenciaRenovacion(r);
        if (!renovacion) return null;
        const { embedding, ...resto } = r;
        return {
          ...resto,
          urgencia: renovacion.urgencia,
          confianza: renovacion.confianza.score,
          alertaFrescura: renovacion.confianza.alertaFrescura,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => b.urgencia - a.urgencia);
    return c.json(registros);
  } catch (e) {
    return c.json({ error: String(e) }, { status: 500 });
  }
});

dashboardRouter.get('/api/dashboard/stats', (c) => {
  try {
    const total = repo.contarRegistros();
    const porPais = repo.agregadoPorPais();
    const porEstado = repo.agregadoPorEstado();
    return c.json({
      totalRegistros: total,
      porPais,
      porEstado,
    });
  } catch (e) {
    return c.json({ error: String(e) }, { status: 500 });
  }
});

dashboardRouter.post('/api/dashboard/registros', async (c) => {
  try {
    const body = await c.req.json();
    const id = repo.crearRegistro(body);
    return c.json({ id, message: 'Registro creado' }, { status: 201 });
  } catch (e) {
    return c.json({ error: String(e) }, { status: 400 });
  }
});
