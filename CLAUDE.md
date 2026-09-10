# Vigía — Project Specification (Updated)

**Status:** Fase 2 completa — backend + dashboard funcionales, con captura de visita completa
(texto, voz, foto), extracción estructurada, preguntas de seguimiento, detección de duplicados,
scoring de confianza, alertas de frescura, oportunidades de renovación, y RAG. Fase 3 pendiente
(Termux client + P2P entre dispositivos).

---

## 1. Resumen Ejecutivo

Vigía es un asistente de captura e inteligencia de base instalada para equipos médicos Philips.
Un colaborador de campo describe lo que observó (hablando, escribiendo, o fotografiando la placa
del equipo) y el sistema extrae datos estructurados, pregunta por lo que falta, detecta
duplicados contra la base existente, y calcula un score de confianza — todo con inferencia
100% on-device vía QVAC SDK (ningún dato sale a una API en la nube).

**Arquitectura:**
- **Fase 2 (COMPLETADA)**: Laptop backend (Hono + SQLite + RAG) + web dashboard (React + Vite)
- **Fase 3 (PRÓXIMA)**: Termux client (Android teléfono) con P2P sync a laptop

**Stack actual:**
- Backend: Node.js + Hono + TypeScript + SQLite + QVAC SDK 0.18.2
- Frontend: React 19 + Vite + Tailwind v4
- RAG: Embeddings + cosine similarity + LLM generation
- Voz: Whisper (STT) + Silero VAD, ambos vía QVAC
- Visión: OCR vía QVAC (extracción de texto de placas/etiquetas)

---

## 2. Estructura del Proyecto

```
hackpty/
├── app/                          # Backend + Frontend (laptop)
│   ├── src/
│   │   ├── index.ts              # Hono entry point
│   │   ├── provider/             # QVAC provider + caches de modelo
│   │   │   ├── qvacProvider.ts   # startQVACProvider() (P2P)
│   │   │   ├── bigModel.ts       # cargar/completar/transcribir/OCR + timeouts
│   │   │   ├── llmCache.ts       # cache del LLM (Llama 3.2 1B)
│   │   │   ├── embedCache.ts     # cache del embedder (EmbeddingGemma 300M)
│   │   │   ├── sttCache.ts       # cache STT (Whisper Small + VAD Silero)
│   │   │   └── visionCache.ts    # cache OCR (OCR_LATIN)
│   │   ├── rag/                  # Extracción + RAG
│   │   │   ├── extraction.ts     # observación -> campos estructurados
│   │   │   ├── followup.ts       # preguntas de seguimiento + parseo de respuestas
│   │   │   ├── embeddings.ts     # texto -> embedding
│   │   │   └── retrieval.ts      # cosine similarity search
│   │   ├── routes/               # API endpoints
│   │   │   ├── health.ts
│   │   │   ├── sync.ts           # Receive phone queue (placeholder, Fase 3)
│   │   │   ├── dashboard.ts      # GET endpoints (registros/agregado/alertas/renovaciones)
│   │   │   ├── query.ts          # POST RAG query
│   │   │   └── visita.ts         # flujo completo de captura de visita
│   │   ├── db/                   # SQLite + CRUD
│   │   │   ├── schema.sql        # registros + visitas
│   │   │   ├── sqlite.ts
│   │   │   ├── repository.ts     # CRUD de registros
│   │   │   └── visitaRepository.ts
│   │   ├── validation/           # Refs lists + duplicados + confianza
│   │   │   ├── referenceLists.ts
│   │   │   ├── duplicates.ts     # modelo Fellegi-Sunter
│   │   │   ├── duplicateCheck.ts # adaptador Registro -> Fellegi-Sunter
│   │   │   └── confianza.ts      # score de confianza + urgencia de renovación
│   │   ├── metrics/               # Performance logging
│   │   │   └── performanceLog.ts
│   │   └── types/                 # TypeScript interfaces
│   │       └── record.ts
│   ├── dashboard/                 # React + Vite frontend
│   │   └── src/
│   │       ├── App.tsx            # Router: Visita | Tablero | Renovaciones | Consulta
│   │       ├── components/
│   │       │   ├── Visita.tsx     # captura (texto/voz/foto) -> preview -> guardado
│   │       │   ├── Tablero.tsx    # registros + badge de confianza + alerta de frescura
│   │       │   ├── Renovaciones.tsx  # oportunidades de renovación, filtro por país
│   │       │   └── Consulta.tsx   # RAG query
│   │       ├── audioToWav.ts      # WAV encoding (referencia; inlineado en Visita.tsx)
│   │       ├── main.tsx
│   │       └── styles/globals.css (Tailwind v4)
│   ├── scripts/
│   │   └── seed.ts                # Test data generator (embeddings reales, no dummy)
│   ├── dist/                      # Build output (generated)
│   ├── data/                      # SQLite database (generated)
│   ├── package.json
│   ├── README.md
│   └── test-e2e.sh
├── evidencia/                     # Performance logs (generated)
├── LICENSE                        # MIT
├── SETUP.md                       # Setup instructions
├── CLAUDE.md                      # This file
├── .gitignore
└── .git/
```

