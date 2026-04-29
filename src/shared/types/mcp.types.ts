export interface TextContent {
  type: 'text';
  text: string;
}

export interface ToolResponse {
  content: TextContent[];
  isError?: boolean;
}

export type TransportMode = 'stdio' | 'sse';
