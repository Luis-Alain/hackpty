#!/bin/bash
set -e

echo "🔵 Starting E2E test..."

# Puerto y DB dedicados: NUNCA usar 8787/data/vigía.sqlite acá. Si el desarrollador
# tiene `npm run dev` corriendo en 8787 (caso común), un e2e test que reutilice ese
# puerto termina golpeando el servidor real y contaminando su base de datos con
# datos de prueba sin que nadie se dé cuenta (pasó una vez con este mismo script).
TEST_PORT="${TEST_PORT:-8799}"
TEST_DB="$(pwd)/data/vigía-e2e-test.sqlite"

if lsof -i ":$TEST_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "❌ El puerto $TEST_PORT ya está en uso. Este script usa un puerto dedicado"
  echo "   para no interferir con un servidor de desarrollo real; libéralo o define"
  echo "   TEST_PORT=<otro-puerto> antes de correr test-e2e.sh."
  exit 1
fi

rm -f "$TEST_DB" "$TEST_DB-shm" "$TEST_DB-wal"

# Cleanup
echo "🧹 Cleaning up old dist..."
rm -rf dist dashboard/dist 2>/dev/null || true

# Build backend
echo "📦 Building backend..."
npm run build

# Build dashboard
echo "📦 Building dashboard..."
cd dashboard && npm run build && cd ..

# Start backend server (background) en puerto + DB dedicados
echo "🚀 Starting backend server on port $TEST_PORT..."
PORT="$TEST_PORT" DB_PATH="$TEST_DB" npm start &
BACKEND_PID=$!

cleanup() {
  kill $BACKEND_PID 2>/dev/null || true
  wait $BACKEND_PID 2>/dev/null || true
  rm -f "$TEST_DB" "$TEST_DB-shm" "$TEST_DB-wal"
}
trap cleanup EXIT

BASE_URL="http://localhost:$TEST_PORT"

# QVAC provider boot puede tardar varios segundos (carga/descarga de modelos);
# reintentar en vez de un sleep fijo que a veces no alcanza.
echo "🏥 Waiting for health endpoint..."
HEALTH=""
for i in $(seq 1 30); do
  HEALTH=$(curl -s "$BASE_URL/api/health" | grep -o '"status"' || true)
  if [ -n "$HEALTH" ]; then break; fi
  sleep 1
done
if [ -z "$HEALTH" ]; then
  echo "❌ Health check failed"
  exit 1
fi
echo "✓ Backend alive"

# Query test (sin datos, espera respuesta sin crash)
echo "📋 Testing empty query..."
RESPONSE=$(curl -s -X POST "$BASE_URL/api/query" \
  -H 'content-type: application/json' \
  -d '{"pregunta":"¿Qué hospitales hay?"}')
echo "Response: $RESPONSE" | head -c 200
echo ""

# Flujo de visita: nueva -> extraer -> guardar
echo "📝 Testing visita flow..."
VISITA_ID=$(curl -s -X POST "$BASE_URL/api/visita/nueva" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).visita_id))")
if [ -z "$VISITA_ID" ]; then
  echo "❌ /api/visita/nueva failed"
  exit 1
fi
echo "✓ Visita creada: $VISITA_ID"

EXTRAER=$(curl -s -X POST "$BASE_URL/api/visita/$VISITA_ID/extraer" \
  -H 'content-type: application/json' \
  -d '{"observacion":"Vi un resonador GE Signa en el Hospital Central Lima, Peru."}')
if ! echo "$EXTRAER" | grep -q '"estadoGlobal"'; then
  echo "❌ /api/visita/:id/extraer failed: $EXTRAER"
  exit 1
fi
echo "✓ Extracción: $(echo "$EXTRAER" | head -c 150)"

GUARDAR=$(curl -s -X POST "$BASE_URL/api/visita/$VISITA_ID/guardar" \
  -H 'content-type: application/json' \
  -d '{"cliente":"Hospital Central Lima","pais":"Perú","modalidad":"MR","marca":"GE","modelo":"Signa","estado":"Confirmed"}')
if ! echo "$GUARDAR" | grep -q '"registro_id"'; then
  echo "❌ /api/visita/:id/guardar failed: $GUARDAR"
  exit 1
fi
echo "✓ Registro guardado: $(echo "$GUARDAR" | head -c 150)"

# Dashboard con confianza
echo "📊 Testing dashboard endpoints..."
REGISTROS=$(curl -s "$BASE_URL/api/dashboard/registros")
if ! echo "$REGISTROS" | grep -q '"confianza"'; then
  echo "❌ /api/dashboard/registros no incluye confianza: $REGISTROS"
  exit 1
fi
echo "✓ Registros con score de confianza"

echo "🧹 Stopping backend..."
echo "✅ E2E test passed"
