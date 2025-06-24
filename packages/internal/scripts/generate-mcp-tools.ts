#!/usr/bin/env bun

import { spawn } from 'child_process';
import { writeFileSync, readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
}

async function discoverMCPTools(packageName: string): Promise<MCPTool[]> {
  console.log(`Starting discovery for ${packageName}...`);
  
  return new Promise((resolve, reject) => {
    console.log(`Spawning process: npx ${packageName}`);
    const process = spawn('npx', [packageName], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => {
      const chunk = data.toString();
      console.log(`[${packageName}] stdout:`, chunk);
      stdout += chunk;
    });

    process.stderr.on('data', (data) => {
      const chunk = data.toString();
      console.log(`[${packageName}] stderr:`, chunk);
      stderr += chunk;
    });

    // Send MCP protocol message to discover tools
    const message = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list'
    }) + '\n';
    
    console.log(`[${packageName}] Sending message:`, message);
    process.stdin.write(message);
    process.stdin.end(); // Signal end of input
    
    // Add timeout to prevent hanging
    const timeoutId = setTimeout(() => {
      console.log(`[${packageName}] Timeout reached, killing process`);
      process.kill('SIGTERM');
      reject(new Error(`Timeout discovering tools for ${packageName}`));
    }, 30000); // 30 second timeout
    
    // Clear timeout when process closes
    process.on('close', (code) => {
      clearTimeout(timeoutId);
      console.log(`[${packageName}] Process closed with code:`, code);
      console.log(`[${packageName}] Final stdout:`, stdout);
      console.log(`[${packageName}] Final stderr:`, stderr);
      
      if (code === 0 || code === null) { // null means killed by signal
        try {
          // Parse MCP response to extract tools
          const response = JSON.parse(stdout);
          console.log(`[${packageName}] Parsed response:`, response);
          resolve(response.result?.tools || []);
        } catch (e) {
          console.error(`[${packageName}] Failed to parse response:`, e);
          reject(new Error(`Failed to parse MCP response: ${e}`));
        }
      } else {
        console.error(`[${packageName}] Process failed with code ${code}`);
        reject(new Error(`MCP package exited with code ${code}: ${stderr}`));
      }
    });

    process.on('error', (error) => {
      console.error(`[${packageName}] Process error:`, error);
      reject(error);
    });
  });
}

function toCamelCase(str: string): string {
  return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function generateToolFile(packageName: string, tools: MCPTool[]): string {
  const safeName = packageName.replace(/[@\/\-]/g, '_');

  return `// Auto-generated from ${packageName}
import { z } from 'zod';
import { mcpRegistry } from '../registry';
import { MCPTool } from '../types';

${tools.map(tool => {
  const camelCaseName = toCamelCase(tool.name);
  
  return `
export const ${camelCaseName}Tool: MCPTool = {
  definition: {
    name: '${tool.name}',
    description: \`${tool.description.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`,
    parameters: ${generateZodSchema(tool.inputSchema)},
  },
  handler: async (args, context) => {
    // Execute via MCP package
    const { spawn } = await import('child_process');
    return new Promise((resolve, reject) => {
      const process = spawn('npx', ['${packageName}'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.stdin.write(JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: '${tool.name}',
          arguments: args
        }
      }) + '\\n');
      process.stdin.end();

      process.on('close', (code) => {
        if (code === 0) {
          try {
            const response = JSON.parse(stdout);
            resolve(response.result);
          } catch (e) {
            reject(new Error(\`Failed to parse tool response: \${e}\`));
          }
        } else {
          reject(new Error(\`Tool execution failed with code \${code}: \${stderr}\`));
        }
      });
    });
  },
};

// Auto-register the tool
mcpRegistry.register(${camelCaseName}Tool);
`;
}).join('\n')}

export const ${safeName}Tools = [${tools.map(tool => `${toCamelCase(tool.name)}Tool`).join(', ')}];
`;
}

function generateZodSchema(schema: any): string {
  // Simplified JSON Schema to Zod conversion
  if (schema.type === 'object') {
    const properties = Object.entries(schema.properties || {})
      .map(([key, prop]: [string, any]) => {
        const zodType = prop.type === 'string' ? 'z.string()' :
                       prop.type === 'number' ? 'z.number()' :
                       prop.type === 'boolean' ? 'z.boolean()' : 'z.any()';
        const description = prop.description ? `.describe(\`${prop.description.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`)` : '';
        const optional = !schema.required?.includes(key) ? '.optional()' : '';
        return `${key}: ${zodType}${description}${optional}`;
      })
      .join(',\n    ');

    return `z.object({\n    ${properties}\n  })`;
  }
  return 'z.any()';
}

async function main() {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf-8'));
  const mcpPackages = Object.keys(packageJson.dependencies || {})
    .filter(pkg => pkg.includes('mcp') || pkg.includes('context7'));

  const toolFiles: string[] = [];

  // Ensure tools directory exists
  mkdirSync('src/mcp/tools', { recursive: true });

  for (const packageName of mcpPackages) {
    try {
      console.log(`Discovering tools from ${packageName}...`);
      const tools = await discoverMCPTools(packageName);

      if (tools.length > 0) {
        const safeName = packageName.replace(/[@\/\-]/g, '_');
        const toolFile = generateToolFile(packageName, tools);

        writeFileSync(`src/mcp/tools/${safeName}.ts`, toolFile);
        toolFiles.push(safeName);

        console.log(`Generated ${tools.length} tools from ${packageName}`);
      }
    } catch (error) {
      console.warn(`Failed to process ${packageName}:`, error);
    }
  }

  // Generate barrel file
  const barrelContent = `// Auto-generated barrel file for MCP tools
${toolFiles.map(file => `export * from './${file}';`).join('\n')}
`;

  writeFileSync('src/mcp/tools/index.ts', barrelContent);
  console.log(`Generated tools index with ${toolFiles.length} packages`);
}

main().catch(console.error);
