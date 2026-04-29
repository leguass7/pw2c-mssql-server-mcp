import { AppError } from '../shared/errors/AppError.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export const withErrorHandling = async <T>(action: () => Promise<T>): Promise<CallToolResult> => {
  try {
    const result = await action();
    return {
      content: [
        {
          type: 'text',
          text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof AppError ? error.statusCode : 500;

    console.error(`[MCP Tool Error] status=${status} message=${message}`);

    return {
      content: [
        {
          type: 'text',
          text: `Error: ${message}`,
        },
      ],
      isError: true,
    };
  }
};
