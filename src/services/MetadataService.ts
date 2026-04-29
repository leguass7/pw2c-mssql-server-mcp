import { SqlClient } from '../infra/sql/SqlClient.js';
import type {
  DatabaseObjectFilter,
  DatabaseObjectInfo,
  TableColumnInfo,
} from '../shared/types/sql.types.js';

const OBJECT_TYPE_SQL: Record<Exclude<DatabaseObjectFilter, 'ALL'>, string> = {
  TABLE: "o.type IN ('U')",
  VIEW: "o.type IN ('V')",
  PROCEDURE: "o.type IN ('P', 'PC')",
  FUNCTION: "o.type IN ('FN', 'IF', 'TF')",
};

interface RawObjectRow {
  objectSchema: string;
  objectName: string;
  objectTypeCode: string;
}

const mapObjectType = (code: string): DatabaseObjectInfo['objectType'] => {
  const normalizedCode = code.trim().toUpperCase();

  if (normalizedCode === 'U') {
    return 'TABLE';
  }
  if (normalizedCode === 'V') {
    return 'VIEW';
  }
  if (normalizedCode === 'P' || normalizedCode === 'PC') {
    return 'PROCEDURE';
  }
  return 'FUNCTION';
};

export class MetadataService {
  constructor(private readonly connectTimeoutMs: number) {}

  private createClient(connectionString: string): SqlClient {
    return new SqlClient({
      databaseUrl: connectionString,
      connectTimeoutMs: this.connectTimeoutMs,
    });
  }

  public async getTableMetadata(
    schema: string | undefined,
    tableName: string | undefined,
    timeoutMs: number,
    connectionString: string
  ): Promise<TableColumnInfo[]> {
    const whereBySchema = schema ? `AND c.TABLE_SCHEMA = '${schema.replace(/'/g, "''")}'` : '';
    const whereByTableName = tableName ? `AND c.TABLE_NAME = '${tableName.replace(/'/g, "''")}'` : '';

    const sql = `
      WITH PrimaryKeys AS (
        SELECT
          kcu.TABLE_SCHEMA,
          kcu.TABLE_NAME,
          kcu.COLUMN_NAME
        FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
        INNER JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
          ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
          AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
          AND tc.TABLE_NAME = kcu.TABLE_NAME
        WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
      ),
      ForeignKeys AS (
        SELECT
          fk.TABLE_SCHEMA,
          fk.TABLE_NAME,
          fk.COLUMN_NAME,
          fk.CONSTRAINT_NAME AS foreignKeyName,
          pk.TABLE_SCHEMA AS referencedTableSchema,
          pk.TABLE_NAME AS referencedTableName,
          pk.COLUMN_NAME AS referencedColumnName
        FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
        INNER JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE fk
          ON fk.CONSTRAINT_CATALOG = rc.CONSTRAINT_CATALOG
          AND fk.CONSTRAINT_SCHEMA = rc.CONSTRAINT_SCHEMA
          AND fk.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
        INNER JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE pk
          ON pk.CONSTRAINT_CATALOG = rc.UNIQUE_CONSTRAINT_CATALOG
          AND pk.CONSTRAINT_SCHEMA = rc.UNIQUE_CONSTRAINT_SCHEMA
          AND pk.CONSTRAINT_NAME = rc.UNIQUE_CONSTRAINT_NAME
          AND pk.ORDINAL_POSITION = fk.ORDINAL_POSITION
      )
      SELECT
        c.TABLE_SCHEMA AS tableSchema,
        c.TABLE_NAME AS tableName,
        c.COLUMN_NAME AS columnName,
        c.DATA_TYPE AS dataType,
        CASE WHEN c.IS_NULLABLE = 'YES' THEN 1 ELSE 0 END AS isNullable,
        c.ORDINAL_POSITION AS ordinalPosition,
        CASE WHEN pk.COLUMN_NAME IS NULL THEN 0 ELSE 1 END AS isPrimaryKey,
        CASE WHEN fk.COLUMN_NAME IS NULL THEN 0 ELSE 1 END AS isForeignKey,
        fk.foreignKeyName,
        fk.referencedTableSchema,
        fk.referencedTableName,
        fk.referencedColumnName
      FROM INFORMATION_SCHEMA.COLUMNS c
      INNER JOIN INFORMATION_SCHEMA.TABLES t
        ON t.TABLE_SCHEMA = c.TABLE_SCHEMA
        AND t.TABLE_NAME = c.TABLE_NAME
      LEFT JOIN PrimaryKeys pk
        ON pk.TABLE_SCHEMA = c.TABLE_SCHEMA
        AND pk.TABLE_NAME = c.TABLE_NAME
        AND pk.COLUMN_NAME = c.COLUMN_NAME
      LEFT JOIN ForeignKeys fk
        ON fk.TABLE_SCHEMA = c.TABLE_SCHEMA
        AND fk.TABLE_NAME = c.TABLE_NAME
        AND fk.COLUMN_NAME = c.COLUMN_NAME
      WHERE t.TABLE_TYPE = 'BASE TABLE'
        ${whereBySchema}
        ${whereByTableName}
      ORDER BY c.TABLE_SCHEMA, c.TABLE_NAME, c.ORDINAL_POSITION;
    `;

    const sqlClient = this.createClient(connectionString);
    try {
      const rows = await sqlClient.query<{
        tableSchema: string;
        tableName: string;
        columnName: string;
        dataType: string;
        isNullable: number;
        ordinalPosition: number;
        isPrimaryKey: number;
        isForeignKey: number;
        foreignKeyName: string | null;
        referencedTableSchema: string | null;
        referencedTableName: string | null;
        referencedColumnName: string | null;
      }>(sql, timeoutMs);

      return rows.map((row) => ({
        tableSchema: row.tableSchema,
        tableName: row.tableName,
        columnName: row.columnName,
        dataType: row.dataType,
        isNullable: row.isNullable === 1,
        ordinalPosition: row.ordinalPosition,
        isPrimaryKey: row.isPrimaryKey === 1,
        isForeignKey: row.isForeignKey === 1,
        ...(row.foreignKeyName ? { foreignKeyName: row.foreignKeyName } : {}),
        ...(row.referencedTableSchema ? { referencedTableSchema: row.referencedTableSchema } : {}),
        ...(row.referencedTableName ? { referencedTableName: row.referencedTableName } : {}),
        ...(row.referencedColumnName ? { referencedColumnName: row.referencedColumnName } : {}),
      }));
    } finally {
      await sqlClient.close();
    }
  }

