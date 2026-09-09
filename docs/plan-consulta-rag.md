> **Encuadre.** Plan técnico del **módulo de consulta en lenguaje natural** (RAG) para el reto Philips: convierte una pregunta del analista en una respuesta con citas sobre la base instalada de `class Base`. Se construye **encima** de `main` (código de Equipos ya escrito en `src/equipos/`); donde este plan y el repo difieran, **gana el repo** — la sección "Checklist ejecutable" lo resuelve en la Fase 0. `@qvac/sdk` **0.18.2** fijado. Modelos: `QWEN3_1_7B_INST_Q4`, `QWEN3_600M_INST_Q4`, `WHISPER_LARGE_V3_TURBO`. Hoy = **2026-09-09**; todas las visitas del seed son ago-2026.

---

# TL;DR

- **Arquitectura:** *router structured-first* — pre-check determinista (0 tokens) + **UNA** llamada de parseo bajo gramática GBNF (Qwen3 1.7B) → descriptor tipado → **ejecutor determinista** (`.filter()`/`.reduce()`) sobre la vista `class Base` en memoria (fold del log sellado) → respuesta en prosa **sin gramática** con citas de Observation ID adjuntadas por código. Sin vector store, sin reranking, sin top-K global.
- **Decisión 1 — Un solo LLM.** Qwen3 1.7B para las 2 llamadas (parsear + narrar). Se **elimina el router-LLM**; el 600M solo como `fallbackToLocal` del parser en el teléfono sin peer.
- **Decisión 2 — El registro consultable es el `equipo` canónico de `Base.inventario()`**, clave única `customer|modality|manufacturer|model` (model nullable; brecha de edad como señal secundaria de split). Metadata plana = filtro exacto. ~20-25 documentos.
- **Decisión 3 — Retrieval 100% determinista** sobre `class Base`. El residual semántico (~5% de queries, `Notes`) lo resuelve un **scorer léxico** (~15 líneas, Jaccard + `SINONIMOS`). `embed()` **solo** si el spike de Día 1 lo confirma, y **solo** para resolver nombres difusos de cliente.
- **Decisión 4 — Structured output con fallback commiteado.** `ESQUEMA_CONSULTA` anidado (precedente: la captura ya mide 12/12 con anidación de 1 nivel + `[type,null]` + `enum`-null). `ESQUEMA_CONSULTA_PLANO` de 1 nivel listo como respaldo probado. Aritmética de rangos y off-by-one **en JS**, nunca en el modelo.
- **Decisión 5 — Respuesta sin `responseFormat`.** `completar()` en modo prosa; las citas las adjunta el código desde el conjunto recuperado; `vista_sugerida` por `switch` determinista. El determinismo del merge P2P se apoya en **firma Ed25519 + log LWW por `decided_at`**, no en `seed`.
- **Camino crítico:** Fase 0 (contrato de API de Gilberto + 7 verificaciones QVAC) → 1 (seed + oráculo, **hoy**) → 2 (schema + spike GBNF) → 3 (normalización compartida) → 8/9 (parser + ejecutor + filtro/agregación) → 11 (respuesta + citas) → servidor + UI mínima (PWA en `app/`) → 12 (eval B0 vs B4) → 14 (demo escenificada de 60-90 s). **Gate de integración hora ~24: slice vertical end-to-end con 1 query real.**

---

# Checklist ejecutable (1 página)

**Día 0/1 — verificaciones bloqueantes (P1, primera hora):**

| # | Verificar | Si falla |
|---|---|---|
| V1 | `@qvac/sdk` 0.18.2 instala; firma real de `completion()`: ¿`generationParams`? ¿`predict`? ¿`seed`? ¿`temperature` plano o anidado? | Cablear `predict`/`temperature` como corresponda en `runtime.js`; si no hay `seed`, el titular del eval = media de 3±desv y el merge se firma con Ed25519 |
| V2 | `responseFormat`: copiar la **forma exacta** de `qvac-invoice-manager-demo/lib/schema.js`. Compilar `ESQUEMA_CONSULTA` COMPLETO por el SDK; round-trip de E1, E2, E5, E8 y 1 OOS | Pasar a `ESQUEMA_CONSULTA_PLANO` (1 nivel, prefijos `f_`/`r_`/`ag_`) + `aplanarADescriptor()` |
| V3 | `embed()` existe en 0.18.2; hay ID de modelo de embedding en el registry; descarga offline; corre en la RTX 4060 8 GB con Qwen3 cargado sin OOM | Ruta **léxica** como única vía del residual semántico; **no** prometer embeddings en el pitch |
| V4 | `delegate:{providerPublicKey}` / `startQVACProvider` existen en 0.18.2; teléfono↔Mac conectan por Hyperswarm **sin internet** (mDNS LAN o clave directa) | `fallbackToLocal:true` como camino por defecto; la demo P2P pasa a "grabada" y se muestra el mecanismo, no el vivo |
| V5 | Correr `reglas.derivar()` sobre las 20 filas del seed; registrar distribución real de `status` y `confidence_peor` | Fijar el gold de E6/E8 con la salida real; si difiere de la columna del xlsx, reportar `derivation_match_rate` aparte |
| V6 | Leer `almacen.js` / `esquema.js` / `duplicados.js` / `runtime.js` reales; fijar **por escrito** el contrato de nombres de campo de `inventario()` | No escribir `planos`/`filtrar`/`consultar` hasta tener el contrato |
| V7 | Correr la misma prompt ×3 a `temperature:0`; confirmar salida idéntica | Titular del eval = media de 3 con desviación; narrativa de merge = firma Ed25519, no determinismo del modelo |

**Orden de construcción (con dueño):** F0 P1 · F1 P4 · F2 P1 · F3 P1 · F5 P4 · F8 P1 · F9 P1 · F11 P3 · servidor+UI P3 · F12 P4 · F14 P3/P4. Embeddings (F6/F7), dedup avanzado (F4), P2P delegado y NL→SQL = **valor de pitch, no MVP**.

**Lo mínimo que gana la demo (corte del sábado a medianoche):** F0, F1, F2, F3, F5(sin embeddings), F8, F9, F11, servidor+UI mínima, F12(modo oráculo + B0/B4), F14.

**Plan B si el parser rinde mal a la hora 30:** (1) ampliar el pre-check determinista a más patrones; (2) pre-cachear en `history` los parses de las ~8 queries del guion; (3) recortar tipos de query soportados a `listar`/`agregar`/`cliente_360`/`renovacion`; (4) si V2 obligó al schema plano, medir accuracy en ambos y quedarse con el mejor número.

---

# A. Entendimiento del dataset

## A.1 Las tres representaciones del mismo hecho físico

| Capa | Qué es | Dónde vive | Mutabilidad |
|---|---|---|---|
| **Observación** | Afirmación evidencial: "el observador O, el día D, reportó N unidades de UNA modalidad, UNA marca, UN bucket de edad, en UN customer" = una fila de `Dummy Installed Base`. | Log append-only sellado (`core/eventos.js`, JSONL + Ed25519; Hypercore en P2P) | **Inmutable.** Nunca se borra ni se fusiona. |
| **`equipo` (fleet line)** | Lo que la fila describe: `(customer, modality, manufacturer, model?) → quantity`, un grupo homogéneo de N unidades. | `class Base` en memoria (`almacen.js` → `inventario()`) | **Derivado** por *fold* determinista de las observaciones enlazadas. Se recalcula en cada append. |
| **`customer`** | El hospital/clínica como cuenta comercial. | `Base` (`cliente360()`) | Derivado; rollup por `groupBy` de sus `equipo`. |

**El registro contra el que consulta el RAG es el `equipo` canónico.** No la observación cruda (duplica señal), no el activo físico individual (el dataset no tiene ni un serial; `Quantity` va de 1 a 8), no el customer (pierde el nivel modalidad/edad que pide el brief).

## A.2 Hechos estructurales (verificados contra las 20 filas)

- **Una fila ≠ un activo ≠ un customer.** Un customer aparece en varias filas: Pacific (1,2), Horizon (3,4 — *ambas MR*), Light (5,6), Valley (7,8), Andes (10,11), Park (12,13), Instituto Lima (16,17).
- **Una frase de voz genera varias filas:** filas 1+2 comparten `Voice Input` → partida por modalidad. Filas 3+4 comparten input → partida por bucket de edad (BP-MR 500 de 9 años vs BP-MR 900 de 3 años). La captura emite N observaciones con un `capture_id` común.
- **`install_year = visit_year − age` cuadra exacto en las 20 filas del seed, pero es un campo DERIVADO y ruidoso** (la visita es de agosto; un equipo "de 7 años" puede ser 2018 o 2019). **Nunca es clave de identidad.** P4 planta 1 fila sintética donde el año derivado ≠ el declarado, con un caso de eval que la ejercita.
- **`Model` falta o es poco fiable:** fila 12 "Model not visible", fila 20 "Model unknown". La columna `Dummy Model` trae valor igual — ese valor es *ground-truth de eval*, no dato observado. **P4 pone `model: null` en las filas 12 y 20 del seed** para que `incompletos()` no sea vacío (gold `[12,20]`).
- **`Notes` es texto libre corto y semánticamente rico:** "Potential refresh opportunity", "Potential aging installed base", "Four confirmed, one uncertain", "Aggregate row for older systems". **P4 inyecta la columna `Notes` del xlsx en `observacion.notes` al sembrar.** Es el único texto donde una señal no estructurada aporta.
- **`Confidence`** en la columna del seed: solo High (10) / Medium (10). **`Status`** en la columna: solo Reported (13) / Estimated (7). Ambos son **Derived** (`Agent Question Logic` pasos 9-10) → los produce `reglas.derivar()` a partir del lenguaje de los `*_quote`. **P4 debe construir `quantity_quote`/`age_quote` en el seed tal que `derivar()` reproduzca la columna** (7 filas Estimated: 3,4,8,10,14,16,20), con un test que lo verifica antes de correr el eval.
- **Ciudades sin acento en el seed** (`Sao Paulo`, `Bogota`, `Medellin`, `San Jose`). Las queries llegarán con acento → **folding bidireccional obligatorio** (`sinAcentos` en ambos lados de todo match).

## A.3 Cardinalidades

10 países (todos LATAM) · 13 ciudades · 13 customers · 13 observers (roles Field/Sales/Account) · 3 modalidades en datos (MR/CT/Ultrasound; X-Ray, Patient Monitoring, Image Guided Therapy = **0 filas**) · 6 brands · 20 modelos únicos `{AA}-{MOD} {NNN}`.

Relaciones: Observación→Customer **N:1** (20→13) · `equipo`→Customer **N:1** (Horizon: 2 líneas MR) · Customer→City **1:1 en el seed** (diseñar N:1) · City→Country **N:1** (13→10) · Country→Region: dict estático plano (10 países → "LATAM"; subregión por lookup: andina / cono sur / centroamérica y caribe / méxico).

## A.4 Números de referencia (verificados a mano, para eval y pitch)

| Métrica | Valor | Observation IDs |
|---|---|---|
| Unidades totales | **50** | (20 obs) |
| Unidades MR / CT / Ultrasound | **15 / 12 / 23** | MR: 1,3,4,7,11,12,15,17,20 · CT: 2,5,8,10,13,16,19 · US: 6,9,14,18 |
| Unidades por país | BR 11, CO 10, MX 9, AR 4, CR 4, PA 3, CL 3, PE 3, EC 2, DO 1 | — |
| Brasil · MR · edad >7 | **1 cliente** (Hospital DemoCare Horizon) | **[3]** |
| CT · edad >10 | 3 obs, 5 unidades | **[5, 10, 16]** |
| Status = Estimated | 7 | 3,4,8,10,14,16,20 |
| Marca con mayor base instalada (unidades) | **Aurelia Health = 13** (NovaMed 10, HelixCare 10, BluePeak 6, Orion 6, Zenith 5) | — |
| Edad media MR / CT / US (por observación) | **6.0 / 8.43 / 5.25** | CT es la flota más vieja |
| Renovación COCIR (planificar+reemplazar), imagen | **10 obs** | 1,3,5,7,8,10,12,13,16,20 |
| Equipo más viejo | Clinica DemoCare Andes, CT 13 años (2013) | **[10]** |
| Ultrasonido ≥5 unidades | 3 obs | [6,9,14] |
| Renovación parcial de flota (viejo+nuevo, mismo customer+modalidad) | **solo Horizon** (BP-MR 500 de 9a + BP-MR 900 de 3a) | [3,4] |

**Convención fijada** (en `metricas.js` y en el system-prompt): *"edad promedio" = media aritmética por observación, NO ponderada por `quantity`*. "cuántas unidades" = `sum(quantity)`; "cuántos hospitales/registros" = `count`.

---

# B. Taxonomía de queries

