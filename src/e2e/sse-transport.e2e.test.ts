import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMcpRuntime } from '../mcp/server.js';
import { startSseServer, type SseServerHandle } from '../transport/sse.js';
import type { ServerConfig } from '../shared/config.js';

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

describe('SSE transport auth e2e', () => {
  const apiKey = 'test-e2e-api-key';
  let baseUrl = '';
  let runtime: ReturnType<typeof createMcpRuntime> | null = null;
  let serverHandle: SseServerHandle | null = null;
  const tempConnectionsFile = join(process.cwd(), 'data', `connections.sse-auth.${randomUUID()}.json`);

  beforeAll(async () => {
    const port = await getFreePort();
    baseUrl = `http://127.0.0.1:${port}/mcp`;

    const config: ServerConfig = {
      databaseUrl:
        process.env.DATABASE_URL ??
        'Server=localhost,1433;Database=master;User Id=sa;Password=invalid;Encrypt=true;TrustServerCertificate=true;',
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

  it('rejects requests without API key', async () => {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(10_000),
    });

    expect(response.status).toBe(401);
  });

  it('rejects requests with invalid API key', async () => {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': 'wrong-key',
      },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(10_000),
    });

    expect(response.status).toBe(401);
  });

  it('accepts authenticated requests and delegates protocol handling', async () => {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'x-mcp-timeout-ms': '90000',
      },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(10_000),
    });

    expect(response.status).not.toBe(401);
  });
});

describe('SSE transport open mode e2e', () => {
  let baseUrl = '';
  let runtime: ReturnType<typeof createMcpRuntime> | null = null;
  let serverHandle: SseServerHandle | null = null;
  const tempConnectionsFile = join(process.cwd(), 'data', `connections.sse-open.${randomUUID()}.json`);

  beforeAll(async () => {
    const port = await getFreePort();
    baseUrl = `http://127.0.0.1:${port}/mcp`;

    const config: ServerConfig = {
      databaseUrl: process.env.DATABASE_URL,
      apiKey: undefined,
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

  it('accepts requests without API key when server is open', async () => {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(10_000),
    });

    expect(response.status).not.toBe(401);
  });
});
