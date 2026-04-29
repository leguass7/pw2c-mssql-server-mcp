# pw2c-mssql-server-mcp

English version: `README.en.md`

Servidor MCP para SQL Server (MSSQL) em TypeScript, com foco em tipagem forte, arquitetura limpa e uso em agentes LLM via `stdio` e `sse`.

## 1) Abordagem e objetivo do projeto

### Objetivo
Fornecer um servidor MCP confiavel para que agentes e modelos LLM possam:

- validar conexao com SQL Server;
- executar consultas SQL;
- obter metadados de tabelas e objetos de banco;
- operar com timeout e autenticacao configurados pelo cliente.

### Abordagem tecnica
O projeto segue uma estrutura em camadas, separando transporte, protocolo MCP e regras de negocio:

- `src/transport`: inicializacao dos modos `stdio` e `sse`.
- `src/mcp`: registro de tools MCP e padronizacao de resposta/erro.
- `src/services`: logica de query e metadados.
- `src/infra/sql`: cliente MSSQL e conexao.
- `src/shared`: config, tipos e erros.

Diretrizes principais:

- TypeScript estrito (`strict`) e sem `any`.
- Tratamento centralizado de erros para retorno consistente ao cliente MCP.
- Fail-fast de configuracao (ex.: `DATABASE_URL` obrigatoria).
- Sem `console.log` para nao quebrar comunicacao via `stdio`.

## 2) Como utilizar

## Requisitos

- Node.js 20+
- `pnpm`

## Configuracao de ambiente

1. Copie `.env.example` para `.env`.
2. Ajuste os valores necessarios.

Variaveis principais:

- `DATABASE_URL` (opcional; quando definida, semeia automaticamente a conexao `default`)
- `MSSQL_MCP_CONNECTION_STRING` (opcional; alias de conexao default via env)
- `MSSQL_MCP_API_KEY` (opcional no modo `sse`; sem ela o servidor sobe aberto)
- `MSSQL_MCP_TIMEOUT_MS` (opcional, default `60000`)
- `MSSQL_MCP_CONNECT_TIMEOUT_MS` (opcional, default `15000`)
- `PORT` (opcional, default `3000` no `sse`)

## Instalar e buildar

```bash
pnpm install
pnpm build
```

## Executar

### Modo STDIO (default)

```bash
pnpm start
```

ou

```bash
node dist/index.js --stdio
```

### Modo SSE

```bash
node dist/index.js --sse --port 3000
```

Endpoint MCP: `http://localhost:3000/mcp`

Headers esperados no `sse`:

- `X-API-Key` (obrigatorio)
- `X-MCP-Timeout-Ms` (opcional)
- `X-MSSQL-Connection-String` (opcional; se enviado, o servidor cria/atualiza conexao automaticamente)
- `X-MSSQL-Connection-Name` (opcional; nome da conexao auto-registrada; sem ele usa nome deterministico)

Quando `X-MSSQL-Connection-String` (SSE) ou uma string de conexao via env (STDIO) e fornecida, o MCP assume automaticamente essa conexao para a requisicao atual e a persiste no registro de conexoes se ainda nao existir.

Se `MSSQL_MCP_API_KEY` nao for configurada, o servidor SSE opera em modo aberto (sem autenticacao por header).

## Tools disponiveis (MVP)

- `mssql_initialize_connection`
- `mssql_execute_query`
- `mssql_get_table_metadata` (`schema?`, `tableName?`)
- `mssql_get_database_objects_metadata` (`schema?`, `includeViews?`, `tableName?` quando `includeViews=false`)
- `mssql_get_database_objects_by_type` (`schema?`, `objectType?`, `tableName?` quando `objectType=TABLE`)

## Tools de conexao (CRUD completo)

- `mssql_get_active_connection` (`connectionName?`)
- `mssql_list_connections`
- `mssql_add_connection` (`name`, `connectionString`, `description?`)
- `mssql_update_connection` (`name`, `connectionString`, `description?`)
- `mssql_remove_connection` (`name`)
- `mssql_test_connection` (`connectionString`)

As tools de query/metadados aceitam `connectionName?` e usam `default` por padrao.

