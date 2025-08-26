import { publisher } from '../constants'
import {
  PLACEHOLDER,
  type SecretAgentDefinition,
} from '../types/secret-agent-definition'

import type {
  AgentState as CommonAgentState,
  Subgoal,
} from '@codebuff/common/types/session-state'
import type { ModelName, ToolCall } from 'types/agent-definition'

export const plannerFactory = (
  model: ModelName,
): Omit<SecretAgentDefinition, 'id'> => ({
  publisher,

  model,
  displayName: 'Peter Plan',
  spawnerPrompt:
    'Creates comprehensive plans by exploring the codebase, doing research on the web, and thinking deeply. You can also use it get deep answer to any question. This is a slow agent -- prefer to use it for complex tasks that require thinking.',
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'The task to plan for',
    },
    params: {
      type: 'object',
      properties: {
        subgoals: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              objective: { type: 'string' },
              status: {
                type: 'string',
                enum: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETE', 'ABORTED'],
              },
            },
            required: ['id', 'objective', 'status'],
          },
        },
      },
      required: [],
    },
  },
  outputMode: 'structured_output',
  outputSchema: {
    type: 'object',
    properties: {
      plan: {
        type: 'string',
        description: 'The comprehensive implementation plan',
      },
      subgoals: {
        type: 'array',
        description: 'Array of subgoals for tracking progress',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            objective: { type: 'string' },
            status: {
              type: 'string',
              enum: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETE', 'ABORTED'],
            },
          },
          required: ['id', 'objective', 'status'],
        },
      },
    },
    required: ['plan', 'subgoals'],
  },
  includeMessageHistory: true,
  toolNames: [
    'spawn_agents',
    'read_files',
    'create_plan',
    'add_subgoal',
    'set_output',
    'end_turn',
  ],
  spawnableAgents: ['file-explorer', 'researcher', 'thinker-gpt-5-high'],

  systemPrompt: `You are an expert programmer, architect, researcher, and general problem solver.
You spawn agents to help you gather information which will be used to create a plan.

${PLACEHOLDER.FILE_TREE_PROMPT}
${PLACEHOLDER.KNOWLEDGE_FILES_CONTENTS}`,

  instructionsPrompt: `Create a comprehensive plan for the given task.

Process:
- Spawn a file-explorer to understand the relevant codebase. You may also spawn a researcher to search the web for relevant information at the same time.
- After gathering information, spawn a thinker to analyze the best approach and craft a plan.

Subgoals:
- Identify concrete steps as subgoals and add them using the add_subgoal tool (with id, objective, and status).
- Always include the current subgoals in your final set_output so the base agent can pass them to the editor.`,

  handleSteps: function* ({ prompt }) {
    // Step 1: Spawn file-explorer and parse out the file paths
    const { agentState: stateAfterFileExplorer } =
      (yield 'STEP') as unknown as {
        agentState: CommonAgentState
        stepsComplete: boolean
        toolResult: string | undefined
      }
    const { messageHistory } = stateAfterFileExplorer
    const lastAssistantMessageIndex =
      stateAfterFileExplorer.messageHistory.findLastIndex(
        (message) => message.role === 'assistant',
      )
    const toolResultMessage = (messageHistory[
      lastAssistantMessageIndex + 1
    ] as { content: string }) ?? {
      content: '',
    }
    const filePaths = parseFilePathsFromToolResult(toolResultMessage.content)

    yield {
      toolName: 'read_files',
      input: {
        paths: filePaths,
      },
    } satisfies ToolCall

    // Step 3: Spawn deep-thinker to analyze approach
    const { toolResult: deepThinkerToolResult } = yield {
      toolName: 'spawn_agents',
      input: {
        agents: [
          {
            agent_type: 'thinker-gpt-5-high',
            prompt: `Create a clear implementation plan for the following task, with a focus on simplicity and making the minimal changes necessary for an awesome implementation. Prompt: ${prompt}`,
          },
        ],
      },
    }

    function parseFilePathsFromToolResult(content: string): string[] {
      const filePaths: string[] = []

      // Match file paths that look like valid paths (containing / and file extensions)
      const filePathRegex =
        /(?:^|\s|\*\s*)((?:[\w-]+\/)*[\w.-]+\.[a-zA-Z]{1,4})(?=\s|$|,|\.|:)/gm

      let match
      while ((match = filePathRegex.exec(content)) !== null) {
        const filePath = match[1]
        // Filter out obvious false positives and ensure reasonable path structure
        if (
          filePath &&
          !filePath.startsWith('http') &&
          !filePath.includes('@') &&
          filePath.length > 3 &&
          filePath.split('/').length <= 10
        ) {
          filePaths.push(filePath)
        }
      }

      // Also look for backtick-quoted file paths
      const backtickPathRegex = /`([^`]+\.[a-zA-Z]{1,4})`/g
      while ((match = backtickPathRegex.exec(content)) !== null) {
        const filePath = match[1]
        if (
          filePath &&
          !filePath.startsWith('http') &&
          !filePath.includes('@')
        ) {
          filePaths.push(filePath)
        }
      }

      // Remove duplicates and return
      return [...new Set(filePaths)]
    }
  },
})
