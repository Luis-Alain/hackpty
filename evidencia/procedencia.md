# Procedencia del código

Este archivo cumple el **artículo 11.c** de los Términos y Condiciones: «Toda base preexistente
utilizada debe declararse en el archivo README del repositorio, con indicación de su origen.»

## Ventana de competencia

Del **9 de septiembre de 2026 a las 8:00** al **11 de septiembre a las 8:00**, hora de Panamá.
Todo el código de `src/`, `app/` y `fixtures/` se escribió dentro de esa ventana. Cada fila de la
tabla siguiente apunta al commit que lo introdujo.

## Referencia previa declarada

Librería propia de experimentación con el SDK de QVAC, escrita por el equipo entre el 3 y el 8 de
septiembre de 2026 (pruebas de recuperación con citas, extracción bajo gramática JSON, sellado
Ed25519, delegación P2P por llave pública, mediciones de rendimiento en laptop y teléfono).
**Uso en este repositorio: referencia de diseño y de resultados medidos. No se copió código.**
Disponible al jurado a solicitud.

## Componentes de este repositorio

| Componente | Archivos | Qué hace | Relación con la referencia | Commit |
|---|---|---|---|---|
| Registro de rendimiento | `src/core/rendimiento.js` | Una línea JSON por carga y por inferencia: modelo, hardware, origen local/delegado, carga, tokens, TTFT, throughput | Nuevo. La referencia solo guardaba el último resumen en memoria | 9-sep |
| Runtime QVAC común | `src/core/runtime.js`, `src/core/runtime.test.js` | Carga (local o delegada por llave pública con respaldo local) y completion medida sobre `@qvac/sdk` 0.18.2; el modo de ejecución se registra según lo que pasó (`getLoadedModelInfo`), no según lo pedido | Nuevo. Toma de la referencia el dato de que `gpu_layers`/`ctx_size` son las claves de `modelConfig` y que Qwen3 antepone `<think>` | 9-sep |
| Sellado de actas | `src/core/sello.js` | JSON canónico + SHA-256 + firma Ed25519 con la llave del nodo (crypto de Node, sin dependencias); `verificar()` funciona con la llave pública que viaja en el sello | Nuevo. La referencia tenía un sellado propio; aquí se reescribió con canonización recursiva y sin librerías | 9-sep |
| Almacén de eventos encadenado | `src/core/eventos.js`, `src/core/sello-eventos.test.js` | JSONL solo-agregar; cada evento lleva la huella del anterior; `verificarCadena()` señala el primer evento alterado | Nuevo | 9-sep |

## Componentes de terceros

Ver `THIRD_PARTY.md`.
