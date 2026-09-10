# Vigía — Instrucciones de Setup

Guía paso a paso para correr el proyecto completo (backend + frontend).

## 1. Instalación Inicial

```bash
# Backend
cd server
npm install

# Dashboard
cd dashboard
npm install
cd ../..
```

## 2. Compilación

```bash
# Backend: TypeScript → JavaScript
cd server && npm run build && cd ..

# Dashboard: React + Vite
cd server/dashboard && npm run build && cd ../..
```

## 3. Seed Data (Opcional)

Si quieres datos de prueba:

```bash
cd server
npm run seed
# Crea 5 registros con embeddings reales (~2-3 min, necesita GPU/modelo)
cd ..
```

## 4. Ejecutar Backend

```bash
cd server
npm start
# Escucha en http://localhost:8787
# Espera mensajes:
#   ✓ Database initialized
#   ✓ QVAC provider ready
#   Listening on http://localhost:8787
```

## 5. Ejecutar Dashboard (Desarrollo)

En otra terminal:

```bash
cd server/dashboard
npm run dev
# Escucha en http://localhost:5173
# Proxy: /api → http://localhost:8787
```

Abre `http://localhost:5173` en navegador.

## 6. Testing Manual

### Health Check

```bash
curl http://localhost:8787/api/health
# {"status":"ready","providerPublicKey":"...","error":null}
```

### Dashboard: Listar Registros

```bash
curl http://localhost:8787/api/dashboard/registros | jq '.'
# [{id:1, cliente:"Hospital Central Lima", ...}]
```

### RAG: Query

```bash
curl -X POST http://localhost:8787/api/query \
  -H 'content-type: application/json' \
  -d '{"pregunta":"¿Cuántos equipos hay en Brasil?"}'
# {"texto":"Basándome en...","fuentes":[{id:2,...}]}
```

### Dashboard: Aggregate

```bash
curl http://localhost:8787/api/dashboard/agregado?por=pais
# {"agregado":[{"pais":"Perú","count":1},...],"por":"pais"}
```

## 7. UI en Navegador

1. Abre http://localhost:5173
2. **Tablero**: Tablist a la izquierda
   - Muestra tabla de registros
   - Si está vacía → "Sin registros"
   - Si error al cargar → mensaje rojo
3. **Consulta**: Tab a la derecha
   - Input de pregunta
   - Botón "Enviar"
   - Respuesta + fuentes citadas
   - Si error → "Error: ..."
   - Si cargando → "Enviando..."

## 8. E2E Test (Opcional)

```bash
cd server
bash test-e2e.sh
# Builds, starts server, queries health, cleanup
# ✅ E2E test passed
```

## Estructura del Proyecto

```
hackpty/
├── server/                     # Backend (Hono + SQLite + RAG)
│   ├── src/
│   │   ├── index.ts           # Entry point
│   │   ├── provider/          # QVAC provider + LLM
│   │   ├── rag/               # Embeddings + retrieval
│   │   ├── routes/            # API endpoints
│   │   ├── db/                # Database + repository
│   │   ├── validation/        # Refs lists + duplicates
│   │   └── metrics/           # Performance logging
│   ├── dashboard/             # Frontend (React + Vite)
│   │   └── src/
│   │       ├── App.tsx        # Main router
│   │       ├── components/    # Tablero, Consulta
│   │       └── styles/        # Tailwind v4
│   ├── scripts/
│   │   └── seed.ts            # Test data generator
│   ├── package.json
│   ├── README.md
│   └── vite.config.ts
├── LICENSE
├── SETUP.md                   # Este archivo
└── CLAUDE.md                  # Project spec (original)
```

## Environment Variables

```bash
# Backend
PORT=8787
QVAC_LOG_LEVEL=error
```

No se requieren secrets para versión demo local.

## Troubleshooting

### Backend no arranca

```bash
# 1. Verificar Node.js
node --version  # Debe ser 18+

# 2. Verificar puerto
lsof -i :8787
# Si está ocupado, cambiar PORT=8788

# 3. Verificar QVAC
npm ls @qvac/sdk  # Debe ser 0.18.2 (pinned)

# 4. Logs
PORT=8787 npm start 2>&1 | head -20
```

### Dashboard no conecta con backend

```bash
# 1. Backend debe estar corriendo
curl http://localhost:8787/api/health

# 2. DevTools → Network → /api/query
# Si 404: proxy no está configurado en vite.config.ts
# Si CORS: backend debe aceptar cualquier origin (Hono default)

# 3. Si dev server en otro puerto:
PORT=5174 npm run dev  # Especificar puerto
```

### Seed falla

```bash
# Necesita GPU y modelo QVAC disponible
# Sin GPU: los queries funcionan pero seed tarda

# Debug:
cd server
npm run seed 2>&1 | head -50
```

### TypeScript errors

```bash
# Backend
cd server && npx tsc --noEmit

# Dashboard
cd server/dashboard && npx tsc --noEmit
```

## Performance Expectations

| Operation | Latency | Notes |
|---|---|---|
| GET /api/health | <10ms | Instant |
| GET /api/dashboard/registros | 5-50ms | SQLite read |
| POST /api/query (RAG) | 5-30s | Model load (cold) + embedding + LLM |
| POST /api/query (warm) | 2-5s | Model cached |

## Production Deployment

Para laptops en red:

```bash
# Asegurar IP accesible
# 1. Backend
PORT=8787 npm start

# 2. Dashboard desde otra máquina
# Cambiar proxy en vite.config.ts a IP real
# O compilar con target IP

# 3. Firewall: abrir puerto 8787
```

## Licencia

MIT — Ver LICENSE

## Support

Para issues:
- Verificar `npm run build` sin errores TypeScript
- Revisar `/api/health` status
- Leer logs en `evidencia/rendimiento.jsonl`
