// Dummy Reference Lists para validación central
export const MODALIDADES = ['MR', 'CT', 'Ultrasound', 'X-Ray', 'Patient Monitoring', 'Image Guided Therapy'];
export const MARCAS = ['NovaMed', 'Aurelia Health', 'BluePeak Medical', 'Orion Imaging', 'HelixCare', 'Zenith MedTech'];
export const ESTADOS = ['Confirmed', 'Reported', 'Estimated', 'Unknown'];
export const CONFIANZAS = ['High', 'Medium', 'Low'];

export const sinAcentos = (s: string | null | undefined): string => {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
};

export const SINONIMOS: Record<string, RegExp[]> = {
  MR: [/\bmri?\b/, /resona/, /ressona/, /magnetic/],
  CT: [/\bcts?\b/, /\btac\b/, /tomograf/, /\bscanner/, /\bcat scan/],
  Ultrasound: [/ultra-?s/, /ecograf/, /sonograf/],
  'X-Ray': [/x-?rays?/, /rayos ?x/, /raios? ?x/, /radiograf/],
  'Patient Monitoring': [/monitor/],
  'Image Guided Therapy': [/\bigt\b/, /angiograf/, /cath ?lab/, /hemodin/, /image.guided/, /intervencion/],
};

export const normalizarModalidad = (s: string | null | undefined): string | null => {
  if (!s) return null;
  if (MODALIDADES.includes(s)) return s;
  const t = sinAcentos(s);
  for (const [m, res] of Object.entries(SINONIMOS)) {
    if (res.some(re => re.test(t))) return m;
  }
  return null;
};
