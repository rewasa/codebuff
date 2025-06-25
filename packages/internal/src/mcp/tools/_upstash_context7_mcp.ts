// Auto-generated from @upstash/context7-mcp
import { z } from 'zod';
import { mcpRegistry } from '../registry';
import { MCPTool } from '../types';



export const resolveLibraryIdTool: MCPTool = {
  definition: {
    name: 'resolve-library-id',
    description: `Resolves a package/product name to a Context7-compatible library ID and returns a list of matching libraries.

You MUST call this function before 'get-library-docs' to obtain a valid Context7-compatible library ID UNLESS the user explicitly provides a library ID in the format '/org/project' or '/org/project/version' in their query.

Selection Process:
1. Analyze the query to understand what library/package the user is looking for
2. Return the most relevant match based on:
- Name similarity to the query (exact matches prioritized)
- Description relevance to the query's intent
- Documentation coverage (prioritize libraries with higher Code Snippet counts)
- Trust score (consider libraries with scores of 7-10 more authoritative)

Response Format:
- Return the selected library ID in a clearly marked section
- Provide a brief explanation for why this library was chosen
- If multiple good matches exist, acknowledge this but proceed with the most relevant one
- If no good matches exist, clearly state this and suggest query refinements

For ambiguous queries, request clarification before proceeding with a best-guess match.`,
    parameters: z.object({
    libraryName: z.string().describe(`Library name to search for and retrieve a Context7-compatible library ID.`)
  }),
  },
  handler: async (args, context) => {
    // Execute via MCP package
    const { spawn } = await import('child_process');
    return new Promise((resolve, reject) => {
      const childProcess = spawn('npx', ['@upstash/context7-mcp'], {
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
          name: 'resolve-library-id',
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
mcpRegistry.register(resolveLibraryIdTool);


export const getLibraryDocsTool: MCPTool = {
  definition: {
    name: 'get-library-docs',
    description: `Fetches up-to-date documentation for a library. You must call 'resolve-library-id' first to obtain the exact Context7-compatible library ID required to use this tool, UNLESS the user explicitly provides a library ID in the format '/org/project' or '/org/project/version' in their query.`,
    parameters: z.object({
    context7CompatibleLibraryID: z.string().describe(`Exact Context7-compatible library ID (e.g., '/mongodb/docs', '/vercel/next.js', '/supabase/supabase', '/vercel/next.js/v14.3.0-canary.87') retrieved from 'resolve-library-id' or directly from user query in the format '/org/project' or '/org/project/version'.`),
    topic: z.string().describe(`Topic to focus documentation on (e.g., 'hooks', 'routing').`).optional(),
    tokens: z.number().describe(`Maximum number of tokens of documentation to retrieve (default: 10000). Higher values provide more context but consume more tokens.`).optional()
  }),
  },
  handler: async (args, context) => {
    // Execute via MCP package
    const { spawn } = await import('child_process');
    return new Promise((resolve, reject) => {
      const childProcess = spawn('npx', ['@upstash/context7-mcp'], {
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
          name: 'get-library-docs',
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
mcpRegistry.register(getLibraryDocsTool);


export const _upstash_context7_mcpTools = [resolveLibraryIdTool, getLibraryDocsTool];
