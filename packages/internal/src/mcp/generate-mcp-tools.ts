#!/usr/bin/env bun

import { spawn, ChildProcess } from 'child_process';
import { writeFileSync, readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
}

interface MCPPackageInfo {
  name: string;
  requiredEnvVars: string[];
}

async function detectRequiredEnvVars(packageName: string): Promise<string[]> {
  console.log(`Detecting required environment variables for ${packageName}...`);
  
  return new Promise((resolve) => {
    const childProcess: ChildProcess = spawn('npx', [packageName], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { NODE_ENV: 'development' }, // Minimal environment to trigger errors
    });

    let stderr = '';

    childProcess.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    // Send a quick message to trigger any env var checks
    const message = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list'
    }) + '\n';
    
    childProcess.stdin?.write(message);
    childProcess.stdin?.end();
    
    const timeoutId = setTimeout(() => {
      childProcess.kill('SIGTERM');
    }, 10000); // 10 second timeout for detection
    
    childProcess.on('close', () => {
      clearTimeout(timeoutId);
      
      // Parse stderr for common environment variable patterns
      const envVars: string[] = [];
      
      // Common patterns for missing API keys
      const patterns = [
        /([A-Z_]+_API_KEY)\s+environment\s+variable\s+is\s+required/gi,
        /EXA_API_KEY/gi,
        /OPENAI_API_KEY/gi,
        /ANTHROPIC_API_KEY/gi,
        /GOOGLE_API_KEY/gi,
        /GEMINI_API_KEY/gi,
        /Missing.*?([A-Z_]+_API_KEY)/gi,
        /Required.*?([A-Z_]+_API_KEY)/gi,
        /Environment variable.*?([A-Z_]+_API_KEY)/gi,
      ];
      
      for (const pattern of patterns) {
        const matches = stderr.matchAll(pattern);
        for (const match of matches) {
          const envVar = match[1] || match[0];
          if (envVar && !envVars.includes(envVar)) {
            envVars.push(envVar);
          }
        }
      }
      
      console.log(`[${packageName}] Detected required env vars:`, envVars);
      resolve(envVars);
    });

    childProcess.on('error', () => {
      clearTimeout(timeoutId);
      resolve([]); // If package fails to run, assume no special env vars needed
    });
  });
}

async function discoverMCPTools(packageInfo: MCPPackageInfo): Promise<MCPTool[]> {
  console.log(`Starting discovery for ${packageInfo.name}...`);
  
  return new Promise((resolve, reject) => {
    console.log(`Spawning process: npx ${packageInfo.name}`);
    
    // Set up environment with detected required variables
    const envVars = { ...process.env };
    for (const envVar of packageInfo.requiredEnvVars) {
      if (!envVars[envVar]) {
        envVars[envVar] = 'dummy-key-for-discovery';
      }
    }
    
    const childProcess: ChildProcess = spawn('npx', [packageInfo.name], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: envVars,
    });

    let stdout = '';
    let stderr = '';

    childProcess.stdout?.on('data', (data: Buffer) => {
      const chunk = data.toString();
      console.log(`[${packageInfo.name}] stdout:`, chunk);
      stdout += chunk;
    });

    childProcess.stderr?.on('data', (data: Buffer) => {
      const chunk = data.toString();
      console.log(`[${packageInfo.name}] stderr:`, chunk);
      stderr += chunk;
    });

    // Send MCP protocol message to discover tools
    const message = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list'
    }) + '\n';
    
    console.log(`[${packageInfo.name}] Sending message:`, message);
    childProcess.stdin?.write(message);
    childProcess.stdin?.end(); // Signal end of input
    
    // Add timeout to prevent hanging
    const timeoutId = setTimeout(() => {
      console.log(`[${packageInfo.name}] Timeout reached, killing process`);
      childProcess.kill('SIGTERM');
      reject(new Error(`Timeout discovering tools for ${packageInfo.name}`));
    }, 30000); // 30 second timeout
    
    // Clear timeout when process closes
    childProcess.on('close', (code: number | null) => {
      clearTimeout(timeoutId);
      console.log(`[${packageInfo.name}] Process closed with code:`, code);
      console.log(`[${packageInfo.name}] Final stdout:`, stdout);
      console.log(`[${packageInfo.name}] Final stderr:`, stderr);
      
      if (code === 0 || code === null) { // null means killed by signal
        try {
          // Parse MCP response to extract tools
          const response = JSON.parse(stdout);
          console.log(`[${packageInfo.name}] Parsed response:`, response);
          resolve(response.result?.tools || []);
        } catch (e) {
          console.error(`[${packageInfo.name}] Failed to parse response:`, e);
          reject(new Error(`Failed to parse MCP response: ${e}`));
        }
      } else {
        console.error(`[${packageInfo.name}] Process failed with code ${code}`);
        reject(new Error(`MCP package exited with code ${code}: ${stderr}`));
      }
    });

    childProcess.on('error', (error) => {
      console.error(`[${packageInfo.name}] Process error:`, error);
      reject(error);
    });
  });
}

function toCamelCase(str: string): string {
  return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function generateToolFile(packageInfo: MCPPackageInfo, tools: MCPTool[]): string {
  const safeName = packageInfo.name.replace(/[@\/\-]/g, '_');
  const needsEnvVars = packageInfo.requiredEnvVars.length > 0;

  return `// Auto-generated from ${packageInfo.name}
import { z } from 'zod';
import { mcpRegistry } from '../registry';
import { MCPTool } from '../types';
${needsEnvVars ? "import { env } from '../../env';" : ''}

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
      const childProcess = spawn('npx', ['${packageInfo.name}'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        ${needsEnvVars ? `env: { ...process.env, ${packageInfo.requiredEnvVars.map(envVar => `${envVar}: env.${envVar}`).join(', ')} },` : ''}
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
          name: '${tool.name}',
          arguments: args
        }
      }) + '\\n');
      childProcess.stdin.end();

      childProcess.on('close', (code: number | null) => {
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
        let zodType = 'z.any()';
        
        if (prop.type === 'string') {
          zodType = 'z.string()';
          if (prop.minLength) zodType += `.min(${prop.minLength})`;
          if (prop.maxLength) zodType += `.max(${prop.maxLength})`;
          if (prop.enum) zodType = `z.enum([${prop.enum.map((v: string) => `"${v}"`).join(', ')}])`;
        } else if (prop.type === 'number') {
          zodType = 'z.number()';
          if (prop.minimum !== undefined) zodType += `.min(${prop.minimum})`;
          if (prop.maximum !== undefined) zodType += `.max(${prop.maximum})`;
        } else if (prop.type === 'boolean') {
          zodType = 'z.boolean()';
        }
        
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
    .filter(pkg => pkg.includes('mcp'));

  const toolFiles: string[] = [];

  // Ensure tools directory exists
  mkdirSync('src/mcp/tools', { recursive: true });

  for (const packageName of mcpPackages) {
    try {
      console.log(`Processing ${packageName}...`);
      
      // First detect required environment variables
      const requiredEnvVars = await detectRequiredEnvVars(packageName);
      
      const packageInfo: MCPPackageInfo = {
        name: packageName,
        requiredEnvVars
      };
      
      // Then discover tools with proper environment
      const tools = await discoverMCPTools(packageInfo);

      if (tools.length > 0) {
        const safeName = packageName.replace(/[@\/\-]/g, '_');
        const toolFile = generateToolFile(packageInfo, tools);

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