`intencion ∈ {listar, cliente_360, agregar, renovacion, incompletos, duplicados, fuera_de_alcance}`.

| Tipo | Estrategia | Ejemplo real | Resultado | ¿Semántico? |
|---|---|---|---|---|
| **exact_lookup** | Determinista sobre `inventario()` / `cliente360()` | "¿Qué equipos hay en Hospital DemoCare Pacific?" | filas 1,2 | No (sí si el nombre viene difuso) |
| **structured_filter** | `.filter()` determinista | "Lista los MR" → 9 obs / 15 unidades | — | No |
| **aggregation** | `agregarSobre()` | "unidades por modalidad" → US 23 / MR 15 / CT 12 | — | No |
| **temporal** | Aritmética de fechas (hoy 2026-09-09) | "visitados antes del 10-ago-2026" → filas 15-20 | — | No |
| **geographic** | Determinista + dict país→región (expansión en `validarConsulta`) | "todo en Brasil" → 3,4,5,6; "región andina" → PE,CL,CO,EC | — | No |
| **multi_condition** | Cadena de `AND` deterministas | **"customers in Brazil with MR estimated more than seven years old"** → **[3] → Hospital DemoCare Horizon** | — | No |
| **comparative** | `groupBy` + rank; el LLM narra el número | "¿qué marca tiene más base instalada?" → Aurelia Health 13 | — | No |
| **renovacion** | COCIR (`clasificarEdad`) dentro del ejecutor + hint de `Notes` | "¿qué sitios conviene renovar?" → 1,3,5,7,8,10,12,13,16,20 | — | Opcional (residual de `Notes`) |
| **data_quality** | Reglas deterministas sobre `planos(base)` | "hospitales con info incompleta" → [12,20]; "duplicados" → ∅ en seed limpio | — | No |
| **semantic** | Scorer léxico sobre `Notes` | "¿dónde el observador dudó del conteo?" → filas 6,14 | — | **Sí** |

**Proporción honesta (~24 queries del brief + demo):**
- **~85% SQL/determinista puro** (filtro + groupBy sobre `class Base`).
- **~10% entity-linking** (nombre de customer difuso — `sinAcentos` + `includes()`; los 13 nombres — "Pacific", "Andes", "Horizon" — son distintivos, no hace falta Levenshtein).
- **~5% semántica de `Notes`** (scorer léxico; `embed()` solo si V3 pasa).

**Conclusión:** el camino primario es determinista. El scorer semántico se activa solo cuando el parser marca `usar_semantico: true`.

---

# C. Structured Output — schema de parseo de query

**Una sola llamada de parseo**, precedida de un pre-check determinista (0 tokens) y seguida de `validarConsulta()` en JS. `generationParams.predict ≈ 800` (el descriptor completo son ~400-600 tokens; sin margen, el JSON se trunca → `JSON.parse` falla → toda query compleja se vuelve silenciosamente `fuera_de_alcance`).

## C.1 El schema (MVP, ~10 campos raíz, anidación de 1 nivel = precedente de la captura)

```js
// src/equipos/consulta.js
import { MODALIDADES, MARCAS, ESTADOS } from './esquema.js';

export const INTENCIONES  = ["listar","cliente_360","agregar","renovacion","incompletos","duplicados","fuera_de_alcance"];
export const CLASES_EDAD  = ["al día","planificar","reemplazar","sin dato"];   // valores COCIR verbatim de clasificarEdad()
export const FRESCURAS    = ["fresca","reciente","vieja"];
export const CONFIANZAS   = ["High","Medium","Low"];
export const CAMPOS_GRUPO = ["country","city","modality","manufacturer","status","confidence_peor","clase_edad","region"];
export const CAMPOS_ORDEN = ["edad","cantidad","ultima_fecha","install_year","modality","country","city","customer"];

const str = { type: ["string","null"] };
const int = { type: ["integer","null"] };
const arrStr  = { type: "array", maxItems: 6, items: { type: "string" } };
const arrEnum = v => ({ type: "array", maxItems: 6, items: { type: "string", enum: v } });

export const ESQUEMA_CONSULTA = {
  type: "object",
  additionalProperties: false,
  required: ["interpretacion","intencion","filtros","rangos","agregacion","orden","limite","consulta_semantica","usar_semantico"],
  properties: {

    // VA PRIMERO a propósito: el 1.7B parafrasea antes de decidir enums (misma técnica que los *_quote de captura).
    // Se muestra al usuario para confirmar (paso "Review" del brief).
    interpretacion: { type: "string" },

    intencion: { type: "string", enum: INTENCIONES },

    filtros: {
      type: "object", additionalProperties: false,
      required: ["country","city","customer","modality","manufacturer","status","confidence_peor","clase_edad","frescura"],
      properties: {
        country:         arrStr,               // texto libre → normalizarPais() + match contra valores vivos de Base
        city:            arrStr,               // texto libre → sinAcentos match
        customer:        arrStr,               // texto libre → sinAcentos + includes(); parcial/difuso va aquí igual
        modality:        arrEnum(MODALIDADES), // ["MR","CT","Ultrasound","X-Ray","Patient Monitoring","Image Guided Therapy"]
        manufacturer:    arrEnum(MARCAS),      // ["NovaMed","Aurelia Health","BluePeak Medical","Orion Imaging","HelixCare","Zenith MedTech"]
        status:          arrEnum(ESTADOS),     // ["Confirmed","Reported","Estimated","Unknown"]
        confidence_peor: arrEnum(CONFIANZAS),  // ["High","Medium","Low"] — se compara contra min(4 subcampos)
        clase_edad:      arrEnum(CLASES_EDAD), // ["al día","planificar","reemplazar","sin dato"]
        frescura:        arrEnum(FRESCURAS)    // ["fresca","reciente","vieja"] — recalculada en query-time vs hoy
      }
    },

    rangos: {
      type: "object", additionalProperties: false,
      required: ["edad_min","edad_max","install_year_min","install_year_max","cantidad_min","ultima_fecha_hasta"],
      properties: {
        edad_min: int, edad_max: int,               // contra age_years_max del equipo
        install_year_min: int, install_year_max: int,
        cantidad_min: int,                          // contra quantity
        ultima_fecha_hasta: str                     // "YYYY-MM-DD" | null, formato validado en JS
      }
    },

    agregacion: {
      type: "object", additionalProperties: false,
      required: ["op","group_by","metric"],
      properties: {
        op:       { type: ["string","null"], enum: ["count","sum","avg","min","max","group", null] },
        group_by: { type: "array", maxItems: 3, items: { type: "string", enum: CAMPOS_GRUPO } },
        metric:   { type: ["string","null"], enum: ["unidades","edad","install_year","registros","clientes", null] }
      }
    },

    orden: {
      type: "object", additionalProperties: false,
      required: ["campo","dir"],
      properties: {
        campo: { type: ["string","null"], enum: [...CAMPOS_ORDEN, null] },
        dir:   { type: ["string","null"], enum: ["asc","desc", null] }
      }
    },

    limite: int,                        // "top N"; null = sin límite
    consulta_semantica: str,            // residual EN INGLÉS que ningún filtro/rango captura; null si todo es estructurado
    usar_semantico: { type: "boolean" } // true SOLO si consulta_semantica != null Y describe algo de las NOTAS de campo
  }
};

export const VACIO_CONSULTA = {
  interpretacion: "", intencion: "fuera_de_alcance",
  filtros: { country:[], city:[], customer:[], modality:[], manufacturer:[], status:[], confidence_peor:[], clase_edad:[], frescura:[] },
  rangos: { edad_min:null, edad_max:null, install_year_min:null, install_year_max:null, cantidad_min:null, ultima_fecha_hasta:null },
  agregacion: { op:null, group_by:[], metric:null }, orden: { campo:null, dir:null },
  limite:null, consulta_semantica:null, usar_semantico:false
};
```

## C.1-bis Fallback commiteado — `ESQUEMA_CONSULTA_PLANO` (1 nivel, si V2 falla)

```js
// Mismos enums; sin sub-objetos. aplanarADescriptor() reconstruye la forma anidada -> el ejecutor solo ve una.
export const ESQUEMA_CONSULTA_PLANO = {
  type: "object", additionalProperties: false,
  required: ["interpretacion","intencion",
    "f_country","f_city","f_customer","f_modality","f_manufacturer","f_status","f_confidence_peor","f_clase_edad","f_frescura",
    "r_edad_min","r_edad_max","r_install_year_min","r_install_year_max","r_cantidad_min","r_ultima_fecha_hasta",
    "ag_op","ag_group_by","ag_metric","ord_campo","ord_dir","limite","consulta_semantica","usar_semantico"],
  properties: {
    interpretacion:{type:"string"}, intencion:{type:"string",enum:INTENCIONES},
    f_country:arrStr, f_city:arrStr, f_customer:arrStr,
    f_modality:arrEnum(MODALIDADES), f_manufacturer:arrEnum(MARCAS), f_status:arrEnum(ESTADOS),
    f_confidence_peor:arrEnum(CONFIANZAS), f_clase_edad:arrEnum(CLASES_EDAD), f_frescura:arrEnum(FRESCURAS),
    r_edad_min:int, r_edad_max:int, r_install_year_min:int, r_install_year_max:int, r_cantidad_min:int, r_ultima_fecha_hasta:str,
    ag_op:{type:["string","null"],enum:["count","sum","avg","min","max","group",null]},
    ag_group_by:{type:"array",maxItems:3,items:{type:"string",enum:CAMPOS_GRUPO}},
    ag_metric:{type:["string","null"],enum:["unidades","edad","install_year","registros","clientes",null]},
    ord_campo:{type:["string","null"],enum:[...CAMPOS_ORDEN,null]}, ord_dir:{type:["string","null"],enum:["asc","desc",null]},
    limite:int, consulta_semantica:str, usar_semantico:{type:"boolean"}
  }
};
```

**Fase 2 mide `exact-match` y tasa de JSON válido del 1.7B sobre AMBOS schemas y se elige por número, no por elegancia.** El plano puede dar mejor accuracy bajo gramática.

## C.2 System-prompt de semántica (lo que el schema no expresa)

Termina en `/no_think`, se limpia con `sinThink()`. Acepta **es/en** (pt: sinónimos incluidos, sin ser objetivo de test).

