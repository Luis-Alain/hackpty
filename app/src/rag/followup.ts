// Preguntas de seguimiento por el dato faltante más valioso, y parseo de las
// respuestas del usuario. Generación determinística (no vía LLM): usa los campos
// ya confirmados por extraerEstructura() para contextualizar la pregunta
// (ej: "¿Sabes el modelo del GE Signa?") sin la latencia ni el riesgo de
// alucinación de otra llamada al modelo para una tarea que templating resuelve
// de forma más confiable.
import { CAMPOS_NUMERICOS, CAMPOS_ORDEN, HEDGE_REGEX, type CampoNombre } from './extraction.js';
import { normalizarModalidad, sinAcentos } from '../validation/referenceLists.js';
import type { CampoEstado, CamposExtraidos } from '../types/record.js';

const MODALIDAD_LABEL: Record<string, string> = {
  MR: 'resonancia magnética',
  CT: 'tomografía',
  Ultrasound: 'ecografía',
  'X-Ray': 'rayos X',
  'Patient Monitoring': 'monitoreo de pacientes',
  'Image Guided Therapy': 'terapia guiada por imagen',
};

// Mayor número = más prioritario cuando el status es igual.
const CAMPO_IMPORTANCIA: Record<CampoNombre, number> = {
  cantidad: 6,
  modelo: 5,
  marca: 5,
  antiguedad: 4,
  ciudad: 3,
  modalidad: 2,
  pais: 2,
  cliente: 1,
};

const STATUS_PRIORIDAD: Record<CampoEstado, number> = {
  Unknown: 3,
  Reported: 2,
  Estimated: 1,
  Confirmed: 0,
};

function construirSujeto(campos: CamposExtraidos): string {
  const marca = campos.marca.status !== 'Unknown' ? campos.marca.valor : null;
  const modelo = campos.modelo.status !== 'Unknown' ? campos.modelo.valor : null;
  const modalidadLabel =
    campos.modalidad.status !== 'Unknown' && typeof campos.modalidad.valor === 'string'
      ? MODALIDAD_LABEL[campos.modalidad.valor]
      : null;

  if (marca && modelo) return `el ${marca} ${modelo}`;
  if (marca) return `el equipo ${marca}`;
  if (modalidadLabel) return `el equipo de ${modalidadLabel}`;
  return 'el equipo';
}

const PREGUNTA_TEMPLATE: Record<CampoNombre, (sujeto: string) => string> = {
  cliente: (s) => `¿En qué hospital o clínica viste ${s}?`,
  ciudad: (s) => `¿En qué ciudad está ${s}?`,
  pais: (s) => `¿En qué país está ${s}?`,
  modalidad: (s) => `¿Qué tipo de equipo es ${s} (resonancia, tomografía, ecógrafo, etc.)?`,
  cantidad: (s) => `¿Cuántos equipos como ${s} hay?`,
  marca: (s) => `¿Sabes la marca de ${s}?`,
  modelo: (s) => `¿Sabes el modelo de ${s}?`,
  antiguedad: (s) => `¿Qué antigüedad aproximada tiene ${s}?`,
};

export interface Pregunta {
  campo: CampoNombre;
  pregunta: string;
  valorActual: string | number | null;
}

export function generarPreguntas(campos: CamposExtraidos, maxPreguntas = 3): Pregunta[] {
  const sujeto = construirSujeto(campos);

  const candidatos = CAMPOS_ORDEN.filter((c) => campos[c].status !== 'Confirmed').sort((a, b) => {
    const prioridadA = STATUS_PRIORIDAD[campos[a].status] * 10 + CAMPO_IMPORTANCIA[a];
    const prioridadB = STATUS_PRIORIDAD[campos[b].status] * 10 + CAMPO_IMPORTANCIA[b];
    return prioridadB - prioridadA;
  });

  return candidatos.slice(0, maxPreguntas).map((campo) => ({
    campo,
    pregunta: PREGUNTA_TEMPLATE[campo](sujeto),
    valorActual: campos[campo].valor,
  }));
}

const NO_SE_REGEX = /^\s*(no s[eé]|ns\/nc|sin dato|no tengo idea|desconoc)/i;

const NUMEROS_TEXTO: Record<string, number> = {
  cero: 0,
  un: 1,
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  ninguno: 0,
  ninguna: 0,
};

const FILLER_PREFIX_REGEX = /^(es|era|son|se llama|creo que es|creo que|diria que|diría que|si,?|sí,?)\s+/i;

function parsearNumero(respuesta: string): number | null {
  const match = respuesta.match(/\d+(\.\d+)?/);
  if (match) return Number(match[0]);

  const palabras = sinAcentos(respuesta).split(/\s+/);
  for (const palabra of palabras) {
    if (palabra in NUMEROS_TEXTO) return NUMEROS_TEXTO[palabra];
  }
  return null;
}

export function parsearRespuesta(
  campo: CampoNombre,
  respuesta: string | null | undefined
): { valor: string | number | null; status: CampoEstado } {
  if (respuesta == null || !respuesta.trim() || NO_SE_REGEX.test(respuesta)) {
    return { valor: null, status: 'Unknown' };
  }

  const texto = respuesta.trim();
  const tieneDuda = HEDGE_REGEX.test(texto);

  if (CAMPOS_NUMERICOS.has(campo)) {
    const num = parsearNumero(texto);
    if (num === null) return { valor: null, status: 'Unknown' };
    return { valor: num, status: tieneDuda ? 'Reported' : 'Confirmed' };
  }

  let valor = texto;
  let anterior: string;
  do {
    anterior = valor;
    valor = valor.replace(FILLER_PREFIX_REGEX, '').trim();
  } while (valor !== anterior);
  if (!valor) return { valor: null, status: 'Unknown' };

  if (campo === 'modalidad') {
    const normalizada = normalizarModalidad(valor);
    if (!normalizada) return { valor, status: 'Reported' };
    valor = normalizada;
  }

  return { valor, status: tieneDuda ? 'Reported' : 'Confirmed' };
}
