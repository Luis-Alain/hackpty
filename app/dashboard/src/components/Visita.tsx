import { useEffect, useState } from 'react';

type CampoEstado = 'Confirmed' | 'Reported' | 'Estimated' | 'Unknown';

interface CampoExtraido {
  valor: string | number | null;
  status: CampoEstado;
}

interface CamposExtraidos {
  cliente: CampoExtraido;
  ciudad: CampoExtraido;
  pais: CampoExtraido;
  modalidad: CampoExtraido;
  cantidad: CampoExtraido;
  marca: CampoExtraido;
  modelo: CampoExtraido;
  antiguedad: CampoExtraido;
}

interface ExtraccionResultado {
  campos: CamposExtraidos;
  completeness: number;
  estadoGlobal: CampoEstado;
}

const CAMPOS_LABEL: Record<keyof CamposExtraidos, string> = {
  cliente: 'Cliente',
  ciudad: 'Ciudad',
  pais: 'País',
  modalidad: 'Modalidad',
  cantidad: 'Cantidad',
  marca: 'Marca',
  modelo: 'Modelo',
  antiguedad: 'Antigüedad (años)',
};

const ESTADO_LABEL: Record<CampoEstado, string> = {
  Confirmed: 'Confirmado',
  Reported: 'Reportado',
  Estimated: 'Estimado',
  Unknown: 'Desconocido',
};

const ESTADO_BADGE: Record<CampoEstado, string> = {
  Confirmed: 'bg-green-100 text-green-800',
  Reported: 'bg-amber-100 text-amber-800',
  Estimated: 'bg-orange-100 text-orange-800',
  Unknown: 'bg-gray-200 text-gray-600',
};

const CAMPO_ORDEN: Array<keyof CamposExtraidos> = [
  'cliente',
  'ciudad',
  'pais',
  'modalidad',
  'cantidad',
  'marca',
  'modelo',
  'antiguedad',
];

type Paso = 'captura' | 'preview' | 'guardado';