```
Conviertes UNA pregunta sobre una base instalada de equipos médicos a JSON. No la respondes: la describes.
Escribe primero "interpretacion": una frase con lo que pide el usuario. Luego el resto.

intencion:
- listar       : mostrar / listar / cuáles / qué equipos.
- cliente_360  : todo sobre UN hospital o clínica (pon exactamente un customer).
- agregar      : cuántos, total, promedio, mín, máx, "por país", "por modalidad", ranking.
- renovacion   : candidatos a reemplazo/upgrade, flota vieja, fin de vida útil, oportunidad de venta.
- incompletos  : registros con datos faltantes (sin marca, sin modelo, sin edad).
- duplicados   : registros repetidos o en conflicto sobre el mismo equipo.
- fuera_de_alcance : la pregunta no es sobre la base instalada.

Hoy es 2026-09-09. Fechas relativas se resuelven contra esta. install_year = 2026 − edad (aprox).

VOCABULARIO CERRADO — usa solo estos valores exactos, nunca inventes:
- modality: MR, CT, Ultrasound, X-Ray, Patient Monitoring, Image Guided Therapy
- manufacturer: NovaMed, Aurelia Health, BluePeak Medical, Orion Imaging, HelixCare, Zenith MedTech
- status: Confirmed (dos observadores independientes), Reported (uno), Estimated, Unknown
- confidence_peor: High, Medium, Low  ("confianza baja / poco fiable / dato flojo" → confidence_peor = ["Low"])
- clase_edad: "al día" (≤5 años), "planificar" (6-10), "reemplazar" (>10), "sin dato"
- frescura: "fresca" (visita ≤30 días), "reciente" (≤90), "vieja" (>90)  ("no verificado recientemente" sin fecha → frescura=["vieja"])
- group_by: country, city, modality, manufacturer, status, confidence_peor, clase_edad, region

Sinónimos de modalidad (ES/EN/PT): MRI/resonancia/RM/RMN → MR ; TAC/TC/tomógrafo/scanner → CT ;
ecografía/ecógrafo/ultrasonido/echo/doppler → Ultrasound ; rayos X/RX/radiografía → X-Ray ;
monitoreo/monitorización → Patient Monitoring ; angio/cath lab/hemodinamia → Image Guided Therapy.
"equipo de imagen / imaging" → modality = [MR, CT, Ultrasound, X-Ray, Image Guided Therapy].

GEOGRAFÍA: normaliza ES/PT→EN (Brasil→Brazil, México→Mexico, São Paulo→Sao Paulo, Bogotá→Bogota).
country/city/customer: escríbelos como los diga el usuario (texto libre); el sistema los resuelve.
Regiones: "región andina" / "los Andes" → country=[Peru, Chile, Colombia, Ecuador] ; "cono sur" → [Argentina, Chile];
"Centroamérica y el Caribe" → [Panama, Costa Rica, Dominican Republic]. Si el usuario pide un desglose "por región" → group_by=["region"].

EDAD Y RECENCIA (edad = entero de años; el sistema compara contra la edad máxima estimada):
- "más de N" / "over N" / "older than N"   → edad_min = N          (el ajuste +1 lo hace el sistema, tú pon N)
- "al menos N" / "N o más"                  → edad_min = N
- "menos de N" / "under N"                  → edad_max = N          (el ajuste −1 lo hace el sistema)
- "hasta N" / "N o menos"                   → edad_max = N
- "alrededor de N"                          → edad_min = N, edad_max = N   (el sistema abre ±2)
- "viejo/antiguo/aging/outdated/legacy/fin de vida" SIN número → clase_edad = ["reemplazar"] (NO pongas edad_min)
- "envejeciendo / conviene planificar reemplazo"            → clase_edad = ["planificar","reemplazar"]
- "nuevo/reciente/recent" SIN número                         → clase_edad = ["al día"]
- "instalado antes de AAAA" → install_year_max = AAAA ; "desde AAAA" → install_year_min = AAAA
- "estimated/estimado" como cobertura de un número NO es filtro. Solo pon status=["Estimated"] si el usuario
  CONTRASTA estimado vs confirmado, o pregunta explícitamente por registros no confirmados.
- "verificado independientemente / confirmado por dos" → status=["Confirmed"]

FECHAS DE VISITA:
- "antes del D"      → ultima_fecha_hasta = D   (el sistema resta 1 día)
- "hasta el D" / "el D o antes" → ultima_fecha_hasta = D
Devuelve la fecha en formato YYYY-MM-DD.

CANTIDAD:
- "cuántos hospitales / sitios / clientes / registros"          → agregacion.metric = "registros" (o "clientes")
- "cuántas unidades / equipos / sistemas / máquinas / escáneres" → agregacion.op = "sum", metric = "unidades"

AGREGACIÓN: "desglose por X" / "por país" → op="group", group_by=[X]. "promedio de edad" → op="avg", metric="edad"
(media por observación, NO ponderada por cantidad).
ORDEN: "más viejos primero" → campo="edad", dir="desc". "top N" / "el más X" → limite = N (1 si "el más").
Sin pedir orden → campo=null, dir=null.

RESIDUAL SEMÁNTICO:
- consulta_semantica = la parte que NINGÚN filtro/rango captura, frase corta, SIEMPRE EN INGLÉS aunque la pregunta
  esté en español o portugués. Si no queda nada, null.
- usar_semantico = true SOLO si consulta_semantica != null Y describe algo de las NOTAS de campo
  ("parece descuidado", "los técnicos lo marcaron raro", "misma familia de equipos", "oportunidad mencionada en notas").
  Si todo es estructurado: consulta_semantica = null, usar_semantico = false.

POR DEFECTO: filtros sin valor = []. rangos/fechas/op/metric/orden sin valor = null. limite = null salvo "top N".
Ante la duda, deja vacío en vez de adivinar.
/no_think
```

**Tablas de lookup estáticas (no vectores), en `normaliza-consulta.js`:**
- **país→región:** los 10 → `"LATAM"`. `subregion`: {Panama, Costa Rica, Dominican Republic} → "Centroamérica y Caribe"; {Mexico} → "México"; {Peru, Chile, Colombia, Ecuador} → "Andina"; {Brazil, Argentina} → "Sudamérica-Este/Cono Sur".
- **región→países** (para expandir menciones de región a `filtros.country`): tabla inversa de lo anterior.
- **clase_edad** = `clasificarEdad(age_years_max)` de `almacen.js` (COCIR/ESR: ≤5 "al día", 6-10 "planificar", >10 "reemplazar").
- **frescura** = de `dias_desde_ultima = hoy − ultima_fecha`: ≤30 "fresca", ≤90 "reciente", else "vieja". Recalculada en query-time contra `Date.now()`, **nunca congelada**.

## C.3 Ejemplos pregunta → descriptor

**E1 — query insignia Philips:** *"Show me customers in Brazil with MR systems estimated to be more than seven years old"*
```json
{ "interpretacion": "Customers in Brazil with MR equipment estimated to be more than seven years old",
  "intencion": "listar",
  "filtros": { "country": ["Brazil"], "city": [], "customer": [], "modality": ["MR"],
               "manufacturer": [], "status": [], "confidence_peor": [], "clase_edad": [], "frescura": [] },
  "rangos": { "edad_min": 7, "edad_max": null, "install_year_min": null, "install_year_max": null,
              "cantidad_min": null, "ultima_fecha_hasta": null },
  "agregacion": { "op": null, "group_by": [], "metric": null },
  "orden": { "campo": "edad", "dir": "desc" }, "limite": null,
  "consulta_semantica": null, "usar_semantico": false }
```
`validarConsulta` aplica off-by-one: "more than seven" → `edad_min = 8`. `"estimated"` se ignora (cobertura de número). Ejecución: `filtrar(planos(base), d)` con `country=Brazil ∧ modality=MR ∧ age_years_max ≥ 8` → fila 3 (edad 9) entra, fila 4 (edad 3) no → **1 sitio: Hospital DemoCare Horizon, 3 unidades**.

**E2 — agregación con filtro:** *"¿Cuántas unidades de CT hay por país?"*
```json
{ "interpretacion": "Total CT units grouped by country", "intencion": "agregar",
  "filtros": { "country": [], "city": [], "customer": [], "modality": ["CT"],
               "manufacturer": [], "status": [], "confidence_peor": [], "clase_edad": [], "frescura": [] },
  "rangos": { "edad_min": null, "edad_max": null, "install_year_min": null, "install_year_max": null,
              "cantidad_min": null, "ultima_fecha_hasta": null },
  "agregacion": { "op": "group", "group_by": ["country"], "metric": "unidades" },
  "orden": { "campo": "cantidad", "dir": "desc" }, "limite": null,
  "consulta_semantica": null, "usar_semantico": false }
```
Ejecución: `agregarSobre(filtrar(planos(base), d), {op:"group", group_by:["country"], metric:"unidades"})` → AR 3, BR 2, MX 2, PE 2, PA 1, CL 1, DO 1.

**E3 — renovación + residual semántico:** *"Which sites have aging imaging equipment that could be a refresh opportunity?"*
```json
{ "interpretacion": "Sites with aging imaging equipment that are refresh candidates", "intencion": "renovacion",
  "filtros": { "country": [], "city": [], "customer": [],
               "modality": ["MR","CT","Ultrasound","X-Ray","Image Guided Therapy"],
               "manufacturer": [], "status": [], "confidence_peor": [], "clase_edad": ["planificar","reemplazar"], "frescura": [] },
  "rangos": { "edad_min": null, "edad_max": null, "install_year_min": null, "install_year_max": null,
              "cantidad_min": null, "ultima_fecha_hasta": null },
  "agregacion": { "op": null, "group_by": [], "metric": null },
  "orden": { "campo": "edad", "dir": "desc" }, "limite": null,
  "consulta_semantica": "refresh opportunity mentioned in field notes", "usar_semantico": true }
```
Ejecución: `filtrar(planos(base), d)` (COCIR aplicada dentro del ejecutor, cada fila con `obs_id` + `notes`) → `rankNotas(filas, "refresh opportunity...")` (scorer léxico) sube filas cuyo `Notes` dice "Potential refresh opportunity" (16), "Potential aging installed base" (5), "Old CT estimate" (10).

**E4 — cliente 360 con nombre difuso:** *"Dame todo lo que sabemos del hospital Pacific en Panamá"*
```json
{ "interpretacion": "Full profile of Hospital DemoCare Pacific in Panama", "intencion": "cliente_360",
  "filtros": { "country": ["Panama"], "city": [], "customer": ["hospital Pacific"], "modality": [],
               "manufacturer": [], "status": [], "confidence_peor": [], "clase_edad": [], "frescura": [] },
  "rangos": { "edad_min": null, "edad_max": null, "install_year_min": null, "install_year_max": null,
              "cantidad_min": null, "ultima_fecha_hasta": null },
  "agregacion": { "op": null, "group_by": [], "metric": null },
  "orden": { "campo": null, "dir": null }, "limite": null,
  "consulta_semantica": null, "usar_semantico": false }
```
`validarConsulta` resuelve `"hospital Pacific"` → `sinAcentos` + `includes()` contra los 13 nombres → `"Hospital DemoCare Pacific"` → `base.cliente360('Hospital DemoCare Pacific')` → MR 2 unidades + CT 1 unidad (filas 1,2).

## C.4 Relación con el schema de captura de Gilberto (`ESQUEMA` en `esquema.js`)

|  | **Captura** (`ESQUEMA`, `extraer.js`) | **Consulta** (`ESQUEMA_CONSULTA`, nuevo) |
|---|---|---|
| Entrada | reporte de campo libre (es/en/pt) | 1 pregunta del analista |
| Salida | 1+ **registros** para APPEND al log sellado | 1 **descriptor** (no toca datos) |
| Operación | WRITE (evento Ed25519 + hash chain) | READ sobre `Base.inventario()` |
| Verbo del modelo | copiar-y-extraer con citas `*_quote` | clasificar intención + mapear a enums |
| `status`/`confidence` | DERIVADOS por `derivar()` | valores de FILTRO que da el usuario |
| Split de filas | sí (por modalidad, por bucket de edad) | no |
| Anti-degradación | `*_quote` por campo | `interpretacion` (1 string, al inicio) |
| Modelo | `QWEN3_1_7B_INST_Q4`, `/no_think` | **el mismo, misma instancia cargada** |

**Reconciliación — 3 acciones concretas:**
1. **`consulta.js` importa de `esquema.js`:** `MODALIDADES, MARCAS, ESTADOS, SINONIMOS, normalizarModalidad, numerosEn, sinAcentos`. Cero redefinición.
2. **Refactor menor a acordar con Gilberto (Fase 0/3):** mover `PAISES / normalizarPais / paisEnTexto` de `extraer.js` a `esquema.js`; exportar `COCIR / clasificarEdad` desde `almacen.js` o moverlo a `esquema.js`. Así captura y consulta comparten normalización de países y de edad.
3. **Contrato de nombres (Fase 0, por escrito):** las claves de `filtros` / `group_by` / `orden` = exactamente los campos que emite `Base.inventario()`. Se documenta la firma real antes de escribir `planos`/`filtrar`.

---

# D. Estrategia de datos / indexado

## D.1 Unidad de indexación: **1 `equipo` consolidado de `Base.inventario()` = 1 documento**

~20-25 documentos del seed (mapeo ~1:1 con las 20 observaciones porque no hay duplicados plantados). El índice es una **vista derivada**: `construirIndice(base)` reconstruye el conjunto entero desde `base.inventario()` tras cada `guardar()`. Sin merge incremental — a 25-150 docs el rebuild es microsegundos.

## D.2 Estructura del documento y clave canónica

```jsonc
{
  "id": "<huella>",                 // huella(canonico({clave})) de core/sello.js — sha256 determinista
  "text": "<string ES + frase espejo EN>",   // plantilla determinista, ver D.3
  "metadata": { /* dict plano, ver D.4 */ }
  // sin campo "vector" en el MVP
}
```

**Clave canónica ÚNICA en todo el pipeline** (resuelve la contradicción D.2/D.5 del borrador):
```js
import { huella, canonico } from '../core/sello.js';
import { claveCliente } from './almacen.js';

const id = huella(canonico({
  sitio:        claveCliente(c),          // "hospital democare pacific|panama"  (sinAcentos ambos lados)
  modality:     e.modality,               // "MR"
  manufacturer: e.manufacturer ?? null,
  model:        e.model ?? null            // separa BP-MR 500 de BP-MR 900 en Horizon (E13 depende de esto)
}));
```
**Nunca se keyea por `age_bucket` derivado** (partiría/fundiría líneas en los bordes de bucket). La **brecha de edad** (`|Δ age_point|` grande) es señal **secundaria** de split, solo cuando `model` es `null` o igual en ambas observaciones.

## D.3 Plantilla EXACTA de `text` (determinista, cero LLM)

`construirTexto(customer, equipo, meta)` — ES canónico + 1 frase espejo EN (ayuda al match léxico cross-lingual y sirve de contexto al LLM narrador).

