import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

try {
  const url = new URL(process.env.DATABASE_URL);
  console.log(`[db] Connecting to host: ${url.hostname}, port: ${url.port || '5432'}, db: ${url.pathname?.slice(1)}`);
} catch (e) {
  console.log(`[db] DATABASE_URL format could not be parsed for logging`);
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 30000,
  idleTimeoutMillis: 60000,
  max: 10,
});

pool.on('error', (err) => {
  console.error('[db] Pool error:', err.message);
});

export async function waitForDb(maxRetries = 5): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      console.log(`[db] Connection verified on attempt ${attempt}`);
      return;
    } catch (err: any) {
      console.error(`[db] Connection attempt ${attempt}/${maxRetries} failed: ${err.message}`);
      if (attempt < maxRetries) {
        const delay = Math.min(attempt * 3000, 15000);
        console.log(`[db] Retrying in ${delay}ms...`);
        await new Promise(res => setTimeout(res, delay));
      } else {
        throw new Error(`[db] Could not connect after ${maxRetries} attempts: ${err.message}`);
      }
    }
  }
}

export const db = drizzle(pool, { schema });
export { pool };
