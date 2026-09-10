import { embed } from '@qvac/sdk';

export async function resumenDe(registro: {
  modalidad: string;
  marca?: string | null;
  modelo?: string | null;
  cliente: string;
  ciudad?: string | null;
  pais: string;
  antiguedad?: number | null;
  estado: string;
}): Promise<string> {
  const marca = registro.marca ?? '';
  const modelo = registro.modelo ?? '';
  const edad = registro.antiguedad ?? -1;
  const ciudad = registro.ciudad ?? 'sin ciudad';

  return `${registro.modalidad} ${marca} ${modelo} in ${registro.cliente}, ${ciudad}, ${registro.pais}. ${edad > 0 ? edad + ' years old' : 'unknown age'}. Status: ${registro.estado}.`;
}

export async function embedTexto(
  modelId: string,
  texto: string
): Promise<Float32Array> {
  const result = await embed({ modelId, text: texto });
  return new Float32Array(result.embedding);
}