```
{customer.name} ({facility_type}) — {city}, {country}. {qty_frase_es} {modalidad_es}{marca_modelo_es}, {edad_frase_es}. Estado del registro: {status_es} ({n_obs} observación(es) de {n_observadores} observador(es): {lista_observadores}; última visita {ultima_fecha}). Confianza (peor campo): {confidence_peor}. Regla COCIR: {clase_edad_es}. {incompleto_frase}Notas de campo: {notas_concat}. {frase_origen_es}
{customer.name} in {city}, {country}: {qty_en} {modalidad_en}{marca_modelo_en}, ~{age_years} years old (installed ~{install_year}), age category {clase_edad_en}. Record status {status_en}, confidence {confidence_peor}. {notas_concat}
```

| Slot | Regla |
|---|---|
| `modalidad_es` | MR→"resonancia magnética (MR)" · CT→"tomografía computarizada (CT)" · Ultrasound→"ecografía (Ultrasound)" · X-Ray→"rayos X (X-Ray)" · Patient Monitoring→"monitoreo de pacientes" · Image Guided Therapy→"terapia guiada por imagen (IGT)" |
| `modalidad_en` | "MRI (magnetic resonance) systems" · "CT (computed tomography) scanners" · "ultrasound systems" · etc. Singular si `quantity == 1`. |
| `qty_frase_es` | `quantity != null` → `"{n} unidad(es) de"` · `null` → `"unidades (cantidad sin confirmar) de"` |
| `marca_modelo_es` | marca+modelo → `" de {manufacturer}, modelo {model}"` · marca sin modelo → `" de {manufacturer}, modelo no registrado"` · sin marca → `", fabricante desconocido"` |
| `edad_frase_es` | `min==max` → `"~{min} años (instalado ~{install_year})"` · `min!=max` → `"entre {min} y {max} años"` · `null` → `"antigüedad desconocida"` |
| `status_es` | Confirmed→"Confirmado (dos observadores independientes)" · Reported→"Reportado (un observador)" · Estimated→"Estimado (lenguaje aproximado)" · Unknown→"Incompleto" |
| `clase_edad_es` | "al día"→"equipo al día (< 5 años)" · "planificar"→"conviene planificar el reemplazo (5-10 años)" · "reemplazar"→"supera los 10 años: corresponde reemplazo" · "sin dato"→"sin datos de antigüedad" |
| `incompleto_frase` | si `faltan.length` → `"Faltan datos: {faltan.join(', ')}; la próxima visita debería confirmarlos. "` si no `""` |
| `notas_concat` | notas distintas no nulas de `equipo.observaciones[].notes`, unidas por `" · "`. Vacío → `"sin notas"`. |
| `frase_origen_es` | opcional: `"Frase(s) de origen: " + dedupe(observaciones[].voice_input)` |

**Ejemplo instanciado (fila 16):**
> *"Instituto DemoCare Lima (instituto) — Lima, Peru. 2 unidades de tomografía computarizada (CT) de Orion Imaging, modelo OI-CT 540, ~12 años (instalado ~2014). Estado del registro: Estimado (1 observación de 1 observador: Sales User 10; última visita 2026-08-08). Confianza (peor campo): Low. Regla COCIR: supera los 10 años: corresponde reemplazo. Notas de campo: Potential refresh opportunity.*
> *Instituto DemoCare Lima in Lima, Peru: 2 CT (computed tomography) scanners from Orion Imaging, ~12 years old (installed ~2014), age category reemplazar. Record status Estimated, confidence Low. Potential refresh opportunity."*

## D.4 Qué va en `metadata` (dict plano, sin sub-objetos)

| Campo | Origen |
|---|---|
| `doc_type` = "equipo", `schema_version` = 1, `equipo_id` | constantes / D.2 |
| `customer_name`, `customer_key` | `claveCliente(c)` = `sinAcentos(name)+'|'+sinAcentos(country)` |
| `facility_type` | prefijo del nombre: Hospital / Clinica / Centro Medico / Centro Diagnostico / Instituto |
| `city`, `city_key` (`sinAcentos`), `country` (`normalizarPais`), `region`="LATAM", `subregion` | |
| `modality`, `modality_group` (Imagen / Monitoreo) | `equipo.modality` |
| `quantity`, `quantity_uncertain` (regex sobre notas: `/uncertain\|sin confirmar\|one unknown\|maybe/i`) | |
| `manufacturer`, `manufacturer_known` (bool) | `equipo.manufacturer` (nunca adivinado) |
| `model`, `model_known` (**false** para filas 12/20 aunque el seed traiga valor) | |
| `age_years_min/max`, `age_known`, `clase_edad` (`clasificarEdad`), `install_year_min/max` | |
| `necesita_atencion` (bool) = `clase_edad ∈ {planificar, reemplazar}` | |
| `status`, `is_estimated` (`status ∈ {Estimated, Unknown}`) | `equipo.status` de `reglas.derivar()` |
| `confidence_peor` = `min(quantity, manufacturer, model, age)` con orden `Low < Medium < High` | derivado de `equipo.confidence.*` (que es un OBJETO) |
| `n_observaciones`, `n_observadores`, `observadores[]`, `observacion_ids[]` (para citar) | |
| `ultima_fecha`, `dias_desde_ultima` (**query-time**, no congelar), `frescura` (fresca/reciente/vieja) | |
| `incompleto` (bool), `faltan[]` (misma lógica que `incompletos()`, aplicada dentro del ejecutor), `notas` (= `notas_concat`) | |

**Los filtros del retrieval son columnas directas de `metadata` → la parte estructurada de la query es `.filter()` puro.**

> **Nota `confidence` (corrección del borrador):** `equipo.confidence` de `reglas.derivar()` es un **objeto** `{quantity, manufacturer, model, age}`, no un escalar. El pipeline expone **`confidence_peor`** (mínimo de los 4) y filtra/ordena contra eso. `status` sí es escalar. **V5 mide la distribución real de `confidence_peor` en el seed** y fija el gold de E6.

## D.5 Deduplicación — reusa lo que ya existe, sin record-linkage nuevo

**Regla firme:** `duplicados.comparar()` de Gilberto ya es Fellegi-Sunter determinista con umbrales **`p≥0.9` "mismo" / `p≥0.5` "revisar" / `p<0.5` "nuevo"**, y ya se usa dentro de `inventario()` para consolidar. **No se añade Jaro-Winkler, ni banda de adjudicación LLM, ni escalera de blocking nueva.**

```
INGEST(captura_cruda):
 1. NORMALIZE  — módulo único (esquema.js / normaliza-consulta.js), compartido con la captura:
    customer → sinAcentos(name) + facility_type ; country → normalizarPais ; city → sinAcentos ;
    modality → normalizarModalidad ; manufacturer → MARCAS exacto o null ; model → regex {AA}-{MOD} {NNN} o null ;
    age → age_point + rango ; install_year = visit_year − age_point ; quantity → int (nunca sumar entre reportes).
    content_hash = sha256(customer_key|modality|manufacturer|model|quantity|age_point|observer_id|observed_at_date)
 2. APPEND a core/eventos.js (Hypercore en P2P) — evidencia inmutable, nunca se muta.
 3. CONSOLIDACIÓN por identidad (dentro del fold, ya existente):
    clave determinista customer|modality|manufacturer|model ; si no matchea → comparar() con veredicto:
      "mismo"  → merge en la línea
      "revisar"→ queda como línea aparte + se registra el par en pendientes[] (lo muestra la vista de duplicados)
      "nuevo"  → línea nueva
 4. EXACT DEDUP: si content_hash ya enlazado a esta línea → marcar duplicate_of, STOP. NO sube confianza.
 5. CONFLICTO: entre observaciones de una misma línea, desacuerdo de quantity / manufacturer concreto / model →
    conflicts[] con atribución {value, observation_id, observer, observed_at}.
 6. RESOLUCIÓN (MVP — mínima):
    - customer, modality : nunca se resuelven (definen la línea).
    - quantity           : MODA entre observaciones → desempate por más reciente. NUNCA suma, NUNCA max.
    - resto de campos     : last-writer-wins por observed_at (el agente reconcilia en la demo P2P).
    - confidence, status  : SIEMPRE derivados por reglas.derivar(), nunca copiados.
    (La matriz por-campo completa — media ponderada de edad, mediana si ≥3 — queda documentada como referencia,
     fuera del MVP: el seed tiene 0 duplicados y P4 planta 5-8.)
 7. BUILD CANONICAL RECORD: fold → recalcular confidence, status, freshness. 
 8. MATERIALIZE a class Base en memoria.
```

**`duplicadosSospechosos(base)`:** necesita un método interno nuevo `Base.inventarioConClave()` (~5 líneas) que exponga la forma de comparación `{site, modality, manufacturer, model, quantity, age}` que `inventario()` recorta; encima, envuelve `candidatos()` + `comparar()` y devuelve los pares con veredicto `"revisar"` (p en `[0.5, 0.9)`). **Cero código de record-linkage nuevo.**

**Decisión explícita (afecta E14 y la demo de corroboración):** `inventario()` **auto-fusiona** con veredicto `"mismo"` y **solo marca** con `"revisar"`. La demo de corroboración usa dos observaciones que fusionan → `reglas.derivar()` sube `status` Reported→Confirmed y `confidence`.

**Detección de duplicados = feature del sync P2P en vivo, no del retrieval.** El seed tiene 0 duplicados → **P4 planta 5-8 observaciones (MUST, Fase 1):** variante con acento "Clínica" vs "Clinica"; 2º observador en el mismo sitio → corroboración; desacuerdo de quantity → conflicto; model que rellena un blanco previo; retry offline → exact-dedup.

---

# E. Estrategia semántica (embeddings = condicional, no MVP)

## E.1 Qué se embebe

**Nada en el MVP.** La plantilla `text` de D.3 se construye igual (sirve de contexto al LLM narrador), pero **no hay vector store**.

## E.2 El residual semántico (~5% de queries) — `rankNotas()` léxico

```js
// src/equipos/semantico.js  (~15 líneas)
export function rankNotas(filas, consultaSemantica) {
  const q = tokens(sinAcentos(consultaSemantica.toLowerCase()));
  const qExp = new Set([...q, ...q.flatMap(t => SINONIMOS[t] ?? [])]);
  return filas
    .map(f => {
      const texto = tokens(sinAcentos((f.notas ?? '').toLowerCase()));
      const hits = texto.filter(t => qExp.has(t)).length;
      return { ...f, _sem: hits / Math.max(1, qExp.size) };
    })
    .filter(f => f._sem > 0)               // piso: al menos 1 token en común
    .sort((a, b) => b._sem - a._sem);
}
```

Las `Notes` del seed son 6 patrones cortos, todos mapeables a tokens. El brief pide "¿dónde el observador dudó del conteo?" → `Notes` "Four confirmed, one uncertain" (6), "Quantity estimated" (14) → hit léxico directo.

## E.3 `embed()` — spike de Día 1 (V3), un solo uso si pasa

Si V3 confirma que `embed()` existe en 0.18.2, hay ID de modelo, descarga offline y **no** hay OOM en la RTX 4060 con Qwen3 cargado:
- **Único uso:** resolución de **nombres difusos de cliente** cuando `sinAcentos` + `includes()` no matchea (p.ej. "la clínica de los Andes"). Se embeben los 13 nombres de customer una vez (~13 vectores), coseno contra el nombre difuso, umbral ~0.6.
- **Se declara en el pitch solo si el spike pasó.** Si no: la resolución difusa se queda en `includes()` + token-overlap y el pitch no menciona embeddings.
- `Map<customer_key, Float32Array>`, L2-normalizado, coseno a mano en JS. **Solo en la laptop**, nunca en el HONOR X6s.

## E.4 Multi-view: **NO.** Un solo camino semántico (léxico). La señal de "riesgo" es 100% determinista (`status`, `clase_edad`, `necesita_atencion`, `incompleto`, `frescura`, `quantity_uncertain`).

---

# F. Estrategia de retrieval

## F.1 Router structured-first (contradice el pipeline lineal del borrador)

