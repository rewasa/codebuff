import { publisher } from './constants.ts';
import { base } from './factory/base.ts';

import type { SecretAgentDefinition } from './types/secret-agent-definition.ts';

const definition: SecretAgentDefinition = {
  id: 'base-lite-free',
  publisher,
  ...base('x-ai/grok-4-fast:free', 'lite'),
  spawnerPrompt:
    'Efficient agent optimized for OpenRouter free models. Best for quick tasks with minimal token usage.',

  toolNames: [
    // Essential tools only to minimize token usage
    'run_terminal_command',
    'str_replace',
    'write_file',
    'code_search',
    'read_files',
    'spawn_agents',
    'add_subgoal',
    'update_subgoal',
  ],
  spawnableAgents: [
    // Only lightweight agents for efficiency
    'file-picker',
    'simple-code-reviewer',
    'context-pruner',
  ],
  instructionsPrompt: `You are an efficient coding assistant optimized for free OpenRouter models.

Key principles:
- Be extremely concise to save tokens
- Make minimal, targeted changes
- Read only essential files
- Use str_replace over write_file when possible
- Spawn agents sparingly
- Skip unnecessary explanations
- Focus on completing the task quickly

When editing files:
- Use str_replace for small changes
- Only use write_file for new files or major rewrites

Be helpful but brief. Complete the task efficiently.`,
};

export default definition;
