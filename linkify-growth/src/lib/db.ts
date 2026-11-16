import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";

const globalForDb = globalThis as unknown as {
  __linkifyPgPool?: pg.Pool;
  __linkifyPglite?: Promise<PGlite>;
};

export async function sql<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
  if (databaseUrl !== "") {
    globalForDb.__linkifyPgPool ??= new pg.Pool({
      connectionString: databaseUrl,
      max: 5,
    });
    const result = await globalForDb.__linkifyPgPool.query(text, params);
    return result.rows as T[];
  }

  globalForDb.__linkifyPglite ??= startLocal().catch((error: unknown) => {
    globalForDb.__linkifyPglite = undefined;
    throw error;
  });
  const db = await globalForDb.__linkifyPglite;
  const result = await db.query<T>(text, params);
  return result.rows;
}

async function startLocal(): Promise<PGlite> {
  const db = new PGlite();
  const files = (await readdir("migrations").catch(() => []))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    await db.exec(await readFile(`migrations/${file}`, "utf8"));
  }
  return db;
}
