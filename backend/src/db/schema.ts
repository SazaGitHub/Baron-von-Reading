import { Database } from "bun:sqlite";
import path from "path";

const dbPath = process.env["DB_PATH"] ?? path.join(import.meta.dir, "../../db.sqlite");
export const db = new Database(dbPath, { create: true });

db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS progress (
    user_id INTEGER NOT NULL,
    file_id TEXT NOT NULL,
    sentence_index INTEGER NOT NULL,
    PRIMARY KEY (user_id, file_id)
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS phonetic_dict (
    user_id INTEGER NOT NULL,
    word TEXT NOT NULL,
    phonetic TEXT NOT NULL,
    PRIMARY KEY (user_id, word)
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS settings (
    user_id INTEGER PRIMARY KEY,
    data TEXT NOT NULL
  )
`);
