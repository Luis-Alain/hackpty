// Scoring de confianza, alertas de frescura y urgencia de renovación.
// No se persiste: se calcula al vuelo a partir de `registros`, porque el
// componente de frescura decae con el tiempo y quedaría obsoleto si se
// guardara una sola vez al crear el registro.
import type { Registro } from '../db/repository.js';

export const DIAS_FRESCURA_MAX = 180; // más allá de esto, un registro se considera "sin verificar"
const ANTIGUEDAD_RENOVACION_MIN = 5; // años, mismo umbral que registrosParaRenovacion()
const ANTIGUEDAD_URGENCIA_TOPE = 15; // años, a partir de aquí la urgencia por edad satura en 1.0

const PESO_ESTADO: Record<string, number> = {
  Confirmed: 1,
  Reported: 0.7,
  Estimated: 0.4,
  Unknown: 0.1,
};

const CAMPOS_OPCIONALES: Array<keyof Registro> = ['ciudad', 'cantidad', 'marca', 'modelo', 'antiguedad'];

export interface ConfianzaResultado {
  score: number; // 0..1
  componentes: {
    estado: number;
    completitud: number;
    frescura: number;
  };
  diasDesdeActualizacion: number;
  alertaFrescura: boolean;
}

function diasDesde(timestamp: string): number {
  const ms = Date.now() - new Date(timestamp).getTime();
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

export function calcularConfianza(registro: Registro): ConfianzaResultado {
  const pesoEstado = PESO_ESTADO[registro.estado] ?? PESO_ESTADO.Unknown;

  const camposPresentes = CAMPOS_OPCIONALES.filter((c) => registro[c] != null).length;
  const completitud = camposPresentes / CAMPOS_OPCIONALES.length;

  const dias = diasDesde(registro.timestamp);
  const decaimiento = clamp01(dias / DIAS_FRESCURA_MAX);
  const frescura = 1 - decaimiento;

  const score = pesoEstado * 0.5 + completitud * 0.2 + frescura * 0.3;

  return {
    score: Math.round(clamp01(score) * 100) / 100,
    componentes: {
      estado: Math.round(pesoEstado * 100) / 100,
      completitud: Math.round(completitud * 100) / 100,
      frescura: Math.round(frescura * 100) / 100,
    },
    diasDesdeActualizacion: dias,
    alertaFrescura: dias > DIAS_FRESCURA_MAX,
  };
}

export interface RenovacionResultado {
  urgencia: number; // 0..1
  confianza: ConfianzaResultado;
}

export function calcularUrgenciaRenovacion(registro: Registro): RenovacionResultado | null {
  if (registro.antiguedad == null || registro.antiguedad <= ANTIGUEDAD_RENOVACION_MIN) return null;

  const confianza = calcularConfianza(registro);
  const antiguedadScore = clamp01(registro.antiguedad / ANTIGUEDAD_URGENCIA_TOPE);
  const decaimientoFrescura = 1 - confianza.componentes.frescura;

  const urgencia =
    antiguedadScore * 0.6 + (1 - confianza.score) * 0.2 + decaimientoFrescura * 0.2;

  return {
    urgencia: Math.round(clamp01(urgencia) * 100) / 100,
    confianza,
  };
}
