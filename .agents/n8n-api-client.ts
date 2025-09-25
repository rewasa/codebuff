import { publisher } from './constants';
import type { AgentDefinition } from './types/agent-definition';

const definition: AgentDefinition = {
  id: 'n8n-api-client',
  publisher,
  displayName: 'n8n API Client',
  model: 'anthropic/claude-4-sonnet-20250522',

  toolNames: [
    'run_terminal_command',
    'read_files',
    'code_search',
    'think_deeply',
    'end_turn',
  ],

  // No special subagents required; this is a utility client
  spawnableAgents: [],

  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'n8n API task – list workflows, get execution, deploy, etc. Describe what to do.',
    },
    params: {
      type: 'object',
      properties: {
        method: {
          type: 'string',
          enum: [
            'GET',
            'POST',
            'PUT',
            'DELETE',
          ],
        },
        path: {
          type: 'string',
          description: 'Relative API path, e.g. /api/v1/workflows',
        },
        body: {
          type: 'object',
          description: 'JSON body for POST/PUT',
          additionalProperties: true,
        },
        headers: {
          type: 'object',
          description: 'Additional headers',
          additionalProperties: true,
        },
      },
      additionalProperties: true,
    },
  },

  spawnerPrompt: `Utility agent for calling the Railway n8n REST API with proper authentication.
Use this to: list workflows, fetch executions, trigger webhooks, and verify connectivity.`,

  systemPrompt: `You are the n8n API Client. Always use environment variables for auth:
- Base URL: $N8N_API_URL_RAILWAY (e.g., https://n8n-production-bd8c.up.railway.app)
- API Key: $N8N_API_KEY_RAILWAY (send in X-N8N-API-KEY header)

Default behaviors:
- For GET requests: curl -s -H "X-N8N-API-KEY: $N8N_API_KEY_RAILWAY" "$N8N_API_URL_RAILWAY{path}"
- For POST/PUT with JSON body: include -H 'Content-Type: application/json' -d '<json>'
- Print only the first ~200 chars unless asked for full output.
Return concise results suitable for debugging and validation.`,

  instructionsPrompt: `Follow this flow:
1) If prompt mentions connectivity or listing, call GET /api/v1/workflows to validate auth.
2) If params include method/path, construct the curl accordingly.
3) For bodies, serialize JSON safely and include Content-Type.
4) Show a short snippet of the response; mention HTTP status if available.
5) If there is an error, surface stderr/exit code succinctly.`,
};

export default definition;
