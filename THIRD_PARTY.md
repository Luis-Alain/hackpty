# Componentes de terceros

## SDK

| Paquete | Versión | Licencia | Uso |
|---|---|---|---|
| `@qvac/sdk` | **0.18.2** (fijada) | ver paquete | Toda la inferencia: LLM, ASR, visión, embeddings, delegación P2P |

## Modelos

Se declaran con el nombre exacto de la constante del SDK, cuantización y hardware donde se
ejecutan en las demostraciones. Se completa a medida que cada módulo los incorpora.

| Constante del SDK | Modelo | Cuantización | Dónde corre |
|---|---|---|---|
| `QWEN3_1_7B_INST_Q4` | Qwen3-1.7B Instruct | Q4_0 | Laptop (RTX 4060, Vulkan) como proveedor P2P |
| `QWEN3_600M_INST_Q4` | Qwen3-0.6B Instruct | Q4_0 | Teléfono (HONOR X6s, CPU Cortex-A53) como respaldo local |
| `WHISPER_LARGE_V3_TURBO` | Whisper large-v3 turbo | — | Laptop (RTX 4060) |
| `VISIONPSY_NANO_460M_MULTIMODAL_Q8_0` + `MMPROJ_VISIONPSY_NANO_460M_MULTIMODAL_Q8_0` | VisionPsy Nano 460M | Q8_0 | Laptop; lectura de placas (track 02) |

## Hardware declarado

| Nodo | Equipo | Rol |
|---|---|---|
| Laptop | Fedora Linux, RTX 4060 8 GB, 31 GB RAM | Proveedor P2P y nodo de sitio |
| Teléfono | HONOR X6s, Android 14, 3.7 GB RAM, 8× Cortex-A53 | Captura; SDK local por Termux (Bare) |
| Nodo remoto | Mac (M5 Max) en otra red | Proveedor P2P alterno, solo para el módulo Equipos |

## Otros

| Componente | Licencia | Uso |
|---|---|---|
| Fotografías ilustrativas del catálogo | Wikimedia Commons (CC), ver `fixtures/FUENTES.json` | Solo demostración |
