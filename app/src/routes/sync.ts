import { Hono } from 'hono';

interface RegistroEnCola {
  cliente: string;
  pais: string;
  modalidad: string;
  cantidad?: number;
}

export const syncRouter = new Hono();

syncRouter.post('/api/sync', async (c) => {
  try {
    const body = await c.req.json();
    const registros: RegistroEnCola[] = body.registros || [];

    if (!Array.isArray(registros)) {
      return c.json({ error: 'registros debe ser array' }, { status: 400 });
    }

    const validos = registros.filter((r) => r.cliente && r.pais);
    const invalidos = registros.length - validos.length;

    return c.json({
      received: registros.length,
      valid: validos.length,
      invalid: invalidos,
      message: 'Sync accepted (save to DB en Paso 7)',
    });
  } catch (e) {
    return c.json({ error: String(e) }, { status: 400 });
  }
});
