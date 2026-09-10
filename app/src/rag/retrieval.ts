export interface EmbeddingRecord {
  id: number;
  vector: Float32Array;
}

export class Retriever {
  private embeddings: EmbeddingRecord[] = [];

  constructor(dbEmbeddings: Array<{ id: number; embedding: Buffer }>) {
    this.embeddings = dbEmbeddings.map((e) => {
      // OJO: e.embedding.buffer es el ArrayBuffer SUBYACENTE del Buffer, no los
      // bytes exactos de este BLOB. Node agrupa buffers pequeños (<4KB; un
      // embedding de 768 floats son 3072 bytes) en un pool compartido, así que
      // sin byteOffset/length un Float32Array(buffer.buffer) puede leer bytes
      // de OTRA fila adyacente en el pool -> similitud coseno con basura.
      const vec = new Float32Array(
        e.embedding.buffer,
        e.embedding.byteOffset,
        e.embedding.byteLength / Float32Array.BYTES_PER_ELEMENT
      );

      if (vec.some(v => !Number.isFinite(v))) {
        console.warn(`Embedding ${e.id} has NaN/Infinity, clamping to 0`);
        for (let i = 0; i < vec.length; i++) {
          if (!Number.isFinite(vec[i])) vec[i] = 0;
        }
      }

      return { id: e.id, vector: vec };
    });
  }

  buscar(
    preguntaVector: Float32Array,
    k: number = 5
  ): Array<{ id: number; score: number }> {
    if (this.embeddings.length === 0) return [];

    const scores = this.embeddings.map((e) => ({
      id: e.id,
      score: this.coseno(preguntaVector, e.vector),
    }));

    return scores
      .filter((s) => Number.isFinite(s.score) && s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  private coseno(a: Float32Array, b: Float32Array): number {
    let dotProd = 0,
      normA = 0,
      normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProd += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA * normB);
    return denom === 0 ? 0 : dotProd / denom;
  }
}
