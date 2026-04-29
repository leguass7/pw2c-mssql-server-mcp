# pw2c-mssql-server-mcp

[![Publish](https://github.com/leguass7/pw2c-mssql-server-mcp/actions/workflows/publish.yml/badge.svg?branch=main)](https://github.com/leguass7/pw2c-mssql-server-mcp/actions/workflows/publish.yml) [![CI](https://github.com/leguass7/pw2c-mssql-server-mcp/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/leguass7/pw2c-mssql-server-mcp/actions/workflows/ci.yml) [![Coverage](https://codecov.io/gh/leguass7/pw2c-mssql-server-mcp/branch/main/graph/badge.svg)](https://codecov.io/gh/leguass7/pw2c-mssql-server-mcp)

English version: [README.en.md](README.en.md)

Servidor MCP para SQL Server (MSSQL) com suporte a `stdio` e `sse`, foco em TypeScript estrito e tools de query, metadata e gestao de conexoes.

## Inicio rapido

### 1) IDE via npm (`npx`, modo STDIO)

```json
{
  "mcpServers": {
    "mssql_npx_stdio": {
      "command": "npx",
      "args": ["-y", "pw2c-mssql-server-mcp", "--stdio"],
      "env": {
        "DATABASE_URL": "Server=host,1433;Database=db;User Id=user;Password=pass;Encrypt=true;TrustServerCertificate=true;",
        "MSSQL_MCP_TIMEOUT_MS": "90000",
        "MSSQL_MCP_CONNECT_TIMEOUT_MS": "15000"
      }
    }
  }
}
```

### 2) Docker publicado (modo SSE)

```bash
docker run --rm -p 3000:3000 \
  -e MCP_TRANSPORT=sse \
  -e MCP_PORT=3000 \
  -e MSSQL_MCP_API_KEY=change-me \
  -e MSSQL_MCP_CONNECTIONS_FILE=/data/connections.json \
  -e DATABASE_URL="Server=host,1433;Database=db;User Id=user;Password=pass;Encrypt=true;TrustServerCertificate=true;" \
  -v mcp_mssql_data:/data \
  ghcr.io/leguass7/pw2c-mssql-server-mcp:lts
```

Observacao: o volume persiste o CRUD de conexoes entre reinicios ou redeploys do container.

Cliente MCP (IDE/agente):

```json
{
  "mcpServers": {
    "mssql_docker_sse": {
      "url": "http://<host-ou-ip>:3000/mcp",
      "headers": {
        "X-API-Key": "change-me",
        "X-MCP-Timeout-Ms": "90000"
      }
    }
  }
}
```

### 3) Docker Compose minimo (VM)

```yaml
services:
  mcp-mssql:
    image: ghcr.io/leguass7/pw2c-mssql-server-mcp:lts
    container_name: mcp-mssql
    restart: unless-stopped
    environment:
      MCP_TRANSPORT: sse
      MCP_PORT: 3000
      MSSQL_MCP_API_KEY: change-me
      MSSQL_MCP_CONNECTIONS_FILE: /data/connections.json
      DATABASE_URL: 'Server=host,1433;Database=db;User Id=user;Password=pass;Encrypt=true;TrustServerCertificate=true;'
    volumes:
      - mcp_mssql_data:/data
    ports:
      - '3000:3000'

volumes:
  mcp_mssql_data:
```

Endpoint: `http://<ip-da-vm>:3000/mcp`

## Requisitos

- Node.js 20+
- pnpm

## Configuracao

1. Copie `.env.example` para `.env`.
2. Ajuste os valores conforme seu ambiente.

Variaveis principais:

- `DATABASE_URL` (opcional; semeia conexao `default`)
- `MSSQL_MCP_CONNECTION_STRING` (opcional; alias para conexao default)
- `MSSQL_MCP_API_KEY` (opcional no SSE; sem valor, SSE fica aberto)
- `MSSQL_MCP_TIMEOUT_MS` (opcional, default `60000`)
- `MSSQL_MCP_CONNECT_TIMEOUT_MS` (opcional, default `15000`)
- `PORT` (opcional, default `3000` no SSE)

## Execucao local

```bash
pnpm install
pnpm build
pnpm start
```

Modo explicito:

- STDIO: `node dist/index.js --stdio`
- SSE: `node dist/index.js --sse --port 3000`

## Tools MCP

Core:

- `mssql_initialize_connection`
- `mssql_execute_query`
- `mssql_get_table_metadata`
- `mssql_get_database_objects_metadata`
- `mssql_get_database_objects_by_type`

Conexoes (CRUD):

- `mssql_get_active_connection`
- `mssql_list_connections`
- `mssql_add_connection`
- `mssql_update_connection`
- `mssql_remove_connection`
- `mssql_test_connection`

Observacao: tools de query/metadata aceitam `connectionName?` e usam `default` por padrao.

## Desenvolvimento

- `pnpm dev`
- `pnpm lint`
- `pnpm test`
- `pnpm test:coverage`
- `pnpm test:e2e`
- `pnpm test:e2e:coverage`
- `pnpm build`
- `pnpm format`

## Troubleshooting rapido

- Sem conexao ativa: configure `DATABASE_URL` ou use `mssql_add_connection`.
- SSE com `401`: confira `X-API-Key` e `MSSQL_MCP_API_KEY`.
- Timeout em query: ajuste `X-MCP-Timeout-Ms` ou `MSSQL_MCP_TIMEOUT_MS`.
- Falha de conexao SQL: valide host/porta/credenciais/TLS da connection string.
