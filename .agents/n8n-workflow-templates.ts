// n8n Workflow Templates and Common Patterns

export const WorkflowTemplates = {
  // Basic webhook workflow
  webhook: {
    name: 'Basic Webhook Handler',
    nodes: [
      {
        id: 'webhook_1',
        name: 'Webhook',
        type: 'n8n-nodes-base.webhook',
        position: [
          250,
          300,
        ],
        parameters: {
          path: 'webhook-endpoint',
          method: 'POST',
          responseMode: 'onReceived',
          responseData: 'allEntries',
        },
      },
      {
        id: 'code_1',
        name: 'Process Data',
        type: 'n8n-nodes-base.code',
        position: [
          450,
          300,
        ],
        parameters: {
          jsCode: `// Process webhook data
const items = $input.all();
return items.map(item => ({
  json: {
    ...item.json,
    processed: true,
    timestamp: new Date().toISOString()
  }
}));`,
        },
      },
    ],
    connections: {
      webhook_1: {
        main: [[{ node: 'code_1', type: 'main', index: 0 }]],
      },
    },
  },

  // Schedule workflow
  scheduled: {
    name: 'Scheduled Task',
    nodes: [
      {
        id: 'schedule_1',
        name: 'Schedule Trigger',
        type: 'n8n-nodes-base.scheduleTrigger',
        position: [
          250,
          300,
        ],
        parameters: {
          rule: {
            interval: [
              {
                field: 'hours',
                hoursInterval: 1,
              },
            ],
          },
        },
      },
      {
        id: 'http_1',
        name: 'Fetch Data',
        type: 'n8n-nodes-base.httpRequest',
        position: [
          450,
          300,
        ],
        parameters: {
          url: 'https://api.example.com/data',
          method: 'GET',
          responseFormat: 'json',
        },
      },
    ],
    connections: {
      schedule_1: {
        main: [[{ node: 'http_1', type: 'main', index: 0 }]],
      },
    },
  },

  // Error handling workflow
  errorHandler: {
    name: 'Error Handler',
    nodes: [
      {
        id: 'error_trigger_1',
        name: 'Error Trigger',
        type: 'n8n-nodes-base.errorTrigger',
        position: [
          250,
          300,
        ],
        parameters: {},
      },
      {
        id: 'email_1',
        name: 'Send Error Email',
        type: 'n8n-nodes-base.emailSend',
        position: [
          450,
          300,
        ],
        parameters: {
          fromEmail: 'n8n@example.com',
          toEmail: 'admin@example.com',
          subject: 'Workflow Error: {{$json.workflow.name}}',
          text: 'Error: {{$json.execution.error.message}}',
        },
      },
    ],
    connections: {
      error_trigger_1: {
        main: [[{ node: 'email_1', type: 'main', index: 0 }]],
      },
    },
  },

  // Data transformation workflow
  dataTransform: {
    name: 'Data Transformation Pipeline',
    nodes: [
      {
        id: 'webhook_1',
        name: 'Data Input',
        type: 'n8n-nodes-base.webhook',
        position: [
          250,
          300,
        ],
        parameters: {
          path: 'transform',
          method: 'POST',
        },
      },
      {
        id: 'set_1',
        name: 'Set Fields',
        type: 'n8n-nodes-base.set',
        position: [
          450,
          300,
        ],
        parameters: {
          values: {
            string: [
              {
                name: 'status',
                value: 'processing',
              },
            ],
            number: [
              {
                name: 'timestamp',
                value: '={{Date.now()}}',
              },
            ],
          },
        },
      },
      {
        id: 'function_1',
        name: 'Transform',
        type: 'n8n-nodes-base.function',
        position: [
          650,
          300,
        ],
        parameters: {
          functionCode: `// Custom transformation
const items = [];
for (const item of $input.all()) {
  items.push({
    json: {
      id: item.json.id,
      name: item.json.name?.toUpperCase(),
      processedAt: new Date().toISOString(),
      status: 'completed'
    }
  });
}
return items;`,
        },
      },
    ],
    connections: {
      webhook_1: {
        main: [[{ node: 'set_1', type: 'main', index: 0 }]],
      },
      set_1: {
        main: [[{ node: 'function_1', type: 'main', index: 0 }]],
      },
    },
  },

  // Database workflow
  database: {
    name: 'Database Operations',
    nodes: [
      {
        id: 'postgres_1',
        name: 'Query Database',
        type: 'n8n-nodes-base.postgres',
        position: [
          250,
          300,
        ],
        parameters: {
          operation: 'executeQuery',
          query: 'SELECT * FROM users WHERE active = true',
        },
        credentials: {
          postgres: {
            id: '1',
            name: 'Postgres',
          },
        },
      },
      {
        id: 'split_1',
        name: 'Split In Batches',
        type: 'n8n-nodes-base.splitInBatches',
        position: [
          450,
          300,
        ],
        parameters: {
          batchSize: 10,
        },
      },
      {
        id: 'http_1',
        name: 'Process Batch',
        type: 'n8n-nodes-base.httpRequest',
        position: [
          650,
          300,
        ],
        parameters: {
          url: 'https://api.example.com/process',
          method: 'POST',
          sendBody: true,
        },
      },
    ],
    connections: {
      postgres_1: {
        main: [[{ node: 'split_1', type: 'main', index: 0 }]],
      },
      split_1: {
        main: [[{ node: 'http_1', type: 'main', index: 0 }]],
      },
      http_1: {
        main: [[{ node: 'split_1', type: 'main', index: 0 }]],
      },
    },
  },
};

