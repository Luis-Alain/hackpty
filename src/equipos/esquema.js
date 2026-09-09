// Contrato del módulo Equipos: listas de referencia del reto (hoja «Dummy Reference Lists»),
// esquema JSON que el modelo debe cumplir bajo gramática, y el prompt del sistema.
export const MODALIDADES = ['MR', 'CT', 'Ultrasound', 'X-Ray', 'Patient Monitoring', 'Image Guided Therapy'];
export const MARCAS = ['NovaMed', 'Aurelia Health', 'BluePeak Medical', 'Orion Imaging', 'HelixCare', 'Zenith MedTech'];
export const ESTADOS = ['Confirmed', 'Reported', 'Estimated', 'Unknown'];
export const CONFIANZAS = ['High', 'Medium', 'Low'];

export const sinAcentos = s => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Sinónimos en español, inglés y portugués → modalidad normalizada (hoja «Agent Question Logic», paso 3).
export const SINONIMOS = {
  MR: [/\bmri?\b/, /resona/, /ressona/, /magnetic/],
  CT: [/\bcts?\b/, /\btac\b/, /tomograf/, /\bscanner/, /\bcat scan/],
  Ultrasound: [/ultra-?s/, /ecograf/, /sonograf/],
  'X-Ray': [/x-?rays?/, /rayos ?x/, /raios? ?x/, /radiograf/],
  'Patient Monitoring': [/monitor/],
  'Image Guided Therapy': [/\bigt\b/, /angiograf/, /cath ?lab/, /hemodin/, /image.guided/, /intervencion/],
};
// Se compara sin acentos y en minúsculas: «ressonâncias», «tomógrafos» y «ecógrafos» entran igual escritos con o sin tilde.
export const normalizarModalidad = s => {
  if (!s) return null;
  if (MODALIDADES.includes(s)) return s;
  const t = sinAcentos(s);
  for (const [m, res] of Object.entries(SINONIMOS)) if (res.some(re => re.test(t))) return m;
  return null;
};

// Numerales en tres idiomas: la cantidad solo cuenta si el reporte la dice con un número o una palabra.
const PALABRAS = {
  1: ['un', 'una', 'uno', 'one', 'a', 'um', 'uma'], 2: ['dos', 'two', 'dois', 'duas', 'par', 'pair', 'ambos', 'both'],
  3: ['tres', 'three', 'três'], 4: ['cuatro', 'four', 'quatro'], 5: ['cinco', 'five'], 6: ['seis', 'six'],
  7: ['siete', 'seven', 'sete'], 8: ['ocho', 'eight', 'oito'], 9: ['nueve', 'nine', 'nove'], 10: ['diez', 'ten', 'dez'],
  11: ['once', 'eleven', 'onze'], 12: ['doce', 'twelve', 'doze'], 13: ['trece', 'thirteen', 'treze'],
  14: ['catorce', 'fourteen', 'catorze', 'quatorze'], 15: ['quince', 'fifteen'], 20: ['veinte', 'twenty', 'vinte'],
  30: ['treinta', 'thirty', 'trinta'],
};
// numerosEn('two seem old') → [2]
export function numerosEn(texto) {
  const t = sinAcentos(texto), n = new Set();
  for (const m of t.matchAll(/\d+/g)) n.add(Number(m[0]));
  for (const [v, ws] of Object.entries(PALABRAS)) if (ws.some(w => new RegExp(`(^|[^a-z])${sinAcentos(w)}([^a-z]|$)`).test(t))) n.add(Number(v));
  return [...n];
}
export const ESTIMADO = /\b(about|around|maybe|approx\w*|roughly|perhaps|some|unos|unas|como|cerca|aprox\w*|mas o menos|quiza\w*|creo|acho|uns|umas|talvez|quase|casi|mostly|most)\b/i;
export const AÑOS = /\b(anos?|años?|years?|yrs?)\b/i;

const str = { type: ['string', 'null'] }, int = { type: ['integer', 'null'] };
// Las citas van PRIMERO en cada grupo: bajo gramática, el modelo copia el fragmento antes de decidir
// el campo (JSON forzado degrada el razonamiento; poner la razón antes de la respuesta lo mitiga).
// Los nombres «*_quote» son a propósito: con «evidence.quantity» el 1.7B contestaba «Yes».
export const CITAS = ['modality_quote', 'quantity_quote', 'manufacturer_quote', 'model_quote', 'age_quote'];
export const ESQUEMA = {
  type: 'object', additionalProperties: false, required: ['customer', 'equipment'],
  properties: {
    customer: { type: 'object', additionalProperties: false, required: ['name', 'city', 'country'],
      properties: { name: str, city: str, country: str } },
    equipment: { type: 'array', maxItems: 8, items: { type: 'object', additionalProperties: false,
      required: [...CITAS, 'modality', 'quantity', 'manufacturer', 'model', 'age_years_min', 'age_years_max', 'age_qualitative', 'notes'],
      properties: {
        modality_quote: str, quantity_quote: str, manufacturer_quote: str, model_quote: str, age_quote: str,
        modality: { type: ['string', 'null'], enum: [...MODALIDADES, null] },
        quantity: int,
        manufacturer: { type: ['string', 'null'], enum: [...MARCAS, null] },
        model: str,
        age_years_min: int, age_years_max: int,
        age_qualitative: { type: ['string', 'null'], enum: ['new', 'old', null] },
        notes: str,
      } } },
  },
};

export const SISTEMA = `Extraes observaciones de equipos médicos de un reporte de campo (en español, inglés o portugués) a JSON.
Reglas:
- Los campos *_quote son CITAS: copia el fragmento exacto del reporte que sustenta ese dato. Si el reporte no lo dice, null (no la palabra "null", ni "Yes").
- Un elemento de equipment por tipo de equipo. Si el reporte da edades distintas a unidades del mismo tipo («dos viejos y uno nuevo»), sepáralos en dos elementos con su cantidad.
- quantity: solo si el reporte dice un número o una palabra numérica; «varios», «muchos», «many», «several» → null.
- manufacturer: solo si el reporte nombra una de estas marcas: ${MARCAS.join(', ')}. Si no nombra ninguna → null. Nunca adivines.
- model: solo si el reporte lo dice. age_years_min/max: solo si el reporte da años («unos ocho años» → 8 y 8; «5-7 years» → 5 y 7). age_qualitative: "new" u "old" solo si usa esas palabras sin dar años.
- customer: el hospital o clínica tal como aparece; city y country solo si el reporte los menciona.
Ejemplo. Reporte: "At Clinica Demo Sur in Lima, Peru, they have three CT scanners, around ten years old, all Orion Imaging."
{"customer":{"name":"Clinica Demo Sur","city":"Lima","country":"Peru"},"equipment":[{"modality_quote":"CT scanners","quantity_quote":"three CT scanners","manufacturer_quote":"all Orion Imaging","model_quote":null,"age_quote":"around ten years old","modality":"CT","quantity":3,"manufacturer":"Orion Imaging","model":null,"age_years_min":10,"age_years_max":10,"age_qualitative":null,"notes":null}]}
/no_think`;
