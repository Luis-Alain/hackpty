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

const PAIS_TODOS = 'Todos';

function badgeUrgencia(urgencia: number): string {
  if (urgencia >= 0.7) return 'bg-red-100 text-red-800';
  if (urgencia >= 0.4) return 'bg-orange-100 text-orange-800';
  return 'bg-amber-100 text-amber-800';
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

  if (loading) return <div className="p-4">Cargando...</div>;
  if (error) return <div className="p-4 text-red-600">Error: {error}</div>;

  const paises = [PAIS_TODOS, ...Array.from(new Set(registros.map((r) => r.pais))).sort()];
  const visibles = filtroPais === PAIS_TODOS ? registros : registros.filter((r) => r.pais === filtroPais);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Oportunidades de Renovación</h2>
        <select
          value={filtroPais}
          onChange={(e) => setFiltroPais(e.target.value)}
          className="p-1 border border-(--color-tinta) rounded text-sm"
        >
          {paises.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      {visibles.length === 0 ? (
        <div className="text-sm opacity-70">
          Sin equipos con más de 5 años de antigüedad{filtroPais !== PAIS_TODOS ? ` en ${filtroPais}` : ''}.
        </div>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-(--color-tinta)">
              <th className="text-left p-2">Cliente</th>
              <th className="text-left p-2">País</th>
              <th className="text-left p-2">Equipo</th>
              <th className="text-left p-2">Antigüedad</th>
              <th className="text-left p-2">Urgencia</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((r) => (
              <tr key={r.id} className="border-b border-(--color-superficie)">
                <td className="p-2">
                  {r.cliente}
                  {r.alertaFrescura && (
                    <span className="ml-2 text-xs text-orange-800" title="Sin verificar hace más de 180 días">
                      ⚠️
                    </span>
                  )}
                </td>
                <td className="p-2">{r.pais}</td>
                <td className="p-2">
                  {r.modalidad} {r.marca ?? ''} {r.modelo ?? ''}
                </td>
                <td className="p-2">{r.antiguedad} años</td>
                <td className="p-2">
                  <span className={`px-2 py-1 rounded text-xs font-mono ${badgeUrgencia(r.urgencia)}`}>
                    {Math.round(r.urgencia * 100)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
