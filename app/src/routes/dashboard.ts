import { Hono } from 'hono';
import * as repo from '../db/repository.js';

export const dashboardRouter = new Hono();

dashboardRouter.get('/api/dashboard/registros', (c) => {
  try {
    const registros = repo.todosLosRegistros(100);
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
    const registros = repo.registrosParaRenovacion();
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
