import { useState } from 'react';

interface Fuente {
  id: number;
  cliente: string;
  score?: number;
}

export function Consulta({ abortSignal }: { abortSignal?: AbortSignal }) {
  const [pregunta, setPregunta] = useState('');
  const [respuesta, setRespuesta] = useState<{ texto: string; fuentes: Fuente[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const manejarEnvio = async () => {
    if (!pregunta.trim()) return;

    if (pregunta.length > 10240) {
      setError('La pregunta es muy larga (máximo 10KB)');
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

  const manejarTecla = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      manejarEnvio();
    }
  };

  return (
    <div className="max-w-2xl">
      <h2 className="text-lg mb-1">Consulta</h2>
      <p className="text-xs text-ink-soft mb-4">Pregunta en lenguaje natural sobre la base instalada</p>

      <div className="placa">
        <textarea
          value={pregunta}
          onChange={(e) => setPregunta(e.target.value)}
          onKeyDown={manejarTecla}
          placeholder="¿Qué equipos de resonancia hay en Brasil con más de 5 años?"
          className="w-full px-3.5 py-3 text-sm resize-none placeholder:text-ink-soft/70"
          rows={3}
          disabled={loading}
        />
        <div className="flex items-center justify-between border-t border-line px-3.5 py-2.5">
          <span className="hidden sm:inline text-xs text-ink-soft font-mono">⌘⏎ para enviar</span>
          <button
            onClick={manejarEnvio}
            disabled={loading || !pregunta.trim()}
            className="ml-auto px-3.5 py-1.5 bg-signal text-surface text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-signal-dim transition-colors"
          >
            {loading ? 'Buscando…' : 'Preguntar'}
          </button>
        </div>
      </div>

      {error && (
        <div
          className="placa p-3.5 mt-4 text-sm"
          style={{ borderColor: 'var(--color-cocir-reemplazar)' }}
        >
          {error}
        </div>
      )}

      {respuesta && (
        <div className="mt-4 space-y-3">
          <p className="text-[15px] leading-relaxed max-w-[62ch]">{respuesta.texto}</p>
          {respuesta.fuentes.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {respuesta.fuentes.map((f) => (
                <span
                  key={f.id}
                  className="font-mono text-xs text-ink-soft border border-line px-2 py-1"
                >
                  #{f.id} {f.cliente}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
