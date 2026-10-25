import pg from 'pg';

/** The slice of the pool the rest of the API depends on — lets tests pass a fake. */
export type Db = Pick<pg.Pool, 'query' | 'connect'>;

export function createPool(connectionString: string): pg.Pool {
  const pool = new pg.Pool({ connectionString, max: 5 });
  // Without a handler, an error on an idle client (the DB restarting) crashes the process.
  pool.on('error', (err) => console.error('idle database client failed', err));
  return pool;
}

/** Anything that can run a query: the pool, or one client inside a transaction. */
export type Queryable = Pick<pg.Pool, 'query'>;

/** Run `fn` in one transaction: commit when it returns, roll back when it throws. */
export async function withTransaction<T>(db: Db, fn: (tx: Queryable) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
