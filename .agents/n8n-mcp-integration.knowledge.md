# n8n-MCP Integration Guide for CodeBuff Agents

## 🧩 Overview

n8n-MCP is a Model Context Protocol (MCP) server that provides a smart interface between n8n and AI agents (CodeBuff, Claude, VSCode, Cursor, Windsurf).

**Key Benefits:**

- Detailed documentation for 530+ n8n nodes
- Partial diff updates (80-90% token reduction)
- Smart validation and auto-fix
- Template-first approach
- Live debugging capabilities

## 🚀 Installation & Setup

### Quick Start with npx

```bash
npx n8n-mcp
```

### CodeBuff Agent Configuration

Add to your agent configuration:

```json
{
  "mcpServers": {
    "n8n-mcp": {
      "command": "npx",
      "args": ["n8n-mcp"],
      "env": {
        "MCP_MODE": "stdio",
        "LOG_LEVEL": "error",
        "DISABLE_CONSOLE_OUTPUT": "true",
        "N8N_API_URL": "https://your-n8n-instance.com",
        "N8N_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Docker Alternative

```bash
docker pull ghcr.io/czlonkowski/n8n-mcp:latest
docker run -it --rm --init \
  -e MCP_MODE=stdio \
  -e LOG_LEVEL=error \
  -e DISABLE_CONSOLE_OUTPUT=true \
  -e N8N_API_URL=https://your-n8n-instance.com \
  -e N8N_API_KEY=your-api-key \
  ghcr.io/czlonkowski/n8n-mcp:latest
```

## 🛠️ Essential MCP Tools

### 1. Node Discovery (Start Here!)

#### get_node_essentials

**Always use this first!** Returns only 10-20 most important properties instead of 200+.

```typescript
const essentials = await mcp.call('get_node_essentials', {
  nodeType: 'n8n-nodes-base.httpRequest',
});
// Returns: core properties with examples
```

#### search_node_properties

Filter properties by specific criteria:

```typescript
const authProps = await mcp.call('search_node_properties', {
  searchTerm: 'authentication',
  nodeType: 'n8n-nodes-base.httpRequest',
});
```

#### search_templates_by_metadata

Find existing templates before creating new ones:

```typescript
const templates = await mcp.call('search_templates_by_metadata', {
  tags: [
    'webhook',
    'api',
  ],
  category: 'integration',
});
```

### 2. Validation & Auto-fix

#### validate_node_minimal

Quick validation with smart error messages:

```typescript
const validation = await mcp.call('validate_node_minimal', {
  nodeType: 'n8n-nodes-base.httpRequest',
  parameters: {
    url: 'https://api.example.com',
    method: 'GET',
  },
});
```

#### validate_node_operation

Full operation validation:

```typescript
const validation = await mcp.call('validate_node_operation', {
  nodeType: 'n8n-nodes-base.httpRequest',
  operation: 'request',
  parameters: {
    /* ... */
  },
});
```

#### n8n_autofix_workflow

Automatically fix validation errors:

```typescript
const fixed = await mcp.call('n8n_autofix_workflow', {
  workflowId: 'workflow-123',
  errors: validation.errors,
});
```

### 3. Partial Diff Updates (CRITICAL!)

**This is the most important feature!** Reduces tokens by 80-90%.

#### n8n_update_partial_workflow

```json
{
  "id": "workflow-id",
  "operations": [
    {
      "type": "updateNode",
      "nodeName": "HTTP Request",
      "changes": {
        "parameters.url": "https://new-api.com/endpoint",
        "parameters.headers.Authorization": "Bearer {{$credentials.apiKey}}"
      },
      "description": "Update API endpoint and auth"
    },
    {
      "type": "addNode",
      "node": {
        "name": "Transform Data",
        "type": "n8n-nodes-base.code",
        "position": [
          450,
          300
        ],
        "parameters": {
          "jsCode": "// Transform data\nreturn items.map(item => ({\n  json: {\n    ...item.json,\n    transformed: true,\n    timestamp: new Date().toISOString()\n  }\n}));"
        }
      },
      "description": "Add data transformation"
    },
    {
      "type": "deleteNode",
      "nodeName": "Old Processor",
      "description": "Remove deprecated node"
    },
    {
      "type": "updateConnection",
      "source": "Webhook",
      "target": "Transform Data",
      "outputIndex": 0,
      "inputIndex": 0,
      "description": "Connect webhook to transformer"
    },
    {
      "type": "deleteConnection",
      "source": "Webhook",
      "target": "Old Processor",
      "description": "Remove old connection"
    }
  ]
}
```

### 4. Workflow Management

#### Standard Operations

```typescript
// Get workflow
const workflow = await mcp.call('n8n_get_workflow', {
  id: 'workflow-123'
});

