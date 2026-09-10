import { useEffect, useRef, useState } from "react";

const crearWavDesdeFloat32 = (
  muestras: Float32Array,
  sampleRate: number,
): Blob => {
  const bytesPorMuestra = 2;
  const buffer = new ArrayBuffer(44 + muestras.length * bytesPorMuestra);
  const vista = new DataView(buffer);
  const escribir = (offset: number, texto: string) => {
    for (let i = 0; i < texto.length; i++)
      vista.setUint8(offset + i, texto.charCodeAt(i));
  };

  escribir(0, "RIFF");
  vista.setUint32(4, 36 + muestras.length * bytesPorMuestra, true);
  escribir(8, "WAVE");
  escribir(12, "fmt ");
  vista.setUint32(16, 16, true);
  vista.setUint16(20, 1, true);
  vista.setUint16(22, 1, true);
  vista.setUint32(24, sampleRate, true);
  vista.setUint32(28, sampleRate * bytesPorMuestra, true);
  vista.setUint16(32, bytesPorMuestra, true);
  vista.setUint16(34, 16, true);
  escribir(36, "data");
  vista.setUint32(40, muestras.length * bytesPorMuestra, true);

  for (let i = 0; i < muestras.length; i++) {
    const muestra = Math.max(-1, Math.min(1, muestras[i]));
    vista.setInt16(
      44 + i * bytesPorMuestra,
      muestra < 0 ? muestra * 0x8000 : muestra * 0x7fff,
      true,
    );
  }

  return new Blob([buffer], { type: "audio/wav" });
};

// Whisper trabaja nativamente a 16kHz. El micrófono del navegador entrega
// audio a la tasa nativa del hardware (típicamente 44100 o 48000 Hz), no
// 16000. El WAV que mandábamos antes llevaba el header correcto (con la
// tasa real, ej. 48000) pero el pipeline de QVAC (en particular con VAD
// activado) no lo manejaba bien: con audio real de micrófono a 48kHz el
// modelo devolvía transcripciones vacías o texto sin ningún parecido a lo
// dicho, mientras que el mismo contenido a 16kHz transcribía correctamente.
// Remuestreamos a 16kHz nosotros mismos antes de codificar el WAV para no
// depender de que el servidor lo haga bien.
const remuestrearA16kHz = (
  muestras: Float32Array,
  sampleRateOriginal: number,
): { muestras: Float32Array; sampleRate: number } => {
  const SAMPLE_RATE_DESTINO = 16000;
  if (sampleRateOriginal === SAMPLE_RATE_DESTINO) {
    return { muestras, sampleRate: SAMPLE_RATE_DESTINO };
  }
  const ratio = sampleRateOriginal / SAMPLE_RATE_DESTINO;
  const longitudDestino = Math.floor(muestras.length / ratio);
  const resultado = new Float32Array(longitudDestino);
  for (let i = 0; i < longitudDestino; i++) {
    const posOriginal = i * ratio;
    const idx0 = Math.floor(posOriginal);
    const idx1 = Math.min(idx0 + 1, muestras.length - 1);
    const frac = posOriginal - idx0;
    resultado[i] = muestras[idx0] * (1 - frac) + muestras[idx1] * frac;
  }
  return { muestras: resultado, sampleRate: SAMPLE_RATE_DESTINO };
};

interface GrabadorPCM {
  audioCtx: AudioContext;
  source: MediaStreamAudioSourceNode;
  processor: ScriptProcessorNode;
  silencio: GainNode;
  buffers: Float32Array[];
  stream: MediaStream;
}

type CampoEstado = "Confirmed" | "Reported" | "Estimated" | "Unknown";

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

interface Pregunta {
  campo: keyof CamposExtraidos;
  pregunta: string;
  valorActual: string | number | null;
}

interface DuplicadoCandidato {
  registro_id: number;
  cliente: string;
  pais: string;
  modalidad: string;
  marca: string | null;
  modelo: string | null;
  antiguedad: number | null;
  p: number;
  veredicto: "mismo" | "revisar";
}

