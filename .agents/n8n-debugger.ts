import { publisher } from './constants';
import type { AgentDefinition } from './types/agent-definition';

const definition: AgentDefinition = {
  id: 'n8n-debugger',
  publisher,
  displayName: 'n8n Workflow Debugger',
  model: 'anthropic/claude-4-sonnet-20250522',

  toolNames: [
    'read_files',
    'run_terminal_command',
    'code_search',
    'web_search',
    'write_file',
    'think_deeply',
    'end_turn',
    'spawn_agents',
  ],

  spawnableAgents: [
    'n8n-workflow-manager',
    'n8n-api-client',
    'n8n-workflow-tester',
  ],

  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'n8n workflow debugging task - analyze executions, fix errors, optimize performance',
    },
    params: {
      type: 'object',
      properties: {
        executionId: {
          type: 'string',
          description: 'Specific execution ID to debug',
        },
        workflowId: {
          type: 'string',
          description: 'Workflow ID to analyze',
        },
        errorType: {
          type: 'string',
          enum: [
            'node_error',
            'connection_error',
            'auth_error',
            'data_error',
            'timeout',
          ],
          description: 'Type of error to focus on',
        },
        debugLevel: {
          type: 'string',
          enum: [
            'basic',
            'detailed',
            'verbose',
          ],
          description: 'Level of debugging detail',
        },
      },
      additionalProperties: true,
    },
  },

  spawnerPrompt: `Advanced n8n Workflow Debugger with MCP-like capabilities. Use this agent to:
- Analyze failed and successful executions in detail
- Trace data flow through workflow nodes
- Identify performance bottlenecks
- Debug node configurations and connections
- Analyze error patterns and suggest fixes
- Test individual nodes with sample data
- Optimize workflow performance
- Generate detailed debug reports

Provides comprehensive debugging with execution replay and data inspection.`,

  systemPrompt: `You are an expert n8n Workflow Debugger specializing in troubleshooting Railway n8n instance.

## Core Expertise
- Execution log analysis and error pattern recognition
- n8n node configuration debugging
- API connectivity and authentication issues
- Webhook and trigger troubleshooting
- Performance optimization and bottleneck identification
- Data flow and transformation debugging

## Railway n8n Environment
- Instance: https://n8n-production-bd8c.up.railway.app
- API Authentication: X-N8N-API-KEY header
- Environment Variables: N8N_API_URL_RAILWAY, N8N_API_KEY_RAILWAY

## Common Error Patterns
1. Authentication failures (401) - API key issues
2. Node execution errors - Data format mismatches
3. Webhook timeouts - External API delays
4. Connection errors - Network/firewall issues
5. Rate limiting (429) - Too many requests
6. Data transformation errors - JSON parsing issues

## Debugging Tools
- Execution logs via GET /api/v1/executions/{id}
- Error stack traces and node failure details
- Webhook payload inspection
- Environment variable validation
- Node configuration analysis`,

  instructionsPrompt: `## n8n Debugging Process

### Step 1: Error Analysis
1. **Get execution details** using execution ID
2. **Parse error message** and stack trace
3. **Identify failed node** and error type
4. **Check execution context** (manual vs trigger)

### Step 2: Root Cause Analysis
- **Authentication**: Verify API keys and headers
- **Data Format**: Check input/output data structures  
- **Node Configuration**: Validate node parameters
- **Environment**: Check environment variables
- **External APIs**: Test external service connectivity

### Step 3: Solution Development
1. **Identify fix strategy** based on error type
2. **Propose specific changes** to workflow definition
3. **Create test cases** to validate fix
4. **Document solution** for future reference

### Step 4: Fix Implementation
1. **Update workflow definition** with fixes
2. **Deploy via n8n-workflow-manager** agent
3. **Test execution** with sample data
4. **Monitor results** and verify fix

### Common Solutions:

#### Authentication Errors (401)
\`\`\`bash
# Verify API key
curl "\${N8N_API_URL_RAILWAY}/api/v1/workflows" \\
  -H "X-N8N-API-KEY: \${N8N_API_KEY_RAILWAY}"
\`\`\`

#### Data Format Errors
- Add Set node to transform data structure
- Use expressions to extract nested values
- Validate JSON schema before processing

#### Webhook Timeout Errors
- Increase timeout settings
- Add retry logic with Wait nodes
- Implement error handling branches

#### Rate Limiting (429)
- Add Wait nodes between requests
- Implement exponential backoff
- Batch requests where possible

### Error Message Patterns:
- "Authentication failed" → Check API keys
- "JSON parsing error" → Validate data format
- "Connection timeout" → Network/firewall issue
- "Node not found" → Workflow definition error
- "Invalid expression" → Syntax error in node expression

### Testing Commands via n8n-service CLI:
\`\`\`bash
# Test webhook endpoint
tsx n8n-service.ts test-webhook test '{"test": "data"}'

# Check execution status
tsx n8n-service.ts executions 5

# Get recent errors
tsx n8n-service.ts errors

# Check service health
tsx n8n-service.ts status
\`\`\`

### Validation via n8n-Validate CLI (mcp-like)
\`\`\`bash
# Conflicts across active workflows
tsx n8n-validate.ts conflicts
# Topology & validation of a specific workflow
tsx n8n-validate.ts walk-workflow <id|name>
tsx n8n-validate.ts validate-workflow <id|name>
# Test all webhooks of a workflow
tsx n8n-validate.ts test-webhooks-all <id|name>
\`\`\`

Always provide specific, actionable solutions with code examples and testing procedures.`,

  handleSteps: function* ({ agentState, prompt, params }) {
    // Start with knowledge base
    yield {
      toolName: 'read_files',
      input: { paths: ['knowledge.md'] },
    };

    // Check for recent execution logs or errors
    yield {
      toolName: 'run_terminal_command',
      input: {
        command:
          'find ugc/logs -name "*.log" -mtime -1 2>/dev/null || echo "No recent logs found"',
        timeout_seconds: 10,
      },
    };

    // Let the model analyze and debug
    yield 'STEP_ALL';
  },
};

export default definition;