// Create workflow
const created = await mcp.call('n8n_create_workflow', {
  name: 'My Workflow',
  nodes: [...],
  connections: {...}
});

// Execute workflow
const execution = await mcp.call('n8n_execute_workflow', {
  id: 'workflow-123',
  data: { test: 'data' }
});

// Activate/Deactivate
await mcp.call('n8n_activate_workflow', { id: 'workflow-123' });
await mcp.call('n8n_deactivate_workflow', { id: 'workflow-123' });
```

## 💡 Best Practices & Workflow

### Recommended Workflow

1. **Start with Essentials**

   ```typescript
   // ✅ Good
   const essentials = await get_node_essentials('n8n-nodes-base.httpRequest');

   // ❌ Bad (too much data initially)
   const fullInfo = await get_node_info('n8n-nodes-base.httpRequest');
   ```

2. **Search for Templates First**

   ```typescript
   const templates = await search_templates_by_metadata({
     category: 'webhook',
     tags: [
       'api',
       'rest',
     ],
   });
   // Use existing template if found
   ```

3. **Use Partial Updates**

   ```typescript
   // ✅ Good (efficient)
   await n8n_update_partial_workflow({
     id: 'workflow-123',
     operations: [
       /* targeted changes */
     ],
   });

   // ❌ Bad (sends entire workflow)
   await n8n_update_workflow(entireWorkflowObject);
   ```

4. **Validate Before Deploy**

   ```typescript
   // Step 1: Quick validation
   const minimalCheck = await validate_node_minimal(nodeConfig);

   // Step 2: Full validation if minimal passes
   if (minimalCheck.valid) {
     const fullCheck = await validate_node_operation(nodeConfig);
   }

   // Step 3: Validate entire workflow
   const workflowCheck = await n8n_validate_workflow(workflowId);

   // Step 4: Auto-fix if needed
   if (!workflowCheck.valid) {
     await n8n_autofix_workflow(workflowId, workflowCheck.errors);
   }
   ```

5. **Property Search Before Deep Dive**

   ```typescript
   // First search for specific properties
   const authProps = await search_node_properties({
     searchTerm: 'authentication',
   });

   // Only then get full info if needed
   if (needMoreDetail) {
     const fullNode = await get_node_info('n8n-nodes-base.httpRequest');
   }
   ```

## 🦾 Debugging & Error Handling

### Validation Strategy

```typescript
async function validateAndFix(workflow) {
  // 1. Validate
  const validation = await n8n_validate_workflow(workflow.id);

  // 2. Check results
  if (!validation.valid) {
    console.log('Errors found:', validation.errors);

    // 3. Attempt auto-fix
    const fixed = await n8n_autofix_workflow(workflow.id, validation.errors);

    // 4. Re-validate
    const recheck = await n8n_validate_workflow(workflow.id);

    if (!recheck.valid) {
      // Manual intervention needed
      console.log('Manual fixes required:', recheck.errors);
    }
  }

  return validation;
}
```

### Common Error Patterns

1. **Missing Required Fields**

   ```json
   {
     "error": "Missing required field: url",
     "node": "HTTP Request",
     "suggestion": "Add 'url' parameter to node configuration"
   }
   ```

2. **Invalid Connections**

   ```json
   {
     "error": "Invalid connection",
     "details": "Node 'Transform' expects input but has none",
     "suggestion": "Connect an input node to 'Transform'"
   }
   ```

3. **Type Mismatches**
   ```json
   {
     "error": "Type mismatch",
     "field": "timeout",
     "expected": "number",
     "received": "string",
     "suggestion": "Convert '30s' to 30000 (milliseconds)"
   }
   ```

## 📚 Examples

### Example 1: Create Webhook Workflow with Partial Updates

```typescript
// 1. Search for webhook template
const templates = await search_templates_by_metadata({
  category: 'webhook',
});

