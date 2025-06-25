// Auto-generated from exa-mcp-server
import { z } from 'zod';
import { mcpRegistry } from '../registry';
import { MCPTool } from '../types';
import { env } from '../../env';

export const web_search_exaTool: MCPTool = {
  definition: {
    name: 'web_search_exa',
    description: `Search the web using Exa AI - performs real-time web searches and can scrape content from specific URLs. Supports configurable result counts and returns the content from the most relevant websites.`,
    parameters: z.object({
    query: z.string().describe(`Search query`),
    numResults: z.number().describe(`Number of search results to return (default: 5)`).optional()
  }),
  },
  handler: async (args, context) => {
    // Execute via MCP package
    const { spawn } = await import('child_process');
    return new Promise((resolve, reject) => {
      const childProcess = spawn('npx', ['exa-mcp-server'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, EXA_API_KEY: env.EXA_API_KEY },
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
          name: 'web_search_exa',
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
mcpRegistry.register(web_search_exaTool);

export const exa_mcp_serverTools = [web_search_exaTool];
