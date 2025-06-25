// Auto-generated from duckduckgo-mcp-server
import { z } from 'zod';
import { mcpRegistry } from '../registry';
import { MCPTool } from '../types';



export const duckduckgo_web_searchTool: MCPTool = {
  definition: {
    name: 'duckduckgo_web_search',
    description: `Performs a web search using the DuckDuckGo, ideal for general queries, news, articles, and online content. Use this for broad information gathering, recent events, or when you need diverse web sources. Supports content filtering and region-specific searches. Maximum 20 results per request.`,
    parameters: z.object({
    query: z.string().describe(`Search query (max 400 chars)`),
    count: z.number().describe(`Number of results (1-20, default 10)`).optional(),
    safeSearch: z.string().describe(`SafeSearch level (strict, moderate, off)`).optional()
  }),
  },
  handler: async (args, context) => {
    // Execute via MCP package
    const { spawn } = await import('child_process');
    return new Promise((resolve, reject) => {
      const childProcess = spawn('npx', ['duckduckgo-mcp-server'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        
      });

      let stdout = '';
      let stderr = '';

      childProcess.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      childProcess.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      childProcess.stdin.write(JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'duckduckgo_web_search',
          arguments: args
        }
      }) + '\n');
      childProcess.stdin.end();

      childProcess.on('close', (code: number | null) => {
        if (code === 0) {
          try {
            const response = JSON.parse(stdout);
            resolve(response.result);
          } catch (e) {
            reject(new Error(`Failed to parse tool response: ${e}`));
          }
        } else {
          reject(new Error(`Tool execution failed with code ${code}: ${stderr}`));
        }
      });
    });
  },
};

// Auto-register the tool
mcpRegistry.register(duckduckgo_web_searchTool);


export const duckduckgo_mcp_serverTools = [duckduckgo_web_searchTool];
