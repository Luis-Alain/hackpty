# Vigía — Dashboard (Frontend)

PWA React + Vite + Tailwind v4 para visualizar y consultar la base de datos de equipos médicos.

## Resumen

Interfaz web que se conecta al backend (`/server`) para:

- **Tablero**: Visualizar lista de registros, agregados por país/modalidad/estado
- **Consulta**: Hacer preguntas en lenguaje natural sobre los equipos (RAG)

Corre en navegador (localhost:5173 en dev, localhost:8787/dashboard en prod).

## Stack

- **Framework**: React 19 + TypeScript
- **Bundler**: Vite
- **Styles**: Tailwind CSS v4 (CSS-first @theme)
- **Build**: TypeScript strict mode

## Requisitos

- Node.js 18+
- Backend corriendo en http://localhost:8787

## Instalación

```bash
cd server/dashboard
npm install
npm run build
```

## Uso

### Desarrollo

```bash
npm run dev
# Escucha en http://localhost:5173
# Proxy de /api → http://localhost:8787
# HMR activado
```

### Producción

```bash
npm run build
# Genera dist/ (servido por backend en /dashboard)

npm start  # (desde /server)
# Luego accede http://localhost:8787/dashboard
```

## Vistas

### 1. Tablero

- **Tabla de registros**: Cliente, País, Modalidad, Antigüedad, Estado
- **Agregados**: (Opcional) Gráficos de distribución por país/modalidad/estado
- **Filtros**: (Opcional, Paso 10+) Filtrar por país, modalidad, estado

### 2. Consulta (RAG)

- **Input**: Textarea para pregunta en lenguaje natural
- **Estados**:
  - Loading: Spinner mientras se procesa
  - Error: Caja roja si algo falla
  - Empty: Texto si no hay respuesta
  - Success: Respuesta + fuentes (registros citados)
- **Fuentes**: Lista de registros que alimentaron la respuesta (con score de similitud)

## Estructura de Carpetas

```
dashboard/
├── src/
│   ├── main.tsx                # React entry point
│   ├── App.tsx                 # Router (Tablero | Consulta)
│   ├── components/
│   │   ├── Tablero.tsx         # Vista tablero
│   │   └── Consulta.tsx        # Vista consulta (RAG)
│   ├── styles/
│   │   └── globals.css         # Tailwind v4 @theme
│   └── api.ts                  # (Optional) fetch helper
├── public/
│   ├── manifest.json           # PWA manifest
│   └── favicon.ico
├── index.html                  # Root HTML (manifest link)
├── vite.config.ts              # Vite + React + API proxy
├── tailwind.config.ts          # (Empty, tokens in globals.css)
├── tsconfig.json
└── package.json
```

## Configuración

### Vite API Proxy

En `vite.config.ts`:
```typescript
proxy: {
  '/api': {
    target: 'http://localhost:8787',
    changeOrigin: true,
  },
}
```

### Tailwind v4 Tokens

En `src/styles/globals.css`:
```css
@theme {
  --color-fondo: #EDF0EE;
  --color-superficie: #F8F9F8;
  --color-tinta: #12232E;
  --color-acento: #145C7A;
  --color-cocir-al-dia: #8FA3AC;
  --color-cocir-planificar: #B98A44;
  --color-cocir-reemplazar: #A13D2B;
  --color-cocir-sin-dato: #C9C4BC;
}
```

## Edge Cases Manejados

- ✅ **AbortController**: Cancela fetch anterior al cambiar vista
- ✅ **Error states**: Muestra error si backend no responde
- ✅ **Loading states**: Spinner mientras se carga
- ✅ **Empty states**: Mensaje si no hay registros o respuesta vacía
- ✅ **Input validation**: Max 10KB en pregunta de consulta
- ✅ **Network retry**: (Optional, Paso 10+) Reintentar si falla

## Desarrollo

### TypeScript Strict Mode

```bash
npm run build  # Verifica tipos
```

### Hot Module Reload (HMR)

En dev (`npm run dev`), cambios en archivos se reflejan automáticamente.

### Estilos

No hay archivo CSS separado; todo en `globals.css` con Tailwind utilities:

```html
<div className="p-4 bg-[--color-fondo] text-[--color-tinta]">
  Usa variables CSS de @theme
</div>
```

## Testing

```bash
# Manual en navegador
npm run dev
# http://localhost:5173
# - Click "Tablero" → tabla de registros
# - Click "Consulta" → input + enviar pregunta
# - Cambiar tabs → debe cancelar request anterior (AbortController)
```

## Deployment

```bash
# Build
npm run build

# El backend sirve los archivos estáticos en /dashboard
npm start  # (desde /server)

# Accede http://localhost:8787/dashboard
```

## Limitaciones Conocidas

- **Una sola pregunta a la vez**: Si haces otra pregunta mientras procesa, se cancela
- **Sin persistencia**: Historial de consultas solo en memoria (refresh = reset)
- **Responsive**: Optimizado para desktop; mobile requiere ajustes (Paso 10+)

## Próximos Pasos

1. Agregar filtros al tablero
2. Historial de consultas persistente
3. Gráficos de distribución (charts)
4. Export a CSV
5. Responsive design para mobile

## Licencia

MIT

## Autores

- Vigía team, ISD Summit 2026
- Generated with Claude Code
