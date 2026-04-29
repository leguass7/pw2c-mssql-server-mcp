export interface QueryRow {
  [column: string]: unknown;
}

export interface QueryExecutionResult {
  rowCount: number;
  rows: QueryRow[];
}

export interface ConnectionEntry {
  name: string;
  connectionString: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectionSummary {
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TableColumnInfo {
  tableSchema: string;
  tableName: string;
  columnName: string;
  dataType: string;
  isNullable: boolean;
  ordinalPosition: number;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  foreignKeyName?: string;
  referencedTableSchema?: string;
  referencedTableName?: string;
  referencedColumnName?: string;
}

export interface DatabaseObjectInfo {
  objectSchema: string;
  objectName: string;
  objectType: 'TABLE' | 'VIEW' | 'PROCEDURE' | 'FUNCTION';
}

export type DatabaseObjectFilter = DatabaseObjectInfo['objectType'] | 'ALL';
