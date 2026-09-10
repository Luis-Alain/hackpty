# Vigía — Project Specification (Updated)

**Status:** Fase 2 completa (backend + dashboard funcionales). Fase 3 pendiente (Termux client + P2P).

---

## 1. Resumen Ejecutivo

Vigía es un asistente de captura e inteligencia de base instalada para equipos médicos Philips. 

**Arquitectura:**
- **Fase 2 (COMPLETADA)**: Laptop backend (Hono + SQLite + RAG) + web dashboard (React + Vite)
- **Fase 3 (PRÓXIMA)**: Termux client (Android teléfono) con P2P sync a laptop

**Stack actual:**
- Backend: Node.js + Hono + TypeScript + SQLite + QVAC SDK 0.18.2
- Frontend: React 19 + Vite + Tailwind v4
- RAG: Embeddings + cosine similarity + LLM generation

---

## 2. Estructura del Proyecto (Fase 2)

```
hackpty/
├── server/                      # Backend + Frontend (laptop)
│   ├── src/
│   │   ├── index.ts             # Hono entry point
│   │   ├── provider/            # QVAC provider + LLM
│   │   │   ├── qvacProvider.ts
│   │   │   └── bigModel.ts
│   │   ├── rag/                 # RAG: embedding + retrieval
│   │   │   ├── embeddings.ts
│   │   │   └── retrieval.ts
│   │   ├── routes/              # API endpoints
│   │   │   ├── health.ts
│   │   │   ├── sync.ts          # Receive phone queue
│   │   │   ├── dashboard.ts     # GET endpoints
│   │   │   └── query.ts         # POST RAG query
│   │   ├── db/                  # SQLite + CRUD
│   │   │   ├── schema.sql
│   │   │   ├── sqlite.ts
│   │   │   └── repository.ts
│   │   ├── validation/          # Refs lists + Felligi-Sunter
│   │   │   ├── referenceLists.ts
│   │   │   └── duplicates.ts
│   │   ├── metrics/             # Performance logging
│   │   │   └── performanceLog.ts
│   │   └── types/               # TypeScript interfaces
│   │       └── record.ts
│   ├── dashboard/               # React + Vite frontend
│   │   └── src/
│   │       ├── App.tsx
│   │       ├── components/
│   │       │   ├── Tablero.tsx
│   │       │   └── Consulta.tsx
│   │       ├── main.tsx
│   │       └── styles/globals.css (Tailwind v4)
│   ├── scripts/
│   │   └── seed.ts              # Test data generator
│   ├── dist/                    # Build output (generated)
│   ├── data/                    # SQLite database (generated)
│   ├── package.json
│   ├── README.md
│   └── test-e2e.sh
├── evidencia/                   # Performance logs (generated)
├── LICENSE                      # MIT
├── SETUP.md                     # Setup instructions
├── CLAUDE.md                    # This file
├── .gitignore
└── .git/
```

---

## 3. API Endpoints (Fase 2)

### Health & Status

```
GET /api/health
→ {status: "ready"|"error"|"starting", providerPublicKey?, error?}
```

### Dashboard (Tablero)

```
GET /api/dashboard/registros
→ [{id, cliente, pais, modalidad, cantidad, ...}]

GET /api/dashboard/agregado?por=pais|estado|modalidad
→ {agregado: [{pais: "...", count: N}, ...], por: "pais"}

GET /api/dashboard/renovaciones
→ [{id, cliente, ...}]  (antiguedad > 5)

GET /api/dashboard/stats
→ {totalRegistros: N, porPais: [...], porEstado: [...]}

POST /api/dashboard/registros
Body: {cliente, pais, modalidad, ...}
→ {id: N, message: "Registro creado"}
```

### Sync (From Termux)

```
POST /api/sync
Body: {registros: [{cliente, pais, ...}, ...]}
→ {received: N, valid: N, invalid: N}
```

### RAG Query

```
POST /api/query
Body: {pregunta: "¿Cuántos equipos en Brasil?"}
→ {texto: "...", fuentes: [{id, cliente, score}, ...]}
```

---

## 4. Features Implementadas (Fase 2)

### Backend

- ✅ SQLite database con schema registros
- ✅ CRUD operations + GROUP BY aggregations
- ✅ QVAC provider boot (startQVACProvider)
- ✅ Model loading (Llama 3.2 1B)
- ✅ LLM completion with 60s timeout
- ✅ Embedding generation (text → Float32Array)
- ✅ RAG retrieval (cosine similarity, NaN validation)
- ✅ Query endpoint (embedding + retrieval + generation)
- ✅ Performance logging (TTFT, tokens, throughput)
- ✅ Error handling + input validation
- ✅ WAL mode SQLite (concurrent reads)

### Frontend

- ✅ React 19 + TypeScript strict
- ✅ Two-view layout (Tablero | Consulta)
- ✅ Tablero: fetch registros, show table, error/loading states
- ✅ Consulta: RAG input, fetch /api/query, show response + sources
- ✅ AbortController: cancel fetch on view change
- ✅ Input validation: max 10KB pregunta length
- ✅ Tailwind v4 CSS-first @theme design
- ✅ Vite HMR (hot reload)
- ✅ Build: TypeScript + Vite production bundle

