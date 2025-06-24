import { z } from 'zod';

export interface MCPToolDefinition {
  name: string;
  description: string;
  parameters: z.ZodSchema<any>;
}

export interface MCPToolHandler {
  (args: any, context?: MCPToolContext): Promise<string | object>;
}

export interface MCPToolContext {
  projectRoot?: string;
  userId?: string;
}

export interface MCPTool {
  definition: MCPToolDefinition;
  handler: MCPToolHandler;
}