```
0. PRE-CHECK determinista (JS puro, 0 tokens):
   - mencionaClienteConocido(q) (substring normalizado vs los 13 nombres de inventario())        → cliente_360
   - /\bduplicad|duplicate|reconcili/i                                                            → duplicados
   - /incomplet|sin verificar|desactualiz|no confirmad/i                                          → incompletos
   - /renov|refresh|upgrade|reemplaz|obsolet|fin de vida|aging/i                                  → renovacion
   PERO fall-through OBLIGATORIO al parser si hay señales de negación/comparación/agregación:
     /\bno\b|sin necesidad|compar|versus|\bvs\b|cuántos|cuantas|promedio|ranking|top \d/i
   Los patrones de alta confianza (sin exclusión disparada) DESPACHAN directo a consultar() con un descriptor mínimo.

1. PARSER (1 sola llamada completion + responseFormat, QWEN3_1_7B, temperature:0, seed si V1 lo permite,
   generationParams.predict ≈ 800)  — solo si el pre-check no resolvió → descriptor (schema C).

2. validarConsulta(crudo, pregunta, base)  — verificador determinista (~70 líneas):
   - JSON.parse(sinThink(texto)); si falla o trunca → VACIO_CONSULTA (intencion:'fuera_de_alcance')
   - descartar valores de array fuera de la lista canónica (defensa ante drift)
   - country → normalizarPais + expandir menciones de región → lista; quedarse con los que existen en base; resto → sinResolver
   - city/customer → sinAcentos + includes() (nada de Levenshtein); ambiguo → candidatos, NO adivinar
   - modality → normalizarModalidad
   - ARITMÉTICA DE RANGOS — ÚNICA FUENTE = JS: el modelo emite el número crudo, JS aplica off-by-one:
       /más de (\d+)|more than (\d+)|older than (\d+)|over (\d+)/  → edad_min = N + 1
       /menos de (\d+)|under (\d+)|younger than (\d+)/            → edad_max = N − 1
       /alrededor de (\d+)|around (\d+)|~\s*(\d+)/                → edad_min = N−2, edad_max = N+2
   - GUARDA DE NÚMERO: si un valor de rango no aparece en numerosEn(pregunta) → descartar
   - FECHAS: /^\d{4}-\d{2}-\d{2}$/ ; "antes del D" → restar 1 día ; swap si min>max ; clamp edad 0..60, año 2000..2026, limite 1..100
   - frescura: traducir a rango de dias_desde_ultima en query-time
   - usar_semantico && !consulta_semantica → usar_semantico = false
   - intencion 'cliente_360' con customer.length !== 1 → bajar a 'listar'
   - agregacion.op != null && intencion 'listar' → subir a 'agregar'
   - intencion 'renovacion' sin clase_edad ni edad_min → clase_edad = ['planificar','reemplazar']

3. consultar(base, descriptor)  — switch por intencion (JS determinista, sin LLM):
   cliente_360  → base.cliente360(customer[0])
   agregar      → agregarSobre(filtrar(planos(base), d), descriptor.agregacion)
   renovacion   → filtrar(planos(base), d) con clase COCIR calculada DENTRO del ejecutor (cada fila con obs_id + notes)
   incompletos  → filtrar(planos(base), d) con regla de faltantes DENTRO del ejecutor
   duplicados   → duplicadosSospechosos(base)
   fuera_de_alcance → { vacio: true, motivo: '...' }
   listar       → filas = filtrar(planos(base), d)
                  if (usar_semantico && consulta_semantica) filas = rankNotas(filas, consulta_semantica)
                  ordenarYlimitar(filas, orden, limite)

4. RESPUESTA (sección G / K.11)
```

`planos(base)` = `base.inventario().flatMap(s => s.equipos.map(e => ({ ...e, customer: s.customer })))` — **firma real a confirmar en Fase 0**.
`filtrar(filas, d)` = `filtros.*` como conjuntos IN + `clase_edad`/`frescura`/`confidence_peor` contra columnas derivadas + `rangos` contra `age_years_max` / `install_year_max` / `quantity` / `ultima_fecha`.

**Camino determinista paralelo (dashboard / 360 / mapa) = 0 LLM:** la UI llama vía HTTP directo a `Base.cliente360()/renovaciones()/incompletos()` y a un endpoint de agregación → JSON en <5 ms. El LLM solo entra por la caja de consulta en lenguaje natural.

## F.2 Metadata filtering PRIMERO (retriever primario, no pre-filtro del vector)

Es `.filter()` + `agregarSobre()` sobre `class Base`. Responde la query estrella del brief y ~85% del resto. El vocabulario es controlado limpio (6 marcas, 6 modalidades, 4 status, 3 confianza) → el filtro es exacto y reduce 20→~3 candidatos.

## F.3 `agregarSobre(filas, {op, group_by, metric})` — motor de agregación (código nuevo, ~medio día, P1)

Corrección del borrador: **`Base.agregado()` del repo solo acepta `country|city|modality` y no calcula promedios.** E4 (ranking de marca) y E10 (avg edad por modalidad) lo necesitan. Por eso:
- **`agregarSobre()` es el único camino de agregación de la capa de consulta.** Soporta `count | sum | avg | min | max | group`, `group_by` multi-campo (hasta 3), `metric ∈ {unidades, edad, install_year, registros, clientes}`.
- `metric:"unidades"` → `sum(quantity)`; `"registros"` → `count(filas)`; `"clientes"` → `count(distinct customer_key)`; `"edad"` con `op:"avg"` → media por observación.
- `Base.agregado()` se deja **solo** para el camino directo del dashboard (sin filtros), no para la capa de consulta.

## F.4 Híbrido: mínimo. Solo `intencion:"listar"` con filtro duro + residuo de `Notes`:
- **Léxico** = `rankNotas()` (E.2) + `contains` de literales que el parser extrajo (número de modelo, fragmento de nombre). No BM25, no RRF.
- **Fusión** = re-ordenar el subconjunto ya filtrado por `_sem` desc. Sin fusión ponderada de scores.

## F.5 Query transformation

| Técnica | Veredicto |
|---|---|
| `consulta_semantica` en inglés emitida por el parser | **SÍ** (coste cero, robustez cross-lingual; instrucción explícita en C.2) |
| Sinónimos de modalidad ES/EN/PT en el system-prompt | **SÍ** (diccionario estático) |
| Expansión región→países en `validarConsulta` | **SÍ** (tabla estática) |
| HyDE / query expansion / multi-query / retrieval agéntico multi-hop | **NO** — el parser + filtro es exacto |
| Multi-turn / resolución de pronombres | **NO** para la demo (single-shot responde todo el brief) |

## F.6 Parámetros top-K

- **NO hay top-K global.** Los agregados devuelven el conjunto completo (un top-K convertiría un `COUNT` correcto en uno mal — bug de correctitud silencioso).
- **K solo dentro del sub-camino semántico:** top-8 de `rankNotas()`.
- **A contexto del LLM:** todas las filas resultado, cap duro ~40; si el match es mayor → pasar el agregado + una muestra, nunca 100 filas.

---

# G. Reranking

## **NO para el MVP. NO como stretch salvo que el eval lo pida.**

Tras el filtro quedan **0-15 candidatos** (seed de 20) o **0-40** (sintético). La query estrella deja **1 candidato**. El problema que justifica un reranker (miles de vecinos casi-duplicados en 100k docs) **no existe aquí**.

- **QVAC no tiene API ni modelo de reranking.** Cross-encoder propio = imposible en 48 h.
- **LLM-as-reranker con `completion`:** ~80 tokens/fila. 15 candidatos ≈ 1200 tok in + 300 out → ~3-6 s en Qwen3 1.7B. Ganancia real en las queries del brief ≈ **0**. Añade un modo de fallo por query.
- **En su lugar — sort determinista de 2-3 claves** (reemplaza la fórmula de 7 términos ponderados del borrador, que es "teatro matemático" a esta escala):

```js
// cuando hace falta ordenar (intencion:"renovacion" sin orden explícito, o desempate):
filas.sort((a, b) =>
     PESO_CLASE[b.clase_edad] - PESO_CLASE[a.clase_edad]   // reemplazar(3) > planificar(2) > al día(1) > sin dato(0)
  || b.age_years_max - a.age_years_max                      // más viejo primero
  || PESO_CONF[b.confidence_peor] - PESO_CONF[a.confidence_peor]); // High > Medium > Low
```
Determinista y **explicable** ("esta fila va primera porque supera 10 años y es la más vieja").

- **LLM-as-reranker se implementa SOLO como 1 corrida A/B (arm B2)** para el pitch: demostrar `Δ_calidad ≈ 0, Δ_coste > 0` (+~1100 tok, +~2 s p50). Frase: *"El reranker añade una inferencia y ~2 s por consulta para 0 puntos de mejora. No lo usamos: enrutamos."*

---

# H. Arquitectura QVAC

## H.1 Mapa etapa → componente QVAC

| Etapa | API / componente | Modelo | Dónde corre |
|---|---|---|---|
| Voz→texto (opcional) | `core/voz.js` → Whisper + ffmpeg normalize | `WHISPER_LARGE_V3_TURBO` | Local (laptop) |
| Pre-check | JS puro sobre `Base.inventario()` | — | Local, 0 ms |
| Parse query → descriptor | `completion` + `responseFormat` json_schema (forma exacta de invoice-manager), `generationParams:{temperature:0, predict:800, seed?}` | `QWEN3_1_7B_INST_Q4`, `/no_think` | Local (laptop; teléfono usa 600M como `fallbackToLocal`) |
| `validarConsulta` | JS determinista | — | Local, <1 ms |
| Filtrado / agregación / dedup | JS determinista sobre `class Base` + `comparar()` | — | Local, <5 ms |
| Residual semántico | `rankNotas()` léxico (`embed()` solo si V3, solo nombres de cliente) | — (opc. modelo de embedding) | Local (laptop) |
| Reranking | **ninguna** | — | **cortado** |
| Respuesta final | `completion` vía `core/runtime.js`, **SIN `responseFormat`** (prosa); citas y `vista_sugerida` las adjunta el código | `QWEN3_1_7B_INST_Q4` | Local o **P2P delegado → laptop/Mac** |
| Evidencia | `core/rendimiento.js` → `evidencia/rendimiento.jsonl` (TTFT, tokens, ruta, modelo, local/delegated) | — | Local |

**Router-LLM: ELIMINADO.** El pre-check es determinista y el parser 1.7B ya emite `intencion`. El 600M solo como `fallbackToLocal` del parser.

**NO usar `ragIngest`/`ragSearch`/`ragChunk`.** Justificación para el pitch (20 s): *"El filtro de metadata estilo-Mongo del vector store built-in solo tiene `$eq` confirmado (`$gt`/`$lt` inciertos); nuestras queries del brief son todas rangos de edad y año. Un `.filter()` JS a 20-150 filas es exacto, auditable y nos da control total para el eval."* (No usar el argumento "not production grade" — la doc de QVAC lo llama "perfecto para prototipos".)

**Sobre modelos:** se estandariza en **Qwen3 1.7B** (medido 12/12 en captura el 9-sep) + **Qwen3 0.6B** (fallback). `LLAMA_3_2_1B_INST_Q4_0` también existe en el registry de QVAC pero no lo necesitamos.

## H.2 Local vs P2P delegado

| Componente | Siempre local | Delegable a laptop/Mac (cliente = teléfono) |
|---|---|---|
| Pre-check, parser, `validarConsulta`, filtrado, agregación, `rankNotas`, dedup | ✅ | — |
| Resolución difusa con `embed()` (si V3) | ✅ | ❌ |
| **Respuesta final** | fallback | ✅ **delegar** — es la demo estrella: *"el teléfono en campo pregunta, el Mac en la oficina responde por Hyperswarm, sin nube"* |

`loadModel({ modelSrc, modelType:'llm', delegate:{ topic, providerPublicKey, fallbackToLocal:true } })` — **existencia de `providerPublicKey`/`startQVACProvider` en 0.18.2 a verificar en V4.** `fallbackToLocal:true` → un teléfono solo sigue respondiendo con el 600M. Hyperswarm sin internet: LAN vía mDNS, o conexión directa por `providerPublicKey` conocida. **V4 monta y ensaya el setup exacto hoy.**

## H.3 Storage — 4 capas, solo la capa 1 es fuente de verdad

```
CAPA 4 — Índices de consulta (DESECHABLES, se reconstruyen del fold)
  • Map<customer_key, Float32Array>   (SOLO si V3 pasa; solo 13 nombres de cliente)
  • (sin sql.js, sin vector store de equipos)
        ▲ se reconstruyen de ↓
CAPA 3 — Vista materializada = fold determinista de TODOS los logs
  class Base (src/equipos/almacen.js), array de ~20-150 objetos EN MEMORIA.
  inventario() consolida observaciones por identidad (comparar()); reglas.derivar() para status/confidence.
  Rebuild en cada append. TODO el retrieval corre AQUÍ.
        ▲ replicado y foldeado de ↓
CAPA 2 — Replicación Hyperswarm (cada dispositivo tiene la UNIÓN de todos los logs tras sync)
        ▲
CAPA 1 — Log append-only por dispositivo (ÚNICA fuente de verdad)
  Hoy: core/eventos.js = JSONL sellado (core/sello.js, Ed25519 + JSON canónico). P2P: Hypercore.
  Merge-decisions cacheadas como registros append-only FIRMADOS Ed25519 (un peer decide una vez, los demás adoptan; LWW por decided_at).
```

**Frase de pitch:** *"El log es la base de datos. El índice es una lente desechable que reconstruimos del fold — por eso el sync P2P no puede corromper una consulta."*

