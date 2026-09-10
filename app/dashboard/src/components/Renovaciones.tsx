import { useEffect, useState } from 'react';

interface RegistroRenovacion {
  id: number;
  cliente: string;
  ciudad?: string;
  pais: string;
  modalidad: string;
  marca?: string;
  modelo?: string;
  antiguedad: number;
  urgencia: number;
  confianza: number;
  alertaFrescura: boolean;
}

const PAIS_TODOS = 'Todos los países';

// Lenguaje COCIR real: al-dia / planificar / reemplazar según urgencia.
function nivelCocir(urgencia: number): { color: string; label: string } {
  if (urgencia >= 0.6) return { color: 'var(--color-cocir-reemplazar)', label: 'Reemplazar' };
  if (urgencia >= 0.3) return { color: 'var(--color-cocir-planificar)', label: 'Planificar' };
  return { color: 'var(--color-cocir-al-dia)', label: 'Al día' };
}

export function Renovaciones({ abortSignal }: { abortSignal?: AbortSignal }) {
  const [registros, setRegistros] = useState<RegistroRenovacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtroPais, setFiltroPais] = useState(PAIS_TODOS);

  useEffect(() => {
    const fetchRenovaciones = async () => {
      try {
        const res = await fetch('http://localhost:8787/api/dashboard/renovaciones');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setRegistros(Array.isArray(data) ? data : []);
        setError(null);
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return;
        setError(String(e));
      } finally {
        setLoading(false);
      }
    };
    fetchRenovaciones();
  }, []);

  if (loading) return <p className="text-sm text-ink-soft">Cargando oportunidades…</p>;
  if (error)
    return (
      <div className="placa p-4 text-sm" style={{ borderColor: 'var(--color-cocir-reemplazar)' }}>
        No se pudo cargar renovaciones: {error}
      </div>
    );

  const paises = [PAIS_TODOS, ...Array.from(new Set(registros.map((r) => r.pais))).sort()];
  const visibles = filtroPais === PAIS_TODOS ? registros : registros.filter((r) => r.pais === filtroPais);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-4 gap-3">
        <div>
          <h2 className="text-lg">Oportunidades de renovación</h2>
          <p className="text-xs text-ink-soft mt-0.5">Equipos con más de 5 años, ordenados por urgencia</p>
        </div>
        <select
          value={filtroPais}
          onChange={(e) => setFiltroPais(e.target.value)}
          className="border border-line bg-surface px-2.5 py-1.5 text-sm w-full sm:w-auto"
        >
          {paises.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      {visibles.length === 0 ? (
        <p className="text-sm text-ink-soft">
          Ningún equipo con más de 5 años{filtroPais !== PAIS_TODOS ? ` en ${filtroPais}` : ''}.
        </p>
      ) : (
        <div className="placa divide-y divide-line">
          {visibles.map((r) => {
            const nivel = nivelCocir(r.urgencia);
            return (
              <div key={r.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-3.5 sm:px-4 py-3 sm:py-3.5">
                <div className="flex items-center gap-3">
                  <span className="w-2 h-2 shrink-0" style={{ background: nivel.color }} />
                  <div className="min-w-0 flex-1 sm:flex-initial">
                    <span className="break-words">{r.cliente}</span>
                    <span
                      className="ml-2 text-xs font-mono sm:hidden"
                      style={{ color: nivel.color }}
                    >
                      {nivel.label}
                    </span>
                  </div>
                </div>
                <div className="flex-1 min-w-0 pl-5 sm:pl-0">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-xs text-ink-soft">{r.pais}</span>
                    {r.alertaFrescura && (
                      <span className="text-xs" style={{ color: 'var(--color-cocir-planificar)' }}>
                        sin verificar hace tiempo
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-ink-soft font-mono mt-0.5">
                    {r.modalidad} {r.marca ?? ''} {r.modelo ?? ''}
                  </p>
                </div>
                <span className="pl-5 sm:pl-0 font-mono text-sm text-ink-soft shrink-0">{r.antiguedad}a</span>
                <span
                  className="hidden sm:inline text-xs font-mono shrink-0 w-24 text-right"
                  style={{ color: nivel.color }}
                >
                  {nivel.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
