#!/usr/bin/env node
import 'dotenv/config';

import { buildConfig } from './shared/config.js';
import type { TransportMode } from './shared/types/mcp.types.js';
import { createMcpRuntime } from './mcp/server.js';
import { startSseServer } from './transport/sse.js';
import { startStdioServer } from './transport/stdio.js';

interface CliArgs {
  mode: TransportMode;
  port?: number;
}

const parseArgs = (argv: string[]): CliArgs => {
  const args = argv.slice(2);
  const mode: TransportMode = args.includes('--sse') ? 'sse' : 'stdio';
  const portFlagIndex = args.findIndex((arg) => arg === '--port');

  if (portFlagIndex >= 0) {
    const portValue = args[portFlagIndex + 1];
    const parsedPort = Number.parseInt(portValue ?? '', 10);
    if (!Number.isNaN(parsedPort)) {
      return { mode, port: parsedPort };
    }
  }

  return { mode };
};

async function main(): Promise<void> {
  try {
    const cliArgs = parseArgs(process.argv);
    const config = buildConfig({ mode: cliArgs.mode, cliPort: cliArgs.port });

    const runtime = createMcpRuntime(config);
    let closeSseServer: (() => Promise<void>) | undefined;

    if (config.mode === 'sse') {
      const sseServerHandle = await startSseServer(runtime.server, config);
      closeSseServer = sseServerHandle.close;
    } else {
      await startStdioServer(runtime.server);
    }

    const shutdown = async () => {
      if (closeSseServer) {
        await closeSseServer();
      }
      await runtime.close();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    console.error('[FATAL] Failed to start MCP MSSQL server:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('[FATAL] Unhandled startup error:', error);
  process.exit(1);
});