> **Corrección de determinismo (V7):** `seed` con `temperature:0` **no** garantiza reproducibilidad bit-a-bit entre dispositivos (Metal vs CUDA vs CPU). Lo que hace adoptable una `merge_decision` es que **un solo peer la calcula y la FIRMA con Ed25519** (`sello.js` ya existe); los demás la adoptan del log encadenado **sin recalcular**. No se confía en que dos peers computen la misma adjudicación.

## H.4 UI — servidor HTTP local + PWA (Electron CORTADO del MVP)

Corrección del borrador: **no existe ninguna UI en `main`**; `package.json` no depende de electron/react/vite; `scripts.start` apunta a `src/servidor.js` (inexistente). El README dice "PWA y tablero", no Electron. **Decisión: la UI de consulta vive en `app/` (PWA) sobre `main`, servida por `src/servidor.js` — NO se usa el shell Electron de la rama `QVAC-Psy` (es de otro track).**

```
src/servidor.js  (P3, código nuevo ~6h) — HTTP local, dueño de:
  @qvac/sdk (loadModel, completion, embed?), class Base en memoria, Map<customer_key,vec> (si V3)
  Endpoints:
    POST /api/consulta         { texto } → { respuesta_md, numeros, entidades, citas, vista_sugerida, filas, rendimiento }
    GET  /api/inventario?...    · GET /api/cliente360?id=... · POST /api/agregado {dim}
    GET  /api/renovaciones      · GET /api/incompletos       · GET /api/malla/estado
    (los GET NO pasan por el LLM, <5 ms)
  SSE: /api/eventos → malla:sync, rendimiento:muestra

app/  (P3, PWA) — Caja de consulta · Customer 360 · "Mapa" (lista agrupada Region→País→Ciudad→Cliente→Equipos, NO mapa geográfico) ·
  Dashboard (por modalidad / geo / edad / tech envejecida / info incompleta / actualizados recientemente / oportunidades)
  Usa vista_sugerida para auto-enfocar el panel. El mapa geográfico real = stretch explícito.
```

**MVP visual = dashboard plano + Customer 360 + caja de consulta.** Las vistas del dashboard/360 NO pasan por el LLM → **aunque el modelo falle, el 90% de la UI sigue viva.**

## H.5 Encaje con la malla P2P

El retrieval corre **siempre sobre la vista materializada LOCAL** (capa 3 = fold de todos los logs replicados). No hay "query distribuida": primero sincronizas (Hyperswarm replica), luego consultas local. `malla:sync` → `class Base` re-foldea → índices de capa 4 invalidados → la PWA refetcha.

**Demo de corroboración:** teléfono A registra "Hospital Pacific, 2 MR". Teléfono B lo registra independientemente. Tras sync, `comparar()` marca `"mismo"`, `reglas.derivar()` sube confidence, `status` Reported→Confirmed, y el pin del mapa pasa de ámbar a verde. La adjudicación borderline se cachea como `merge_decision` firmada Ed25519 que todos los peers adoptan.

---

# I. Evaluación

## I.1 Unidad de recuperación y ground truth

Unidad = el registro `equipo` de `Base.inventario()`, cada uno con `obs_id` = Observation ID del Excel (mapeo 1:1 con el seed). **El gold se expresa como lista de Observation IDs.**

**Oráculo determinista, no escrito a mano:** se commitea `fixtures/base-instalada.json` (20 filas + 1 fila de conflicto de año + 5-8 duplicados plantados). El gold se **calcula** ejecutando el mismo predicado en JS plano en `src/equipos/eval/consulta.gold.js`. Si se tocan los datos, el gold se regenera solo.

**Gold de `status`/`confidence`:** se toma de la columna del Excel **y** se verifica que `reglas.derivar()` la reproduce (test de fixture, Fase 1). La diferencia residual se reporta como `derivation_match_rate` (métrica lateral, no error de retrieval).

## I.2 Set de eval — **12 casos canónicos + 2 extra + 2 negativos** (congelar HOY)

| id | pregunta | intención | filtros esperados (post-`validarConsulta`) | obs gold | respuesta |
|---|---|---|---|---|---|
| **E1** | "customers in Brazil with MR estimated to be more than seven years old" | listar | `country=[Brazil], modality=[MR], edad_min=8` | **[3]** | 1 cliente: Hospital DemoCare Horizon, 3× BP-MR 500 ~9a |
| **E2** | "¿cuántas unidades MR hay y en qué países?" | agregar | `modality=[MR], op=sum, metric=unidades, group_by=[country]` | [1,3,4,7,11,12,15,17,20] | 15 unidades / 9 obs / 8 países |
| **E3** | "CT de más de 10 años" | listar | `modality=[CT], edad_min=11` | **[5,10,16]** | Light 2×OI-CT 450 (11a); Andes 1×BP-CT 610 (13a); Lima 2×OI-CT 540 (12a) |
| **E4** | "¿qué marca tiene mayor base instalada por unidades?" | agregar | `op=sum, metric=unidades, group_by=[manufacturer], orden=cantidad desc` | [2,8,14,20] | **Aurelia Health = 13** |
| **E5** | "¿qué equipo hay en el hospital Pacific?" | cliente_360 | `customer≈"Pacific"` → Hospital DemoCare Pacific | **[1,2]** | 2×NM-MR 700 + 1×AH-CT 320 |
| **E6** | "¿qué registros son estimados, no confirmados?" | listar | `status=[Estimated]` | **[3,4,8,10,14,16,20]** | 7 obs |
| **E7** | "desglose de unidades por modalidad" | agregar | `op=group, metric=unidades, group_by=[modality]` | (todas) | Ultrasound 23, MR 15, CT 12 |
| **E8** | "¿qué sitios de imagen conviene renovar?" (COCIR determinista) | renovacion | `modality=imagen, clase_edad=[planificar,reemplazar]` | **[1,3,5,7,8,10,12,13,16,20]** | 10 obs; ordenadas por edad desc |
| **E9** | "sitios visitados antes del 10-ago-2026" | listar | `ultima_fecha_hasta=2026-08-09` | **[15,16,17,18,19,20]** | 6 obs / 5 sitios |
| **E10** | "compara la edad promedio entre modalidades" | agregar | `op=avg, metric=edad, group_by=[modality]` (por observación) | (todas) | CT 8.43a, MR 6.0a, US 5.25a |
| **E11** | "flotas de ultrasonido de 5 o más unidades" | listar | `modality=[Ultrasound], cantidad_min=5` | **[6,9,14]** | Light (5), North (6), Central (8) |
| **E12** | "¿cuál es el sistema más antiguo?" | listar | `orden=edad desc, limite=1` | **[10]** | Andes, BP-CT 610, ~13a (2013) |
| **E13** (extra) | "hospitales con información incompleta" | incompletos | `incompleto=true` (falta model) | **[12,20]** | Park, Metro North |
| **E14** (extra) | "¿hay duplicados que reconciliar?" | duplicados | regla sobre observaciones plantadas | **par plantado** (∅ en seed limpio) | el par observador-A/observador-B |
| **EN1** (neg) | "equipos que NO necesitan renovación" | listar | fall-through del pre-check; `clase_edad=[al día]` | [2,4,6,9,11,15,17,19] | mide misroute del pre-check |
| **EN2** (neg) | "compara Pacific vs Horizon" | agregar/comparative | fall-through; `customer=[Pacific, Horizon]` | [1,2,3,4] | mide misroute del pre-check |

**E8 y E10:** gold determinista (COCIR verbatim / media aritmética por observación). **E14:** único caso positivo de dedup — usa las observaciones plantadas. Idiomas: mezcla es/en. Recortable a 10 si falta tiempo (quitar E13, E14 → pero E14 vale para el brief).

## I.3 Métricas (`src/equipos/eval/metricas.js`, funciones puras)

- **Filter-accuracy (parseo):** `intent_ok`, `exact` (deepEqual de filtros normalizados post-`validarConsulta`), `slot_f1` sobre slots `"campo:op:valor"`, `over_filter` / `under_filter`. **Titular: exact-match rate + slot-F1 medio.**
- **Retrieval:** `setF1(got, gold)` sobre el corte natural (list/count/aggregate devuelven exactamente N, sin K) = **métrica principal**. `recallAtK` / `precisionAtK` con K∈{1,3,5}. `mrr` solo para lookup/rank. Sin nDCG/MAP.
- **Answer correctness:** el paso de respuesta emite `{respuesta_md, numeros:[{k,v}], entidades:[str], citas:[obsId], vista_sugerida}`. `num_ok` = todo par numérico del gold está en `pred.numeros` con `v` exacto. `ent_f1` = setF1 de entidades con `sinAcentos` + inclusión de substring. `answer_score` = media.
- **Groundedness (estructural, NO LLM-judge):** media de 3 booleanos — (1) `pred.citas ⊆ recuperados`, (2) cada entidad aparece en alguna fila recuperada, (3) cada número = recomputar el agregado sobre las filas recuperadas.
- **Latencia / tokens:** filtrar `evidencia/rendimiento.jsonl` por `request_id` con prefijo `EVAL-<RUN_ID>-<qNN>-<etapa>`. Por etapa y arm: p50/p90 `end_to_end_ms`, `ttft_ms`, tokens in/out, `execution_mode` (local/delegated).
- **Truncado:** caso que verifica que E1/E2/E8 no truncan (longitud de salida < `predict`) + test "JSON truncado → `VACIO_CONSULTA`".

## I.4 Experimentos A/B — **B0 vs B4** (los demás opcionales)

| Arm | Pipeline | Qué demuestra | Prioridad |
|---|---|---|---|
| **B0 vector-only** | `rankNotas(pregunta)` (o `embed` si V3) → top-K sobre ~20 docs → respuesta. Sin filtro, sin parser. | El baseline "RAG genérico". Falla en count/aggregate y filtros duros. | **must** (el contraste) |
| **B4 structured-first** | pre-check → parser → `validarConsulta` → ejecutor determinista → respuesta. `rankNotas` solo si `usar_semantico`. | **La arquitectura recomendada.** Recall exacto, latencia mínima, respuestas verificables. | **must** |
| B1 filtro+semántico siempre | B4 pero corriendo `rankNotas` en toda query `listar` | El filtro arregla lo estructural; el residuo desempata | should |
| B2 + reranker LLM | B4 + `completion` como reranker sobre top-N. **1 sola corrida.** | Que el reranker **no aporta** (Δ≈0) y cuesta ~1 inferencia + ~2 s | should |

**Orden:** B4 → B0 → (1 pasada de B2 si hay GPU). **Congelar el set hoy, correr modo oráculo hoy, correr B0/B4 el viernes noche / sábado mañana.** Si B4 no supera claramente a B0, el pitch cambia y hay que saberlo con 24 h de margen.

## I.5 Script mínimo

Archivos: `fixtures/base-instalada.json`, `fixtures/distractores.json` (~8 near-miss, obs_id 101+: MR de Brasil de 4 años para E1, CT de 9 años para E3…), `fixtures/sembrar.js`, `src/equipos/eval/consulta.gold.js`, `src/equipos/eval/metricas.js`, `src/equipos/eval/consulta.eval.js`, `src/equipos/consulta.test.js`.

- **Modo oráculo (gate de CI, sin GPU):** `node --test` sin `PRUEBA_MODELO` → siembra, corre `consultar()` con los filtros del gold, verifica `setF1==1` para todos los casos no-semánticos. Valida ejecutor + métricas + gold + `derivar()` vs columna.
- **Modo completo:** `PRUEBA_MODELO=1 ARM=B4 node --test` en la laptop RTX 4060. Escribe `evidencia/eval-consulta.<ARM>.<RUN_ID>.json` + filas en `rendimiento.jsonl`.
- **Determinismo:** `temperature:0` + `seed` si V1 lo permite. Si V7 muestra no-reproducibilidad: titular = **media de 3 repeticiones ± desviación** de `recall@5` y `answer_score` de B4.

## I.6 Números para el pitch (**proyectados — se llenan con la corrida real**)

| Arm | Filter exact | Recall@5 | Answer-F1 | Groundedness | p50 latencia | tokens in/out |
|---|---|---|---|---|---|---|
| B0 vector/léxico-only | — | ~0.55-0.70 | ~0.45-0.60 | ~0.60 | ~0.8-1.7 s | ~350/110 |
| **B4 structured-first** | ~0.85-0.92 | **~0.95-1.0** | **~0.92-0.97** | **~1.0** | **~2.3 s** | ~600/150 |
| B2 +reranker | ~0.85-0.92 | ~0.95-1.0 | ~0.92-0.97 | ~1.0 | **~4.3 s** | **~1100/230** |

