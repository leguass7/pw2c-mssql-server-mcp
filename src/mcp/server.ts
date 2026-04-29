import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { ConnectionService, DEFAULT_MSSQL_CONNECTION_NAME } from '../services/ConnectionService.js';
import { MetadataService } from '../services/MetadataService.js';
import { QueryService } from '../services/QueryService.js';
import type { ServerConfig } from '../shared/config.js';
import { resolveTimeoutMs } from '../shared/config.js';
import { getRequestContext } from '../shared/request-context.js';
import type { DatabaseObjectFilter } from '../shared/types/sql.types.js';
import { withErrorHandling } from './tool.wrapper.js';

const objectTypeSchema = z.enum(['ALL', 'TABLE', 'VIEW', 'PROCEDURE', 'FUNCTION']);

export interface McpRuntime {
  server: McpServer;
  close: () => Promise<void>;
}

export const createMcpRuntime = (config: ServerConfig): McpRuntime => {
  const server = new McpServer({
    name: 'pw2c-mssql-server-mcp',
    version: '0.1.0',
  });

  const connectionService = new ConnectionService({
    filePath: config.connectionsFilePath,
    defaultDatabaseUrl: config.databaseUrl,
    connectTimeoutMs: config.connectTimeoutMs,
  });

  const queryService = new QueryService(config.connectTimeoutMs);
  const metadataService = new MetadataService(config.connectTimeoutMs);

  const getRequestTimeout = (): number => {
    const context = getRequestContext();
    return resolveTimeoutMs(
      config.timeoutMs,
      { min: config.minTimeoutMs, max: config.maxTimeoutMs },
      context?.timeoutMs
    );
  };

  const resolveAutoConnectionName = (connectionString: string, contextConnectionName?: string): string => {
    if (contextConnectionName && contextConnectionName.trim().length > 0) {
      return contextConnectionName.trim();
    }

    const digest = createHash('sha1').update(connectionString).digest('hex').slice(0, 10);
    return `auto_${digest}`;
  };

  const resolveConnection = (
    connectionName?: string
  ): { connectionName: string; connectionString: string; source: 'input' | 'request_context' | 'default' } => {
    if (connectionName) {
      return {
        connectionName,
        connectionString: connectionService.getConnectionString(connectionName),
        source: 'input',
      };
    }

    const context = getRequestContext();
    if (context?.connectionString) {
      const autoConnectionName = resolveAutoConnectionName(context.connectionString, context.connectionName);
      connectionService.ensureConnection(autoConnectionName, context.connectionString, 'Auto-registered from client config');
      return {
        connectionName: autoConnectionName,
        connectionString: connectionService.getConnectionString(autoConnectionName),
        source: 'request_context',
      };
    }

    return {
      connectionName: DEFAULT_MSSQL_CONNECTION_NAME,
      connectionString: connectionService.getConnectionString(DEFAULT_MSSQL_CONNECTION_NAME),
      source: 'default',
    };
  };

  const getConnectionString = (connectionName?: string): string => {
    return resolveConnection(connectionName).connectionString;
  };

  server.registerTool(
    'mssql_initialize_connection',
    {
      description: 'Initialize SQL Server connection and verify connectivity.',
      inputSchema: {
        connectionName: z.string().optional(),
      },
    },
    async ({ connectionName }) =>
      withErrorHandling(async () => queryService.initializeConnection(getConnectionString(connectionName)))
  );

  server.registerTool(
    'mssql_execute_query',
    {
      description: 'Execute a SQL query and return JSON rows.',
      inputSchema: {
        connectionName: z.string().optional(),
        query: z.string().min(1).describe('SQL query text to execute.'),
      },
    },
    async ({ connectionName, query }) =>
      withErrorHandling(async () => queryService.executeQuery(query, getRequestTimeout(), getConnectionString(connectionName)))
  );

  server.registerTool(
    'mssql_get_table_metadata',
    {
      description: 'Get table columns metadata from SQL Server.',
      inputSchema: {
        connectionName: z.string().optional(),
        schema: z.string().optional().describe('Optional schema filter, e.g. dbo.'),
        tableName: z.string().optional().describe('Optional table name filter.'),
      },
    },
    async ({ connectionName, schema, tableName }) =>
      withErrorHandling(async () =>
        metadataService.getTableMetadata(schema, tableName, getRequestTimeout(), getConnectionString(connectionName))
      )
  );

  server.registerTool(
    'mssql_get_database_objects_metadata',
    {
      description: 'Get database objects metadata (tables, views, procedures, functions).',
      inputSchema: {
        connectionName: z.string().optional(),
        schema: z.string().optional().describe('Optional schema filter, e.g. dbo.'),
        tableName: z.string().optional().describe('Optional table name filter when includeViews=false.'),
        includeViews: z.boolean().default(true),
      },
    },
    async ({ connectionName, schema, tableName, includeViews }) =>
      withErrorHandling(async () =>
        metadataService.getDatabaseObjectsMetadata(
          schema,
          tableName,
          getRequestTimeout(),
          includeViews,
          getConnectionString(connectionName)
        )
      )
  );

  server.registerTool(
    'mssql_get_database_objects_by_type',
    {
      description: 'Get database objects metadata filtered by type.',
      inputSchema: {
        connectionName: z.string().optional(),
        schema: z.string().optional().describe('Optional schema filter, e.g. dbo.'),
        tableName: z.string().optional().describe('Optional table name filter when objectType=TABLE.'),
        objectType: objectTypeSchema.default('ALL'),
      },
    },
    async ({ connectionName, schema, tableName, objectType }) =>
      withErrorHandling(async () =>
        metadataService.getDatabaseObjectsByType(
          schema,
          tableName,
          getRequestTimeout(),
          objectType as DatabaseObjectFilter,
          getConnectionString(connectionName)
        )
      )
  );

  server.registerTool(
    'mssql_get_active_connection',
    {
      description: 'Get the active resolved connection for current request context.',
      inputSchema: {
        connectionName: z.string().optional(),
      },
    },
    async ({ connectionName }) =>
      withErrorHandling(async () => {
        const resolved = resolveConnection(connectionName);
        return {
          connectionName: resolved.connectionName,
          source: resolved.source,
        };
      })
  );

  server.registerTool(
    'mssql_list_connections',
    {
      description: 'List available saved connections (without secrets).',
      inputSchema: z.object({}),
    },
    async () => withErrorHandling(async () => connectionService.listConnections())
  );

  server.registerTool(
    'mssql_add_connection',
    {
      description: 'Add a new named SQL Server connection.',
      inputSchema: {
        name: z.string().min(1),
        connectionString: z.string().min(1),
        description: z.string().optional(),
      },
    },
    async ({ name, connectionString, description }) =>
      withErrorHandling(async () => connectionService.addConnection(name, connectionString, description))
  );

  server.registerTool(
    'mssql_update_connection',
    {
      description: 'Update an existing named SQL Server connection.',
      inputSchema: {
        name: z.string().min(1),
        connectionString: z.string().min(1),
        description: z.string().optional(),
      },
    },
    async ({ name, connectionString, description }) =>
      withErrorHandling(async () => connectionService.updateConnection(name, connectionString, description))
  );

  server.registerTool(
    'mssql_remove_connection',
    {
      description: 'Remove a named SQL Server connection.',
      inputSchema: {
        name: z.string().min(1),
      },
    },
    async ({ name }) => withErrorHandling(async () => connectionService.removeConnection(name))
  );

  server.registerTool(
    'mssql_test_connection',
    {
      description: 'Test connectivity with a provided connection string.',
      inputSchema: {
        connectionString: z.string().min(1),
      },
    },
    async ({ connectionString }) => withErrorHandling(async () => connectionService.testConnection(connectionString))
  );

  return {
    server,
    close: async () => Promise.resolve(),
  };
};