  public async getDatabaseObjectsMetadata(
    schema: string | undefined,
    tableName: string | undefined,
    timeoutMs: number,
    includeViews: boolean,
    connectionString: string
  ): Promise<DatabaseObjectInfo[]> {
    if (includeViews) {
      return this.getDatabaseObjectsByType(schema, undefined, timeoutMs, 'ALL', connectionString);
    }
    return this.getDatabaseObjectsByType(schema, tableName, timeoutMs, 'TABLE', connectionString);
  }

  public async getDatabaseObjectsByType(
    schema: string | undefined,
    tableName: string | undefined,
    timeoutMs: number,
    objectType: DatabaseObjectFilter,
    connectionString: string
  ): Promise<DatabaseObjectInfo[]> {
    const whereBySchema = schema ? `AND s.name = '${schema.replace(/'/g, "''")}'` : '';
    const whereByTableName =
      objectType === 'TABLE' && tableName ? `AND o.name = '${tableName.replace(/'/g, "''")}'` : '';
    const whereByType = objectType === 'ALL' ? "o.type IN ('U', 'V', 'P', 'PC', 'FN', 'IF', 'TF')" : OBJECT_TYPE_SQL[objectType];

    const sql = `
      SELECT
        s.name AS objectSchema,
        o.name AS objectName,
        o.type AS objectTypeCode
      FROM sys.objects o
      INNER JOIN sys.schemas s ON s.schema_id = o.schema_id
      WHERE ${whereByType}
        ${whereBySchema}
        ${whereByTableName}
      ORDER BY s.name, o.name;
    `;

    const sqlClient = this.createClient(connectionString);
    try {
      const rows = await sqlClient.query<RawObjectRow>(sql, timeoutMs);

      return rows.map((row) => ({
        objectSchema: row.objectSchema,
        objectName: row.objectName,
        objectType: mapObjectType(row.objectTypeCode),
      }));
    } finally {
      await sqlClient.close();
    }
  }
}