---

## 3. API Endpoints

### Health & Status

```
GET /api/health
→ {status: "ready"|"error"|"starting", providerPublicKey?, error?}
```

### Visita (flujo de captura)

```
POST /api/visita/nueva
→ {visita_id: N, estado: "en_progreso"}

POST /api/visita/:id/captura/audio
Body: multipart/form-data, campo "audio" (WAV, 16kHz mono PCM)
→ {transcripcion: "..."}                    (503 si el modelo STT no está disponible)

POST /api/visita/:id/captura/foto
Body: multipart/form-data, campo "foto" (JPEG/PNG/WebP)
→ {texto_extraido: "..."}                   (503 si el modelo OCR no está disponible)

POST /api/visita/:id/extraer
Body: {observacion: "..."}
→ {campos: {cliente: {valor, status}, ...}, completeness: 0..1, estadoGlobal}
   status por campo: Confirmed | Reported | Estimated | Unknown

POST /api/visita/:id/preguntas
→ {preguntas: [{campo, pregunta, valorActual}]}   (top-3, solo campos no Confirmed)

POST /api/visita/:id/respuestas
Body: {respuestas: [{campo, respuesta: string|null}]}   (null = "No sé")
→ {campos: {...}, completeness, estadoGlobal}     (recalculado)

POST /api/visita/:id/duplicados
Body: {cliente, pais, modalidad, marca?, modelo?, cantidad?, antiguedad?}
→ {duplicados: [{registro_id, cliente, ..., p, veredicto}]}   (Fellegi-Sunter, top-3)

POST /api/visita/:id/guardar
Body: {cliente, pais, modalidad, ciudad?, cantidad?, marca?, modelo?, antiguedad?,
       estado?, colaborador?, mergeConId?}
→ {registro_id: N, estado, message}
   Si mergeConId se pasa: combina con un registro existente (solo llena campos
   vacíos, nunca degrada el estado de confianza) en vez de crear uno nuevo.
```

### Dashboard (Tablero)

```
GET /api/dashboard/registros
→ [{id, cliente, pais, modalidad, ..., confianza, confianzaComponentes,
    diasDesdeActualizacion, alertaFrescura}]

GET /api/dashboard/agregado?por=pais|estado|modalidad
→ {agregado: [{pais: "...", count: N}, ...], por: "pais"}

GET /api/dashboard/renovaciones
→ [{id, cliente, ..., antiguedad, urgencia, confianza, alertaFrescura}]
   (antiguedad > 5 años, ordenado por urgencia desc)

GET /api/dashboard/alertas
→ [{id, cliente, ..., diasDesdeActualizacion, confianza}]
   (registros sin verificar hace > 180 días, ordenado por más antiguo primero)

GET /api/dashboard/stats
→ {totalRegistros: N, porPais: [...], porEstado: [...]}

POST /api/dashboard/registros
Body: {cliente, pais, modalidad, ...}
→ {id: N, message: "Registro creado"}
```

### Sync (From Termux — placeholder, Fase 3)

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

## 4. Features Implementadas

### Sprint 1 — Captura básica + extracción