## 3) Exemplos de configuracao (genericos)

## 3.1 Agente MCP via STDIO (processo local)

```json
{
  "mcpServers": {
    "mssql_local": {
      "command": "node",
      "args": ["/caminho/absoluto/pw2c-mssql-server-mcp/dist/index.js", "--stdio"],
      "env": {
        "DATABASE_URL": "Server=host,1433;Database=db;User Id=user;Password=pass;Encrypt=true;TrustServerCertificate=true;",
        "MSSQL_MCP_TIMEOUT_MS": "90000",
        "MSSQL_MCP_CONNECT_TIMEOUT_MS": "15000"
      }
    }
  }
}
```

## 3.2 Agente MCP via SSE (servidor remoto/local)

```json
{
  "mcpServers": {
    "mssql_sse": {
      "url": "http://localhost:3000/mcp",
      "headers": {
        "X-API-Key": "SUA_API_KEY",
        "X-MCP-Timeout-Ms": "90000"
      }
    }
  }
}
```

## 3.3 Exemplo generico para IDE/cliente LLM

Use a mesma estrutura de `mcpServers` do seu cliente e adapte:

- `stdio`: comando + args + env.
- `sse`: URL + headers.

Se o cliente suportar varios perfis, mantenha dois perfis separados (`mssql_stdio` e `mssql_sse`) para facilitar troca rapida de ambiente.

## 4) Desenvolvimento local e contribuicao

## Scripts

- `pnpm dev`: desenvolvimento com watch
- `pnpm build`: build de producao
- `pnpm lint`: analise estatica
- `pnpm test`: testes unitarios
- `pnpm test:e2e`: testes fim a fim (inclui banco real via `.env`)
- `pnpm format`: formatacao
- `pnpm changeset`: cria uma entrada de versao SemVer
- `pnpm version-packages`: aplica versionamento/changelog a partir dos changesets
- `pnpm release`: publica pacote

## Fluxo recomendado para contribuir

1. Crie uma branch de trabalho.
2. Rode em modo dev:

```bash
pnpm dev
```

3. Antes de abrir PR/MR, valide tudo:

```bash
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```

4. Gere o changeset da sua alteracao:

```bash
pnpm changeset
```

## Testes locais

- Unitarios (`pnpm test`): validam logica isolada.
- E2E (`pnpm test:e2e`): validam
  - conectividade real com SQL Server (via `DATABASE_URL`);
  - autenticacao e transporte SSE;
  - fluxo de protocolo MCP (`initialize`, `tools/list`, `tools/call`).

Se nao quiser rodar testes E2E de banco em determinado ambiente, execute apenas `pnpm test`.

## Troubleshooting rapido

- **Erro de startup: `DATABASE_URL is required`**
  - Verifique se `.env` existe na raiz e contem `DATABASE_URL` valido.

- **Modo SSE retorna 401 Unauthorized**
  - Confirme o header `X-API-Key` no cliente e o valor de `MSSQL_MCP_API_KEY` no servidor.

- **Erro de timeout em queries**
  - Aumente `X-MCP-Timeout-Ms` (SSE) ou `MSSQL_MCP_TIMEOUT_MS` (STDIO).
  - Ajuste tambem `MSSQL_MCP_CONNECT_TIMEOUT_MS` para conexoes lentas.

- **Falha de conexao com SQL Server**
  - Valide host/porta, credenciais e flags de TLS em `DATABASE_URL`.
  - Em ambiente de homologacao, confirme acesso de rede/firewall ate o banco.

- **Cliente MCP em STDIO nao responde**
  - Garanta que nao exista `console.log` no fluxo de execucao.
  - Verifique caminho do binario (`dist/index.js`) e permissao de execucao.

## Diagnostico rapido

Use estes comandos para validar rapidamente o ambiente local:

```bash
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
node dist/index.js --sse --port 3000
```

Interpretacao rapida:

- Se `pnpm test` falhar: problema de logica/unitario.
- Se `pnpm test:e2e` falhar: problema de ambiente, conexao SQL ou configuracao de transporte.
- Se `node dist/index.js --sse --port 3000` falhar no startup: revisar `.env` e variaveis obrigatorias.
