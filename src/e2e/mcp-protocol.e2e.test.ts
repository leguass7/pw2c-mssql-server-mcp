import 'dotenv/config';

import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMcpRuntime } from '../mcp/server.js';
import { startSseServer, type SseServerHandle } from '../transport/sse.js';
import type { ServerConfig } from '../shared/config.js';

interface JsonRpcResponse<T> {
  jsonrpc: '2.0';
  id?: number | string | null;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface InitializeResult {
  protocolVersion: string;
}

interface ToolsListResult {
  tools: Array<{ name: string }>;
}

interface ToolsCallResult {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

interface ConnectionsListResult {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

interface ActiveConnectionResult {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

interface GenericToolJsonResult {
  [key: string]: unknown;
}

const getFreePort = async (): Promise<number> => {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Failed to resolve free port.'));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
};

describe('MCP protocol e2e over SSE transport', () => {
  const apiKey = 'test-e2e-api-key';
  const ideConnectionName = 'ide_config_connection';
  const ideConnectionString = process.env.DATABASE_URL;
  let baseUrl = '';
  let sessionId: string | undefined;
  let runtime: ReturnType<typeof createMcpRuntime> | null = null;
  let serverHandle: SseServerHandle | null = null;
  const tempConnectionsFile = join(process.cwd(), 'data', `connections.mcp-protocol.${randomUUID()}.json`);

  const sendRpc = async <T>(payload: Record<string, unknown>): Promise<JsonRpcResponse<T>> => {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'x-mcp-timeout-ms': '90000',
        ...(ideConnectionString
          ? {
              'x-mssql-connection-string': ideConnectionString,
              'x-mssql-connection-name': ideConnectionName,
            }
          : {}),
        ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });

    const responseSessionId = response.headers.get('mcp-session-id');
    if (responseSessionId) {
      sessionId = responseSessionId;
    }

    const responseText = await response.text();
    if (![200, 202].includes(response.status)) {
      throw new Error(`Unexpected HTTP status ${response.status} for method ${String(payload.method)}: ${responseText}`);
    }

    if (response.status === 202) {
      return { jsonrpc: '2.0' } as JsonRpcResponse<T>;
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('text/event-stream')) {
      const dataLines = responseText
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .filter((line) => line.length > 0);

      const lastPayload = dataLines[dataLines.length - 1];
      if (!lastPayload) {
        throw new Error('SSE response did not contain JSON-RPC payload data.');
      }

      return JSON.parse(lastPayload) as JsonRpcResponse<T>;
    }

    return JSON.parse(responseText) as JsonRpcResponse<T>;
  };

  const parseToolTextJson = (toolResponse: { content?: Array<{ text?: string }> }): GenericToolJsonResult => {
    const rawText = toolResponse.content?.[0]?.text;
    if (!rawText) {
      throw new Error('Tool response did not include text payload.');
    }
    return JSON.parse(rawText) as GenericToolJsonResult;
  };

  beforeAll(async () => {
    const port = await getFreePort();
    baseUrl = `http://127.0.0.1:${port}/mcp`;

    const config: ServerConfig = {
      databaseUrl: undefined,
      apiKey,
      mode: 'sse',
      port,
      connectionsFilePath: tempConnectionsFile,
      timeoutMs: 60_000,
      connectTimeoutMs: 15_000,
      maxTimeoutMs: 300_000,
      minTimeoutMs: 1_000,
    };

    runtime = createMcpRuntime(config);
    serverHandle = await startSseServer(runtime.server, config);
  });

  afterAll(async () => {
    if (serverHandle) {
      await serverHandle.close();
    }
    if (runtime) {
      await runtime.close();
    }
    rmSync(tempConnectionsFile, { force: true });
  });

  const runIfDatabase = ideConnectionString ? it : it.skip;

  runIfDatabase('supports initialize, tools/list and tools/call', async () => {
    const tempConnectionName = `mcp_e2e_${Date.now()}`;

    const initializeResponse = await sendRpc<InitializeResult>({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'vitest-e2e-client',
          version: '1.0.0',
        },
      },
    });

    expect(initializeResponse.error).toBeUndefined();
    expect(initializeResponse.result?.protocolVersion).toBeDefined();

    const listToolsResponse = await sendRpc<ToolsListResult>({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    });

    expect(listToolsResponse.error).toBeUndefined();
    expect(listToolsResponse.result?.tools.some((tool) => tool.name === 'mssql_execute_query')).toBe(true);

    const callToolResponse = await sendRpc<ToolsCallResult>({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'mssql_execute_query',
        arguments: {
          query: 'SELECT 1 AS healthcheck',
        },
      },
    });

    expect(callToolResponse.error).toBeUndefined();
    expect(callToolResponse.result?.isError).not.toBe(true);
    expect(callToolResponse.result?.content[0]?.type).toBe('text');
    expect(callToolResponse.result?.content[0]?.text).toContain('healthcheck');