// Common node configurations
export const NodeConfigs = {
  webhookAuth: {
    type: 'n8n-nodes-base.webhook',
    parameters: {
      authentication: 'headerAuth',
      headerAuth: {
        name: 'Authorization',
        value: 'Bearer {{$credentials.apiKey}}',
      },
    },
  },

  httpRetry: {
    type: 'n8n-nodes-base.httpRequest',
    parameters: {
      options: {
        retry: {
          maxTries: 3,
          waitBetweenTries: 1000,
          onFail: 'continueErrorOutput',
        },
        timeout: 30000,
      },
    },
  },

  errorBranch: {
    type: 'n8n-nodes-base.if',
    parameters: {
      conditions: {
        boolean: [
          {
            value1: '={{$json.error}}',
            value2: true,
          },
        ],
      },
    },
  },
};

// Workflow patterns
export const WorkflowPatterns = {
  // Retry pattern with exponential backoff
  retryWithBackoff: (nodeId: string, maxRetries = 3) => ({
    nodes: [
      {
        id: `${nodeId}_retry`,
        name: 'Retry Logic',
        type: 'n8n-nodes-base.code',
        parameters: {
          jsCode: `
const maxRetries = ${maxRetries};
const retryCount = $item(0).$node['${nodeId}_retry'].runIndex || 0;

if (retryCount >= maxRetries) {
  throw new Error('Max retries exceeded');
}

const delay = Math.pow(2, retryCount) * 1000;
await new Promise(resolve => setTimeout(resolve, delay));

return [{json: {retryCount, delay}}];`,
        },
      },
    ],
  }),

  // Parallel processing pattern
  parallelProcess: (branches: number) => {
    const nodes = [];
    const connections = {};

    // Create split node
    nodes.push({
      id: 'split_data',
      name: 'Split Data',
      type: 'n8n-nodes-base.code',
      position: [
        250,
        300,
      ],
      parameters: {
        jsCode: `
const items = $input.all();
const branches = ${branches};
const chunkSize = Math.ceil(items.length / branches);
const chunks = [];

for (let i = 0; i < branches; i++) {
  chunks.push(items.slice(i * chunkSize, (i + 1) * chunkSize));
}

return chunks.map((chunk, index) => ({
  json: { branchId: index, items: chunk }
}));`,
      },
    });

    // Create branch nodes
    for (let i = 0; i < branches; i++) {
      nodes.push({
        id: `branch_${i}`,
        name: `Process Branch ${i}`,
        type: 'n8n-nodes-base.function',
        position: [
          450 + i * 50,
          300 + i * 100,
        ],
        parameters: {
          functionCode: `// Process branch ${i}\nreturn $input.all();`,
        },
      });
    }

    // Create merge node
    nodes.push({
      id: 'merge_results',
      name: 'Merge Results',
      type: 'n8n-nodes-base.merge',
      position: [
        850,
        300,
      ],
      parameters: {
        mode: 'combine',
        combinationMode: 'mergeByPosition',
      },
    });

    return { nodes, connections };
  },

  // Rate limiting pattern
  rateLimiter: (requestsPerSecond: number) => ({
    nodes: [
      {
        id: 'rate_limiter',
        name: 'Rate Limiter',
        type: 'n8n-nodes-base.wait',
        parameters: {
          resume: 'timeInterval',
          amount: 1000 / requestsPerSecond,
          unit: 'milliseconds',
        },
      },
    ],
  }),
};

// Utility functions for workflow creation
export const WorkflowUtils = {
  // Generate unique node ID
  generateNodeId: (type: string) => {
    return `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  },

  // Calculate node position
  calculatePosition: (index: number, columns = 3) => {
    const x = 250 + (index % columns) * 200;
    const y = 300 + Math.floor(index / columns) * 150;
    return [
      x,
      y,
    ];
  },

  // Create connection between nodes
  createConnection: (
    sourceNode: string,
    targetNode: string,
    outputIndex = 0,
  ) => {
    return {
      [sourceNode]: {
        main: [
          outputIndex === 0
            ? [{ node: targetNode, type: 'main', index: 0 }]
            : [],
        ],
      },
    };
  },

  // Validate workflow structure
  validateWorkflow: (workflow: any) => {
    const errors = [];

    if (!workflow.name) {
      errors.push('Workflow name is required');
    }

    if (!workflow.nodes || workflow.nodes.length === 0) {
      errors.push('Workflow must have at least one node');
    }

    // Check for duplicate node IDs
    const nodeIds = workflow.nodes?.map((n: any) => n.id) || [];
    const duplicates = nodeIds.filter(
      (id: string, index: number) => nodeIds.indexOf(id) !== index,
    );
    if (duplicates.length > 0) {
      errors.push(`Duplicate node IDs found: ${duplicates.join(', ')}`);
    }

    // Validate connections
    if (workflow.connections) {
      Object.keys(workflow.connections).forEach((nodeId) => {
        if (!nodeIds.includes(nodeId)) {
          errors.push(`Connection references non-existent node: ${nodeId}`);
        }
      });
    }

    return { valid: errors.length === 0, errors };
  },
};

export default WorkflowTemplates;
