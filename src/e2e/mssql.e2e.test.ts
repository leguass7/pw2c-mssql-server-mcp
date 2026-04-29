import 'dotenv/config';

import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { MetadataService } from '../services/MetadataService.js';
import { QueryService } from '../services/QueryService.js';
import { ConnectionService } from '../services/ConnectionService.js';

const databaseUrl = process.env.DATABASE_URL;

const describeIfDatabase = databaseUrl ? describe : describe.skip;

describeIfDatabase('MSSQL real e2e', () => {
  const queryService = new QueryService(15_000);
  const metadataService = new MetadataService(15_000);

  const tempConnectionsFile = join(process.cwd(), 'data', `connections.e2e.${randomUUID()}.json`);
  const connectionService = new ConnectionService({
    filePath: tempConnectionsFile,
    defaultDatabaseUrl: databaseUrl as string,
    connectTimeoutMs: 15_000,
  });
  const connectionName = 'default';

  const getConnectionString = (): string => connectionService.getConnectionString(connectionName);

  afterAll(async () => {
    rmSync(tempConnectionsFile, { force: true });
  });

  it('initializes SQL Server connection', async () => {
    await expect(queryService.initializeConnection(getConnectionString())).resolves.toContain('initialized');
  });

  it('executes a simple read-only query', async () => {
    const result = await queryService.executeQuery('SELECT 1 AS healthcheck', 10_000, getConnectionString());
    expect(result.rowCount).toBeGreaterThan(0);
    expect(result.rows[0]).toHaveProperty('healthcheck', 1);
  });

  it('retrieves database objects metadata', async () => {
    const objects = await metadataService.getDatabaseObjectsByType(
      undefined,
      undefined,
      10_000,
      'ALL',
      getConnectionString()
    );
    expect(Array.isArray(objects)).toBe(true);
    expect(objects.length).toBeGreaterThan(0);
  });

  it('retrieves table metadata including PK/FK flags', async () => {
    const metadata = await metadataService.getTableMetadata(undefined, undefined, 15_000, getConnectionString());

    expect(Array.isArray(metadata)).toBe(true);
    expect(metadata.length).toBeGreaterThan(0);
    expect(metadata[0]).toHaveProperty('isPrimaryKey');
    expect(metadata[0]).toHaveProperty('isForeignKey');
  });

  it('filters table metadata by tableName', async () => {
    const allMetadata = await metadataService.getTableMetadata(undefined, undefined, 15_000, getConnectionString());
    expect(allMetadata.length).toBeGreaterThan(0);

    const targetTableName = allMetadata[0]?.tableName;
    const filteredMetadata = await metadataService.getTableMetadata(undefined, targetTableName, 15_000, getConnectionString());

    expect(filteredMetadata.length).toBeGreaterThan(0);
    expect(filteredMetadata.every((column) => column.tableName === targetTableName)).toBe(true);
  });

  it('filters database objects by tableName when objectType=TABLE', async () => {
    const tables = await metadataService.getDatabaseObjectsByType(
      undefined,
      undefined,
      15_000,
      'TABLE',
      getConnectionString()
    );
    expect(tables.length).toBeGreaterThan(0);

    const targetTableName = tables[0]?.objectName;
    const filteredTables = await metadataService.getDatabaseObjectsByType(
      undefined,
      targetTableName,
      15_000,
      'TABLE',
      getConnectionString()
    );

    expect(filteredTables.length).toBeGreaterThan(0);
    expect(filteredTables.every((table) => table.objectType === 'TABLE')).toBe(true);
    expect(filteredTables.every((table) => table.objectName === targetTableName)).toBe(true);
  });

  it('performs full CRUD lifecycle for connections with real connectivity test', async () => {
    const extraConnectionName = `e2e_${Date.now()}`;

    const addResult = connectionService.addConnection(extraConnectionName, databaseUrl as string, 'E2E temporary connection');
    expect(addResult.name).toBe(extraConnectionName);

    const listAfterAdd = connectionService.listConnections();
    expect(listAfterAdd.some((connection) => connection.name === extraConnectionName)).toBe(true);

    const testResult = await connectionService.testConnection(databaseUrl as string);
    expect(testResult.ok).toBe(true);

    const updateResult = connectionService.updateConnection(extraConnectionName, databaseUrl as string, 'Updated E2E connection');
    expect(updateResult.description).toBe('Updated E2E connection');

    const removeResult = connectionService.removeConnection(extraConnectionName);
    expect(removeResult.removed).toBe(true);

    const listAfterRemove = connectionService.listConnections();
    expect(listAfterRemove.some((connection) => connection.name === extraConnectionName)).toBe(false);
  });
});
