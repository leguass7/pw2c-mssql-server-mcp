import fastify from 'fastify';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { ServerConfig } from '../shared/config.js';
import { runWithRequestContext } from '../shared/request-context.js';
import { parseOptionalTimeout } from '../shared/timeout.js';

export interface SseServerHandle {
  app: FastifyInstance;
  close: () => Promise<void>;
}

export const startSseServer = async (server: McpServer, config: ServerConfig): Promise<SseServerHandle> => {
  const app = fastify({ logger: false });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });

  await server.connect(transport);

  app.all('/mcp', async (request, reply) => {
    const apiKey = request.headers['x-api-key'];
    const isAuthEnabled = Boolean(config.apiKey && config.apiKey.trim().length > 0);

    if (isAuthEnabled && (!apiKey || typeof apiKey !== 'string' || apiKey !== config.apiKey)) {
      return reply.status(401).send({ error: 'Unauthorized. Provide valid X-API-Key header.' });
    }

    const timeoutHeader = request.headers['x-mcp-timeout-ms'];
    const timeoutMs = parseOptionalTimeout(typeof timeoutHeader === 'string' ? timeoutHeader : undefined);
    const connectionStringHeader = request.headers['x-mssql-connection-string'];
    const connectionNameHeader = request.headers['x-mssql-connection-name'];
    const connectionString = typeof connectionStringHeader === 'string' ? connectionStringHeader : undefined;
    const connectionName = typeof connectionNameHeader === 'string' ? connectionNameHeader : undefined;

    try {
      reply.hijack();
      await runWithRequestContext(
        {
          transport: 'sse',
          timeoutMs,
          connectTimeoutMs: config.connectTimeoutMs,
          connectionString,
          connectionName,
        },
        async () => transport.handleRequest(request.raw, reply.raw, request.body)
      );
    } catch (error) {
      console.error('[SSE] Failed to process /mcp request:', error);
      if (!reply.raw.headersSent) {
        reply.status(500).send({ error: 'Internal server error.' });
      }
    }
  });

  try {
    await app.listen({ host: '0.0.0.0', port: config.port });
    console.error(`[SSE] MCP server listening at http://localhost:${config.port}/mcp`);
    return {
      app,
      close: async () => app.close(),
    };
  } catch (error) {
    console.error('[SSE] Failed to start HTTP server:', error);
    throw error;
  }
};
