import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type QueryResult<T> = { rows: T[]; rowCount: number };

interface Driver {
  query<T>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  close(): Promise<void>;
}

/**
 * One SQL surface for two deployment modes:
 *  - DATABASE_URL set   -> node-postgres against Supabase (production).
 *  - DATABASE_URL unset -> PGlite, a real Postgres compiled to WASM, persisted under .data/.
 *
 * Both run the identical schema, so local development never drifts from production and the
 * project stays runnable before any Supabase credentials exist.
 */
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private driver: Driver;
  public mode: 'postgres' | 'pglite' = 'pglite';

  async onModuleInit(): Promise<void> {
    const url = process.env.DATABASE_URL;
    if (url) {
      const { Pool } = await import('pg');
      const pool = new Pool({
        connectionString: url,
        max: Number(process.env.DATABASE_POOL_MAX ?? 5),
        ssl: url.includes('localhost') ? undefined : { rejectUnauthorized: false },
      });
      this.driver = {
        query: async <T>(sql: string, params?: unknown[]) => {
          const res = await pool.query(sql, params as never[]);
          return { rows: res.rows as T[], rowCount: res.rowCount ?? 0 };
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
        close: () => db.close(),
      };
      this.mode = 'pglite';
    }

    await this.migrate();
    this.logger.log(`Database ready (${this.mode})`);
  }

  /** Called after SeedService is constructed; kept here so boot order stays obvious. */
  markReady(): void {
    this.logger.log(`OrderFlow API database is accepting queries (${this.mode})`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.driver?.close();
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

  private async migrate(): Promise<void> {
    const schema = this.readSql('schema.sql');
    for (const statement of splitStatements(schema)) {
      await this.driver.query(statement);
    }
  }

  private readSql(file: string): string {
    // Works both from src (ts-node-dev) and dist (compiled), where .sql files are copied alongside.
    for (const candidate of [join(__dirname, file), join(process.cwd(), 'src', 'database', file)]) {
      try {
        return readFileSync(candidate, 'utf8');
      } catch {
        continue;
      }
    }
    throw new Error(`Unable to locate SQL file ${file}`);
  }
}

/** PGlite executes one statement per call, so the schema file is split on top-level semicolons. */
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
