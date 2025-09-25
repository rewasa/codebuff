import { publisher } from './constants'

import type {
  AgentDefinition,
  AgentStepContext,
  Logger,
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

  handleSteps: function* (
    { agentState, prompt, params }: AgentStepContext,
    logger?: Logger,
  ) {
    logger?.info(
      { phase: 'initialization', prompt },
      'Starting git-committer agent',
    )

    const output = {
      success: false,
      issues: [] as Array<{ message: string; type: 'error' | 'warning' }>,
      commitMessage: undefined as string | undefined,
      commitOutput: undefined as string | undefined,
    }

    logger?.debug({ output }, 'Initialized output structure')

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
    logger?.info({ phase: 1 }, 'Starting initial git analysis')

    const { toolResult: diffToolResult } = yield {
      toolName: 'run_terminal_command',
      input: { command: 'git diff' },
    } as const

    const diffResult = extractTerminalResult(diffToolResult)
    logger?.debug(
      {
        diffResult: {
          exitCode: diffResult?.exitCode,
          hasStdout: !!diffResult?.stdout,
        },
      },
      'Git diff command completed',
    )
    const diffError = handleCommandError(diffResult, 'get git diff')

    const { toolResult: logToolResult } = yield {
      toolName: 'run_terminal_command',
      input: { command: 'git log --oneline -10' },
    } as const

    const logResult = extractTerminalResult(logToolResult)
    logger?.debug(
      {
        logResult: {
          exitCode: logResult?.exitCode,
          hasStdout: !!logResult?.stdout,
        },
      },
      'Git log command completed',
    )
    const logError = handleCommandError(logResult, 'get git log')

    if (diffError || logError) {
      logger?.error(
        { diffError, logError, issues: output.issues },
        'Initial git analysis failed',
      )
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

    logger?.info(
      { phase: 2, diffLength: diffOutput.length, logLength: logOutput.length },
      'Providing context to AI for commit message generation',
    )

    yield {
      toolName: 'add_message',
      input: {
        role: 'user',
        content: `Please analyze the following git changes and create a concise, imperative commit message:

**Git Diff:**
\`\`\`
${diffOutput}
\`\`\`

**Recent Commits:**
\`\`\`
${logOutput}
\`\`\`

Generate ONLY the commit message text (no explanations). If unsure, use a descriptive message like "feat: add new functionality" or "fix: resolve issue".`,
      },
      includeToolCall: false,
    }

    // Phase 3: Let the AI generate commit message
    logger?.info({ phase: 3 }, 'Requesting AI to generate commit message')
    const stepResult = yield 'STEP'
    logger?.debug(
      {
        stepResult: {
          hasStepResult: !!stepResult,
          hasAgentState: !!stepResult?.agentState,
          messageHistoryLength:
            stepResult?.agentState?.messageHistory?.length || 0,
        },
      },
      'STEP completed, analyzing result',
    )

    // Phase 4: Extract commit message from AI response
    logger?.info({ phase: 4 }, 'Extracting commit message from AI response')

    // Use the updated agentState from stepResult to get the AI's response
    const updatedAgentState = stepResult?.agentState
    let commitMessage = 'Auto-commit via git-committer agent'

    // Debug: check what we have
    if (!stepResult) {
      logger?.warn({ stepResult }, 'stepResult is null/undefined')
      commitMessage = 'Debug: stepResult is null/undefined'
    } else if (!updatedAgentState) {
      logger?.warn({ stepResult }, 'updatedAgentState is null/undefined')
      commitMessage = 'Debug: updatedAgentState is null/undefined'
    } else if (!updatedAgentState.messageHistory) {
      logger?.warn({ updatedAgentState }, 'No messageHistory found')
      commitMessage = 'Debug: No messageHistory found'
    } else if (updatedAgentState.messageHistory.length === 0) {
      logger?.warn({ messageHistoryLength: 0 }, 'Empty messageHistory')
      commitMessage = 'Debug: Empty messageHistory'
    } else {
      const lastMessage =
        updatedAgentState.messageHistory[
          updatedAgentState.messageHistory.length - 1
        ]
      logger?.debug(
        {
          messageHistoryLength: updatedAgentState.messageHistory.length,
          lastMessageExists: !!lastMessage,
          lastMessageRole: lastMessage?.role,
        },
        'Analyzing last message from AI',
      )

      if (!lastMessage) {
        logger?.warn({}, 'Last message is null/undefined')
        commitMessage = 'Debug: Last message is null/undefined'
      } else if (!lastMessage.hasOwnProperty('content')) {
        logger?.warn(
          { lastMessageKeys: Object.keys(lastMessage) },
          'Last message has no content property',
        )
        commitMessage = `Debug: Last message has no content property, keys: ${Object.keys(lastMessage).join(', ')}`
      } else if (typeof lastMessage.content !== 'string') {
        logger?.warn(
          {
            contentType: typeof lastMessage.content,
            role: lastMessage.role,
          },
          'Last message content is not a string',
        )
        commitMessage = `Debug: Last message content is ${typeof lastMessage.content}, role: ${lastMessage.role || 'unknown'}`
      } else {
        // Use the entire message content as the commit message
        const rawMessage = lastMessage.content.trim()
        logger?.info(
          {
            rawMessageLength: lastMessage.content.length,
            trimmedLength: rawMessage.length,
            previewMessage:
              rawMessage.substring(0, 50) +
              (rawMessage.length > 50 ? '...' : ''),
            rawContent: lastMessage.content, // Log the actual content for debugging
          },
          'Successfully extracted commit message from AI',
        )

        if (rawMessage) {
          commitMessage = rawMessage
        } else {
          // Fallback: create a heuristic commit message
          logger?.warn(
            { rawContent: lastMessage.content },
            'AI returned empty commit message, using fallback',
          )
          commitMessage = 'chore: update files via git-committer'
        }
      }
    }

    // Phase 5: Stage and commit
    logger?.info(
      { phase: 5, commitMessage: commitMessage.substring(0, 100) },
      'Starting staging and commit process',
    )

    const { toolResult: addToolResult } = yield {
      toolName: 'run_terminal_command',
      input: { command: 'git add -A' },
    } as const

    const addResult = extractTerminalResult(addToolResult)
    logger?.debug(
      { addResult: { exitCode: addResult?.exitCode } },
      'Git add command completed',
    )
    const addError = handleCommandError(addResult, 'stage files')

    if (addError) {
      logger?.error(
        { addError, issues: output.issues },
        'Failed to stage files',
      )
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
    logger?.debug(
      { fullCommitMessage },
      'Prepared full commit message with footer',
    )
    const { toolResult: commitToolResult } = yield {
      toolName: 'run_terminal_command',
      input: {
        command: `git commit -m "${fullCommitMessage.replace(/"/g, '\\"')}"`,
      },
    } as const

    const commitResult = extractTerminalResult(commitToolResult)
    logger?.debug(
      {
        commitResult: {
          exitCode: commitResult?.exitCode,
          hasStdout: !!commitResult?.stdout,
          hasStderr: !!commitResult?.stderr,
        },
      },
      'Git commit command completed',
    )
    const commitError = handleCommandError(commitResult, 'create commit')

    // Handle "nothing to commit" as warning, not error
    if (commitError) {
      if (
        commitResult?.stdout?.includes('nothing to commit') ||
        commitResult?.stdout?.includes('working tree clean')
      ) {
        logger?.warn(
          { commitResult },
          'No changes to commit - working tree is clean',
        )
        output.issues[output.issues.length - 1].type = 'warning'
        output.issues[output.issues.length - 1].message =
          'No changes to commit - working tree is clean'
      } else {
        logger?.error(
          { commitError, commitResult, issues: output.issues },
          'Failed to create commit',
        )
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

    logger?.info(
      {
        phase: 6,
        success: true,
        commitMessage: commitMessage.substring(0, 100),
        outputLength: output.commitOutput?.length ?? 0,
        issueCount: output.issues.length,
      },
      'Git commit completed successfully',
    )

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
