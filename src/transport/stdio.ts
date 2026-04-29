import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export const startStdioServer = async (server: McpServer): Promise<void> => {
  const transport = new StdioServerTransport();

  try {
    await server.connect(transport);
    console.error('[STDIO] MCP server started.');
  } catch (error) {
    console.error('[STDIO] Failed to start MCP server:', error);
    process.exit(1);
  }
};
