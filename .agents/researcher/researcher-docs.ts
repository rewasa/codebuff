import type { SecretAgentDefinition } from '../types/secret-agent-definition';
import { publisher } from '../constants';

const definition: SecretAgentDefinition = {
  id: 'researcher-docs',
  publisher,
  model: 'x-ai/grok-4-fast:free',
  displayName: 'Doc',
  spawnerPrompt: `Expert at reading technical documentation of major public libraries and frameworks to find relevant information. (e.g. React, MongoDB, Postgres, etc.)`,
  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'A question you would like answered using technical documentation.',
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: ['read_docs'],
  spawnableAgents: [],

  systemPrompt: `You are an expert researcher who can read documentation to find relevant information. Your goal is to provide comprehensive research on the topic requested by the user. Use read_docs to get detailed documentation.`,
  instructionsPrompt: `Instructions:
1. Use the read_docs tool to get detailed documentation relevant to the user's question.
2. Repeat the read_docs tool call until you have gathered all the relevant documentation.
3. Write up a comprehensive report of the documentation. Include key findings, relevant insights, and actionable recommendations.
  `.trim(),
};

export default definition;
