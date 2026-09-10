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

  if (loading) return <div className="p-4">Cargando...</div>;
  if (error) return <div className="p-4 text-red-600">Error: {error}</div>;
  if (registros.length === 0) return <div className="p-4">Sin registros.</div>;

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Registros</h2>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-[--color-tinta]">
            <th className="text-left p-2">Cliente</th>
            <th className="text-left p-2">País</th>
            <th className="text-left p-2">Modalidad</th>
            <th className="text-left p-2">Edad</th>
            <th className="text-left p-2">Estado</th>
          </tr>
        </thead>
        <tbody>
          {registros.map((r) => (
            <tr key={r.id} className="border-b border-[--color-superficie]">
              <td className="p-2">{r.cliente}</td>
              <td className="p-2">{r.pais}</td>
              <td className="p-2">{r.modalidad}</td>
              <td className="p-2">{r.antiguedad ?? '—'}</td>
              <td className="p-2">{r.estado}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
