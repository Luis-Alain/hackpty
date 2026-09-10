import { useState } from 'react';

interface Fuente {
  id: number;
  cliente: string;
}

export function Consulta({ abortSignal }: { abortSignal?: AbortSignal }) {
  const [pregunta, setPregunta] = useState('');
  const [respuesta, setRespuesta] = useState<{ texto: string; fuentes: Fuente[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const manejarEnvio = async () => {
    if (!pregunta.trim()) return;

    // EDGE CASE: input validation
    if (pregunta.length > 10240) {
      setError('Pregunta muy larga (max 10KB)');
      return;
    }

    setLoading(true);
    setError(null);
    setRespuesta(null);

    try {
      const res = await fetch('http://localhost:8787/api/query', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pregunta }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRespuesta(data);
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return;
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-bold">Consulta</h2>
      <div className="space-y-2">
        <textarea
          value={pregunta}
          onChange={(e) => setPregunta(e.target.value)}
          placeholder="Pregunta sobre los registros..."
          className="w-full p-2 border border-(--color-tinta) rounded"
          rows={4}
          disabled={loading}
        />
        <button
          onClick={manejarEnvio}
          disabled={loading || !pregunta.trim()}
          className="px-4 py-2 bg-(--color-acento) text-white rounded disabled:opacity-50"
        >
          {loading ? 'Enviando...' : 'Enviar'}
        </button>
      </div>

      {error && <div className="p-2 bg-red-100 text-red-800 rounded">{error}</div>}

      {respuesta && (
        <div className="space-y-2">
          <div className="p-3 bg-(--color-superficie) rounded">
            <p className="font-serif italic">{respuesta.texto}</p>
          </div>
          {respuesta.fuentes.length > 0 && (
            <div className="text-sm">
              <p className="font-mono text-(--color-tinta)">
                Fuentes: {respuesta.fuentes.map((f) => `Reg. ${f.id}`).join(', ')}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
