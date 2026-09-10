CREATE TABLE IF NOT EXISTS registros (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente TEXT NOT NULL, ciudad TEXT, pais TEXT NOT NULL,
  modalidad TEXT NOT NULL, cantidad INTEGER, marca TEXT, modelo TEXT,
  antiguedad INTEGER, fuente TEXT NOT NULL, estado TEXT NOT NULL,
  colaborador TEXT, timestamp TEXT NOT NULL,
  resumen TEXT NOT NULL,        -- texto plano usado para generar el embedding
  embedding BLOB NOT NULL       -- Float32Array serializado (768 dim, EMBEDDINGGEMMA/GTE)
);

-- Fase 3 (Sprint 1): flujo de captura de visita (observación → extracción → guardado)
CREATE TABLE IF NOT EXISTS visitas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  observacion_raw TEXT,
  extraccion_json TEXT,          -- último resultado de extracción (JSON: campos + status)
  estado_visita TEXT NOT NULL DEFAULT 'en_progreso',  -- en_progreso | completada
  registro_id INTEGER,           -- FK a registros, se llena al guardar
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (registro_id) REFERENCES registros(id)
);
