import { useRef, useEffect, useState } from 'react';
import { Tablero } from './components/Tablero';
import { Consulta } from './components/Consulta';
import { Visita } from './components/Visita';
import { Renovaciones } from './components/Renovaciones';

type Vista = 'visita' | 'tablero' | 'renovaciones' | 'consulta';

const NAV: Array<{ id: Vista; label: string }> = [
  { id: 'visita', label: 'Visita' },
  { id: 'tablero', label: 'Tablero' },
  { id: 'renovaciones', label: 'Renovaciones' },
  { id: 'consulta', label: 'Consulta' },
];

export default function App() {
  const [vista, setVista] = useState<Vista>('visita');
  const abortControllerRef = useRef(new AbortController());

  useEffect(() => {
    abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
  }, [vista]);

  useEffect(() => {
    return () => abortControllerRef.current.abort();
  }, []);

  return (
    <div className="min-h-screen bg-paper text-ink font-sans">
      <header className="border-b border-line sticky top-0 bg-paper z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <span className="font-mono text-[15px] tracking-tight pt-3.5 pb-2 sm:py-4">Vigía</span>
          <nav className="grid grid-cols-4 sm:flex sm:gap-1 -mb-px">
            {NAV.map((item) => (
              <button
                key={item.id}
                onClick={() => setVista(item.id)}
                aria-current={vista === item.id ? 'page' : undefined}
                className={`px-1 sm:px-4 py-3 sm:py-4 text-xs sm:text-sm leading-tight sm:whitespace-nowrap border-b-2 transition-colors ${
                  vista === item.id
                    ? 'border-signal text-ink'
                    : 'border-transparent text-ink-soft hover:text-ink'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {vista === 'visita' && <Visita />}
        {vista === 'tablero' && <Tablero abortSignal={abortControllerRef.current.signal} />}
        {vista === 'renovaciones' && <Renovaciones abortSignal={abortControllerRef.current.signal} />}
        {vista === 'consulta' && <Consulta abortSignal={abortControllerRef.current.signal} />}
      </main>
    </div>
  );
}
