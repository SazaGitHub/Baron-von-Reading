import { DatabaseSync } from "node:sqlite";
import path from "path";

// Support both running locally in dev (current directory) and in Electron (where env is set)
const dbPath = process.env["DB_PATH"] ?? path.join(process.cwd(), "db.sqlite");
const rawDb = new DatabaseSync(dbPath);

export const db = {
  run(sql: string, params: any[] = []): void {
    const stmt = rawDb.prepare(sql);
    stmt.run(...params);
  },
  query<T = any, P extends any[] = any[]>(sql: string) {
    const stmt = rawDb.prepare(sql);
    return {
      all(...params: P): T[] {
        return stmt.all(...params) as T[];
      },
      get(...params: P): T | undefined {
        return stmt.get(...params) as T | undefined;
      }
    };
  }
};

// Optimize SQLite for performance
db.run("PRAGMA journal_mode = WAL");
db.run("PRAGMA synchronous = NORMAL");

db.run(`
  CREATE TABLE IF NOT EXISTS book_metadata (
    user_id INTEGER NOT NULL DEFAULT 1,
    file_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    PRIMARY KEY (user_id, file_id)
  )
`);

// Migration: Ensure user_id exists in book_metadata (for existing DBs)
try {
  db.run("ALTER TABLE book_metadata ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1");
  console.log("Migration: Added user_id to book_metadata");
} catch {
  // Column already exists, ignore
}

db.run(`
  CREATE TABLE IF NOT EXISTS bookshelves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS bookshelf_books (
    bookshelf_id INTEGER NOT NULL,
    file_id TEXT NOT NULL,
    PRIMARY KEY (bookshelf_id, file_id)
  )
`);

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
