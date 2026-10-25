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
