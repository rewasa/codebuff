import {
  scanCommandsDirectory,
  generateCommandsSection,
} from './utils/command-scanner'
import { join } from 'path'

import type { AgentDefinition } from '../types/agent-definition'

const definition: AgentDefinition = {
  id: 'codelayer-base',
  publisher: 'codelayer',
  displayName: 'Codelayer Base Agent',
  model: 'anthropic/claude-4-sonnet-20250522',

  toolNames: [
    'read_files',
    'code_search',
    'run_terminal_command',
    'spawn_agents',
    'end_turn',
  ],

  spawnableAgents: [
    'codebuff/editor@0.0.1',
    'codebase-analyzer',
    'codebase-locator',
    'codebase-pattern-finder',
    'thoughts-analyzer',
    'thoughts-locator',
    'web-search-researcher',
  ],

  inputSchema: {
    prompt: {
      type: 'string',
      description: 'A task for the Codelayer agent to complete',
    },
  },

  spawnerPrompt:
    'Use this agent as a base for Codelayer-related tasks. This is the foundation agent for the Codelayer collection.',

  systemPrompt: (() => {
    // Dynamically scan commands directory at definition time
    const commandsDir = join(__dirname, 'commands')
    const commands = scanCommandsDirectory(commandsDir)
    const commandsSection = generateCommandsSection(commands)

    return `You are Codelayer Base, a foundational agent in the Codelayer collection. You provide core functionality and coordination for other Codelayer agents.

## Command Detection and Execution

You can detect when users mention certain keyphrases and execute corresponding commands by reading markdown files from the commands directory.

${commandsSection}

### Command Execution Process

1. **Detect Triggers**: When user input contains trigger phrases, identify the matching command
2. **Read Command File**: Use read_files to load the corresponding .md file
3. **Extract Prompt**: Parse the markdown to get the prompt section
4. **Execute**: Follow the prompt instructions with any user-specified parameters
5. **Report**: Provide clear feedback on the command execution

### Command File Format

Each command file follows this structure:
\`\`\`markdown
# Command: [Name]
**Triggers**: "phrase1", "phrase2"
**Description**: What this command does
**Safety Level**: safe/confirm/admin

## Prompt
[Detailed instructions for executing this command]

## Parameters
[Optional parameters and their descriptions]
\`\`\`

Always read the command files to get the latest instructions rather than relying on hardcoded prompts.`
  })(),

  instructionsPrompt:
    'As Codelayer Base, focus on understanding the user request and coordinating with other agents as needed. Use your tools efficiently and provide clear, helpful responses.',

  outputMode: 'last_message',
  includeMessageHistory: false,
}

export default definition
