import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type QueryResult<T> = { rows: T[]; rowCount: number };

interface Driver {
  query<T>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  transaction<T>(fn: (tx: QueryClient) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export interface QueryClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  one<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>;
}

function client(query: Driver['query']): QueryClient {
  return {
    query,
    async one<T>(sql: string, params: unknown[] = []) {
      const result = await query<T>(sql, params);
      return result.rows[0] ?? null;
    },
  };
}

/**
 * One SQL surface for two deployment modes:
 *  - DATABASE_URL set   -> node-postgres against Supabase (production).
 *  - DATABASE_URL unset -> PGlite, a real Postgres compiled to WASM, persisted under .data/.
 */
export class DatabaseService {
  private driver!: Driver;
  public mode: 'postgres' | 'pglite' = 'pglite';
  private ready = false;

  async init(): Promise<void> {
    if (this.ready) return;
    const url = process.env.DATABASE_URL;
    if (url) {
      const { Pool } = await import('pg');
      const pool = new Pool({
        connectionString: url,
        max: Number(process.env.DATABASE_POOL_MAX ?? 5),
        connectionTimeoutMillis: 15000,
        idleTimeoutMillis: 30000,
        ssl: url.includes('localhost') ? undefined : { rejectUnauthorized: false },
      });
      this.driver = {
        query: async <T>(sql: string, params?: unknown[]) => {
          const res = await pool.query(sql, params as never[]);
          return { rows: res.rows as T[], rowCount: res.rowCount ?? 0 };
        },
        transaction: async <T>(fn: (tx: QueryClient) => Promise<T>) => {
          const connection = await pool.connect();
          try {
            await connection.query('begin');
            const result = await fn(client(async <R>(sql: string, params?: unknown[]) => {
              const res = await connection.query(sql, params as never[]);
              return { rows: res.rows as R[], rowCount: res.rowCount ?? 0 };
            }));
            await connection.query('commit');
            return result;
          } catch (error) {
            await connection.query('rollback');
            throw error;
          } finally {
            connection.release();
          }
        },
        close: () => pool.end(),
      };
      this.mode = 'postgres';
    } else {
      const { PGlite } = await import('@electric-sql/pglite');
      const dataDir = process.env.PGLITE_PATH ?? join(process.cwd(), '.data', 'pglite');
      mkdirSync(dataDir, { recursive: true });
      const db = new PGlite(dataDir);
      this.driver = {
        query: async <T>(sql: string, params?: unknown[]) => {
          const res = await db.query<T>(sql, params as never[]);
          return { rows: res.rows, rowCount: res.affectedRows ?? res.rows.length };
        },
        transaction: <T>(fn: (tx: QueryClient) => Promise<T>) =>
          db.transaction((tx) => fn(client(async <R>(sql: string, params?: unknown[]) => {
            const res = await tx.query<R>(sql, params as never[]);
            return { rows: res.rows, rowCount: res.affectedRows ?? res.rows.length };
          }))),
        close: () => db.close(),
      };
      this.mode = 'pglite';
    }

    await this.migrate();
    this.ready = true;
    console.log(`Database ready (${this.mode})`);
  }

  async close(): Promise<void> {
    await this.driver?.close();
    this.ready = false;
  }

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    return this.driver.query<T>(sql, params);
  }

  async one<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
    const { rows } = await this.query<T>(sql, params);
    return rows[0] ?? null;
  }

  async many<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const { rows } = await this.query<T>(sql, params);
    return rows;
  }

  transaction<T>(fn: (tx: QueryClient) => Promise<T>): Promise<T> {
    return this.driver.transaction(fn);
  }

  private async migrate(): Promise<void> {
    if (this.mode === 'postgres') {
      const existing = await this.one<{ tbl: string | null }>(
        "select to_regclass('public.billing_webhook_events')::text as tbl",
      );
      if (existing?.tbl) return;
      const candidate = join(process.cwd(), 'src', 'server', 'database', 'schema.sql');
      if (!existsSync(candidate)) return;
      await this.driver.query(readFileSync(/* turbopackIgnore: true */ candidate, 'utf8'));
      return;
    }
    const schema = this.readSql('schema.sql');
    for (const statement of splitStatements(schema)) {
      await this.driver.query(statement);
    }
  }

  private readSql(file: string): string {
    const candidate = join(process.cwd(), 'src', 'server', 'database', file);
    return readFileSync(/* turbopackIgnore: true */ candidate, 'utf8');
  }
}

export function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let buffer = '';
  let inDollarBlock = false;

  for (const line of sql.split('\n')) {
    const withoutComment = line.replace(/--.*$/, '');
    if (/\$\$/.test(withoutComment)) {
      const markers = withoutComment.match(/\$\$/g)!.length;
      if (markers % 2 === 1) inDollarBlock = !inDollarBlock;
    }
    buffer += line + '\n';
    if (!inDollarBlock && withoutComment.trimEnd().endsWith(';')) {
      if (buffer.trim()) statements.push(buffer.trim());
      buffer = '';
    }
  }
  if (buffer.trim()) statements.push(buffer.trim());
  return statements;
}
