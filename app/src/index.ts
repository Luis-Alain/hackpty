import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { healthRouter } from './routes/health.js';
import { syncRouter } from './routes/sync.js';
import { dashboardRouter } from './routes/dashboard.js';
import { queryRouter } from './routes/query.js';
import { initQVACProvider } from './provider/qvacProvider.js';
import { initSchema } from './db/sqlite.js';

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;

const app = new Hono();

// CORS middleware
app.use('*', async (c, next) => {
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (c.req.method === 'OPTIONS') {
    return c.text('OK', 200);
  }
  await next();
});

app.use('*', async (c, next) => {
  c.header('content-type', 'application/json');
  await next();
});

app.route('/', healthRouter);
app.route('/', syncRouter);
app.route('/', dashboardRouter);
app.route('/', queryRouter);

app.get('/', (c) =>
  c.json({ service: 'vigía-server', version: '0.1.0' })
);

async function main() {
  console.log('Vigía server starting...');

  try {
    initSchema();
    console.log('✓ Database initialized');
  } catch (e) {
    console.error('✗ Database init failed:', e);
    process.exit(1);
  }

  try {
    await initQVACProvider();
    console.log('✓ QVAC provider ready');
  } catch (e) {
    console.error('✗ QVAC provider failed:', e);
  }

  serve({ fetch: app.fetch, port: PORT }, (info) => {
    console.log(`Listening on http://localhost:${info.port}`);
  });
}

main().catch(console.error);
