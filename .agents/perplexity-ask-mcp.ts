import { publisher } from './constants';
import { base } from './factory/base.ts';

import type { SecretAgentDefinition } from './types/secret-agent-definition';

const definition: SecretAgentDefinition & { mcpServers?: Record<string, any> } =
  {
    id: 'perplexity-ask-mcp',
    publisher,
    ...base('anthropic/claude-4.5-sonnet', 'normal'),

    displayName: 'Perplexity Ask MCP Expert Agent',
    spawnerPrompt: '',
    mcpServers: {
      hubspot: {
        command: 'npx',
        args: [
          '-y',
          'mcp/perplexity-ask',
        ],
        env: {
          PERPLEXITY_API_KEYN: '${PERPLEXITY_API_KEY}',
        },
      },
    },
  };

export default definition;