export function Visita() {
  const [paso, setPaso] = useState<Paso>('captura');
  const [visitaId, setVisitaId] = useState<number | null>(null);
  const [observacion, setObservacion] = useState('');
  const [extrayendo, setExtrayendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estadoGlobal, setEstadoGlobal] = useState<CampoEstado>('Unknown');
  const [valores, setValores] = useState<Record<keyof CamposExtraidos, string>>({
    cliente: '',
    ciudad: '',
    pais: '',
    modalidad: '',
    cantidad: '',
    marca: '',
    modelo: '',
    antiguedad: '',
  });
  const [statuses, setStatuses] = useState<Record<keyof CamposExtraidos, CampoEstado>>({
    cliente: 'Unknown',
    ciudad: 'Unknown',
    pais: 'Unknown',
    modalidad: 'Unknown',
    cantidad: 'Unknown',
    marca: 'Unknown',
    modelo: 'Unknown',
    antiguedad: 'Unknown',
  });
  const [guardadoInfo, setGuardadoInfo] = useState<{ registro_id: number; estado: CampoEstado } | null>(null);

  useEffect(() => {
    const crearVisita = async () => {
      try {
        const res = await fetch('http://localhost:8787/api/visita/nueva', { method: 'POST' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setVisitaId(data.visita_id);
      } catch (e) {
        setError('No se pudo iniciar la visita: ' + String(e));
      }
    };
    crearVisita();
  }, []);

  const manejarExtraer = async () => {
    if (!visitaId || !observacion.trim()) return;
    if (new TextEncoder().encode(observacion).length > 10240) {
      setError('Observación muy larga (max 10KB)');
      return;
    }

    setExtrayendo(true);
    setError(null);

    try {
      const res = await fetch(`http://localhost:8787/api/visita/${visitaId}/extraer`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ observacion }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error ?? `HTTP ${res.status}`);
      }
      const data: ExtraccionResultado = await res.json();

      const nuevosValores = {} as Record<keyof CamposExtraidos, string>;
      const nuevosStatuses = {} as Record<keyof CamposExtraidos, CampoEstado>;
      for (const campo of CAMPO_ORDEN) {
        const c = data.campos[campo];
        nuevosValores[campo] = c.valor != null ? String(c.valor) : '';
        nuevosStatuses[campo] = c.status;
      }
      setValores(nuevosValores);
      setStatuses(nuevosStatuses);
      setEstadoGlobal(data.estadoGlobal);
      setPaso('preview');
    } catch (e) {
      setError(String(e));
    } finally {
      setExtrayendo(false);
    }
  };

  const manejarCambioValor = (campo: keyof CamposExtraidos, valor: string) => {
    setValores((prev) => ({ ...prev, [campo]: valor }));
    // Editar manualmente un campo lo marca como Confirmado (el usuario lo verificó).
    setStatuses((prev) => ({ ...prev, [campo]: valor.trim() ? 'Confirmed' : 'Unknown' }));
  };

  const manejarGuardar = async () => {
    if (!visitaId) return;
    if (!valores.cliente.trim() || !valores.pais.trim() || !valores.modalidad.trim()) {
      setError('Cliente, país y modalidad son obligatorios para guardar');
      return;
    }

    setGuardando(true);
    setError(null);

    try {
      const res = await fetch(`http://localhost:8787/api/visita/${visitaId}/guardar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          cliente: valores.cliente.trim(),
          ciudad: valores.ciudad.trim() || undefined,
          pais: valores.pais.trim(),
          modalidad: valores.modalidad.trim(),
          cantidad: valores.cantidad ? Number(valores.cantidad) : undefined,
          marca: valores.marca.trim() || undefined,
          modelo: valores.modelo.trim() || undefined,
          antiguedad: valores.antiguedad ? Number(valores.antiguedad) : undefined,
          estado: estadoGlobal,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setGuardadoInfo({ registro_id: data.registro_id, estado: data.estado });
      setPaso('guardado');
    } catch (e) {
      setError(String(e));
    } finally {
      setGuardando(false);
    }
  };

  const manejarNuevaVisita = () => {
    setPaso('captura');
    setObservacion('');
    setVisitaId(null);
    setError(null);
    setGuardadoInfo(null);
    fetch('http://localhost:8787/api/visita/nueva', { method: 'POST' })
      .then((res) => res.json())
      .then((data) => setVisitaId(data.visita_id))
      .catch((e) => setError('No se pudo iniciar la visita: ' + String(e)));
  };

  return (
    <div className="p-4 space-y-4 max-w-2xl">
      <h2 className="text-xl font-bold">Comenzar Visita</h2>

      {error && <div className="p-2 bg-red-100 text-red-800 rounded">{error}</div>}

      {paso === 'captura' && (
        <div className="space-y-2">
          <p className="text-sm opacity-70">
            Describe lo que observaste. No te preocupes si falta información: podrás
            completarla después.
          </p>
          <textarea
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
            placeholder="Ej: Vi un resonador GE Signa en el segundo piso, muy antiguo, en el Hospital Central Lima..."
            className="w-full p-2 border border-[--color-tinta] rounded"
            rows={6}
            disabled={extrayendo}
          />
          <button
            onClick={manejarExtraer}
            disabled={extrayendo || !observacion.trim() || !visitaId}
            className="px-4 py-2 bg-[--color-acento] text-white rounded disabled:opacity-50"
          >
            {extrayendo ? 'Extrayendo datos...' : 'Extraer datos'}
          </button>
        </div>
      )}

      {paso === 'preview' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-sm">Confianza general:</span>
            <span className={`px-2 py-1 rounded text-xs font-mono ${ESTADO_BADGE[estadoGlobal]}`}>
              {ESTADO_LABEL[estadoGlobal]}
            </span>
          </div>

          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-[--color-tinta]">
                <th className="text-left p-2">Campo</th>
                <th className="text-left p-2">Valor</th>
                <th className="text-left p-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {CAMPO_ORDEN.map((campo) => (
                <tr key={campo} className="border-b border-[--color-superficie]">
                  <td className="p-2 text-sm">{CAMPOS_LABEL[campo]}</td>
                  <td className="p-2">
                    <input
                      type={campo === 'cantidad' || campo === 'antiguedad' ? 'number' : 'text'}
                      value={valores[campo]}
                      onChange={(e) => manejarCambioValor(campo, e.target.value)}
                      className="w-full p-1 border border-[--color-superficie] rounded text-sm"
                    />
                  </td>
                  <td className="p-2">
                    <span className={`px-2 py-1 rounded text-xs font-mono ${ESTADO_BADGE[statuses[campo]]}`}>
                      {ESTADO_LABEL[statuses[campo]]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex gap-2">
            <button
              onClick={() => setPaso('captura')}
              disabled={guardando}
              className="px-4 py-2 border border-[--color-tinta] rounded disabled:opacity-50"
            >
              ← Atrás
            </button>
            <button
              onClick={manejarGuardar}
              disabled={guardando}
              className="px-4 py-2 bg-[--color-acento] text-white rounded disabled:opacity-50"
            >
              {guardando ? 'Guardando...' : 'Guardar Registro'}
            </button>
          </div>
        </div>
      )}

      {paso === 'guardado' && guardadoInfo && (
        <div className="space-y-4">
          <div className="p-3 bg-green-100 text-green-800 rounded">
            ✅ Registro #{guardadoInfo.registro_id} guardado exitosamente. Confianza:{' '}
            {ESTADO_LABEL[guardadoInfo.estado]}
          </div>
          <button
            onClick={manejarNuevaVisita}
            className="px-4 py-2 bg-[--color-acento] text-white rounded"
          >
            Comenzar otra visita
          </button>
        </div>
      )}
    </div>
  );
}