const CAMPOS_LABEL: Record<keyof CamposExtraidos, string> = {
  cliente: "Cliente",
  ciudad: "Ciudad",
  pais: "País",
  modalidad: "Modalidad",
  cantidad: "Cantidad",
  marca: "Marca",
  modelo: "Modelo",
  antiguedad: "Antigüedad (años)",
};

const ESTADO_LABEL: Record<CampoEstado, string> = {
  Confirmed: "Confirmado",
  Reported: "Reportado",
  Estimated: "Estimado",
  Unknown: "Desconocido",
};

const ESTADO_BADGE: Record<CampoEstado, string> = {
  Confirmed: "bg-green-100 text-green-800",
  Reported: "bg-amber-100 text-amber-800",
  Estimated: "bg-orange-100 text-orange-800",
  Unknown: "bg-gray-200 text-gray-600",
};

const CAMPO_ORDEN: Array<keyof CamposExtraidos> = [
  "cliente",
  "ciudad",
  "pais",
  "modalidad",
  "cantidad",
  "marca",
  "modelo",
  "antiguedad",
];

const API = "http://localhost:8787";

type Paso = "captura" | "preguntas" | "preview" | "guardado";

const CAMPOS_VACIOS: Record<keyof CamposExtraidos, string> = {
  cliente: "",
  ciudad: "",
  pais: "",
  modalidad: "",
  cantidad: "",
  marca: "",
  modelo: "",
  antiguedad: "",
};

const STATUSES_VACIOS: Record<keyof CamposExtraidos, CampoEstado> = {
  cliente: "Unknown",
  ciudad: "Unknown",
  pais: "Unknown",
  modalidad: "Unknown",
  cantidad: "Unknown",
  marca: "Unknown",
  modelo: "Unknown",
  antiguedad: "Unknown",
};