// 2. Create base workflow
const workflow = await n8n_create_workflow({
  name: 'API Webhook Handler',
  nodes: [
    {
      name: 'Webhook',
      type: 'n8n-nodes-base.webhook',
      position: [
        250,
        300,
      ],
      parameters: {
        path: 'api-webhook',
        method: 'POST',
      },
    },
  ],
  connections: {},
});

// 3. Add processing node via partial update
await n8n_update_partial_workflow({
  id: workflow.id,
  operations: [
    {
      type: 'addNode',
      node: {
        name: 'Process',
        type: 'n8n-nodes-base.code',
        position: [
          450,
          300,
        ],
        parameters: {
          jsCode: 'return items;',
        },
      },
    },
    {
      type: 'updateConnection',
      source: 'Webhook',
      target: 'Process',
    },
  ],
});

// 4. Validate
const valid = await n8n_validate_workflow(workflow.id);

// 5. Activate if valid
if (valid.valid) {
  await n8n_activate_workflow(workflow.id);
}
```

### Example 2: Debug and Fix Existing Workflow

```typescript
// 1. Get workflow
const workflow = await n8n_get_workflow('problematic-workflow');

// 2. Validate
const validation = await n8n_validate_workflow(workflow.id);

if (!validation.valid) {
  // 3. Analyze errors
  for (const error of validation.errors) {
    console.log(`Error in ${error.node}: ${error.message}`);

    // 4. Get node essentials for fixing
    const essentials = await get_node_essentials(error.nodeType);

    // 5. Search for solution
    const props = await search_node_properties({
      nodeType: error.nodeType,
      searchTerm: error.field,
    });
  }

  // 6. Auto-fix
  await n8n_autofix_workflow(workflow.id, validation.errors);

  // 7. Re-validate
  const recheck = await n8n_validate_workflow(workflow.id);
  console.log('Fixed:', recheck.valid);
}
```

## 🔗 Resources

- [n8n-MCP GitHub Repository](https://github.com/czlonkowski/n8n-mcp)
- [MCP Quick Start Guide](https://github.com/czlonkowski/n8n-mcp/blob/main/docs/MCP_QUICK_START_GUIDE.md)
- [Workflow Diff Examples](https://github.com/czlonkowski/n8n-mcp/blob/main/docs/workflow-diff-examples.md)
- [Essentials Feature Documentation](https://github.com/czlonkowski/n8n-mcp/blob/main/docs/MCP_ESSENTIALS_README.md)
- [Validation Improvements](https://github.com/czlonkowski/n8n-mcp/blob/main/docs/validation-improvements-v2.4.2.md)
- [Deployment Guide](https://github.com/czlonkowski/n8n-mcp/blob/main/docs/N8N_DEPLOYMENT.md)

## ⚠️ Important Notes

1. **Never test in production** - Always use development environment
2. **Backup workflows** before major changes
3. **Use partial updates** whenever possible (80-90% token savings)
4. **Start with essentials** - Don't fetch full node info initially
5. **Validate before deploy** - Always run validation checks
6. **Template first** - Search for existing templates before creating new
7. **Restart agent** after configuration changes
