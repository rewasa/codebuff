import { publisher } from '../constants'
import {
  PLACEHOLDER,
  type SecretAgentDefinition,
} from '../types/secret-agent-definition'

import type {
  AgentState as CommonAgentState,
  Subgoal,
} from '@codebuff/common/types/session-state'

const editor: SecretAgentDefinition = {
  id: 'editor',
  publisher,
  model: 'openai/gpt-5',
  displayName: 'Code Editor',
  spawnerPrompt:
    'Expert code editor with access to tools to find and edit files, run terminal commands, and search the web. Can handle small to medium sized tasks, or work off of a plan for more complex tasks. For easy tasks, you can spawn this agent directly rather than invoking a scout or planner first.',
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'The coding task to implement',
    },
    params: {
      type: 'object',
      properties: {
        maxContextLength: {
          type: 'number',
        },
        context: {
          type: 'object',
          description:
            'Any information that should be passed to the agent to help it perform the task',
        },
        // Add subgoals so the editor can track and update them
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
      message: {
        type: 'string',
        description:
          'Summary message of the changes made or response to user request',
      },
      edits: {
        type: 'array',
        description:
          'Array of edit results from write_file and str_replace operations',
        items: {
          type: 'string',
        },
      },
      subgoals: {
        type: 'array',
        description: 'Array of subgoals with their current status',
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
    additionalProperties: true,
  },
  includeMessageHistory: true,
  toolNames: [
    'read_files',
    'write_file',
    'str_replace',
    'run_terminal_command',
    'code_search',
    'spawn_agents',
    'add_message',
    'set_output',
    'update_subgoal',
    'end_turn',
  ],
  spawnableAgents: ['file-explorer', 'web-researcher', 'docs-researcher'],

  systemPrompt: `You are an expert code editor with deep understanding of software engineering principles.

You are extremely skilled at:
- Reading and understanding existing codebases
- Following existing codebase patterns
- Never duplicating existing code and always reusing existing code when possible
- Making the minimal change necessary to implement the user request
- Calling the set_output tool to with a clear explanation of the changes made or with an answer to the user's question
- Not writing a final summary outside of the one that you include in the set_output tool

- **Conventions:** Rigorously adhere to existing project conventions when reading or modifying code. Analyze surrounding code, tests, and configuration first.
- **Libraries/Frameworks:** NEVER assume a library/framework is available or appropriate. Verify its established usage within the project (check imports, configuration files like 'package.json', 'Cargo.toml', 'requirements.txt', 'build.gradle', etc., or observe neighboring files) before employing it.
- **Style & Structure:** Mimic the style (formatting, naming), structure, framework choices, typing, and architectural patterns of existing code in the project.
- **Idiomatic Changes:** When editing, understand the local context (imports, functions/classes) to ensure your changes integrate naturally and idiomatically.
- **No code comments:** *NEVER* add any comments while writing code, unless the user asks you to! *NEVER* talk to the user or describe your changes through comments. Do not edit comments that are separate from the code you are changing.
- **Minimal Changes:** Make as few changes as possible to satisfy the user request! Don't go beyond what the user has asked for.
- **Code Reuse:** Always reuse helper functions, components, classes, etc., whenever possible! Don't reimplement what already exists elsewhere in the codebase.
- **Security First:** Always apply security best practices. Never introduce code that exposes, logs, or commits secrets, API keys, or other sensitive information.
- **Front end development** We want to make the UI look as good as possible. Don't hold back. Give it your all.
    - Include as many relevant features and interactions as possible
    - Add thoughtful details like hover states, transitions, and micro-interactions
    - Apply design principles: hierarchy, contrast, balance, and movement
    - Create an impressive demonstration showcasing web development capabilities
-  **Refactoring Awareness:** Whenever you modify an exported symbol like a function or class or variable, you should find and update all the references to it appropriately.
-  **Package Management:** When adding new packages, use the run_terminal_command tool to install the package rather than editing the package.json file with a guess at the version number to use (or similar for other languages). This way, you will be sure to have the latest version of the package. Do not install packages globally unless asked by the user (e.g. Don't run \`npm install -g <package-name>\`). Always try to use the package manager associated with the project (e.g. it might be \`pnpm\` or \`bun\` or \`yarn\` instead of \`npm\`, or similar for other languages).
-  **Code Hygiene:** Make sure to leave things in a good state:
    - Don't forget to add any imports that might be needed
    - Remove unused variables, functions, and files as a result of your changes.
    - If you added files or functions meant to replace existing code, then you should also remove the previous code.
- **Edit multiple files at once:** When you edit files, you must make as many tool calls as possible in a single message. This is faster and much more efficient than making all the tool calls in separate messages. It saves users thousands of dollars in credits if you do this!
<example>
Assistant: I will now implement feature X.

<codebuff_tool_call>
{
  "toolName": "str_replace",
  "input": {
    "filePath": "src/components/Button.tsx",
    "oldContent": "...",
    "newContent": "...",
  }
}
</codebuff_tool_call>

<codebuff_tool_call>
{
  "toolName": "str_replace",
  "input": {
    "filePath": "src/components/Button.tsx",
    "oldContent": "...",
    "newContent": "...",
  }
}
</codebuff_tool_call>

// ... 8 more str_replace tool calls ...

Let's see what the code looks like now.

User: <tool_result>
<tool>str_replace</tool>
<result>...</result>
</tool_result>

<tool_result>
<tool>str_replace</tool>
<result>...</result>
</tool_result>

// ... 8 more tool_result blocks ...
</example>
- **Summarize with set_output:** You must use the set_output tool before finishing and include a clear explanation of the changes made or an answer to the user prompt. Do not write a separate summary outside of the set_output tool.

- **Subgoals:** These are crucial to staying on track to solve the user's request.
  - When you start work on a subgoal, mark it IN_PROGRESS using update_subgoal with a brief log of what you're doing.
  - When you complete a subgoal, mark it COMPLETE and add a concise log.
  - Always include the current subgoals in your final set_output so the base agent can pass the latest state back to the planner.

${PLACEHOLDER.KNOWLEDGE_FILES_CONTENTS}`,

  instructionsPrompt: `Implement the requested changes. Feel free to ignore the plan if it seems incorrect.

# Instructions

- It's helpful to spawn a file explorer to discover all the relevant files for implementing the plan. You can also spawn a web-researcher or docs-researcher at the same time to find information on the web, if relevant.
- You must read all relevant files to understand the current state. You must read any file that could be relevant to the plan, especially files you need to modify, but also files that could show codebase patterns you could imitate. Try to read a lot of files in a single tool call. E.g. use read_files on 12 different files, and then use read_files on 6 more files that fill in the gaps.
- Implement changes using str_replace or write_file.
- You must use the set_output tool before finishing and include the following in your summary:
  - An answer to the user prompt (if they asked a question).
  - An explanation of the changes made.
  - A note on any checks you ran to verify the changes, such as tests, typechecking, etc.
- Do not write a summary outside of the one that you include in the set_output tool.
- As soon as you use set_output, you must end your turn using the end_turn tool.
`,

  handleSteps: function* ({ agentState: initialAgentState }) {
    const stepLimit = 20
    let stepCount = 0
    let agentState = initialAgentState as CommonAgentState

    while (true) {
      stepCount++

      const stepResult = (yield 'STEP') as unknown as {
        agentState: CommonAgentState
        stepsComplete: boolean
        toolResult: string | undefined
      }
      agentState = stepResult.agentState // Capture the latest state

      // Check if all subgoals have been attempted (none are NOT_STARTED)
      const subgoals = Object.values(agentState.agentContext ?? {}) as Subgoal[]
      const hasNotStartedSubgoals = subgoals.some(
        (sg) => sg.status === 'NOT_STARTED',
      )
      const hasInProgressSubgoals = subgoals.some(
        (sg) => sg.status === 'IN_PROGRESS',
      )

      // Only consider job done if LLM wants to complete AND all subgoals have been attempted and resolved
      if (
        stepResult.stepsComplete &&
        !hasNotStartedSubgoals &&
        !hasInProgressSubgoals
      ) {
        break
      }

      // If LLM wants to complete but there are still NOT_STARTED subgoals, remind it to continue
      if (stepResult.stepsComplete && hasNotStartedSubgoals) {
        const notStartedSubgoals = subgoals.filter(
          (sg) => sg.status === 'NOT_STARTED',
        )
        const subgoalSummary = notStartedSubgoals
          .map((sg) => `- ${sg.objective || 'Unnamed subgoal'}`)
          .join('\n')

        yield {
          toolName: 'add_message',
          input: {
            role: 'user',
            content: `You still have subgoals that haven't been attempted yet. Please continue working on these remaining subgoals before finishing:\n\n${subgoalSummary}\n\nMark each subgoal as IN_PROGRESS when you start working on it, and COMPLETE when finished.`,
          },
        }

        // Continue to next step to work on remaining subgoals
        continue
      }

      // If LLM wants to complete but there are IN_PROGRESS subgoals, ask to resolve them
      if (stepResult.stepsComplete && hasInProgressSubgoals) {
        const inProgressSubgoals = subgoals.filter(
          (sg) => sg.status === 'IN_PROGRESS',
        )
        const subgoalSummary = inProgressSubgoals
          .map((sg) => `- ${sg.objective || 'Unnamed subgoal'}`)
          .join('\n')

        yield {
          toolName: 'add_message',
          input: {
            role: 'user',
            content: `You still have subgoals marked as IN_PROGRESS. Before finishing, please resolve each by marking it as COMPLETE or ABORTED as appropriate:\n\n${subgoalSummary}`,
          },
        }

        continue
      }

      // If we've reached within one of the step limit, ask LLM to summarize progress
      if (stepCount === stepLimit - 1) {
        yield {
          toolName: 'add_message',
          input: {
            role: 'user',
            content:
              'You have reached the step limit. Please use the set_output tool now to summarize your progress so far, what you still need to solve, and provide any insights that could help complete the remaining work. Please end your turn after using the set_output tool with the end_turn tool.',
          },
        }

        // One final step to produce the summary
        const finalStepResult = (yield 'STEP') as unknown as {
          agentState: CommonAgentState
        }
        agentState = finalStepResult.agentState
        break
      }
    }

    // Collect all the edits from the conversation
    const { messageHistory, output } = agentState
    const editToolResults: string[] = []
    for (const message of messageHistory) {
      if (
        message.role === 'user' &&
        typeof message.content === 'string' &&
        message.content.includes('<tool_result>')
      ) {
        // Parse out tool results for write_file and str_replace
        const writeFileMatches = message.content.match(
          /<tool_result>\s*<tool>write_file<\/tool>\s*<result>([\s\S]*?)<\/result>\s*<\/tool_result>/g,
        )
        const strReplaceMatches = message.content.match(
          /<tool_result>\s*<tool>str_replace<\/tool>\s*<result>([\s\S]*?)<\/result>\s*<\/tool_result>/g,
        )

        // Extract inner <result> content from write_file matches
        if (writeFileMatches) {
          for (const match of writeFileMatches) {
            const resultMatch = match.match(/<result>([\s\S]*?)<\/result>/)
            if (resultMatch) {
              editToolResults.push(resultMatch[1])
            }
          }
        }

        // Extract inner <result> content from str_replace matches
        if (strReplaceMatches) {
          for (const match of strReplaceMatches) {
            const resultMatch = match.match(/<result>([\s\S]*?)<\/result>/)
            if (resultMatch) {
              editToolResults.push(resultMatch[1])
            }
          }
        }
      }
    }
    const successfulEdits = editToolResults.filter(
      (edit) => edit.includes('successfully') && edit.includes('Changes made:'),
    )

    yield {
      toolName: 'set_output',
      input: {
        ...output,
        edits: editToolResults,
      },
    }
  },
}

export default editor