- ✅ Flujo de visita: nueva -> extraer -> guardar
- ✅ Extracción estructurada vía QVAC LLM (Llama 3.2 1B) con prompt que incluye
  sinónimos de modalidad en español
- ✅ Estado por campo (Confirmed/Reported/Estimated/Unknown) derivado de si el
  valor aparece literalmente en el texto y si está en una oración con "hedge words"
  (creo que, tal vez, parece...)
- ✅ Guardrail anti-alucinación: campos de texto (cliente/ciudad/pais/marca/modelo)
  se descartan si el valor no aparece literalmente en la observación, en vez de
  confiar en que el LLM respete la instrucción de "no inventes"

### Sprint 2 — Preguntas de seguimiento + duplicados

- ✅ Preguntas de seguimiento generadas de forma **determinística** (sin LLM),
  contextualizadas con los campos ya confirmados ("¿Sabes el modelo del GE Signa?"),
  priorizando Unknown > Reported > Estimated
- ✅ Parseo de respuestas libres (números en texto, "no sé", sinónimos de modalidad)
- ✅ Detección de duplicados reutilizando el modelo Fellegi-Sunter existente
- ✅ Merge con registro existente sin sobreescribir datos confirmados

### Sprint 3 — Voz y foto

- ✅ Captura de voz: grabación PCM cruda vía Web Audio API (no MediaRecorder — ver
  Design Decisions), transcripción con QVAC Whisper
- ✅ Captura de foto: OCR vía QVAC (OCR_LATIN), el texto extraído se fusiona con
  la observación manual

### Sprint 4 — Confianza, alertas, renovación

- ✅ Score de confianza (0-100%) calculado al vuelo: estado (peso 50%) +
  completitud de campos (20%) + frescura temporal, decae después de 180 días (30%)
- ✅ Alerta de frescura (⚠️ en Tablero) para registros sin verificar hace > 180 días
- ✅ Vista "Renovaciones": equipos con antigüedad > 5 años, ordenados por urgencia
  (antigüedad + baja confianza + poca frescura), filtro por país

### RAG

- ✅ Embedding real por registro (QVAC EmbeddingGemma 300M) generado al guardar
- ✅ Retrieval por cosine similarity (top-5) + generación con LLM citando fuentes
- ✅ `scripts/seed.ts` genera embeddings reales (no vectores de ceros)

### Edge Cases Mitigados

| # | Mitigación | Status |
|---|---|---|
| 1 | Timeout en LLM/STT/OCR (withTimeout real, no el `setTimeout(() => throw)` roto original) | ✅ |
| 2 | NaN/Infinity validation en embeddings | ✅ |
| 3 | Buffer/byteOffset correcto al leer embeddings de SQLite (bug de pooling de Node) | ✅ |
| 4 | Input validation (type, length, trim) en todos los endpoints | ✅ |
| 5 | try/catch en file I/O (appendFileSync) | ✅ |
| 6 | AbortController per view switch | ✅ |
| 7 | Error/loading/empty UI states | ✅ |
| 8 | Fallback a entrada manual si STT/OCR no están disponibles (503, nunca bloquea) | ✅ |
| 9 | Detección de silencio en grabación (macOS: permiso de navegador ≠ permiso de SO) | ✅ |
| 10 | VAD (Silero) para evitar alucinaciones de Whisper en silencio prolongado | ✅ |
| 11 | Remuestreo a 16kHz en el cliente (audio real del mic viene a 44.1/48kHz) | ✅ |
| 12 | Version pinning (@qvac/sdk@0.18.2, no ^/~) | ✅ |

---

## 5. Mapeo de Modelos QVAC

| Tarea | Modelo | Notas |
|---|---|---|
| Extracción estructurada | Llama 3.2 1B Instruct Q4_0 | Prompt con sinónimos de modalidad + guardrail anti-alucinación en código |
| Preguntas de seguimiento | — (determinístico) | Templates contextualizados con campos confirmados, sin LLM |
| RAG generation | Llama 3.2 1B Instruct Q4_0 | Mismo modelo que extracción (cache compartido) |
| Embeddings | EmbeddingGemma 300M Q4_0 | 768 dim; modelo separado del LLM (tipos de modelo distintos en QVAC) |
| STT (voz) | Whisper Small Q8_0 + VAD Silero 5.1.2 | `language: 'es'` forzado en modelConfig (no vía prompt); VAD obligatorio para clips con cola de silencio |
| OCR (foto) | OCR_LATIN | Cubre español/portugués/inglés |

