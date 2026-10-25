import pg from 'pg';

/** The slice of the pool the rest of the API depends on — lets tests pass a fake. */
export type Db = Pick<pg.Pool, 'query' | 'connect'>;

export function createPool(connectionString: string): pg.Pool {
  const pool = new pg.Pool({ connectionString, max: 5 });
  // Without a handler, an error on an idle client (the DB restarting) crashes the process.
  pool.on('error', (err) => console.error('idle database client failed', err));
  return pool;
}