**3 frases de pitch:**
1. *"En una base de 20-150 registros, el parser bajo gramática de QVAC + filtro determinista alcanza recall exacto; el baseline sin parser se queda en ~2/3 porque no cuenta ni agrega."*
2. *"El reranker añade una inferencia y ~2 s por consulta para 0 puntos de mejora. No lo usamos: enrutamos."*
3. *"Cada respuesta cita los Observation IDs de las filas que la sustentan; groundedness estructural = 1.0, auditable contra `evidencia/`."*

**Anti-saturación:** `fixtures/distractores.json` con ~8 equipos casi-acierto hace que el `over_filter` del parser tenga consecuencia medible.

## I.7 Narrativa de impacto (para el pitch — 20 pts en juego)

- **Persona:** rep de campo de Philips en un hospital de LATAM sin wifi, con un teléfono de gama baja. Hoy anota la base instalada en una libreta o una hoja de cálculo que nunca se sincroniza.
- **El dinero:** un MR ronda **US$1-3M**. Una base instalada que muere en hojas de cálculo = oportunidades de renovación de 7 cifras que nadie ve. E1 y E8 identifican esas oportunidades en una frase.
- **Por qué descentralizado y no SaaS:** (1) el hospital no deja salir sus datos de inventario; (2) el rep no tiene conectividad en el sótano de radiología; (3) el log sellado Ed25519 es **evidencia auditable** para compras médicas y compliance.
- **Alineación con el hackathon:** Vigía prueba que `structured-output` + delegación P2P de QVAC **reemplazan un stack RAG de nube** para un workflow enterprise real, on-device.

---

# J. Arquitectura final

## J.1 Crítica caja por caja al pipeline propuesto

`User Query → Structured Output/Parsing → Structured Query + Original → Metadata Filtering → Embedding Search → Hybrid Retrieval → Top-K → Reranking → Context → LLM Answer`

| Caja del usuario | Veredicto | Qué cambia |
|---|---|---|
| **User Query** | **se queda** | + voz opcional + **pre-check determinista ANTES de cualquier modelo** (¿cliente conocido? ¿"duplicado"/"incompleto"/"renovar"?), con fall-through obligatorio ante negación/comparación/agregación |
| **Structured Output / Query Parsing** | **se queda, 1 sola llamada** | pre-check → 1 parseo (no 2, sin router-LLM) → `validarConsulta()` JS |
| **Structured Query + Original Query** | **se queda** | la "structured query" es un **descriptor tipado**, NO prosa ni SQL |
| **Metadata Filtering** | **se PROMUEVE a retriever primario** | `.filter()`/`agregarSobre()` sobre `class Base`; responde ~85% del brief |
| **Embedding Search** | **DEGRADADA a scorer léxico opcional** | `rankNotas()` (~15 líneas) sobre `Notes`; solo `usar_semantico:true`; `embed()` solo si V3, solo para nombres de cliente |
| **Hybrid Retrieval** | **SIMPLIFICADO** | solo `listar` con residuo; re-orden por `_sem`; sin RRF |
| **Top-K** | **SE ELIMINA como etapa global** | los agregados necesitan el conjunto completo; K solo dentro del sub-camino semántico (top-8) |
| **Reranking** | **SE CORTA** | no existe en QVAC; a ≤15 filas tipadas = latencia por cero ganancia. Solo 1 corrida A/B |
| **Context** | **se queda** | ensamblado determinista: filas → tabla markdown + agregados YA calculados por código; cap 40 filas |
| **LLM Answer** | **se queda, SIN `responseFormat`** | `completion` en prosa; citas y `vista_sugerida` las adjunta el código; prompt "no recalcules números, cítalos" |
| **(nuevo) Router / dispatch** | **SE AGREGA** | pre-check + `intencion` del descriptor → método de `class Base` |
| **(nuevo) Camino determinista paralelo** | **SE AGREGA** | dashboard / 360 / mapa = HTTP directo a `Base.*`, 0 LLM, <5 ms |

## J.2 Diagrama ASCII final

```
   voz (opcional) ─►┌────────────────────────────┐
                    │ Whisper LARGE_V3_TURBO      │  core/voz.js              [local]
                    └──────────────┬─────────────┘
                                   ▼  consulta en lenguaje natural (es/en)
                 ┌─────────────────▼──────────────────┐
                 │ 0. PRE-CHECK  (JS, 0 ms)            │
                 │  ¿cliente conocido? ¿"duplicado"?    │
                 │  ¿"incompleto"? ¿"renovar/refresh"?  │
                 │  fall-through si: no / compara / vs  │
                 │            / cuántos / promedio      │
                 └───────┬───────────────────┬─────────┘
                 (match) │                   │ (ambiguo / fall-through)
                         │      ┌────────────▼───────────────────────────┐
                         │      │ 1. PARSER  completion + responseFormat  │
                         │      │    QWEN3_1_7B  temp=0  predict=800      │  ~1.4–3.3 s
                         │      │    seed? (V1)                    [local] │
                         │      │  → descriptor {interpretacion, intencion,│
                         │      │    filtros, rangos, agregacion, orden,   │
                         │      │    limite, consulta_semantica, usar_sem} │
                         │      │  (fallback: ESQUEMA_CONSULTA_PLANO)      │
                         │      └────────────┬───────────────────────────┘
                         │                   ▼
                         │      ┌────────────────────────────────────────┐
                         │      │ 2. validarConsulta()  (JS ~70 líneas)   │
                         │      │  enums · normalizarPais · región→países │
                         │      │  sinAcentos+includes() customer         │
                         │      │  OFF-BY-ONE en JS (única fuente)         │
                         │      │  guarda de números vs numerosEn()       │
                         │      │  fechas · clamps · up/downgrade intención│
                         │      └────────────┬───────────────────────────┘
                         ▼                   ▼
       ┌─────────────────────────────────────────────────────────────┐
       │ 3. consultar(base, descriptor)  — switch por intencion       │
       │                                                             │
       │  cliente_360 → base.cliente360()                             │
       │  agregar     → agregarSobre(filtrar(planos(base), d), ag)    │
       │  renovacion  → filtrar(planos(base), d) + COCIR EN ejecutor  │
       │  incompletos → filtrar(planos(base), d) + faltantes EN ejec. │
       │  duplicados  → duplicadosSospechosos(base)  (comparar())     │
       │  listar      → filas = filtrar(planos(base), d)              │
       │               if usar_semantico:                            │
       │                 ┌───────────────────────────────────────┐   │
       │                 │ 3b. rankNotas(filas, consulta_sem_EN)   │   │
       │                 │     scorer léxico Jaccard + SINONIMOS   │   │
       │                 │     (embed() SOLO nombres de cliente,   │   │
       │                 │      SOLO si V3 pasó)                   │   │
       │                 └───────────────────────────────────────┘   │
       │               ordenarYlimitar(filas, orden, limite)          │
       │                                                             │
       │  CONJUNTO COMPLETO para agregados (SIN top-K global)         │
       └───────────────────────┬─────────────────────────────────────┘
                               ▼
       ┌─────────────────────────────────────────────────┐
       │ 4. CONTEXTO  (JS determinista)                   │
       │  filas → tabla markdown compacta (obs_id incl.)  │
       │  + agregados YA calculados por código            │
       │  cap 40 filas; si más → agregado + muestra       │
       └───────────────────────┬─────────────────────────┘
                               ▼
       ┌───────────────────────────────────────────────────────────┐
       │ 5. RESPUESTA  completion  (SIN responseFormat, prosa)      │
       │  QWEN3_1_7B  [local]  ó  [P2P → laptop/Mac] fallbackToLocal│
       │  prompt: "responde solo con estas filas; no recalcules     │
       │           números; si vacío, dilo, no inventes"            │
       │  el CÓDIGO adjunta: numeros[], entidades[], citas[obsId],  │
       │                     vista_sugerida (switch por intencion)  │
       └───────────────────────┬───────────────────────────────────┘
                               ▼
   respuesta + citas + auto-foco de vista  +  evidencia/rendimiento.jsonl

 ────────────────────────────────────────────────────────────────────────────
  CAMINO DETERMINISTA PARALELO (dashboard / 360 / mapa) — 0 LLM, <5 ms:
     PWA ──HTTP──► /api/{inventario,cliente360,agregado,renovaciones,incompletos} ──► JSON
 ────────────────────────────────────────────────────────────────────────────

  ALMACENAMIENTO:
     Hypercore log (verdad) ──sync Hyperswarm──► fold ──► class Base en memoria (vista)
        │                                                      │
        └── Map<customer_key,vec>  (solo si V3, 13 nombres) ◄──┘  (lente desechable)
     merge_decisions: firmadas Ed25519, un peer decide, los demás adoptan (LWW por decided_at)
```

---

# K. Plan de implementación por fases

> Roles: **P1** Núcleo QVAC (Gilberto — captura ya hecha + schema/parser/ejecutor de consulta) · **P2** Malla P2P (Hyperswarm/Hypercore/fold/inferencia delegada) · **P3** Interfaz (servidor HTTP + PWA + responder) · **P4** Producto/datos/demo (dataset, eval, guion, video, pitch).
>
> ~43 h restantes, 4 devs. **Presupuesto:** P1 ~19h · P3 ~18h · P4 ~21h · P2 en su track de malla + ~4h de apoyo.

