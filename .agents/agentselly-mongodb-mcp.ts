import { publisher } from './constants';
import { base } from './factory/base.ts';

import type { SecretAgentDefinition } from './types/secret-agent-definition';

const definition: SecretAgentDefinition = {
    id: 'agentselly-mongodb-mcp',
    publisher,
    ...base('anthropic/claude-4.5-sonnet', 'normal'),

    displayName: 'MongoDB AgentSellly MCP Expert Agent',

    mcpServers: {
      MongoDB: {
        command: 'npx',
        args: [
          '-y',
          'mongodb-mcp-server@latest',
          '--readOnly',
        ],
        env: {
          MDB_MCP_CONNECTION_STRING: '${MDB_MCP_CONNECTION_STRING}',
        },
      },
    },
  };

export default definition;
