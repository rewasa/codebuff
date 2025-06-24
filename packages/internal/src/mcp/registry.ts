import { MCPTool, MCPToolDefinition } from './types';

export class MCPToolRegistry {
  private tools = new Map<string, MCPTool>();

  register(tool: MCPTool) {
    this.tools.set(tool.definition.name, tool);
  }

  unregister(name: string) {
    this.tools.delete(name);
  }

  getTool(name: string): MCPTool | undefined {
    return this.tools.get(name);
  }

  getAllTools(): MCPTool[] {
    return Array.from(this.tools.values());
  }

  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  getToolDefinitions(): MCPToolDefinition[] {
    return this.getAllTools().map(tool => tool.definition);
  }
}

export const mcpRegistry = new MCPToolRegistry();
