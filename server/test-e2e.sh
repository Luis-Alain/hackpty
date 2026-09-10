#!/bin/bash
set -e

echo "🔵 Starting E2E test..."

# Cleanup
echo "🧹 Cleaning up old dist..."
rm -rf dist dashboard/dist 2>/dev/null || true

# Build backend
echo "📦 Building backend..."
npm run build

# Build dashboard
echo "📦 Building dashboard..."
cd dashboard && npm run build && cd ..

# Start backend server (background)
echo "🚀 Starting backend server..."
npm start &
BACKEND_PID=$!
sleep 3

# Health check
echo "🏥 Checking health endpoint..."
HEALTH=$(curl -s http://localhost:8787/api/health | grep -o '"status"')
if [ -z "$HEALTH" ]; then
  kill $BACKEND_PID 2>/dev/null || true
  echo "❌ Health check failed"
  exit 1
fi
echo "✓ Backend alive"

# Query test (sin datos, espera respuesta sin crash)
echo "📋 Testing empty query..."
RESPONSE=$(curl -s -X POST http://localhost:8787/api/query \
  -H 'content-type: application/json' \
  -d '{"pregunta":"¿Qué hospitales hay?"}')
echo "Response: $RESPONSE" | head -c 200
echo ""

# Cleanup
echo "🧹 Stopping backend..."
kill $BACKEND_PID 2>/dev/null || true
wait $BACKEND_PID 2>/dev/null || true

echo "✅ E2E test passed"