---

## 6. Setup & Running

### Quick Start

```bash
# Build
cd app && npm run build && cd dashboard && npm run build && cd ../..

# Seed test data (embeddings reales, requiere que el modelo de embeddings cargue)
cd app && npm run seed && cd ..

# Terminal 1: Backend
cd app && npm start

# Terminal 2: Frontend (dev)
cd app/dashboard && npm run dev

# Open http://localhost:5173 (dev) o http://localhost:8787/dashboard (prod)
```

Ver `SETUP.md` para instrucciones completas.

**Nota sobre puertos**: si ves `EADDRINUSE` al arrancar, ya hay un proceso escuchando
en el puerto 8787 — `lsof -i :8787` para encontrarlo y `kill <PID>` antes de reintentar.

---

## 7. Limitaciones & Roadmap

### Limitations (Current)

- **Single model instance**: No concurrent LLM requests (cached in memory)
- **No vector DB**: Brute force cosine similarity (~100 registros OK)
- **Embedding on-the-fly**: Generado al guardar el registro y al hacer cada query
- **Preguntas de seguimiento genéricas**: no usan LLM, así que no se adaptan a
  matices del texto más allá de qué campo falta
- **Calidad de transcripción**: Whisper Small es mucho mejor que Tiny pero sigue
  siendo un modelo pequeño; nombres de marca/modelo poco comunes pueden salir mal
- **Termux not yet**: Teléfono sync no implementado

### Fase 3 Roadmap

1. **Termux client** (`/termux-client`): Android app con Node.js + PWA
2. **P2P sync**: Hyperswarm o mDNS entre teléfono ↔ laptop (delegación de
   inferencia pesada ya soportada por `startQVACProvider()`, falta el cliente)
3. **Offline queue**: cola JSON en Termux, sync cuando haya conexión
4. **Fallback LLM**: modelo pequeño en el teléfono como respaldo

### Future (Fase 4+)

- [ ] Vector database (pgvector o similar) si el dataset crece
- [ ] Dashboard graphs & exports
- [ ] Multi-user support
- [ ] Audit logs & compliance
- [ ] Preguntas de seguimiento generadas por LLM (en vez de templates) para casos ambiguos

---

## 8. Design Decisions

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
- **Cuidado**: la sintaxis correcta para referenciar una custom property es
  `bg-(--color-x)`, no `bg-[--color-x]` (esta última genera una regla vacía en
  Tailwind v4 y falla en silencio — pasó en las 4 vistas del dashboard)

### Why RAG (no semantic search)

- Explicit retrieval (auditable, no black box)
- Top-k registros citados en respuesta
- Composable: embedding + cosine + LLM

### Why @qvac/sdk 0.18.2 pinned

- 0.19.0 removed `startQVACProvider` (breaking change)
- P2P delegation requires 0.18.2
- Explicit version lock = no surprises

### Why ScriptProcessorNode (no MediaRecorder) para grabar voz

- `MediaRecorder` sin mimeType explícito graba en webm/opus (Chrome/Firefox) o
  mp4/aac (Safari) — ninguno está en `SUPPORTED_AUDIO_FORMATS` del SDK de QVAC
  (solo mp3/m4a/ogg/wav/flac/aac/raw)
- Convertir el blob grabado a WAV con `AudioContext.decodeAudioData()` falla de
  forma intermitente ("EncodingError: Unable to decode audio data") — problema
  documentado de Chromium: el WebM que produce MediaRecorder en vivo no tiene
  Duration/Cues en el header
- Se captura PCM crudo en vivo con `ScriptProcessorNode` (deprecado pero
  universalmente soportado) y se codifica como WAV directamente, sin pasar por
  ningún formato comprimido intermedio

### Why remuestrear a 16kHz en el cliente

- El micrófono entrega audio a la tasa nativa del hardware (44100/48000Hz), pero
  Whisper trabaja nativamente a 16kHz
