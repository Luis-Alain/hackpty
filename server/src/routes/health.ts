import { Hono } from 'hono';
import { getProviderState } from '../provider/qvacProvider.js';

export const healthRouter = new Hono();

healthRouter.get('/api/health', (c) => {
  const state = getProviderState();
  const statusCode =
    state.status === 'ready' ? 200 : state.status === 'error' ? 500 : 503;

  return c.json(
    {
      status: state.status,
      providerPublicKey: state.providerPublicKey,
      error: state.error,
    },
    { status: statusCode }
  );
});
