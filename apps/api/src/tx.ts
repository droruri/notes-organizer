import type { Db } from './db';

/** Anything that can run a query: the pool, or one client inside a transaction. */
export type Queryable = Pick<Db, 'query'>;

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

export type Result<T, E extends string> = { ok: true; value: T } | { ok: false; error: E };

const UNIQUE_VIOLATION = '23505';

/** Run a write; a clash with a unique index becomes `{ ok: false, error: 'name_taken' }`. */
export async function guarded<T>(write: () => Promise<T>): Promise<Result<T, 'name_taken'>> {
  try {
    return { ok: true, value: await write() };
  } catch (err) {
    if (typeof err === 'object' && err !== null && 'code' in err && err.code === UNIQUE_VIOLATION) {
      return { ok: false, error: 'name_taken' };
    }
    throw err;
  }
}
