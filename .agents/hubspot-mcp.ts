import { publisher } from './constants'
import { base } from './factory/base.ts'

import type { SecretAgentDefinition } from './types/secret-agent-definition'

const definition: SecretAgentDefinition & { mcpServers?: Record<string, any> } =
  {
    id: 'hubspot-mcp',
    publisher,
    ...base('anthropic/claude-4.5-sonnet', 'normal'),

    displayName: 'Hubspot MCP Expert Agent',
    spawnerPrompt: '',
    mcpServers: {
      hubspot: {
        command: 'npx',
        args: ['-y', '@hubspot/mcp-server'],
        env: {
          PRIVATE_APP_ACCESS_TOKEN: '${PRIVATE_APP_ACCESS_TOKEN}',
        },
        working_directory: null,
      },
    },
  }

export default definition
