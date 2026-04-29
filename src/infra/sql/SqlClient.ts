import mssql from 'mssql';
import { DatabaseError } from '../../shared/errors/AppError.js';
import { normalizeConnectionString } from './connection-string.js';

export interface SqlClientConfig {
  databaseUrl: string;
  connectTimeoutMs: number;
}

export class SqlClient {
  private pool: mssql.ConnectionPool | null = null;
  private readonly connectionString: string;
  private readonly connectTimeoutMs: number;

  constructor(config: SqlClientConfig) {
    const baseConnectionString = normalizeConnectionString(config.databaseUrl);
    const connectTimeoutSeconds = Math.max(1, Math.ceil(config.connectTimeoutMs / 1000));
    this.connectionString = `${baseConnectionString.replace(/;\s*$/, '')};Connection Timeout=${connectTimeoutSeconds};`;
    this.connectTimeoutMs = config.connectTimeoutMs;
  }

  private async getPool(): Promise<mssql.ConnectionPool> {
    if (this.pool?.connected) {
      return this.pool;
    }

    const pool = new mssql.ConnectionPool(this.connectionString);

    try {
      this.pool = await pool.connect();
      return this.pool;
    } catch (error) {
      throw new DatabaseError(`Failed to connect to SQL Server: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public async testConnection(): Promise<void> {
    await this.query('SELECT 1 AS ok', 10_000);
  }

  public async query<T extends Record<string, unknown>>(sqlText: string, timeoutMs: number): Promise<T[]> {
    const pool = await this.getPool();
    const request = pool.request();

    let timeoutHandle: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        request.cancel();
        reject(new DatabaseError(`Query timeout after ${timeoutMs}ms.`, 408));
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([request.query<T>(sqlText), timeoutPromise]);
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      return result.recordset;
    } catch (error) {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      if (error instanceof DatabaseError) {
        throw error;
      }
      throw new DatabaseError(`Query failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public async close(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
    }
  }
}
