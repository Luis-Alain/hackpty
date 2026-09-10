CREATE TABLE IF NOT EXISTS registros (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente TEXT NOT NULL, ciudad TEXT, pais TEXT NOT NULL,
  modalidad TEXT NOT NULL, cantidad INTEGER, marca TEXT, modelo TEXT,
  antiguedad INTEGER, fuente TEXT NOT NULL, estado TEXT NOT NULL,
  colaborador TEXT, timestamp TEXT NOT NULL,
  resumen TEXT NOT NULL,        -- texto plano usado para generar el embedding
  embedding BLOB NOT NULL       -- Float32Array serializado (768 dim, EMBEDDINGGEMMA/GTE)
);
