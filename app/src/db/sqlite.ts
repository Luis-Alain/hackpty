import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', '..', 'data', 'vigía.sqlite');

let _db: Database.Database | null = null;

function ensurePath() {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function getDb(): Database.Database {
  if (_db) return _db;
  ensurePath();
  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  return _db;
}

export function initSchema() {
  const db = getDb();
  const schema = fs.readFileSync(
    path.join(__dirname, 'schema.sql'),
    'utf8'
  );
  db.exec(schema);
}
