# pw2c-mssql-server-mcp

Portuguese version: `README.md`

MCP server for SQL Server (MSSQL), built with TypeScript, focused on strong typing, clean architecture, and practical usage with LLM agents over `stdio` and `sse`.

## 1) Project goal and approach

### Goal
Provide a reliable MCP server so agents and LLM-powered tools can:

- validate SQL Server connectivity;
- execute SQL queries;
- fetch table and database object metadata;
- run with client-driven timeout and authentication controls.

### Technical approach
The project is organized in clear layers:

- `src/transport`: `stdio` and `sse` startup/transport handling.
- `src/mcp`: MCP tool registration and unified tool responses.
- `src/services`: query and metadata business logic.
- `src/infra/sql`: MSSQL client and connection handling.
- `src/shared`: config, types, and error classes.

Core principles:

- strict TypeScript (`strict`) and no `any`.
- centralized error handling for consistent MCP tool errors.
- fail-fast configuration validation.
- no `console.log` in runtime paths (important for `stdio` MCP protocol integrity).

## 2) How to use

## Requirements

- Node.js 20+
- `pnpm`

## Environment setup

1. Copy `.env.example` to `.env`.
2. Set required values.

Main variables:

- `DATABASE_URL` (optional; when provided, it auto-seeds the `default` connection)
- `MSSQL_MCP_CONNECTION_STRING` (optional; default connection alias via env)
- `MSSQL_MCP_API_KEY` (optional in `sse`; when omitted, server runs open)
- `MSSQL_MCP_TIMEOUT_MS` (optional, default `60000`)
- `MSSQL_MCP_CONNECT_TIMEOUT_MS` (optional, default `15000`)
- `PORT` (optional, default `3000` for `sse`)

## Install and build

```bash
pnpm install
pnpm build
```

## Run

### STDIO mode (default)

```bash
pnpm start
```

or

```bash
node dist/index.js --stdio
```

### SSE mode

```bash
node dist/index.js --sse --port 3000
```

MCP endpoint: `http://localhost:3000/mcp`

Expected headers in `sse` mode:

- `X-API-Key` (required)
- `X-MCP-Timeout-Ms` (optional)
- `X-MSSQL-Connection-String` (optional; if provided, server auto-creates/updates a connection)
- `X-MSSQL-Connection-Name` (optional; name for the auto-registered connection; deterministic name otherwise)

When `X-MSSQL-Connection-String` (SSE) or a connection string from env (STDIO) is provided, the MCP automatically assumes that connection for the current request and persists it in the connection registry if missing.

If `MSSQL_MCP_API_KEY` is not configured, SSE runs in open mode (no header auth required).

## Available MVP tools

- `mssql_initialize_connection`
- `mssql_execute_query`
- `mssql_get_table_metadata` (`schema?`, `tableName?`)
- `mssql_get_database_objects_metadata` (`schema?`, `includeViews?`, `tableName?` when `includeViews=false`)
- `mssql_get_database_objects_by_type` (`schema?`, `objectType?`, `tableName?` when `objectType=TABLE`)

## Connection tools (full CRUD)

- `mssql_get_active_connection` (`connectionName?`)
- `mssql_list_connections`
- `mssql_add_connection` (`name`, `connectionString`, `description?`)
- `mssql_update_connection` (`name`, `connectionString`, `description?`)
- `mssql_remove_connection` (`name`)
- `mssql_test_connection` (`connectionString`)

Query/metadata tools also accept `connectionName?` and use `default` by default.

## 3) Generic configuration examples (agents, IDEs, LLM clients)

## 3.1 Local process MCP agent (STDIO)

```json
{
  "mcpServers": {
    "mssql_local": {
      "command": "node",
      "args": ["/absolute/path/to/pw2c-mssql-server-mcp/dist/index.js", "--stdio"],
      "env": {
        "DATABASE_URL": "Server=host,1433;Database=db;User Id=user;Password=pass;Encrypt=true;TrustServerCertificate=true;",
        "MSSQL_MCP_TIMEOUT_MS": "90000",
        "MSSQL_MCP_CONNECT_TIMEOUT_MS": "15000"
      }
    }
  }
}
```

## 3.2 Remote/local MCP agent over SSE

```json
{
  "mcpServers": {
    "mssql_sse": {
      "url": "http://localhost:3000/mcp",
      "headers": {
        "X-API-Key": "YOUR_API_KEY",
        "X-MCP-Timeout-Ms": "90000"
      }
    }
  }
}
```

## 3.3 Generic IDE / LLM client guidance

Use your client's MCP server configuration section and choose one profile:

- `stdio`: command + args + env.
- `sse`: URL + headers.

If your tool supports multiple profiles, keep both (`mssql_stdio` and `mssql_sse`) for fast environment switching.

## 4) Local development and contribution

## Scripts

- `pnpm dev`: watch mode for development
- `pnpm build`: production build
- `pnpm lint`: static checks
- `pnpm test`: unit tests
- `pnpm test:e2e`: end-to-end tests (includes real DB path through `.env`)
- `pnpm format`: formatting
- `pnpm changeset`: create a SemVer version entry
- `pnpm version-packages`: apply versions/changelog from pending changesets
- `pnpm release`: publish package

## Recommended contribution flow

1. Create a feature branch.
2. Run in dev mode:

```bash
pnpm dev
```

3. Before opening a PR/MR, run:

```bash
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```

4. Generate a changeset for your change:

```bash
pnpm changeset
```

## Local tests

- Unit tests (`pnpm test`): isolated logic validation.
- E2E tests (`pnpm test:e2e`): validate
  - real SQL Server connectivity via `DATABASE_URL`;
  - SSE authentication and transport behavior;
  - MCP protocol flow (`initialize`, `tools/list`, `tools/call`).

If you do not want to run real DB E2E in a specific environment, run only `pnpm test`.

## Quick troubleshooting

- **Startup error: `DATABASE_URL is required`**
  - Ensure `.env` exists at project root and includes a valid `DATABASE_URL`.

- **SSE mode returns 401 Unauthorized**
  - Verify `X-API-Key` in the client request and `MSSQL_MCP_API_KEY` on the server.

- **Query timeout errors**
  - Increase `X-MCP-Timeout-Ms` (SSE) or `MSSQL_MCP_TIMEOUT_MS` (STDIO).
  - Also tune `MSSQL_MCP_CONNECT_TIMEOUT_MS` for slow connection establishment.

- **SQL Server connection failure**
  - Validate host/port, credentials, and TLS flags in `DATABASE_URL`.
  - In staging environments, confirm network/firewall access to the database.

- **STDIO MCP client not responding**
  - Ensure there is no `console.log` in runtime paths.
  - Verify binary path (`dist/index.js`) and execution permissions.

## Quick diagnostics

Use these commands to validate your local setup quickly:

```bash
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
node dist/index.js --sse --port 3000
```

Quick interpretation:

- If `pnpm test` fails: likely unit/business-logic issue.
- If `pnpm test:e2e` fails: likely environment, SQL connectivity, or transport configuration issue.
- If `node dist/index.js --sse --port 3000` fails at startup: review `.env` and required variables.
