import { getAgentTemplate } from '../../../templates/agent-registry'
import { logger } from '../../../util/logger'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import type { AgentState } from '@codebuff/common/types/session-state'
import type { ProjectFileContext } from '@codebuff/common/util/file'

type ToolName = 'set_output'
export const handleSetOutput = ((params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<ToolName>
  fileContext: ProjectFileContext
  state: {
    agentState?: AgentState
    localAgentTemplates?: Record<string, AgentTemplate>
  }
}): {
  result: Promise<CodebuffToolOutput<ToolName>>
  state: { agentState: AgentState }
} => {
  const { previousToolCallFinished, toolCall, state } = params
  const output = toolCall.input
  const { agentState, localAgentTemplates } = state

  logger.info(
    {
      toolCallId: toolCall.toolCallId,
      agentType: agentState?.agentType,
      agentId: agentState?.agentId,
      hasAgentState: !!agentState,
      hasLocalAgentTemplates: !!localAgentTemplates,
      outputProvided: !!output,
      outputType: typeof output,
      outputKeys:
        output && typeof output === 'object' ? Object.keys(output) : null,
    },
    'handleSetOutput: set_output tool handler called',
  )

  if (!agentState) {
    throw new Error(
      'Internal error for set_output: Missing agentState in state',
    )
  }

  if (!localAgentTemplates) {
    throw new Error(
      'Internal error for set_output: Missing localAgentTemplates in state',
    )
  }

  const triggerSetOutput = async () => {
    logger.info(
      {
        agentType: agentState.agentType,
        agentId: agentState.agentId,
        outputReceived: output,
        outputType: typeof output,
        hasOutput: !!output,
      },
      'set_output: received output data',
    )

    // Validate output against outputSchema if defined
    let agentTemplate = null
    if (agentState.agentType) {
      agentTemplate = await getAgentTemplate(
        agentState.agentType,
        localAgentTemplates,
      )
      logger.info(
        {
          agentType: agentState.agentType,
          hasOutputSchema: !!agentTemplate?.outputSchema,
          outputSchemaKeys: agentTemplate?.outputSchema
            ? Object.keys(agentTemplate.outputSchema)
            : null,
        },
        'set_output: agent template and schema info',
      )
    }
    if (agentTemplate?.outputSchema) {
      try {
        const validationResult = agentTemplate.outputSchema.parse(output)
        logger.info(
          {
            agentType: agentState.agentType,
            validationSucceeded: true,
            validatedOutput: validationResult,
          },
          'set_output: schema validation succeeded',
        )
      } catch (error) {
        const errorMessage = `Output validation error: Output failed to match the output schema and was ignored. You might want to try again! Issues: ${error}`
        logger.error(
          {
            output,
            agentType: agentState.agentType,
            agentId: agentState.agentId,
            error,
            errorMessage: String(error),
          },
          'set_output validation error',
        )
        return errorMessage
      }
    }

    // Set the output (completely replaces previous output)
    const previousOutput = agentState.output
    agentState.output = output

    logger.info(
      {
        agentType: agentState.agentType,
        agentId: agentState.agentId,
        previousOutput,
        newOutput: agentState.output,
        outputSet: true,
      },
      'set_output: output successfully set on agent state',
    )

    return 'Output set'
  }

  return {
    result: (async () => {
      logger.info(
        {
          toolCallId: toolCall.toolCallId,
          agentType: agentState?.agentType,
        },
        'handleSetOutput: waiting for previous tool call to finish',
      )
      await previousToolCallFinished
      logger.info(
        {
          toolCallId: toolCall.toolCallId,
          agentType: agentState?.agentType,
        },
        'handleSetOutput: previous tool call finished, executing triggerSetOutput',
      )
      const message = await triggerSetOutput()
      const result: [{ type: 'json'; value: { message: string } }] = [
        {
          type: 'json',
          value: {
            message,
          },
        },
      ]
      logger.info(
        {
          toolCallId: toolCall.toolCallId,
          agentType: agentState?.agentType,
          message,
          result,
        },
        'handleSetOutput: returning result from set_output handler',
      )
      return result
    })(),
    state: { agentState: agentState },
  }
}) satisfies CodebuffToolHandlerFunction<ToolName>
