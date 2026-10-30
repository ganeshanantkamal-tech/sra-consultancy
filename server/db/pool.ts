import pg from 'pg';

const { Pool } = pg;

// Return DATE columns as 'YYYY-MM-DD' strings. The default parser builds a JS Date at
// local midnight, which serialises to the previous day in UTC (IST is +05:30).
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);

let pool: pg.Pool | undefined;

export function db() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  return (pool ??= new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }));
}

export async function tx<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await db().connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