export function Visita() {
  const [paso, setPaso] = useState<Paso>("captura");
  const [visitaId, setVisitaId] = useState<number | null>(null);
  const [observacion, setObservacion] = useState("");
  const [extrayendo, setExtrayendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [verificandoDuplicados, setVerificandoDuplicados] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estadoGlobal, setEstadoGlobal] = useState<CampoEstado>("Unknown");
  const [valores, setValores] =
    useState<Record<keyof CamposExtraidos, string>>(CAMPOS_VACIOS);
  const [statuses, setStatuses] =
    useState<Record<keyof CamposExtraidos, CampoEstado>>(STATUSES_VACIOS);
  const [guardadoInfo, setGuardadoInfo] = useState<{
    registro_id: number;
    estado: CampoEstado;
  } | null>(null);

  const [preguntas, setPreguntas] = useState<Pregunta[]>([]);
  const [respuestasLocal, setRespuestasLocal] = useState<
    Record<string, string | null>
  >({});
  const [enviandoRespuestas, setEnviandoRespuestas] = useState(false);

  const [duplicadoCandidato, setDuplicadoCandidato] =
    useState<DuplicadoCandidato | null>(null);

  const [grabando, setGrabando] = useState(false);
  const [transcribiendo, setTranscribiendo] = useState(false);
  const [procesandoFoto, setProcesandoFoto] = useState(false);
  const grabadorRef = useRef<GrabadorPCM | null>(null);
  const fotoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    iniciarVisita();
  }, []);

  const agregarAObservacion = (texto: string) => {
    if (!texto.trim()) return;
    setObservacion((prev) =>
      prev.trim() ? `${prev.trim()}\n${texto.trim()}` : texto.trim(),
    );
  };

  const manejarGrabar = async () => {
    if (grabando) {
      await detenerGrabacion();
      return;
    }

    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AudioContextCtor =
        window.AudioContext ?? (window as any).webkitAudioContext;
      const audioCtx: AudioContext = new AudioContextCtor();
      // Los navegadores crean el AudioContext en estado "suspended" por política
      // de autoplay; sin resume() explícito, onaudioprocess nunca dispara y no
      // se captura ninguna muestra.
      await audioCtx.resume();
      const source = audioCtx.createMediaStreamSource(stream);
      // ScriptProcessorNode está deprecado en favor de AudioWorklet, pero sigue
      // soportado universalmente y evita el round-trip MediaRecorder -> WebM ->
      // decodeAudioData() que falla de forma intermitente (ver audioToWav.ts).
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      const buffers: Float32Array[] = [];
      processor.onaudioprocess = (e) => {
        buffers.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };
      // onaudioprocess solo dispara si el nodo está conectado a un destino; lo
      // enrutamos a través de una ganancia en 0 para no producir eco audible.
      const silencio = audioCtx.createGain();
      silencio.gain.value = 0;
      source.connect(processor);
      processor.connect(silencio);
      silencio.connect(audioCtx.destination);

      grabadorRef.current = {
        audioCtx,
        source,
        processor,
        silencio,
        buffers,
        stream,
      };
      setGrabando(true);
    } catch (e) {
      setError("No se pudo acceder al micrófono: " + String(e));
    }
  };

  const detenerGrabacion = async () => {
    const g = grabadorRef.current;
    grabadorRef.current = null;
    setGrabando(false);
    if (!g) return;

    g.processor.disconnect();
    g.source.disconnect();
    g.silencio.disconnect();
    g.stream.getTracks().forEach((t) => t.stop());
    const sampleRate = g.audioCtx.sampleRate;
    await g.audioCtx.close();

    const totalMuestras = g.buffers.reduce((suma, b) => suma + b.length, 0);
    if (totalMuestras === 0) {
      setError("No se capturó audio. Intenta grabar de nuevo.");
      return;
    }
    const combinado = new Float32Array(totalMuestras);
    let offset = 0;
    for (const b of g.buffers) {
      combinado.set(b, offset);
      offset += b.length;
    }

    // Si el pico de amplitud es casi cero, el micrófono no está entregando audio
    // real (causa típica en macOS: Chrome obtiene un stream válido de getUserMedia
    // aunque el permiso de micrófono a nivel de sistema operativo esté bloqueado,
    // entregando silencio puro sin ningún error de JS). Avisamos antes de subir
    // en vez de mandar silencio y fallar sin explicación.
    let pico = 0;
    for (let i = 0; i < combinado.length; i++) {
      const abs = Math.abs(combinado[i]);
      if (abs > pico) pico = abs;
    }
    if (pico < 0.01) {
      setError("No se detectó audio del micrófono");
      return;
    }

    const { muestras: muestras16k, sampleRate: sampleRate16k } =
      remuestrearA16kHz(combinado, sampleRate);
    const wavBlob = crearWavDesdeFloat32(muestras16k, sampleRate16k);
    await subirAudio(wavBlob);
  };

  const subirAudio = async (wavBlob: Blob) => {
    if (!visitaId) return;
    setTranscribiendo(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("audio", wavBlob, "observacion.wav");
      const res = await fetch(`${API}/api/visita/${visitaId}/captura/audio`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      if (!data.transcripcion || !data.transcripcion.trim()) {
        setError(
          "El modelo no detectó voz en el audio grabado. Intenta hablar más " +
            "cerca del micrófono, o escribe la observación manualmente.",
        );
        return;
      }
      agregarAObservacion(data.transcripcion);
    } catch (e) {
      setError(String(e));
    } finally {
      setTranscribiendo(false);
    }
  };

  const manejarSeleccionarFoto = async (file: File | undefined) => {
    if (!file || !visitaId) return;
    setProcesandoFoto(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("foto", file);
      const res = await fetch(`${API}/api/visita/${visitaId}/captura/foto`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      agregarAObservacion(data.texto_extraido);
    } catch (e) {
      setError(String(e));
    } finally {
      setProcesandoFoto(false);
      if (fotoInputRef.current) fotoInputRef.current.value = "";
    }
  };

  const iniciarVisita = () => {
    fetch(`${API}/api/visita/nueva`, { method: "POST" })
      .then((res) => res.json())
      .then((data) => setVisitaId(data.visita_id))
      .catch((e) => setError("No se pudo iniciar la visita: " + String(e)));
  };

  const aplicarExtraccion = (data: ExtraccionResultado) => {
    const nuevosValores = {} as Record<keyof CamposExtraidos, string>;
    const nuevosStatuses = {} as Record<keyof CamposExtraidos, CampoEstado>;
    for (const campo of CAMPO_ORDEN) {
      const c = data.campos[campo];
      nuevosValores[campo] = c.valor != null ? String(c.valor) : "";
      nuevosStatuses[campo] = c.status;
    }
    setValores(nuevosValores);
    setStatuses(nuevosStatuses);
    setEstadoGlobal(data.estadoGlobal);
  };

  const manejarExtraer = async () => {
    if (!visitaId || !observacion.trim()) return;
    if (new TextEncoder().encode(observacion).length > 10240) {
      setError("Observación muy larga (max 10KB)");
      return;
    }

    setExtrayendo(true);
    setError(null);

    try {
      const res = await fetch(`${API}/api/visita/${visitaId}/extraer`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ observacion }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error ?? `HTTP ${res.status}`);
      }
      const data: ExtraccionResultado = await res.json();
      aplicarExtraccion(data);

      // Preguntamos por el dato faltante más valioso solo si algo quedó pendiente.
      const resPreg = await fetch(`${API}/api/visita/${visitaId}/preguntas`, {
        method: "POST",
      });
      const dataPreg = await resPreg.json();
      if (
        resPreg.ok &&
        Array.isArray(dataPreg.preguntas) &&
        dataPreg.preguntas.length > 0
      ) {
        setPreguntas(dataPreg.preguntas);
        setRespuestasLocal({});
        setPaso("preguntas");
      } else {
        setPaso("preview");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setExtrayendo(false);
    }
  };

  const manejarResponderPregunta = (campo: string, respuesta: string) => {
    setRespuestasLocal((prev) => ({ ...prev, [campo]: respuesta }));
  };

  const manejarNoSe = (campo: string) => {
    setRespuestasLocal((prev) => ({ ...prev, [campo]: null }));
  };

  const manejarContinuarPreguntas = async (omitir: boolean) => {
    if (!visitaId) return;

    if (omitir || Object.keys(respuestasLocal).length === 0) {
      setPaso("preview");
      return;
    }

    setEnviandoRespuestas(true);
    setError(null);
    try {
      const respuestas = Object.entries(respuestasLocal).map(
        ([campo, respuesta]) => ({
          campo,
          respuesta,
        }),
      );
      const res = await fetch(`${API}/api/visita/${visitaId}/respuestas`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ respuestas }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error ?? `HTTP ${res.status}`);
      }
      const data: ExtraccionResultado = await res.json();
      aplicarExtraccion(data);
      setPaso("preview");
    } catch (e) {
      setError(String(e));
    } finally {
      setEnviandoRespuestas(false);
    }
  };

  const manejarCambioValor = (campo: keyof CamposExtraidos, valor: string) => {
    setValores((prev) => ({ ...prev, [campo]: valor }));
    // Editar manualmente un campo lo marca como Confirmado (el usuario lo verificó).
    setStatuses((prev) => ({
      ...prev,
      [campo]: valor.trim() ? "Confirmed" : "Unknown",
    }));
    // Los datos cambiaron: cualquier chequeo de duplicado anterior queda obsoleto.
    setDuplicadoCandidato(null);
  };

  const construirPayloadRegistro = () => ({
    cliente: valores.cliente.trim(),
    ciudad: valores.ciudad.trim() || undefined,
    pais: valores.pais.trim(),
    modalidad: valores.modalidad.trim(),
    cantidad: valores.cantidad ? Number(valores.cantidad) : undefined,
    marca: valores.marca.trim() || undefined,
    modelo: valores.modelo.trim() || undefined,
    antiguedad: valores.antiguedad ? Number(valores.antiguedad) : undefined,
    estado: estadoGlobal,
  });

  const guardarFinal = async (mergeConId?: number) => {
    if (!visitaId) return;
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/visita/${visitaId}/guardar`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...construirPayloadRegistro(), mergeConId }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setGuardadoInfo({ registro_id: data.registro_id, estado: data.estado });
      setDuplicadoCandidato(null);
      setPaso("guardado");
    } catch (e) {
      setError(String(e));
    } finally {
      setGuardando(false);
    }
  };

  const manejarIntentarGuardar = async () => {
    if (!visitaId) return;
    if (
      !valores.cliente.trim() ||
      !valores.pais.trim() ||
      !valores.modalidad.trim()
    ) {
      setError("Cliente, país y modalidad son obligatorios para guardar");
      return;
    }

    setVerificandoDuplicados(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/visita/${visitaId}/duplicados`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(construirPayloadRegistro()),
      });
      const data = await res.json();
      if (
        res.ok &&
        Array.isArray(data.duplicados) &&
        data.duplicados.length > 0
      ) {
        setDuplicadoCandidato(data.duplicados[0]);
      } else {
        await guardarFinal();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setVerificandoDuplicados(false);
    }
  };

  const manejarNuevaVisita = () => {
    setPaso("captura");
    setObservacion("");
    setVisitaId(null);
    setError(null);
    setGuardadoInfo(null);
    setValores(CAMPOS_VACIOS);
    setStatuses(STATUSES_VACIOS);
    setDuplicadoCandidato(null);
    setPreguntas([]);
    setRespuestasLocal({});
    iniciarVisita();
  };

  return (
    <div className="p-4 space-y-4 max-w-2xl">
      <h2 className="text-xl font-bold">Comenzar Visita</h2>

      {error && (
        <div className="p-2 bg-red-100 text-red-800 rounded">{error}</div>
      )}

      {paso === "captura" && (
        <div className="space-y-2">
          <p className="text-sm opacity-70">
            Describe lo que observaste. No te preocupes si falta información:
            podrás completarla después.
          </p>
          <textarea
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
            placeholder="Ej: Vi un resonador GE Signa en el segundo piso, muy antiguo, en el Hospital Central Lima..."
            className="w-full p-2 border border-(--color-tinta) rounded"
            rows={6}
            disabled={extrayendo}
          />

          <div className="flex gap-2 items-center flex-wrap">
            <button
              onClick={manejarGrabar}
              disabled={transcribiendo || !visitaId}
              className={`px-3 py-2 rounded border text-sm disabled:opacity-50 ${
                grabando
                  ? "bg-red-600 text-white border-red-600"
                  : "border-(--color-tinta)"
              }`}
            >
              {grabando ? "⏹ Detener grabación" : "🎤 Grabar voz"}
            </button>
            {transcribiendo && (
              <span className="text-sm opacity-70">
                Transcribiendo audio...
              </span>
            )}

            <button
              onClick={() => fotoInputRef.current?.click()}
              disabled={procesandoFoto || !visitaId}
              className="px-3 py-2 rounded border border-(--color-tinta) text-sm disabled:opacity-50"
            >
              📷 Tomar foto de placa
            </button>
            {procesandoFoto && (
              <span className="text-sm opacity-70">Leyendo placa...</span>
            )}
            <input
              ref={fotoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              className="hidden"
              onChange={(e) => manejarSeleccionarFoto(e.target.files?.[0])}
            />
          </div>

          <button
            onClick={manejarExtraer}
            disabled={extrayendo || !observacion.trim() || !visitaId}
            className="px-4 py-2 bg-(--color-acento) text-white rounded disabled:opacity-50"
          >
            {extrayendo ? "Extrayendo datos..." : "Extraer datos"}
          </button>
        </div>
      )}

      {paso === "preguntas" && (
        <div className="space-y-4">
          <p className="text-sm opacity-70">
            Falta información. Responde lo que sepas, o marca "No sé" para lo
            demás.
          </p>
          <div className="space-y-3">
            {preguntas.map((p) => {
              const respondida = respuestasLocal[p.campo];
              return (
                <div
                  key={p.campo}
                  className="p-3 bg-(--color-superficie) rounded space-y-2"
                >
                  <p className="text-sm font-medium">{p.pregunta}</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={respondida ?? ""}
                      onChange={(e) =>
                        manejarResponderPregunta(p.campo, e.target.value)
                      }
                      placeholder="Tu respuesta..."
                      disabled={respondida === null}
                      className="flex-1 p-1 border border-(--color-tinta) rounded text-sm disabled:opacity-40"
                    />
                    <button
                      onClick={() => manejarNoSe(p.campo)}
                      className={`px-3 py-1 text-xs rounded border ${
                        respondida === null
                          ? "bg-gray-300 border-gray-400"
                          : "border-(--color-tinta)"
                      }`}
                    >
                      No sé
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => manejarContinuarPreguntas(true)}
              disabled={enviandoRespuestas}
              className="px-4 py-2 border border-(--color-tinta) rounded disabled:opacity-50"
            >
              Saltar
            </button>
            <button
              onClick={() => manejarContinuarPreguntas(false)}
              disabled={enviandoRespuestas}
              className="px-4 py-2 bg-(--color-acento) text-white rounded disabled:opacity-50"
            >
              {enviandoRespuestas ? "Guardando respuestas..." : "Continuar"}
            </button>
          </div>
        </div>
      )}

      {paso === "preview" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-sm">Confianza general:</span>
            <span
              className={`px-2 py-1 rounded text-xs font-mono ${ESTADO_BADGE[estadoGlobal]}`}
            >
              {ESTADO_LABEL[estadoGlobal]}
            </span>
          </div>

          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-(--color-tinta)">
                <th className="text-left p-2">Campo</th>
                <th className="text-left p-2">Valor</th>
                <th className="text-left p-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {CAMPO_ORDEN.map((campo) => (
                <tr
                  key={campo}
                  className="border-b border-(--color-superficie)"
                >
                  <td className="p-2 text-sm">{CAMPOS_LABEL[campo]}</td>
                  <td className="p-2">
                    <input
                      type={
                        campo === "cantidad" || campo === "antiguedad"
                          ? "number"
                          : "text"
                      }
                      value={valores[campo]}
                      onChange={(e) =>
                        manejarCambioValor(campo, e.target.value)
                      }
                      className="w-full p-1 border border-(--color-superficie) rounded text-sm"
                    />
                  </td>
                  <td className="p-2">
                    <span
                      className={`px-2 py-1 rounded text-xs font-mono ${ESTADO_BADGE[statuses[campo]]}`}
                    >
                      {ESTADO_LABEL[statuses[campo]]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {duplicadoCandidato ? (
            <div className="p-3 bg-amber-100 text-amber-900 rounded space-y-2">
              <p className="text-sm font-medium">
                ⚠️ Posible duplicado detectado
              </p>
              <p className="text-sm">
                Coincide con el registro #{duplicadoCandidato.registro_id}: "
                {duplicadoCandidato.cliente}" — {duplicadoCandidato.modalidad}{" "}
                {duplicadoCandidato.marca ?? ""}{" "}
                {duplicadoCandidato.modelo ?? ""} (
                {Math.round(duplicadoCandidato.p * 100)}% de confianza)
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => guardarFinal()}
                  disabled={guardando}
                  className="px-3 py-1 text-sm border border-amber-900 rounded disabled:opacity-50"
                >
                  No, crear registro nuevo
                </button>
                <button
                  onClick={() => guardarFinal(duplicadoCandidato.registro_id)}
                  disabled={guardando}
                  className="px-3 py-1 text-sm bg-amber-900 text-white rounded disabled:opacity-50"
                >
                  {guardando ? "Combinando..." : "Sí, combinar con éste"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => setPaso("captura")}
                disabled={guardando || verificandoDuplicados}
                className="px-4 py-2 border border-(--color-tinta) rounded disabled:opacity-50"
              >
                ← Atrás
              </button>
              <button
                onClick={manejarIntentarGuardar}
                disabled={guardando || verificandoDuplicados}
                className="px-4 py-2 bg-(--color-acento) text-white rounded disabled:opacity-50"
              >
                {verificandoDuplicados
                  ? "Verificando duplicados..."
                  : guardando
                    ? "Guardando..."
                    : "Guardar Registro"}
              </button>
            </div>
          )}
        </div>
      )}

      {paso === "guardado" && guardadoInfo && (
        <div className="space-y-4">
          <div className="p-3 bg-green-100 text-green-800 rounded">
            ✅ Registro #{guardadoInfo.registro_id} guardado exitosamente.
            Confianza: {ESTADO_LABEL[guardadoInfo.estado]}
          </div>
          <button
            onClick={manejarNuevaVisita}
            className="px-4 py-2 bg-(--color-acento) text-white rounded"
          >
            Comenzar otra visita
          </button>
        </div>
      )}
    </div>
  );
}
