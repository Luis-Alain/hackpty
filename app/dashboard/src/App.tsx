import { useRef, useEffect, useState } from 'react';
import { Tablero } from './components/Tablero';
import { Consulta } from './components/Consulta';

export default function App() {
  const [vista, setVista] = useState<'tablero' | 'consulta'>('tablero');
  const abortControllerRef = useRef(new AbortController());

  useEffect(() => {
    abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
  }, [vista]);

  useEffect(() => {
    return () => abortControllerRef.current.abort();
  }, []);

  return (
    <div className="min-h-screen bg-[--color-fondo] text-[--color-tinta]">
      <header className="border-b border-[--color-tinta] p-4">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Vigía</h1>
          <div className="flex gap-4">
            <button
              onClick={() => setVista('tablero')}
              className={vista === 'tablero' ? 'font-bold' : 'opacity-60'}
            >
              Tablero
            </button>
            <button
              onClick={() => setVista('consulta')}
              className={vista === 'consulta' ? 'font-bold' : 'opacity-60'}
            >
              Consulta
            </button>
          </div>
        </div>
      </header>
      <main className="p-6">
        {vista === 'tablero' && <Tablero abortSignal={abortControllerRef.current.signal} />}
        {vista === 'consulta' && <Consulta abortSignal={abortControllerRef.current.signal} />}
      </main>
    </div>
  );
}