    const listConnectionsResponse = await sendRpc<ConnectionsListResult>({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'mssql_list_connections',
        arguments: {},
      },
    });

    expect(listConnectionsResponse.error).toBeUndefined();
    const listText = listConnectionsResponse.result?.content[0]?.text ?? '';
    expect(listText).toContain(ideConnectionName);

    const testConnectionResponse = await sendRpc<ToolsCallResult>({
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: {
        name: 'mssql_test_connection',
        arguments: {
          connectionString: ideConnectionString,
        },
      },
    });

    expect(testConnectionResponse.error).toBeUndefined();
    expect(testConnectionResponse.result?.isError).not.toBe(true);
    const testConnectionJson = parseToolTextJson(testConnectionResponse.result ?? {});
    expect(testConnectionJson.ok).toBe(true);

    const addConnectionResponse = await sendRpc<ToolsCallResult>({
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: {
        name: 'mssql_add_connection',
        arguments: {
          name: tempConnectionName,
          connectionString: ideConnectionString,
          description: 'MCP protocol e2e temporary connection',
        },
      },
    });

    expect(addConnectionResponse.error).toBeUndefined();
    expect(addConnectionResponse.result?.isError).not.toBe(true);

    const executeWithNamedConnectionResponse = await sendRpc<ToolsCallResult>({
      jsonrpc: '2.0',
      id: 8,
      method: 'tools/call',
      params: {
        name: 'mssql_execute_query',
        arguments: {
          connectionName: tempConnectionName,
          query: 'SELECT 1 AS by_named_connection',
        },
      },
    });

    expect(executeWithNamedConnectionResponse.error).toBeUndefined();
    expect(executeWithNamedConnectionResponse.result?.isError).not.toBe(true);
    expect(executeWithNamedConnectionResponse.result?.content[0]?.text).toContain('by_named_connection');

    const activeNamedConnectionResponse = await sendRpc<ActiveConnectionResult>({
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/call',
      params: {
        name: 'mssql_get_active_connection',
        arguments: {
          connectionName: tempConnectionName,
        },
      },
    });

    expect(activeNamedConnectionResponse.error).toBeUndefined();
    const activeNamedText = activeNamedConnectionResponse.result?.content[0]?.text ?? '';
    expect(activeNamedText).toContain(tempConnectionName);
    expect(activeNamedText).toContain('input');

    const updateConnectionResponse = await sendRpc<ToolsCallResult>({
      jsonrpc: '2.0',
      id: 10,
      method: 'tools/call',
      params: {
        name: 'mssql_update_connection',
        arguments: {
          name: tempConnectionName,
          connectionString: ideConnectionString,
          description: 'Updated by MCP protocol e2e',
        },
      },
    });

    expect(updateConnectionResponse.error).toBeUndefined();
    expect(updateConnectionResponse.result?.isError).not.toBe(true);

    const listAfterUpdateResponse = await sendRpc<ConnectionsListResult>({
      jsonrpc: '2.0',
      id: 11,
      method: 'tools/call',
      params: {
        name: 'mssql_list_connections',
        arguments: {},
      },
    });

    expect(listAfterUpdateResponse.error).toBeUndefined();
    const listAfterUpdateText = listAfterUpdateResponse.result?.content[0]?.text ?? '';
    expect(listAfterUpdateText).toContain(tempConnectionName);
    expect(listAfterUpdateText).toContain('Updated by MCP protocol e2e');

    const activeConnectionResponse = await sendRpc<ActiveConnectionResult>({
      jsonrpc: '2.0',
      id: 12,
      method: 'tools/call',
      params: {
        name: 'mssql_get_active_connection',
        arguments: {},
      },
    });

    expect(activeConnectionResponse.error).toBeUndefined();
    const activeText = activeConnectionResponse.result?.content[0]?.text ?? '';
    expect(activeText).toContain(ideConnectionName);
    expect(activeText).toContain('request_context');

    const removeConnectionResponse = await sendRpc<ToolsCallResult>({
      jsonrpc: '2.0',
      id: 13,
      method: 'tools/call',
      params: {
        name: 'mssql_remove_connection',
        arguments: {
          name: tempConnectionName,
        },
      },
    });

    expect(removeConnectionResponse.error).toBeUndefined();
    expect(removeConnectionResponse.result?.isError).not.toBe(true);

    const listAfterRemoveResponse = await sendRpc<ConnectionsListResult>({
      jsonrpc: '2.0',
      id: 14,
      method: 'tools/call',
      params: {
        name: 'mssql_list_connections',
        arguments: {},
      },
    });

    expect(listAfterRemoveResponse.error).toBeUndefined();
    const listAfterRemoveText = listAfterRemoveResponse.result?.content[0]?.text ?? '';
    expect(listAfterRemoveText).not.toContain(tempConnectionName);
  });
});
