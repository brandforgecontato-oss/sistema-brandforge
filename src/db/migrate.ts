import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { seedDefaultTrendSources } from "@/features/trends/sources";
import { db, sqlite } from "./client";

migrate(db, { migrationsFolder: "./src/db/migrations" });
const added = seedDefaultTrendSources();
sqlite.close();

console.log(`Migrações aplicadas. Fontes de tendência novas: ${added}.`);
