import { useEffect, useState } from 'react';

interface Registro {
  id: number;
  cliente: string;
  ciudad?: string;
  pais: string;
  modalidad: string;
  cantidad?: number;
  marca?: string;
  modelo?: string;
  antiguedad?: number;
  estado: string;
  timestamp: string;
  confianza?: number;
  alertaFrescura?: boolean;
  diasDesdeActualizacion?: number;
}

const ESTADO_LABEL: Record<string, string> = {
  Confirmed: 'Confirmado',
  Reported: 'Reportado',
  Estimated: 'Estimado',
  Unknown: 'Desconocido',
};

// Reutiliza el lenguaje de color de COCIR para confianza de dato, pero nunca
// "reemplazar" (--cocir-reemplazar): ese tono queda reservado exclusivamente
// para urgencia real de renovación de equipo, no para incertidumbre de un campo.
function colorConfianza(score?: number): string {
  if (score == null) return 'var(--color-cocir-sin-dato)';
  if (score < 0.6) return 'var(--color-cocir-planificar)';
  if (score < 0.85) return 'var(--color-cocir-al-dia)';
  return 'var(--color-signal)';
}

export function Tablero({ abortSignal }: { abortSignal?: AbortSignal }) {
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRegistros = async () => {
      try {
        const res = await fetch('http://localhost:8787/api/dashboard/registros');
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
    fetchRegistros();
  }, []);

  if (loading) return <p className="text-sm text-ink-soft">Cargando registros…</p>;
  if (error)
    return (
      <div className="placa p-4 text-sm" style={{ borderColor: 'var(--color-cocir-reemplazar)' }}>
        No se pudo cargar el tablero: {error}
      </div>
    );
  if (registros.length === 0)
    return <p className="text-sm text-ink-soft">Todavía no hay equipos registrados.</p>;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-lg">Base instalada</h2>
        <span className="font-mono text-xs text-ink-soft">{registros.length} registros</span>
      </div>

      {/* Móvil: una placa por registro, campos apilados (una tabla de 6 columnas
          no cabe ni con scroll horizontal sin perder legibilidad). */}
      <div className="sm:hidden space-y-2">
        {registros.map((r) => (
          <div key={r.id} className="placa p-3.5">
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0 break-words">
                {r.cliente}
                {r.alertaFrescura && (
                  <span
                    className="inline-block w-1.5 h-1.5 ml-2 align-middle shrink-0"
                    style={{ background: 'var(--color-cocir-planificar)' }}
                    title={`Sin verificar hace ${r.diasDesdeActualizacion} días`}
                  />
                )}
              </span>
              <span className="inline-flex items-center gap-1.5 shrink-0">
                <span className="w-2 h-2 shrink-0" style={{ background: colorConfianza(r.confianza) }} />
                <span className="font-mono text-[13px]">
                  {r.confianza != null ? `${Math.round(r.confianza * 100)}%` : '—'}
                </span>
              </span>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-ink-soft font-mono">
              <span>{r.pais}</span>
              <span>{r.modalidad}</span>
              <span>{r.antiguedad != null ? `${r.antiguedad}a` : '—'}</span>
              <span>{ESTADO_LABEL[r.estado] ?? r.estado}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Escritorio: tabla completa. */}
      <div className="hidden sm:block placa overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-line text-left text-ink-soft">
              <th className="px-3 py-2.5 font-normal">Cliente</th>
              <th className="px-3 py-2.5 font-normal">País</th>
              <th className="px-3 py-2.5 font-normal">Modalidad</th>
              <th className="px-3 py-2.5 font-normal">Edad</th>
              <th className="px-3 py-2.5 font-normal">Estado</th>
              <th className="px-3 py-2.5 font-normal">Confianza</th>
            </tr>
          </thead>
          <tbody>
            {registros.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-b-0">
                <td className="px-3 py-2.5">
                  <span>{r.cliente}</span>
                  {r.alertaFrescura && (
                    <span
                      className="inline-block w-1.5 h-1.5 ml-2 align-middle"
                      style={{ background: 'var(--color-cocir-planificar)' }}
                      title={`Sin verificar hace ${r.diasDesdeActualizacion} días`}
                    />
                  )}
                </td>
                <td className="px-3 py-2.5 text-ink-soft">{r.pais}</td>
                <td className="px-3 py-2.5 font-mono text-[13px]">{r.modalidad}</td>
                <td className="px-3 py-2.5 font-mono text-[13px]">
                  {r.antiguedad != null ? `${r.antiguedad}a` : '—'}
                </td>
                <td className="px-3 py-2.5 text-ink-soft">{ESTADO_LABEL[r.estado] ?? r.estado}</td>
                <td className="px-3 py-2.5">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 shrink-0"
                      style={{ background: colorConfianza(r.confianza) }}
                    />
                    <span className="font-mono text-[13px]">
                      {r.confianza != null ? `${Math.round(r.confianza * 100)}%` : '—'}
                    </span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
