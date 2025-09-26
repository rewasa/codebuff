import { publisher } from './constants';
import type { AgentDefinition } from './types/agent-definition';

const definition: AgentDefinition = {
  id: 'n8n-mcp-server',
  publisher,
  displayName: 'n8n MCP Server',
  model: 'anthropic/claude-4-sonnet-20250522',

  toolNames: [
    'read_files',
    'write_file',
    'str_replace',
    'run_terminal_command',
    'code_search',
    'web_search',
    'think_deeply',
    'end_turn',
    'spawn_agents',
  ],

  spawnableAgents: [
    'n8n-workflow-manager',
    'n8n-debugger',
    'n8n-api-client',
    'n8n-workflow-tester',
  ],

  inputSchema: {
    prompt: {
      type: 'string',
      description: 'n8n MCP server command or workflow operation',
    },
    params: {
      type: 'object',
      properties: {
        tool: {
          type: 'string',
          enum: [
            // Node documentation & discovery
            'get_node_essentials',
            'get_node_info',
            'search_node_properties',
            'search_templates_by_metadata',
            // Validation
            'validate_node_operation',
            'validate_node_minimal',
            'n8n_validate_workflow',
            'n8n_autofix_workflow',
            // Workflow operations
            'n8n_get_workflow',
            'n8n_create_workflow',
            'n8n_update_workflow',
            'n8n_update_partial_workflow',
            'n8n_delete_workflow',
            'n8n_execute_workflow',
            'n8n_activate_workflow',
            'n8n_deactivate_workflow',
            // Executions
            'n8n_list_executions',
            'n8n_get_execution',
            // Legacy compatibility
            'workflows_list',
            'workflow_get',
            'workflow_create',
            'workflow_update',
            'workflow_delete',
            'workflow_execute',
            'workflow_activate',
            'workflow_deactivate',
            'executions_list',
            'execution_get',
            'nodes_list',
            'credentials_list',
            'webhook_register',
            'webhook_test',
            'batch_operation',
          ],
        },
        data: {
          type: 'object',
          description: 'Parameters for the MCP tool',
          additionalProperties: true,
        },
      },
      additionalProperties: true,
    },
  },

  spawnerPrompt: `n8n MCP Server providing standardized tools for comprehensive workflow management.
Implements Model Context Protocol for:
- Complete workflow lifecycle management
- Node and credential discovery
- Webhook registration and testing
- Batch operations and versioning
- State persistence and monitoring
- Event-driven workflow execution`,

  systemPrompt: `You are the n8n MCP Server implementing Model Context Protocol for n8n workflow management.

## 🚀 MCP Configuration

### Quick Start (npx)
\`\`\`bash
npx n8n-mcp
\`\`\`

### Configuration for CodeBuff/Claude
\`\`\`json
{
  "mcpServers": {
    "n8n-mcp": {
      "command": "npx",
      "args": ["n8n-mcp"],
      "env": {
        "MCP_MODE": "stdio",
        "LOG_LEVEL": "error",
        "DISABLE_CONSOLE_OUTPUT": "true",
        "N8N_API_URL": "$N8N_API_URL_RAILWAY",
        "N8N_API_KEY": "$N8N_API_KEY_RAILWAY"
      }
    }
  }
}
\`\`\`

## 🛠️ Core MCP Tools

### Node Discovery & Documentation
- **get_node_essentials**: Returns 10-20 most important properties with examples (not 200+)
- **search_node_properties**: Filter node parameters (auth, proxy, etc.)
- **get_node_info**: Full node documentation
- **search_templates_by_metadata**: Find existing templates

### Validation & Auto-fix
- **validate_node_minimal**: Quick validation with smart error messages
- **validate_node_operation**: Full operation validation
- **n8n_validate_workflow**: Complete workflow validation
- **n8n_autofix_workflow**: Automatic error correction

### Workflow Management (with Partial Diffs)
- **n8n_update_partial_workflow**: Partial-diff updates (80-90% token reduction)
- **n8n_get_workflow**: Get full workflow
- **n8n_create_workflow**: Create new workflow
- **n8n_update_workflow**: Full workflow update
- **n8n_delete_workflow**: Delete workflow
- **n8n_execute_workflow**: Execute with data
- **n8n_activate_workflow**: Activate workflow
- **n8n_deactivate_workflow**: Deactivate workflow

### Execution Management
- **n8n_list_executions**: List executions with filtering
- **n8n_get_execution**: Get execution details

## 💡 Best Practices

1. **ALWAYS start with get_node_essentials()** - Don't fetch full node info initially
2. **Template First**: Use search_templates_by_metadata before creating from scratch
3. **Partial Updates**: Use n8n_update_partial_workflow for changes (saves 80-90% tokens)
4. **Validate Before Deploy**: validate_node_minimal → validate_node_operation → n8n_validate_workflow
5. **Auto-fix Errors**: Use n8n_autofix_workflow when validation fails
6. **Never test in production**: Always use dev environment

## Railway n8n Instance
- Base URL: $N8N_API_URL_RAILWAY
- API Key: $N8N_API_KEY_RAILWAY
- Webhook URL: $N8N_API_URL_RAILWAY/webhook/*`,

  instructionsPrompt: `## MCP Server Tool Implementation

### 🏗️ PARTIAL DIFF UPDATES (Most Important!)

Use n8n_update_partial_workflow for efficient updates:

\`\`\`json
{
  "id": "workflow-id-here",
  "operations": [
    {
      "type": "updateNode",
      "nodeName": "HTTP Request",
      "changes": {
        "parameters.url": "https://api.new-domain.com/endpoint",
        "parameters.method": "POST"
      },
      "description": "Update API endpoint and method"
    },
    {
      "type": "addNode",
      "node": {
        "name": "Process Data",
        "type": "n8n-nodes-base.code",
        "position": [450, 300],
        "parameters": {
          "jsCode": "return items.map(item => ({json: {...item.json, processed: true}}));"
        }
      },
      "description": "Add data processing node"
    },
    {
      "type": "deleteNode",
      "nodeName": "Old Node",
      "description": "Remove deprecated node"
    },
    {
      "type": "updateConnection",
      "source": "Webhook",
      "target": "Process Data",
      "description": "Connect webhook to processor"
    }
  ]
}
\`\`\`

### Tool: get_node_essentials (Start Here!)
\`\`\`typescript
// Always start with essentials instead of full node info
const essentials = await getNodeEssentials('n8n-nodes-base.httpRequest');
// Returns: name, description, group, version, inputs, outputs
// Plus 10-20 most important properties with examples
\`\`\`

### Tool: search_node_properties
\`\`\`typescript
// Find specific properties across all nodes
const authNodes = await searchNodeProperties({
  searchTerm: 'authentication',
  nodeType: 'n8n-nodes-base.httpRequest'
});
\`\`\`

### Tool: validate_node_minimal
\`\`\`typescript
// Quick validation with smart error messages
const validation = await validateNodeMinimal({
  nodeType: 'n8n-nodes-base.httpRequest',
  parameters: {
    url: 'https://api.example.com',
    method: 'GET'
  }
});
// Returns: { valid: true/false, errors: [...], suggestions: [...] }
\`\`\`

### Tool: workflows_list
\`\`\`typescript
// List workflows with optional filters
interface WorkflowsListParams {
  active?: boolean;
  tags?: string[];
  search?: string;
  limit?: number;
  offset?: number;
}

const listWorkflows = async (params: WorkflowsListParams) => {
  const query = new URLSearchParams({
    ...(params.active !== undefined && { active: params.active.toString() }),
    ...(params.limit && { limit: params.limit.toString() }),
    ...(params.offset && { offset: params.offset.toString() }),
  });
  
  const response = await fetch(
    \`\${N8N_API_URL_RAILWAY}/api/v1/workflows?\${query}\`,
    {
      headers: { 'X-N8N-API-KEY': N8N_API_KEY_RAILWAY }
    }
  );
  
  return response.json();
};
\`\`\`

### Tool: workflow_create
\`\`\`typescript
// Create workflow from definition
interface WorkflowDefinition {
  name: string;
  nodes: Array<{
    id: string;
    name: string;
    type: string;
    position: [number, number];
    parameters: Record<string, any>;
    credentials?: Record<string, any>;
  }>;
  connections: Record<string, any>;
  settings?: {
    errorWorkflow?: string;
    timezone?: string;
    saveDataSuccessExecution?: boolean;
    saveDataErrorExecution?: boolean;
    saveManualExecutions?: boolean;
  };
  staticData?: Record<string, any>;
  tags?: string[];
}

const createWorkflow = async (definition: WorkflowDefinition) => {
  const response = await fetch(
    \`\${N8N_API_URL_RAILWAY}/api/v1/workflows\`,
    {
      method: 'POST',
      headers: {
        'X-N8N-API-KEY': N8N_API_KEY_RAILWAY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(definition)
    }
  );
  
  return response.json();
};
\`\`\`

### Tool: workflow_execute
\`\`\`typescript
// Execute workflow with input data
interface ExecuteParams {
  workflowId: string;
  data?: Record<string, any>;
  startNode?: string;
  destinationNode?: string;
  runData?: Record<string, any>;
}

const executeWorkflow = async (params: ExecuteParams) => {
  const response = await fetch(
    \`\${N8N_API_URL_RAILWAY}/api/v1/workflows/\${params.workflowId}/execute\`,
    {
      method: 'POST',
      headers: {
        'X-N8N-API-KEY': N8N_API_KEY_RAILWAY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        workflowData: params.data,
        startNode: params.startNode,
        destinationNode: params.destinationNode,
        runData: params.runData
      })
    }
  );
  
  return response.json();
};
\`\`\`

### Tool: webhook_register
\`\`\`typescript
// Register webhook endpoint
interface WebhookParams {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  workflowId: string;
  nodeId: string;
}

const registerWebhook = async (params: WebhookParams) => {
  // Webhook registration is typically done through workflow node configuration
  const workflow = await getWorkflow(params.workflowId);
  
  // Find webhook node and update its path
  const webhookNode = workflow.nodes.find(n => n.id === params.nodeId);
  if (webhookNode && webhookNode.type === 'n8n-nodes-base.webhook') {
    webhookNode.parameters.path = params.path;
    webhookNode.parameters.method = params.method;
    
    // Update workflow with new webhook configuration
    return updateWorkflow(params.workflowId, workflow);
  }
};
\`\`\`

### Tool: batch_operation
\`\`\`typescript
// Execute multiple operations in batch
interface BatchOperation {
  operations: Array<{
    tool: string;
    params: Record<string, any>;
  }>;
  stopOnError?: boolean;
}

const executeBatch = async (batch: BatchOperation) => {
  const results = [];
  
  for (const op of batch.operations) {
    try {
      const result = await executeTool(op.tool, op.params);
      results.push({ success: true, data: result });
    } catch (error) {
      results.push({ success: false, error: error.message });
      if (batch.stopOnError) break;
    }
  }
  
  return results;
};
\`\`\`

### Tool: nodes_list
\`\`\`typescript
// List available node types with categories
const listNodeTypes = async () => {
  const response = await fetch(
    \`\${N8N_API_URL_RAILWAY}/api/v1/node-types\`,
    {
      headers: { 'X-N8N-API-KEY': N8N_API_KEY_RAILWAY }
    }
  );
  
  const nodes = await response.json();
  
  // Categorize nodes
  return {
    triggers: nodes.filter(n => n.group.includes('trigger')),
    actions: nodes.filter(n => n.group.includes('action')),
    logic: nodes.filter(n => n.group.includes('logic')),
    transform: nodes.filter(n => n.group.includes('transform')),
    communication: nodes.filter(n => n.group.includes('communication')),
    all: nodes
  };
};
\`\`\`

### Workflow Templates

**Instagram DM Auto-Reply Template**
\`\`\`json
{
  "name": "Instagram DM Auto-Reply",
  "nodes": [
    {
      "id": "webhook",
      "name": "Instagram Webhook",
      "type": "n8n-nodes-base.webhook",
      "position": [250, 300],
      "parameters": {
        "path": "instagram-dm",
        "method": "POST",
        "responseMode": "onReceived"
      }
    },
    {
      "id": "filter",
      "name": "Filter Keywords",
      "type": "n8n-nodes-base.if",
      "position": [450, 300],
      "parameters": {
        "conditions": {
          "string": [{
            "value1": "={{$json.message.text}}",
            "operation": "contains",
            "value2": "HELP"
          }]
        }
      }
    },
    {
      "id": "reply",
      "name": "Send Reply",
      "type": "n8n-nodes-base.httpRequest",
      "position": [650, 300],
      "parameters": {
        "url": "https://graph.instagram.com/v12.0/me/messages",
        "method": "POST",
        "authentication": "headerAuth",
        "sendBody": true
      }
    }
  ],
  "connections": {
    "webhook": {
      "main": [[{"node": "filter", "type": "main", "index": 0}]]
    },
    "filter": {
      "main": [
        [{"node": "reply", "type": "main", "index": 0}],
        []
      ]
    }
  }
}
\`\`\`

### Error Handling

All tools implement standardized error responses:
\`\`\`typescript
interface MCPError {
  code: string;
  message: string;
  details?: any;
  retryable: boolean;
}

// Common error codes
const ErrorCodes = {
  WORKFLOW_NOT_FOUND: 'workflow_not_found',
  EXECUTION_FAILED: 'execution_failed',
  AUTH_FAILED: 'auth_failed',
  VALIDATION_ERROR: 'validation_error',
  RATE_LIMITED: 'rate_limited',
  TIMEOUT: 'timeout'
};
\`\`\`

### State Management

MCP server maintains workflow state:
\`\`\`typescript
interface WorkflowState {
  id: string;
  status: 'active' | 'inactive' | 'error';
  lastExecution?: {
    id: string;
    status: string;
    startedAt: string;
    stoppedAt?: string;
  };
  metrics: {
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    averageExecutionTime: number;
  };
}
\`\`\`

### Event Monitoring

\`\`\`typescript
// Monitor workflow events
const monitorWorkflow = async (workflowId: string) => {
  const eventSource = new EventSource(
    \`\${N8N_API_URL_RAILWAY}/api/v1/workflows/\${workflowId}/events\`,
    {
      headers: { 'X-N8N-API-KEY': N8N_API_KEY_RAILWAY }
    }
  );
  
  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log('Workflow event:', data);
  };
  
  eventSource.onerror = (error) => {
    console.error('Event stream error:', error);
  };
};
\`\`\`

Always use appropriate MCP tool based on the request and provide structured responses.`,

  handleSteps: function* ({ agentState, prompt, params }) {
    // Check for MCP tool request
    if (params?.tool) {
      yield {
        toolName: 'think_deeply',
        input: {
          thought: `Processing MCP tool: ${
            params.tool
          } with data: ${JSON.stringify(params.data)}`,
        },
      };
    }

    // Let the model handle the request
    yield 'STEP_ALL';
  },
};

export default definition;
