// Extracción estructurada de observaciones de visita vía QVAC LLM.
// Tolerante a datos incompletos: cada campo recibe un status explícito
// (Confirmed | Reported | Estimated | Unknown) en vez de asumir confianza opaca.
import type { LoadedModel } from '../provider/bigModel.js';
import { completar, sinThink } from '../provider/bigModel.js';
import { normalizarModalidad, sinAcentos } from '../validation/referenceLists.js';
import type { CampoEstado, CamposExtraidos, ExtraccionResultado } from '../types/record.js';

export const CAMPOS_ORDEN = [
  'cliente',
  'ciudad',
  'pais',
  'modalidad',
  'cantidad',
  'marca',
  'modelo',
  'antiguedad',
] as const;

export type CampoNombre = (typeof CAMPOS_ORDEN)[number];

export const CAMPOS_NUMERICOS: ReadonlySet<CampoNombre> = new Set(['cantidad', 'antiguedad']);

export const HEDGE_REGEX =
  /\b(creo que|tal ?vez|parece|parec[ií]a|pienso que|quiz[aá]s|posiblemente|no estoy seguro|diria|diría|aproximadamente|m[aá]s o menos|creo)\b/i;

const SYSTEM_PROMPT = `Eres un asistente que extrae datos estructurados de observaciones de campo sobre equipos médicos en hospitales.
Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, sin markdown, sin explicación.
Incluye una clave SOLO si el dato fue mencionado (explícita o implícitamente) en el texto. Si no se menciona, omite la clave por completo.
No inventes datos que no estén respaldados por el texto.`;

// Campos de texto libre sujetos a verificación de "grounding": si el valor extraído
// no aparece literalmente en la observación, se descarta (no se confía en el LLM
// para respetar "no inventes datos" sin una verificación programática).
const CAMPOS_TEXTO_VERIFICABLES: ReadonlySet<CampoNombre> = new Set([
  'cliente',
  'ciudad',
  'pais',
  'marca',
  'modelo',
]);

function buildUserPrompt(observacion: string): string {
  return `Extrae estos campos del siguiente texto:
- cliente: nombre PROPIO del hospital o clínica (ej: "Hospital Central Lima"). Si el texto solo dice algo genérico como "un hospital" o "una clínica" sin nombre propio, omite esta clave.
- ciudad: ciudad donde está ubicado
- pais: país donde está ubicado
- modalidad: una de estas opciones exactas, según lo que describa el texto:
  * MR = resonancia magnética, resonador, resonancia
  * CT = tomógrafo, tomografía, TAC, escáner
  * Ultrasound = ecógrafo, ecografía, ultrasonido
  * X-Ray = rayos X, radiografía
  * Patient Monitoring = monitor de paciente, monitor de signos vitales
  * Image Guided Therapy = angiógrafo, sala de hemodinamia, terapia guiada por imagen
- cantidad: número entero de equipos observados
- marca: fabricante del equipo
- modelo: modelo del equipo
- antiguedad: antigüedad estimada en años (número entero)

Texto: "${observacion.replace(/"/g, "'")}"

JSON:`;
}

function extraerJSON(texto: string): Record<string, unknown> {
  const limpio = sinThink(texto);
  const inicio = limpio.indexOf('{');
  const fin = limpio.lastIndexOf('}');
  if (inicio === -1 || fin === -1 || fin < inicio) {
    throw new Error('El modelo no devolvió un objeto JSON válido');
  }
  const bloque = limpio.slice(inicio, fin + 1);
  return JSON.parse(bloque);
}

// Divide el texto en oraciones para detectar "hedge words" (dudas) cerca de cada valor,
// en vez de aplicar la penalización a todo el texto por igual.
function oracionesConDuda(texto: string): string[] {
  return texto
    .split(/(?<=[.!?\n])\s+/)
    .filter((oracion) => HEDGE_REGEX.test(oracion));
}

function valorApareceEnOraciones(valor: string, oraciones: string[]): boolean {
  const valorNorm = sinAcentos(valor);
  if (!valorNorm) return false;
  return oraciones.some((o) => sinAcentos(o).includes(valorNorm));
}

