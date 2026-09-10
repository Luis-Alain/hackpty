# Vigía — Backend (Servidor Laptop)

Backend Hono + TypeScript + SQLite + RAG para Vigía (reto Philips, ISD Summit 2026).

## Resumen

Servidor que actúa como proveedor P2P y motor de razonamiento para la base instalada de equipos médicos:

- **Proveedor QVAC**: Atiende delegaciones de inferencia desde el teléfono (Termux) vía P2P
- **Base de datos central**: SQLite con dataset de equipos validados
- **RAG (Retrieval-Augmented Generation)**: Embeddings + búsqueda por similitud + LLM para consultas agregadas
- **Dashboard API**: Endpoints REST para tablero web del frontend

Corre en un proceso Node + Hono en la laptop.

## Stack

- **Runtime**: Node.js (LTS)
- **Framework**: Hono (HTTP + middleware)
- **Base de datos**: SQLite + better-sqlite3
- **Inferencia**: QVAC SDK 0.18.2 (pinned)
- **Lenguaje**: TypeScript 5 strict mode

## Requisitos

- Node.js 18+
- Laptop con GPU (opcional; fallback a CPU)
- ~2GB RAM mínimo

## Instalación

```bash
cd app
npm install
npm run build
```

## Uso

### Desarrollo

```bash
npm run dev
# Escucha en http://localhost:8787
# Recarga automática con `tsx watch`
```

### Producción

```bash
npm run build
npm start
# Escucha en http://localhost:8787 (configurable vía PORT)
```

### Inicializar Base de Datos con Datos de Ejemplo

```bash
npm run seed
# Crea 5 registros con embeddings reales
# Necesita GPU/modelo disponible (~2-3 min)
```

## Endpoints

### Health & Status

```bash
GET /api/health
# {status: "ready"|"error"|"starting", providerPublicKey, error?}
```

### Dashboard (Tablero)

```bash
# Todos los registros
GET /api/dashboard/registros

# Agregados por país, estado o modalidad
GET /api/dashboard/agregado?por=pais
GET /api/dashboard/agregado?por=estado
GET /api/dashboard/agregado?por=modalidad

# Registros para renovación (antigüedad > 5 años)
GET /api/dashboard/renovaciones

# Estadísticas globales
GET /api/dashboard/stats

# Crear registro (para sync desde teléfono)
POST /api/dashboard/registros
Body: {cliente, pais, modalidad, cantidad, ...}
```

### Sincronización

```bash
POST /api/sync
Body: {registros: [{cliente, pais, ...}, ...]}
# Recibe cola de teléfono, valida y guarda
```

### RAG Query (Consulta)

```bash
POST /api/query
Body: {pregunta: "¿Cuántos equipos hay en Brasil?"}
# {texto: "...", fuentes: [{id, cliente, score}, ...]}
```

## Estructura de Carpetas

```
app/
├── src/
│   ├── index.ts                # Entry point (Hono boot)
│   ├── provider/
│   │   ├── qvacProvider.ts     # startQVACProvider() boot
│   │   └── bigModel.ts         # cargar/completar/descargar (LLM)
│   ├── rag/
│   │   ├── embeddings.ts       # embed text, summary template
│   │   └── retrieval.ts        # cosine similarity search
│   ├── routes/
│   │   ├── health.ts           # GET /api/health
│   │   ├── sync.ts             # POST /api/sync
│   │   ├── dashboard.ts        # GET /api/dashboard/*
│   │   └── query.ts            # POST /api/query (RAG)
│   ├── db/
│   │   ├── schema.sql          # CREATE TABLE registros
│   │   ├── sqlite.ts           # getDb(), initSchema()
│   │   └── repository.ts       # CRUD + aggregations
│   ├── validation/
│   │   ├── referenceLists.ts   # Enums (modalidades, marcas, etc.)
│   │   └── duplicates.ts       # Felligi-Sunter algorithm
│   ├── metrics/
│   │   └── performanceLog.ts   # Logging (carga, tokens, TTFT)
│   └── types/
│       └── record.ts           # TypeScript interfaces
├── scripts/
│   └── seed.ts                 # Crear datos de ejemplo
├── dist/                       # Compiled JS (generado por `npm run build`)
├── data/
│   └── vigía.sqlite            # Database (generado al iniciar)
├── package.json
├── tsconfig.json
└── README.md
```

## Configuración

### Variables de Entorno

```bash
PORT=8787              # Puerto de escucha (default 8787)
QVAC_LOG_LEVEL=error   # Verbosidad de QVAC SDK (error|warn|info|debug)
```

### QVAC Config

`qvac.config.json`:
```json
{
  "loggerLevel": "error",
  "loggerConsoleOutput": false,
  "httpDownloadConcurrency": 3,
  "httpConnectionTimeoutMs": 20000
}
```

## Proceso de Boot

1. **Inicializa DB schema** — crea tabla `registros` si no existe
2. **Arranca QVAC provider** — `startQVACProvider()` para delegación P2P
3. **Escucha en puerto 8787** — acepta peticiones del teléfono y frontend
4. **Si proveedor falla** → `/api/health` reporta `status: error`, pero servidor sigue vivo

## Edge Cases Manejados

- ✅ **Timeout en LLM**: 60s máximo en completion()
- ✅ **NaN/Infinity en embeddings**: Validación al boot, clampeo a 0
- ✅ **Input validation**: Pregunta max 10KB, string type check
- ✅ **File I/O errors**: try/catch en appendFileSync de logs
- ✅ **Concurrent requests**: SQLite WAL mode, better-sqlite3 thread-safe
- ✅ **Provider fallback**: Si delegación falla, modelo local responde

## Métricas de Rendimiento

Logs se guardan en `evidencia/rendimiento.jsonl` (relativo a `app/src`):

```json
{
  "stage": "load|completion|provider_startup",
  "status": "ok|error",
  "model": "Llama-3.2-1B-Instruct-Q4_0",
  "hardware_id": "laptop",
  "execution_mode": "local|delegated",
  "load_ms": 3500,
  "ttft_ms": 120,
  "end_to_end_ms": 2400,
  "input_tokens": 256,
  "output_tokens": 87,
  "throughput_tps": 18.5
}
```

## Testing

```bash
# Unit tests (si existen)
npm test

# E2E manual (ver Paso 9)
npm run seed
npm start
# En otra terminal:
curl http://localhost:8787/api/health
curl -X POST http://localhost:8787/api/query \
  -H 'content-type: application/json' \
  -d '{"pregunta":"¿Cuántos equipos hay?"}'
```

## Dependencias Críticas

- `@qvac/sdk@0.18.2` — **Fijada exacta** (0.19.0 removió delegación P2P)
- `hono@^4.0.0` — Web framework
- `better-sqlite3@^11.0.0` — SQLite binding nativo (laptop, no Termux)
- `@hono/node-server@^1.0.0` — Adaptador Node.js

## Limitaciones Conocidas

- **Embedding**: Genera on-the-fly para preguntas; no precalculado (slower pero flexible)
- **Model cache**: Una sola instancia del modelo en memoria (no concurrent requests a LLM)
- **DB size**: Optimizado para ~100-1000 registros (sin índices vectoriales complejos)
- **GPU**: Fallback a CPU disponible si no hay GPU, pero más lento

## Próximos Pasos

1. Integración con Termux (teléfono) — `/termux-client`
2. P2P real con Hyperswarm (sin internet)
3. Índices vectoriales (pgvector o similar) si dataset crece
4. Endpoint de delete/update para registros (CRUD completo)

## Licencia

MIT

## Autores

- Vigía team, ISD Summit 2026
- Generated with Claude Code
