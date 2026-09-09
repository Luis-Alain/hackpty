# Vigía — inteligencia local con evidencia

**Equipo HackPTY · Decentralized AI Hackathon 2026 (ISD Summit, Panamá) · 9–11 de septiembre de 2026**

Vigía convierte lo que una persona observa en campo —un hospital, una sucursal bancaria, una
red— en datos revisables y verificables, **sin que el contenido salga de la infraestructura de
quien lo produce**. Toda la inferencia corre en el dispositivo o se delega entre pares con el SDK
de QVAC. Ninguna llamada a una API de inferencia en la nube.

Tracks a los que se presenta este proyecto: **01 Philips** (base instalada) · **02 Tether QVAC Psy**
· **03 Desafío General** · y los módulos de banca (05 Caja de Ahorros) y red (04 Ovnicom) si
quedan completos dentro de la ventana.

## Requisito técnico (artículo 10)

- SDK: `@qvac/sdk` **0.18.2**, fijado a propósito. La versión 0.19.0 (7-sep-2026) eliminó la
  inferencia delegada por DHT (`startQVACProvider`, `delegate.providerPublicKey`). Este proyecto
  demuestra esa delegación entre pares, así que se queda en la última versión que la incluye.
- Modelos, cuantizaciones y hardware de ejecución: `THIRD_PARTY.md`.
- Cada inferencia deja una fila en `evidencia/rendimiento.jsonl` (modelo, hardware, origen local o
  delegado, carga, tokens, TTFT, throughput).

## Base preexistente declarada (artículo 11.c)

Antes del inicio de la competencia, el equipo desarrolló una librería propia de experimentación
con el SDK de QVAC (pruebas de recuperación con citas, extracción bajo gramática, sellado Ed25519 y
delegación P2P). **Se utilizó únicamente como referencia; su código no se incorpora al producto
entregado.** Declaramos este antecedente conforme al artículo 11.c. `evidencia/procedencia.md`
identifica cada componente de este repositorio, su fecha de creación dentro de la ventana y su
relación con dicha referencia.

## Datos

Todos los datos de las demostraciones son **sintéticos**: marcas, modelos, clientes, documentos y
registros son ficticios. Se generan con los scripts de `fixtures/`.

## Estructura

```text
src/core/        runtime QVAC, política de ejecución, registro de rendimiento, eventos, sellado
src/equipos/     módulo Philips: captura, extracción, identidad de activos, inventario
src/sucursal/    módulo banca: procedimiento citado, acta verificable
src/red/         módulo red: consumidor del stream DNS, clasificación, salidas
app/             interfaz web instalable (PWA) y tablero
fixtures/        datos sintéticos
evidencia/       procedencia, rendimiento, pruebas de no salida de datos
```

## Dónde está cada track

Un solo proyecto, un solo repositorio (rama `main`), un solo video. Cada jurado encuentra aquí su parte.

| Track | Módulo | Carpeta | Minuto del video |
|---|---|---|---|
| 01 Philips · Base instalada | Equipos: captura por voz/texto/foto, extracción, identidad y duplicados, inventario, Customer 360 | `src/equipos/`, `app/` | _(por definir)_ |
| 02 Tether · QVAC Psy | VisionPsy Nano lee la placa; reglas deterministas sacan marca, modelo y serie; registro de rendimiento | `src/equipos/placa.js`, `evidencia/rendimiento.jsonl` | _(por definir)_ |
| 03 General · Sovereign Intelligence at the Edge | Todo lo anterior + delegación entre pares por llave pública, respaldo local en el teléfono, actas verificables, prueba de no salida de datos | `src/core/`, `evidencia/` | _(por definir)_ |
| 05 Caja de Ahorros · Banca | Sucursal: procedimiento citado sin conexión, acta sellada y verificable | `src/sucursal/` | _(solo si queda completo)_ |
| 04 Ovnicom · Sentinel-DNS | Red: consumidor del stream DNS, clasificación, alerta a Wazuh, score por zona | `src/red/`, `infra/` | _(solo si queda completo)_ |

## Cómo ejecutarlo

_(se completa con la primera versión funcional)_