function asignarStatus(
  campo: CampoNombre,
  valorCrudo: unknown,
  observacion: string,
  oracionesDuda: string[]
): { valor: string | number | null; status: CampoEstado } {
  if (valorCrudo === null || valorCrudo === undefined || valorCrudo === '') {
    return { valor: null, status: 'Unknown' };
  }

  if (CAMPOS_NUMERICOS.has(campo)) {
    const num = Number(valorCrudo);
    if (!Number.isFinite(num)) return { valor: null, status: 'Unknown' };

    // Si el número extraído no aparece literalmente en el texto (con límites de palabra,
    // para no confundir "1" con la subcadena de "15"), el LLM lo infirió
    // (ej: "parece viejo" -> antiguedad: 15) => Estimado, no Confirmado.
    const numRegex = new RegExp(`\\b${num}\\b`);
    if (!numRegex.test(observacion)) return { valor: num, status: 'Estimated' };

    const enOracionDuda = oracionesDuda.some((o) => numRegex.test(o));
    return { valor: num, status: enOracionDuda ? 'Reported' : 'Confirmed' };
  }

  let valor = String(valorCrudo).trim();
  if (campo === 'modalidad') {
    const normalizada = normalizarModalidad(valor);
    if (!normalizada) return { valor, status: 'Reported' };
    valor = normalizada;
  } else if (CAMPOS_TEXTO_VERIFICABLES.has(campo)) {
    // Guardrail contra alucinaciones: si el valor no aparece literalmente en el
    // texto (aunque el prompt pida no inventar, un modelo de 1B no lo garantiza),
    // se descarta en vez de persistir un dato fabricado como "Confirmado".
    const valorNorm = sinAcentos(valor);
    const apareceEnTexto = valorNorm.length > 0 && sinAcentos(observacion).includes(valorNorm);
    if (!apareceEnTexto) return { valor: null, status: 'Unknown' };
  }

  const enOracionDuda = valorApareceEnOraciones(valor, oracionesDuda);
  return { valor, status: enOracionDuda ? 'Reported' : 'Confirmed' };
}

export function calcularEstadoGlobal(campos: CamposExtraidos): CampoEstado {
  const CRITICOS: CampoNombre[] = ['cliente', 'pais', 'modalidad'];
  const criticosOk = CRITICOS.every((c) => campos[c].status !== 'Unknown');
  if (!criticosOk) return 'Unknown';

  const valores = CAMPOS_ORDEN.map((c) => campos[c].status);
  const confirmados = valores.filter((s) => s === 'Confirmed').length;
  const desconocidos = valores.filter((s) => s === 'Unknown').length;

  if (desconocidos === 0 && confirmados >= 6) return 'Confirmed';
  if (desconocidos <= 2) return 'Reported';
  return 'Estimated';
}

// Recalcula completeness + estadoGlobal a partir de un set de campos ya existente
// (ej: después de aplicar respuestas de seguimiento), sin volver a llamar al LLM.
export function derivarResultado(campos: CamposExtraidos): ExtraccionResultado {
  const totalCampos = CAMPOS_ORDEN.length;
  const conocidos = CAMPOS_ORDEN.filter((c) => campos[c].status !== 'Unknown').length;
  const completeness = Math.round((conocidos / totalCampos) * 100) / 100;

  return {
    campos,
    completeness,
    estadoGlobal: calcularEstadoGlobal(campos),
  };
}

export async function extraerEstructura(
  modelo: LoadedModel,
  observacion: string
): Promise<ExtraccionResultado> {
  const { texto } = await completar(modelo, {
    history: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(observacion) },
    ],
    maxTokens: 400,
    temperature: 0.2,
  });

  let bruto: Record<string, unknown>;
  try {
    bruto = extraerJSON(texto);
  } catch {
    bruto = {};
  }

  const oracionesDuda = oracionesConDuda(observacion);

  const campos = {} as CamposExtraidos;
  for (const nombre of CAMPOS_ORDEN) {
    campos[nombre] = asignarStatus(nombre, bruto[nombre], observacion, oracionesDuda) as any;
  }

  return derivarResultado(campos);
}