### Edge Cases Mitigated

| # | Mitigación | Status |
|---|---|---|
| 1 | Timeout 60s en LLM + finally cleanup | ✅ |
| 2 | NaN/Infinity validation en embeddings | ✅ |
| 3 | Input validation (type, length, trim) | ✅ |
| 4 | try/catch en file I/O (appendFileSync) | ✅ |
| 5 | AbortController per view switch | ✅ |
| 6 | Error/loading/empty UI states | ✅ |
| 7 | Array validation en sync endpoint | ✅ |
| 8 | Version pinning (@qvac/sdk@0.18.2, no ^/~) | ✅ |

---

## 5. Setup & Running

### Quick Start

```bash
# Build
cd server && npm run build && cd dashboard && npm run build && cd ../..

# Seed test data (optional)
cd server && npm run seed && cd ..

# Terminal 1: Backend
cd server && npm start

# Terminal 2: Frontend (dev)
cd server/dashboard && npm run dev

# Open http://localhost:5173 (dev) or http://localhost:8787/dashboard (prod)
```

Ver `SETUP.md` para instrucciones completas.

---

## 6. Limitaciones & Roadmap

### Limitations (Current)

- **Single model instance**: No concurrent LLM requests (cached in memory)
- **No vector DB**: Brute force cosine similarity (~100 registros OK)
- **Embedding on-the-fly**: Generated per query, not pre-computed
- **No data persistence UI**: Historial de queries en memoria solamente
- **Termux not yet**: Teléfono sync no implementado

### Fase 3 Roadmap

1. **Termux client** (`/termux-client`): Android app with Node.js + PWA
2. **Local transcription**: Whisper/Parakeet for audio input
3. **VisionPsy**: Plate recognition for camera capture
4. **P2P sync**: Hyperswarm or mDNS for phone ↔ laptop
5. **Offline queue**: JSON-based queue in Termux, sync when available
6. **Fallback LLM**: Small model on phone for respaldo

### Future (Fase 4+)

- [ ] Advanced duplicate detection (matching engine)
- [ ] Vector database (pgvector or similar)
- [ ] Mobile-optimized UI
- [ ] Dashboard graphs & exports
- [ ] Multi-user support
- [ ] Audit logs & compliance

---

## 7. Design Decisions

### Why Hono (not Express/Fastify)

- Minimal, zero-config
- P2P provider arranca una vez sin framework lifecycle
- TypeScript native
- Modular routing

### Why SQLite (not Postgres)

- ~100-1000 registros: no need for heavy DB
- No external dependencies
- WAL mode para concurrent reads
- File-based, fácil backup

### Why better-sqlite3 (laptop only)

- Synchronous API (simpler error handling)
- Better performance than node:sqlite
- No issues en laptop (Bionic/glibc only concern in Termux, Fase 3)

### Why Tailwind v4 CSS-first

- Custom tokens in CSS (no config files)
- Offline-first, no CDN
- Responsive utilities built-in

### Why RAG (no semantic search)

- Explicit retrieval (auditable, no black box)
- Top-k registros citados en respuesta
- Composable: embedding + cosine + LLM

### Why @qvac/sdk 0.18.2 pinned

- 0.19.0 removed `startQVACProvider` (breaking change)
- P2P delegation requires 0.18.2
- Explicit version lock = no surprises

---

## 8. Metrics & Performance

Logged to `evidencia/rendimiento.jsonl`:

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

---

## 9. Testing Strategy

### Unit Tests

```bash
npm test
# Runs: validation/referenceLists.test.ts, duplicates.test.ts
```

### E2E Tests

```bash
npm run seed        # Populate DB with test data
npm start           # Start backend
# Manual: curl /api/health, /api/query, etc.
bash test-e2e.sh    # Auto health + query test
```

### Manual UI Testing

1. `npm run dev` (dashboard)
2. Tablero: Verify table loads, error states, empty message
3. Consulta: Verify input, error handling, AbortController on switch

---

## 10. Checklist de Entrega (Fase 2 Completada)

- [x] Backend compiles clean (TypeScript strict)
- [x] Frontend compiles + builds (Vite)
- [x] All 8 edge cases mitigated + verified
- [x] API endpoints working (manual tested)
- [x] Database schema + CRUD
- [x] RAG: embedding + retrieval + LLM
- [x] Performance logging
- [x] Error handling (400/500/503)
- [x] Input validation (max 10KB, type check)
- [x] Documentation (README.md per module, SETUP.md)
- [x] License (MIT)
- [x] .gitignore updated
- [ ] Fase 3: Termux client
- [ ] Fase 4: Entregable final (video, paper, etc.)

---

## 11. Contact & Support

- **Project Lead**: Vigía team
- **Main Docs**: `SETUP.md` (quick start), `server/README.md` (backend), `server/dashboard/README.md` (frontend)
- **Code Issues**: Check logs in `evidencia/rendimiento.jsonl`
- **License**: MIT (see LICENSE)

---

**Last Updated**: 2026-09-09 (Fase 2 Complete)
