import { SqlClient } from '../infra/sql/SqlClient.js';
import type { QueryExecutionResult } from '../shared/types/sql.types.js';

export class QueryService {
  constructor(private readonly connectTimeoutMs: number) {}

  private createClient(connectionString: string): SqlClient {
    return new SqlClient({
      databaseUrl: connectionString,
      connectTimeoutMs: this.connectTimeoutMs,
    });
  }

  public async initializeConnection(connectionString: string): Promise<string> {
    const sqlClient = this.createClient(connectionString);
    try {
      await sqlClient.testConnection();
      return 'SQL Server connection initialized successfully.';
    } finally {
      await sqlClient.close();
    }
  }

  public async executeQuery(query: string, timeoutMs: number, connectionString: string): Promise<QueryExecutionResult> {
    const sqlClient = this.createClient(connectionString);
    try {
      const rows = await sqlClient.query<Record<string, unknown>>(query, timeoutMs);
      return {
        rowCount: rows.length,
        rows,
      };
    } finally {
      await sqlClient.close();
    }
  }
}
