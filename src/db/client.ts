import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import { DB_PATH, ensureDataDirs } from "@/lib/paths";
import * as schema from "./schema";

function openConnection(): Database.Database {
  ensureDataDirs();
  const connection = new Database(DB_PATH);
  connection.pragma("journal_mode = WAL");
  connection.pragma("foreign_keys = ON");
  connection.pragma("busy_timeout = 5000");
  return connection;
}

// Reaproveita a conexão entre recarregamentos do `next dev`.
const globalForDb = globalThis as unknown as { __painelSqlite?: Database.Database };
export const sqlite = globalForDb.__painelSqlite ?? openConnection();
globalForDb.__painelSqlite = sqlite;

export const db = drizzle(sqlite, { schema });
