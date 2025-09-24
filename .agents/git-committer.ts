import { publisher } from './constants'

import type {
  AgentDefinition,
  AgentStepContext,
} from './types/agent-definition'

const definition: AgentDefinition = {
  id: 'git-committer',
  displayName: 'Mitt the Git Committer',
  model: 'x-ai/grok-4-fast',

  publisher,
  toolNames: [
    'read_files',
    'run_terminal_command',
    'add_message',
    'end_turn',
    'set_output',
  ],

  inputSchema: {
    prompt: {
      type: 'string',
      description: 'What changes to commit',
    },
  },

  spawnerPrompt:
    'Spawn when you need to commit code changes to git with an appropriate commit message',

  systemPrompt:
    'You are an expert software developer. Your job is to create a git commit with a really good commit message.',

  instructionsPrompt:
    'Follow the steps to create a good commit: analyze changes with git diff and git log, read relevant files for context, stage appropriate files, analyze changes, and create a commit with proper formatting.',

  stepPrompt:
    'Based on the git diff and commit history I just provided, respond with ONLY a concise, imperative commit message that explains why the change was made. Do not include any analysis, explanation, or other text - just the commit message itself that will be used directly for the git commit.',

  outputMode: 'structured_output',
  outputSchema: {
    type: 'object',
    properties: {
      success: {
        type: 'boolean',
        description: 'Whether the commit was successful',
      },
      commitMessage: {
        type: 'string',
        description: 'The final commit message that was used',
      },
      commitOutput: {
        type: 'string',
        description: 'Raw output from the git commit command',
      },
      issues: {
        type: 'array',
        description:
          'Any errors or warnings encountered during the commit process',
        items: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'The issue message',
            },
            type: {
              type: 'string',
              enum: ['error', 'warning'],
              description: 'Whether this is an error or warning',
            },
          },
          required: ['message', 'type'],
        },
      },
    },
    required: ['success', 'issues'],
    additionalProperties: false,
  },

  handleSteps: function* ({ agentState, prompt, params }: AgentStepContext) {
    const output = {
      success: false,
      issues: [] as Array<{ message: string; type: 'error' | 'warning' }>,
      commitMessage: undefined as string | undefined,
      commitOutput: undefined as string | undefined,
    }

    // Helper function to extract terminal command results
    function extractTerminalResult(toolResult: any): any {
      return toolResult?.[0]?.type === 'json'
        ? (toolResult[0] as { type: 'json'; value: any }).value
        : null
    }

    // Helper function to handle command errors
    function handleCommandError(
      result: any,
      commandName: string,
      isWarning = false,
    ) {
      if (result?.exitCode !== 0) {
        output.issues.push({
          message: `Failed to ${commandName}: ${result?.stderr || result?.stdout || 'Unknown error'}`,
          type: isWarning ? 'warning' : 'error',
        })
        return true
      }
      return false
    }

    // Phase 1: Initial analysis
    const { toolResult: diffToolResult } = yield {
      toolName: 'run_terminal_command',
      input: { command: 'git diff' },
    } as const

    const diffResult = extractTerminalResult(diffToolResult)
    const diffError = handleCommandError(diffResult, 'get git diff')

    const { toolResult: logToolResult } = yield {
      toolName: 'run_terminal_command',
      input: { command: 'git log --oneline -10' },
    } as const

    const logResult = extractTerminalResult(logToolResult)
    const logError = handleCommandError(logResult, 'get git log')

    if (diffError || logError) {
      yield {
        toolName: 'set_output',
        input: output,
      } as const
      yield {
        toolName: 'end_turn',
        input: {},
      } as const
      return
    }

    // Phase 2: Provide git diff and log context to the AI
    const diffOutput = diffResult?.stdout || 'No changes detected'
    const logOutput = logResult?.stdout || 'No commit history available'

    yield {
      toolName: 'add_message',
      input: {
        role: 'assistant',
        content: `I've analyzed the git repository. Here's what I found:

**Git Diff:**
\`\`\`
${diffOutput}
\`\`\`

**Recent Commits:**
\`\`\`
${logOutput}
\`\`\`

Now I'll analyze these changes and create an appropriate commit message.`,
      },
      includeToolCall: false,
    }

    // Phase 3: Let the AI generate commit message
    const stepResult = yield 'STEP'

    // Phase 4: Extract commit message from AI response
    // Use the updated agentState from stepResult to get the AI's response
    const updatedAgentState = stepResult?.agentState
    let commitMessage = 'Auto-commit via git-committer agent'
    
    // Debug: check what we have
    if (!stepResult) {
      commitMessage = 'Debug: stepResult is null/undefined'
    } else if (!updatedAgentState) {
      commitMessage = 'Debug: updatedAgentState is null/undefined'
    } else if (!updatedAgentState.messageHistory) {
      commitMessage = 'Debug: No messageHistory found'
    } else if (updatedAgentState.messageHistory.length === 0) {
      commitMessage = 'Debug: Empty messageHistory'
    } else {
      const lastMessage = updatedAgentState.messageHistory[updatedAgentState.messageHistory.length - 1]
      if (!lastMessage) {
        commitMessage = 'Debug: Last message is null/undefined'
      } else if (!lastMessage.hasOwnProperty('content')) {
        commitMessage = `Debug: Last message has no content property, keys: ${Object.keys(lastMessage).join(', ')}`
      } else if (typeof lastMessage.content !== 'string') {
        commitMessage = `Debug: Last message content is ${typeof lastMessage.content}, role: ${lastMessage.role || 'unknown'}`
      } else {
        // Use the entire message content as the commit message
        commitMessage = lastMessage.content.trim() || 'Debug: Empty content after trim'
      }
    }

    // Phase 5: Stage and commit
    const { toolResult: addToolResult } = yield {
      toolName: 'run_terminal_command',
      input: { command: 'git add -A' },
    } as const

    const addResult = extractTerminalResult(addToolResult)
    const addError = handleCommandError(addResult, 'stage files')

    if (addError) {
      yield {
        toolName: 'set_output',
        input: output,
      } as const
      yield {
        toolName: 'end_turn',
        input: {},
      } as const
      return
    }

    // Create commit with Codebuff footer
    const fullCommitMessage = `${commitMessage}\n\n🤖 Generated with Codebuff\nCo-Authored-By: Codebuff <noreply@codebuff.com>`
    const { toolResult: commitToolResult } = yield {
      toolName: 'run_terminal_command',
      input: {
        command: `git commit -m "${fullCommitMessage.replace(/"/g, '\\"')}"`,
      },
    } as const

    const commitResult = extractTerminalResult(commitToolResult)
    const commitError = handleCommandError(commitResult, 'create commit')

    // Handle "nothing to commit" as warning, not error
    if (commitError) {
      if (
        commitResult?.stdout?.includes('nothing to commit') ||
        commitResult?.stdout?.includes('working tree clean')
      ) {
        output.issues[output.issues.length - 1].type = 'warning'
        output.issues[output.issues.length - 1].message =
          'No changes to commit - working tree is clean'
      }
      yield {
        toolName: 'set_output',
        input: output,
      } as const
      yield {
        toolName: 'end_turn',
        input: {},
      } as const
      return
    }

    // Phase 6: Set success and return commit results
    output.success = true
    output.commitMessage = commitMessage
    output.commitOutput = commitResult?.stdout || ''

    yield {
      toolName: 'set_output',
      input: output,
    }

    yield {
      toolName: 'end_turn',
      input: {},
    }
  },
}

export default definition
