import {createHash} from 'node:crypto';
import {pool} from '@yoggan/db';
import {drizzle} from 'drizzle-orm/mysql2';

// A database-scoped lock serializes the empty-database check and user insert
// across API processes. Keep it on one connection until the insert completes.
const lockName = `yoggan-bootstrap-${createHash('sha256').update(process.env.DB_NAME ?? 'yoggan').digest('hex').slice(0, 32)}`;

export async function withBootstrapLock<T>(operation: (database: Omit<ReturnType<typeof drizzle>, '$client'>) => Promise<T>): Promise<T> {
  const connection = await pool.getConnection();
  let acquired = false;
  try {
    const [rows] = await connection.query('SELECT GET_LOCK(?, 10) AS acquired', [lockName]);
    acquired = (rows as {acquired: number}[])[0]?.acquired === 1;
    if (!acquired) throw new Error('Household setup is busy. Please try again.');
    return await operation(drizzle(connection, {mode: 'default'}));
  } finally {
    try {
      if (acquired) await connection.query('SELECT RELEASE_LOCK(?)', [lockName]);
    } finally {connection.release();}
  }
}
