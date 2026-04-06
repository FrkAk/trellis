import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

/**
 * Lazily initialized Drizzle ORM client.
 * Works with any PostgreSQL instance (local or Neon).
 * Defers connection until first use so builds succeed without DATABASE_URL.
 */
export const db = new Proxy(
  {} as ReturnType<typeof drizzle<typeof schema>>,
  {
    get(_target, prop, receiver) {
      if (!_db) {
        const client = postgres(process.env.DATABASE_URL!);
        _db = drizzle(client, { schema });
      }
      return Reflect.get(_db, prop, receiver);
    },
  },
);
