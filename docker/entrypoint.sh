#!/bin/sh
set -eu

if [ "$#" -gt 0 ]; then
  exec pw2c-mssql-server-mcp "$@"
fi

transport="${MCP_TRANSPORT:-sse}"
port="${MCP_PORT:-3000}"

case "$(printf '%s' "$transport" | tr '[:upper:]' '[:lower:]')" in
  stdio)
    exec pw2c-mssql-server-mcp --stdio
    ;;
  sse)
    exec pw2c-mssql-server-mcp --sse --port "$port"
    ;;
  *)
    echo "[entrypoint] Invalid MCP_TRANSPORT='$transport'. Use 'stdio' or 'sse'." >&2
    exit 1
    ;;
esac
