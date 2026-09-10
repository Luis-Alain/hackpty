import { initSchema } from '../src/db/sqlite';
import * as repo from '../src/db/repository';
import { obtenerModeloEmbedding } from '../src/provider/embedCache';
import { embedTexto } from '../src/rag/embeddings';

const testData = [
  {
    cliente: 'Hospital Central Lima',
    pais: 'Perú',
    ciudad: 'Lima',
    modalidad: 'MR',
    cantidad: 2,
    marca: 'Siemens',
    modelo: 'Magnetom',
    antiguedad: 8,
    fuente: 'reporte',
    estado: 'Confirmed',
    colaborador: 'Carlos',
    resumen: 'Hospital Central Lima, Perú. Resonancia magnética Siemens Magnetom. Dos equipos. 8 años de antigüedad.',
  },
  {
    cliente: 'Clínica Sur São Paulo',
    pais: 'Brasil',
    ciudad: 'São Paulo',
    modalidad: 'CT',
    cantidad: 1,
    marca: 'GE',
    modelo: 'LightSpeed',
    antiguedad: 3,
    fuente: 'foto',
    estado: 'Confirmed',
    colaborador: 'Ana',
    resumen: 'Clínica Sur São Paulo, Brasil. Tomógrafo GE LightSpeed. Un equipo. 3 años de antigüedad.',
  },
  {
    cliente: 'Hospital San Martín Bogotá',
    pais: 'Colombia',
    ciudad: 'Bogotá',
    modalidad: 'X-Ray',
    cantidad: 3,
    marca: 'Philips',
    modelo: 'DigitalDiagnost',
    antiguedad: 5,
    fuente: 'texto',
    estado: 'Reported',
    colaborador: 'Miguel',
    resumen: 'Hospital San Martín Bogotá, Colombia. Rayos X Philips DigitalDiagnost. Tres equipos. 5 años de antigüedad.',
  },
  {
    cliente: 'Clínica Luz México',
    pais: 'México',
    ciudad: 'Ciudad de México',
    modalidad: 'Ultrasound',
    cantidad: 4,
    marca: null,
    modelo: null,
    antiguedad: 2,
    fuente: 'voz',
    estado: 'Estimated',
    colaborador: 'Rosa',
    resumen: 'Clínica Luz México, Ciudad de México. Equipos de ultrasonografía. Cuatro equipos. 2 años de antigüedad. Marca desconocida.',
  },
  {
    cliente: 'Hospital Nacional Caracas',
    pais: 'Venezuela',
    ciudad: 'Caracas',
    modalidad: 'Patient Monitoring',
    cantidad: 10,
    marca: 'Philips',
    modelo: 'IntelliVue',
    antiguedad: 7,
    fuente: 'reporte',
    estado: 'Confirmed',
    colaborador: 'Fernando',
    resumen: 'Hospital Nacional Caracas, Venezuela. Monitores de pacientes Philips IntelliVue. Diez equipos. 7 años de antigüedad.',
  },
];

async function seed() {
  console.log('🌱 Initializing DB schema...');
  initSchema();

  console.log('🧠 Loading embedding model (QVAC)...');
  const modelo = await obtenerModeloEmbedding();

  console.log('📝 Creating test records with real embeddings...');
  let count = 0;
  for (const data of testData) {
    try {
      // Embedding real generado a partir del resumen, igual que en el flujo
      // de guardado normal (/api/visita/:id/guardar). Un vector de ceros
      // (como se usaba antes) tiene norma 0, así que la similitud coseno da
      // siempre 0 contra cualquier pregunta -> el retriever los descarta a
      // todos (filtro score > 0) y /api/query nunca encuentra nada.
      const vector = await embedTexto(modelo.modelId, data.resumen);
      const embedding = Buffer.from(vector.buffer);

      const id = repo.crearRegistro({
        ...data,
        timestamp: new Date().toISOString(),
        embedding,
      });
      console.log(`✓ Record ${id}: ${data.cliente}`);
      count++;
    } catch (e) {
      console.error(`✗ Failed to create record for ${data.cliente}:`, e);
    }
  }

  console.log(`✅ Seeded ${count}/${testData.length} records`);
  process.exit(0);
}

seed();