| # | Fase | Qué hacer | Archivos/módulos | Dep. | "Hecho" cuando | Prio | Dueño · h |
|---|---|---|---|---|---|---|---|
| **0** | **Contrato + verificaciones** | Las 7 verificaciones de la casilla (V1-V7). Leer `almacen.js`/`esquema.js`/`duplicados.js`/`runtime.js` reales; documentar por escrito la firma de `inventario()` y qué devuelven `cliente360/renovaciones/incompletos`. Acordar el refactor de `normalizarPais`/`clasificarEdad`. | `docs/contrato-base.md`, `docs/verificaciones-qvac.md` | — | `docs/contrato-base.md` fija los nombres de campo; V1-V4 tienen respuesta sí/no | **must** | P1 · 2 |
| **1** | **Dataset + oráculo** | `fixtures/base-instalada.json` (20 filas con `*_quote` tal que `derivar()` reproduzca Status/Confidence del xlsx; `model:null` en 12,20; `Notes` del xlsx en `observacion.notes`). **+1 fila de conflicto de año. +5-8 observaciones de duplicado/corroboración.** Test de fixture que verifica `derivar()` vs columna para las 20 filas. Tabla de números de A.4. | `fixtures/{base-instalada,distractores,sembrar}.js`, `docs/dataset-notas.md`, `fixtures/derivar.test.js` | 0 | `sembrar()` reproduce 50/15/12/23; el test de `derivar()` pasa; el gold de E1-E14 se calcula solo | **must** | P4 · 5 |
| **2** | **Schema + spike GBNF** | `ESQUEMA_CONSULTA` + `ESQUEMA_CONSULTA_PLANO` + `SISTEMA_CONSULTA` + `INTENCIONES`/`CLASES_EDAD`/`FRESCURAS`/`VACIO_CONSULTA` + `aplanarADescriptor()`. Compilar AMBOS por el SDK; medir `exact-match` y tasa de JSON válido del 1.7B en 5 queries reales; elegir por número. | `src/equipos/consulta.js` | 0, `esquema.js` | El schema elegido devuelve JSON parseable en E1/E2/E5/E8/OOS; `predict` dimensionado | **must** | P1 · 4 |
| **3** | **Normalización compartida** | Mover `PAISES`/`normalizarPais`/`paisEnTexto` a `esquema.js`; exportar `COCIR`/`clasificarEdad`. Añadir `normaliza-consulta.js`: tabla región↔países, `subregion`, regex `model`, regex `quantity_uncertain`, `frescuraDe(dias)`, `sinAcentos` bidireccional. | `src/equipos/esquema.js` (edit), `src/equipos/normaliza-consulta.js` | 2 | captura y consulta importan el MISMO módulo; `node --test` de normalización pasa | **must** | P1 · 3 |
| **4** | **Dedup wrapper** | `Base.inventarioConClave()` (~5 líneas, expone la forma de comparación). `duplicadosSospechosos(base)` = envolver `candidatos()`/`comparar()` existentes, devolver pares con veredicto `"revisar"` (p∈[0.5,0.9)). Conflicto de quantity = comparar observaciones de una línea consolidada. **Sin record-linkage nuevo.** | `src/equipos/duplicados.js` (edit), `src/equipos/almacen.js` (edit) | 3 | E14 devuelve `[]` en seed limpio; con las 2 obs plantadas devuelve el par | **should** | P1/P2 · 3 |
| **5** | **Document generation** | `construirTexto(customer, equipo, meta)` (plantilla D.3, determinista) + `construirIndice(base)` (metadata D.4, incl. `confidence_peor`, `frescura` query-time). | `src/equipos/indice.js` | 1, 3 | `construirIndice` produce ~20-25 docs; `text` de fila 16 = el ejemplo de D.3; `node --test` de plantilla | **must** | P4 · 3 |
| **6** | **Semántico léxico** | `rankNotas()` (Jaccard + `SINONIMOS` sobre `notas`). **Sin embeddings.** | `src/equipos/semantico.js` | 5 | E-semánticas ("dudó del conteo") suben filas 6,14 | **should** | P2 · 2 |
| **7** | **embed() (condicional)** | SOLO si V3 pasó: `embebeCliente(nombre)` con el modelo de embedding, L2-norm, `Map<customer_key, Float32Array>` (13 entradas), coseno en JS. Único consumidor: resolución difusa de customer en `validarConsulta`. | `src/equipos/vector.js` | 6, V3 | "la clínica de los Andes" resuelve a Clinica DemoCare Andes; o se omite la fase entera | **nice** | P2 · 2 |
| **8** | **Retrieval / parser** | `parsear(modelo, pregunta)` (pre-check con fall-through + `completar` + `validarConsulta`) · `consultar(base, descriptor)` (switch → métodos de `Base` + `filtrar`/`ordenarYlimitar`; COCIR y faltantes DENTRO del ejecutor con `obs_id`+`notes`). | `src/equipos/consultar.js`, `src/equipos/router.js` | 2, 3, 5 | E1-E14 en modo oráculo dan `setF1==1` (no-semánticos); EN1/EN2 no hacen misroute | **must** | P1 · 8 |
| **9** | **Metadata filtering + agregación** | `filtrar(filas, d)` (conjuntos IN + `clase_edad`/`frescura`/`confidence_peor` + rangos) · **`agregarSobre(filas, {op, group_by, metric})`** con `count/sum/avg/min/max/group` y `group_by` multi-campo (código nuevo). | `src/equipos/consultar.js` (parte de 8) | 8 | E2/E4/E7/E10 dan el número exacto; test `agregarSobre` sin filtro == dashboard | **must** | P1 · 5 |
| **10** | **Reranking** | **NADA en el pipeline.** Solo `rerankLLM(pregunta, candidatos)` aislado para el arm B2 (1 corrida). | `src/equipos/eval/rerank-spike.js` | 8, 12 | el arm B2 corre y produce `Δ` medible | **nice / cut** | P4 · 1 |
| **11** | **Generation** | `responder(base, modelo, pregunta, {arm, requestId})` → contexto determinista + `completion` **sin `responseFormat`**; el código adjunta `{numeros, entidades, citas:[obsId], vista_sugerida}`; render 100% determinista para `agregar`/`cliente_360`/`renovacion`/`incompletos`/`duplicados`, `completion` de prosa solo para `listar`. | `src/equipos/responder.js` | 8, 9 | E1-E14: `num_ok` y `ent_f1` altos; groundedness estructural = 1.0 | **must** | P3 · 4 |
| **12** | **Evaluation** | `GOLD` + `ORACULO` (I.1), `metricas.js` (I.3), `consulta.eval.js` (runner I.5), modo oráculo como gate de CI. Correr modo oráculo HOY; B0/B4 viernes noche. | `src/equipos/eval/{consulta.gold,metricas,consulta.eval}.js`, `src/equipos/consulta.test.js` | 1, 8, 11 | modo oráculo pasa en cualquier máquina; B0/B4 corren en la 4060 | **must** | P4 · 6 |
| **13** | **UI + servidor** | `src/servidor.js` (HTTP local, endpoints H.4, dueño del SDK y `class Base`) + PWA en `app/`: caja de consulta + Customer 360 + dashboard plano. "Mapa" = lista agrupada. `vista_sugerida` auto-enfoca. | `src/servidor.js`, `app/*` | 11 | las 3 vistas MVP navegables; `POST /api/consulta` responde con cita | **must** | P3 · 8 |
| **14** | **Demo integration** | **Plano escenificado de 60-90 s** (I.7 + abajo). Guion de 4-5 queries + fallback cacheado. Corrida en vivo de los 10 prompts oficiales de captura. Diapositiva "superficie QVAC de Vigía" con tokens/latencia MEDIDA. Fila en `evidencia/procedencia.md` para el módulo de consulta (art. 11.c: escrito fresco). | `docs/guion-demo.md`, `evidencia/procedencia.md` (edit) | 12, 13 | las 5 queries del guion responden en vivo con cita + auto-foco; backup grabado | **must** | P4/P3 · 5 |

**Gate de integración — hora ~24:** slice vertical end-to-end (texto → parser → `class Base` → respuesta → pantalla) con **1 query real** (E1). Si no está, se activa el Plan B (casilla).

**Plano de demo (Fase 14, para Innovation/Impact):** teléfono HONOR X6s **en modo avión, visible** → pregunta por voz en español la query insignia de Philips ("clientes en Brasil con MR de más de 7 años") → el Mac/laptop "en otra red" responde por Hyperswarm con las **citas de Observation ID en pantalla** → el nodo de Hospital DemoCare Horizon se resalta en la lista-mapa. Cero internet visible. Ensayar 10×, grabar backup.

---

# Divergencias con el borrador inicial

| Borrador inicial (genérico) | Decisión firme de este plan |
|---|---|
| Stack genérico desde cero | Se construye **encima de `main`**. Se construye encima de `class Base`, `duplicados.comparar()`, `reglas.derivar()`, `esquema.js`, `runtime.js`, `voz.js`, `sello.js`, `eventos.js`, `rendimiento.js`. |
| Modelos: Llama 3.2 1B / Qwen 2.5 1.5B | **`QWEN3_1_7B_INST_Q4`** (parser + respuesta + captura) y **`QWEN3_600M_INST_Q4`** (fallback). Llama 3.2 1B existe en el registry pero no se usa. |
| **Router-LLM** para clasificar intención | **ELIMINADO.** Pre-check determinista → parser 1.7B (ya emite `intencion`) → ejecutor. Un solo modelo LLM. |
| SQLite / `sql.js` como vista materializada | **NO.** `class Base` en memoria (fold del JSONL sellado) **ES** la vista. Sin `.db`, sin migraciones, sin `sql.js`. |
| NL→SQL = fork adaptado como camino de consulta | **CORTADO del build.** Queda como diapositiva del pitch. Si se hiciera, declararlo como fork en README (art. 11.c). |
| Pipeline lineal con "Top-K → Reranking" | **Sin top-K global** (rompe agregados). **Sin reranking** (no existe en QVAC; Δ≈0; solo 1 corrida A/B). |
| Embeddings como pieza central | **Fuera del MVP.** El residual semántico = `rankNotas()` léxico. `embed()` solo si el spike de Día 1 pasa, y solo para nombres de cliente. |
| Vector store: `ragIngest`/`ragSearch` o externo | **Ninguno.** `rankNotas()` léxico; opcional `Map<customer_key, Float32Array>` de 13 entradas. |
| `EMBEDDING_GEMMA` como constante | **Constante no verificada.** V3 confirma el ID real o no hay embeddings. |
| Motor de confianza propio | Lo posee `reglas.derivar()`. La fórmula queda documentada como referencia; se reporta `derivation_match_rate`. |
| Unidad de indexación implícita = la fila | **El `equipo` consolidado**, clave `customer\|modality\|manufacturer\|model`. Nunca por `age_bucket`. |
| Escalera de identity-resolution (Jaro-Winkler, banda LLM 0.75-0.92) | **CORTADA.** Umbrales reales del repo (0.9/0.5). `duplicadosSospechosos()` envuelve `candidatos()`/`comparar()`. |
| Política de resolución de conflictos por-campo | **MVP: solo quantity=moda + LWW por `observed_at`.** La matriz completa queda como referencia. |
| `responseFormat` para la respuesta final | **NO.** `completion` en prosa; el código adjunta citas y `vista_sugerida`. |
| Determinismo del merge por `temperature:0` + `seed` | **Por firma Ed25519 + log LWW.** Un peer decide una vez, los demás adoptan sin recalcular. |
| Electron / `apps/desktop/` | **CORTADO.** `src/servidor.js` (HTTP) + PWA en `app/` sobre `main`. |
| Región como campo de datos | **Derivado** por dict estático (10 países → "LATAM" + 4 subregiones). |
| `Base.agregado()` cubre la agregación | **`agregarSobre()` nuevo** (count/sum/avg/min/max, group_by multi-campo). `agregado()` solo para el dashboard. |
| Eval de 5 arms + 3 repeticiones | **B0 vs B4.** B1/B2 opcionales. 12 casos canónicos + 2 extra + 2 negativos. |
| Schema de consulta con ~30 campos | **~10 campos raíz** (se quitaron `observer`, `model`, `corroboracion_min`, `cantidad_max`, `ultima_fecha_desde`). Fallback plano commiteado. |
| Prompt trilingüe es/en/pt | **es/en** objetivo; pt solo sinónimos, sin test. |

---

# Overengineering que NO haremos

**Retrieval / semántica:**
- Vector store dedicado (Chroma / LanceDB / `sqlite-vec`) o `ragIngest`/`ragSearch`/`ragChunk`.
- Embeddings de equipos — `rankNotas()` léxico de ~15 líneas; `embed()` como mucho para 13 nombres de cliente.
- Reranker (cross-encoder o LLM) como etapa fija — Δ≈0 a ≤15 filas tipadas; solo 1 corrida A/B.
- Híbrido BM25 + dense con RRF — `contains` + re-orden por `_sem` basta.
- Multi-view embeddings — la señal de riesgo es 100% determinista.
- Chunking — 1 `equipo` ≈ 60 palabras = 1 unidad atómica.
- Indexar 3 niveles (observación + equipo + cliente) — solo el `equipo`; cliente = `groupBy`.
- Query expansion / HyDE / multi-query / retrieval agéntico.
- Router-LLM — el pre-check es determinista y el parser ya emite `intencion`.
- Modelo de embedding multilingüe grande — normalización ES→EN en el parser.

**Modelo de datos / dedup:**
- Modelar activos físicos / seriales / grafo de sucesión / modelo bitemporal — el dataset no tiene nada de eso.
- Librería CRDT (Automerge / Yjs) — fold determinista + log de merge-decisions firmadas.
- Framework de entity matching (Dedupe.io / Splink / Zingg) o modelo entrenado.
- Jaro-Winkler + banda de adjudicación LLM — umbrales fijos del repo (0.9/0.5).
- Matriz de resolución de conflictos por-campo (media ponderada, mediana si ≥3) — quantity=moda + LWW.
- Dedup global por embeddings — caro, no-determinista entre peers.
- Geocoding fuzzy / gazetteer — lista a mano de ciudades LATAM.
- Fusionar customers entre ciudades (IDNs) — customer:site 1:1; "DemoCare" es agrupación de dashboard.

**Parser / arquitectura:**
- Dos llamadas para el parseo (clasificar → extraer) — la gramática ya fuerza la forma.
- `minimum`/`maximum`/`pattern`/`format` en el JSON Schema — clamps y `YYYY-MM-DD` en JS.
- Doble aritmética off-by-one (modelo + JS) — **única fuente = JS**; el modelo emite el número crudo.
- Taxonomía de 15-20 intents — 7 intenciones cubren todo el brief.
- Parser de fechas relativas complejas — todas las visitas son ago-2026; 2 reglas hardcoded.
- Multi-turn / resolución de pronombres.
- Grafo de conocimiento / ontología / RDF para Region→Country→City — un dict plano.
- Servidor OpenAI-compatible de QVAC como capa intermedia — HTTP directo.
- SQLite persistente / `sql.js` in-memory / NL→SQL.
- Fine-tuning del extractor o de un modelo de "riesgo".
- Electron — PWA + `src/servidor.js`.
- `country_code` ISO-2, `subregion` de 3 niveles, `evento_ns[]` en cada metadata — la cita es el Observation ID.
- Score de rerank de 7 términos ponderados — sort de 2-3 claves.

**Eval:**
- Set de 100+ casos con split train/test — 12-16 casos verificables + oráculo.
- N=30 corridas con intervalos de confianza — 1 canónica + 3 repeticiones del titular.
- nDCG / MAP / ERR — relevancia binaria + gold de 1-12 ítems.
- Groundedness por NLI / LLM-judge — chequeo estructural.
- Harness de latencia aparte (OpenTelemetry) — `evidencia/rendimiento.jsonl` ya lo tiene.
- Generar las preguntas del eval con un LLM — se escriben a mano, las respuestas las calcula el oráculo.
- Espejo SQLite solo para un baseline NL→SQL.
- Tests profundos de X-Ray / Patient Monitoring / Image Guided Therapy — 0 filas en el seed.
- Congelar `dias_desde_ultima` / `frescura` en ingest — query-time contra `Date.now()`.
