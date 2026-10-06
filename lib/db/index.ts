import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "@neondatabase/serverless";
import type { Database } from "./schema";

// Neon's Pool speaks the pg API over WebSockets, so transactions work.
export const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) as never }),
});
