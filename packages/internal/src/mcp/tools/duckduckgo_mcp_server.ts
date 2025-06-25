// Auto-generated from duckduckgo-mcp-server
import { z } from 'zod';
import { mcpRegistry } from '../registry';
import { MCPTool } from '../types';
import { spawn, ChildProcess } from 'child_process';

// Persistent server instance
let serverProcess: ChildProcess | null = null;
let serverReady = false;
let pendingRequests = new Map<number, { resolve: Function, reject: Function }>();
let requestId = 0;

async function ensureServerRunning(): Promise<void> {
  if (serverProcess && serverReady) return;

  return new Promise((resolve, reject) => {
    serverProcess = spawn('uvx', ['duckduckgo-mcp-server'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PATH: `${process.env.HOME}/.local/bin:${process.env.PATH}` },
    });

    let stdout = '';
    
    serverProcess.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
      
      // Handle responses
      const lines = stdout.split('\n').filter(line => line.trim());
      for (const line of lines) {
        try {
          const response = JSON.parse(line);
          if (response.id === 0 && response.result && !serverReady) {
            serverReady = true;
            resolve();
          } else if (response.id > 0) {
            const pending = pendingRequests.get(response.id);
            if (pending) {
              pendingRequests.delete(response.id);
              if (response.result) {
                pending.resolve(response.result);
              } else if (response.error) {
                pending.reject(new Error(`MCP Server Error: ${response.error.message}`));
              }
            }
          }
        } catch (e) {
          // Ignore parse errors for partial JSON
        }
      }
      
      // Clear processed lines
      const lastNewline = stdout.lastIndexOf('\n');
      if (lastNewline > -1) {
        stdout = stdout.substring(lastNewline + 1);
      }
    });

    serverProcess.stderr?.on('data', (data: Buffer) => {
      console.error('DuckDuckGo server stderr:', data.toString());
    });

    serverProcess.on('close', () => {
      serverProcess = null;
      serverReady = false;
      // Reject all pending requests
      for (const [id, { reject }] of pendingRequests) {
        reject(new Error('Server process closed'));
      }
      pendingRequests.clear();
    });

    // Initialize server
    serverProcess.stdin?.write(JSON.stringify({
      jsonrpc: '2.0',
      id: 0,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'codebuff', version: '1.0.0' }
      }
    }) + '\n');

    // Timeout
    setTimeout(() => {
      if (!serverReady) {
        reject(new Error('Server initialization timeout'));
      }
    }, 5000);
  });
}

export const duckduckgo_web_searchTool: MCPTool = {
  definition: {
    name: 'duckduckgo_web_search',
    description: `Performs a web search using the DuckDuckGo, ideal for general queries, news, articles, and online content. Use this for broad information gathering, recent events, or when you need diverse web sources. Supports content filtering and region-specific searches. Maximum 20 results per request.`,
    parameters: z.object({
    query: z.string().max(400).describe(`Search query (max 400 chars)`),
    count: z.number().min(1).max(20).describe(`Number of results (1-20, default 10)`).optional(),
    safeSearch: z.enum(["strict", "moderate", "off"]).describe(`SafeSearch level (strict, moderate, off)`).optional()
  }),
  },
  handler: async (args, context) => {
    await ensureServerRunning();
    
    return new Promise((resolve, reject) => {
      const id = ++requestId;
      pendingRequests.set(id, { resolve, reject });
      
      serverProcess?.stdin?.write(JSON.stringify({
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params: {
          name: 'search',
          arguments: { 
            query: args.query,
            max_results: args.count || 10
          }
        }
      }) + '\n');
      
      // Timeout individual requests
      setTimeout(() => {
        if (pendingRequests.has(id)) {
          pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 10000);
    });
  },
};

// Auto-register the tool
mcpRegistry.register(duckduckgo_web_searchTool);

export const duckduckgo_mcp_serverTools = [duckduckgo_web_searchTool];
