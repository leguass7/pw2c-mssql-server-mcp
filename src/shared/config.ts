import type { TransportMode } from './types/mcp.types.js';

export interface ServerConfig {
  databaseUrl?: string;
  apiKey?: string;
  mode: TransportMode;
  port: number;
  connectionsFilePath: string;
  timeoutMs: number;
  connectTimeoutMs: number;
  maxTimeoutMs: number;
  minTimeoutMs: number;
}

interface RuntimeOptions {
  mode: TransportMode;
  cliPort?: number;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_CONNECT_TIMEOUT_MS = 15_000;
const DEFAULT_MIN_TIMEOUT_MS = 1_000;
const DEFAULT_MAX_TIMEOUT_MS = 300_000;

const parseNumber = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return parsed;
};

export const buildConfig = (options: RuntimeOptions): ServerConfig => {
  const {
    DATABASE_URL,
    MSSQL_MCP_CONNECTION_STRING,
    MSSQL_MCP_API_KEY,
    PORT,
    MSSQL_MCP_TIMEOUT_MS,
    MSSQL_MCP_CONNECT_TIMEOUT_MS,
    MSSQL_MCP_CONNECTIONS_FILE,
  } = process.env;

  const timeoutMs = parseNumber(MSSQL_MCP_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const connectTimeoutMs = parseNumber(MSSQL_MCP_CONNECT_TIMEOUT_MS, DEFAULT_CONNECT_TIMEOUT_MS);

  const minTimeoutMs = DEFAULT_MIN_TIMEOUT_MS;
  const maxTimeoutMs = DEFAULT_MAX_TIMEOUT_MS;

  const boundedTimeoutMs = Math.min(maxTimeoutMs, Math.max(minTimeoutMs, timeoutMs));
  const boundedConnectTimeoutMs = Math.min(maxTimeoutMs, Math.max(minTimeoutMs, connectTimeoutMs));

  const portFromEnv = parseNumber(PORT, 3000);

  return {
    databaseUrl: DATABASE_URL ?? MSSQL_MCP_CONNECTION_STRING,
    apiKey: MSSQL_MCP_API_KEY,
    mode: options.mode,
    port: options.cliPort ?? portFromEnv,
    connectionsFilePath: MSSQL_MCP_CONNECTIONS_FILE ?? './data/connections.json',
    timeoutMs: boundedTimeoutMs,
    connectTimeoutMs: boundedConnectTimeoutMs,
    maxTimeoutMs,
    minTimeoutMs,
  };
};

export const resolveTimeoutMs = (
  defaultTimeoutMs: number,
  bounds: { min: number; max: number },
  candidate?: number
): number => {
  const raw = candidate ?? defaultTimeoutMs;
  return Math.min(bounds.max, Math.max(bounds.min, raw));
};