- El WAV enviado llevaba el header correcto con la tasa real, pero el pipeline de
  QVAC (particularmente con VAD activado) no lo manejaba bien a 48kHz —
  transcripciones vacías o sin ningún parecido al audio real
- Remuestrear por interpolación lineal en el navegador antes de codificar el WAV
  evita depender de que el servidor resamplee correctamente

### Why VAD (Silero) en la carga del modelo STT

- Sin VAD, Whisper procesa el audio completo en ventanas de 30s rellenadas con
  silencio; cuando el silencio domina el clip (ej: el usuario habla y tarda unos
  segundos en hacer clic en "Detener"), el decoder alucina frases repetidas del
  corpus de entrenamiento (clásico: frases de outro de YouTube — "gracias por ver
  el video", "¡suscríbete!")
- `vadModelSrc: VAD_SILERO_5_1_2` en el modelConfig de whispercpp-transcription
  recorta el silencio antes de transcribir

### Why WHISPER_SMALL_Q8_0 en vez de WHISPER_SPANISH_TINY_Q8_0

- El registro de QVAC solo tiene una variante "tiny" específica de español; no
  existe una "base"/"small" en español
- Un Whisper multilingüe con más parámetros (small > tiny) generalmente reconoce
  mejor que un "tiny" especializado, incluso forzando `language: 'es'`

---

## 9. Metrics & Performance

Logged to `evidencia/rendimiento.jsonl`:

```json
{
  "stage": "load|completion|provider_startup|transcribe|ocr|visita_extraer|visita_guardar|visita_captura_audio|visita_captura_foto",
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

## 10. Testing Strategy

### Unit Tests

```bash
npm test
# Runs: validation/referenceLists.test.ts, validation/duplicates.test.ts,
#       validation/duplicateCheck.test.ts, validation/confianza.test.ts,
#       rag/followup.test.ts
```

### E2E Tests

```bash
npm run seed        # Populate DB con embeddings reales
npm start            # Start backend
# Manual: curl /api/health, /api/query, /api/visita/nueva, etc.
bash test-e2e.sh     # Auto health + query test
```

### Manual UI Testing

1. `npm run dev` (dashboard)
2. Visita: grabar voz, tomar foto, extraer datos, responder preguntas de
   seguimiento, verificar detección de duplicados, guardar
3. Tablero: verificar tabla, badge de confianza, alerta de frescura
4. Renovaciones: verificar orden por urgencia y filtro de país
5. Consulta: verificar input, error handling, AbortController on switch

**Nota**: la grabación de voz real (con micrófono, no simulada) no se puede
automatizar completamente — `getUserMedia` requiere un permiso de navegador que
la automatización de pruebas no puede otorgar. Verificar manualmente con voz real.

---

## 11. Checklist de Entrega

- [x] Backend compiles clean (TypeScript strict)
- [x] Frontend compiles + builds (Vite)
- [x] API endpoints working (manual + curl tested)
- [x] Database schema + CRUD (registros + visitas)
- [x] Extracción estructurada + preguntas de seguimiento + duplicados
- [x] Captura de voz + foto vía QVAC (STT + OCR)
- [x] Score de confianza + alertas de frescura + renovaciones
- [x] RAG: embedding + retrieval + LLM (embeddings reales, no dummy)
- [x] Performance logging
- [x] Error handling (400/500/503)
- [x] Input validation
- [x] Documentation (README.md per module, SETUP.md)
- [x] License (MIT)
- [x] .gitignore updated
- [ ] Fase 3: Termux client
- [ ] Fase 4: Entregable final (video, paper, etc.)

---

## 12. Contact & Support

- **Project Lead**: Vigía team
- **Main Docs**: `SETUP.md` (quick start), `app/README.md` (backend), `app/dashboard/README.md` (frontend)
- **Code Issues**: Check logs in `evidencia/rendimiento.jsonl`
- **License**: MIT (see LICENSE)

---

**Last Updated**: 2026-09-10 (Sprints 1-4 completos: captura, preguntas de seguimiento,
duplicados, voz, foto, confianza, alertas, renovaciones, RAG con embeddings reales)
