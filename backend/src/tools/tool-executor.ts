import { endsAgentStepParam } from '@codebuff/common/tools/constants'
import { generateCompactId } from '@codebuff/common/util/string'
import z from 'zod/v4'
import { convertJsonSchemaToZod } from 'zod-from-json-schema'

import { checkLiveUserInput } from '../live-user-inputs'
import { logger } from '../util/logger'
import { requestToolCall } from '../websockets/websocket-action'
import { codebuffToolDefs } from './definitions/list'
import { codebuffToolHandlers } from './handlers/list'

import type { CodebuffToolHandlerFunction } from './handlers/handler-function-type'
import type { AgentTemplate } from '../templates/types'
import type { ToolName } from '@codebuff/common/tools/constants'
import type {
  ClientToolCall,
  ClientToolName,
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { Message } from '@codebuff/common/types/messages/codebuff-message'
import type {
  ToolResultOutput,
  ToolResultPart,
} from '@codebuff/common/types/messages/content-part'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'
import type {
  customToolDefinitionsSchema,
  ProjectFileContext,
} from '@codebuff/common/util/file'
import type { ToolCallPart } from 'ai'
import type { WebSocket } from 'ws'

export type CustomToolCall = {
  toolName: string
  input: Record<string, unknown>
} & Omit<ToolCallPart, 'type'>

export type ToolCallError = {
  toolName?: string
  input: Record<string, unknown>
  error: string
} & Pick<CodebuffToolCall, 'toolCallId'>

export function parseRawToolCall<T extends ToolName = ToolName>(
  rawToolCall: {
    toolName: T
    toolCallId: string
    input: Record<string, unknown>
  },
  autoInsertEndStepParam: boolean = false,
): CodebuffToolCall<T> | ToolCallError {
  const toolName = rawToolCall.toolName

  if (!(toolName in codebuffToolDefs)) {
    return {
      toolName,
      toolCallId: rawToolCall.toolCallId,
      input: rawToolCall.input,
      error: `Tool ${toolName} not found`,
    }
  }
  const validName = toolName as T

  const processedParameters: Record<string, any> = {}
  for (const [param, val] of Object.entries(rawToolCall.input ?? {})) {
    processedParameters[param] = val
  }

  // Add the required codebuff_end_step parameter with the correct value for this tool if requested
  if (autoInsertEndStepParam) {
    processedParameters[endsAgentStepParam] =
      codebuffToolDefs[validName].endsAgentStep
  }

  const paramsSchema = codebuffToolDefs[validName].endsAgentStep
    ? (
        codebuffToolDefs[validName]
          .parameters satisfies z.ZodObject as z.ZodObject
      ).extend({
        [endsAgentStepParam]: z.literal(
          codebuffToolDefs[validName].endsAgentStep,
        ),
      })
    : codebuffToolDefs[validName].parameters
  const result = paramsSchema.safeParse(processedParameters)

  if (!result.success) {
    return {
      toolName: validName,
      toolCallId: rawToolCall.toolCallId,
      input: rawToolCall.input,
      error: `Invalid parameters for ${validName}: ${JSON.stringify(
        result.error.issues,
        null,
        2,
      )}`,
    }
  }

  if (endsAgentStepParam in result.data) {
    delete result.data[endsAgentStepParam]
  }

  return {
    toolName: validName,
    input: result.data,
    toolCallId: rawToolCall.toolCallId,
  } as CodebuffToolCall<T>
}

export interface ExecuteToolCallParams<T extends string = ToolName> {
  toolName: T
  input: Record<string, unknown>
  toolCalls: (CodebuffToolCall | CustomToolCall)[]
  toolResults: ToolResultPart[]
  previousToolCallFinished: Promise<void>
  ws: WebSocket
  agentTemplate: AgentTemplate
  fileContext: ProjectFileContext
  agentStepId: string
  clientSessionId: string
  userInputId: string
  fullResponse: string
  onResponseChunk: (chunk: string | PrintModeEvent) => void
  state: Record<string, any>
  userId: string | undefined
  autoInsertEndStepParam?: boolean
  excludeToolFromMessageHistory?: boolean
}

export function executeToolCall<T extends ToolName>({
  toolName,
  input,
  toolCalls,
  toolResults,
  previousToolCallFinished,
  ws,
  agentTemplate,
  fileContext,
  agentStepId,
  clientSessionId,
  userInputId,
  fullResponse,
  onResponseChunk,
  state,
  userId,
  autoInsertEndStepParam = false,
  excludeToolFromMessageHistory = false,
}: ExecuteToolCallParams<T>): Promise<void> {
  logger.info(
    {
      toolName,
      input,
      agentStepId,
      userId,
      agentType: agentTemplate.id,
      hasAgentState: !!state.agentState,
      inputKeys: Object.keys(input || {}),
    },
    `executeToolCall: Starting execution of tool '${toolName}'`,
  )
  const toolCall: CodebuffToolCall<T> | ToolCallError = parseRawToolCall<T>(
    {
      toolName,
      toolCallId: generateCompactId(),
      input,
    },
    autoInsertEndStepParam,
  )
  if ('error' in toolCall) {
    toolResults.push({
      type: 'tool-result',
      toolName,
      toolCallId: toolCall.toolCallId,
      output: [
        {
          type: 'json',
          value: {
            errorMessage: toolCall.error,
          },
        },
      ],
    })
    logger.error(
      { toolCall, error: toolCall.error, agentType: agentTemplate.id },
      `executeToolCall: Tool '${toolName}' failed with parsing error: ${toolCall.error}`,
    )
    return previousToolCallFinished
  }

  logger.info(
    {
      toolName,
      toolCallId: toolCall.toolCallId,
      agentType: agentTemplate.id,
      parsedInput: toolCall.input,
    },
    `executeToolCall: Successfully parsed tool call for '${toolName}'`,
  )

  onResponseChunk({
    type: 'tool_call',
    toolCallId: toolCall.toolCallId,
    toolName,
    input: toolCall.input,
  })

  toolCalls.push(toolCall)

  // Filter out restricted tools in ask mode unless exporting summary
  if (!agentTemplate.toolNames.includes(toolCall.toolName)) {
    logger.warn(
      {
        toolName,
        availableTools: agentTemplate.toolNames,
        agentType: agentTemplate.id,
      },
      `executeToolCall: Tool '${toolName}' is not available for agent type '${agentTemplate.id}'`,
    )
    toolResults.push({
      type: 'tool-result',
      toolName,
      toolCallId: toolCall.toolCallId,
      output: [
        {
          type: 'json',
          value: {
            errorMessage: `Tool \`${toolName}\` is not currently available. Make sure to only use tools listed in the system instructions.`,
          },
        },
      ],
    })
    return previousToolCallFinished
  }

  logger.info(
    {
      toolName,
      agentType: agentTemplate.id,
      isSetOutput: toolName === 'set_output',
    },
    `executeToolCall: Tool '${toolName}' is available, proceeding with execution`,
  )

  // Cast to any to avoid type errors
  const handler = codebuffToolHandlers[toolName] as any
  const { result: toolResultPromise, state: stateUpdate } = handler({
    previousToolCallFinished,
    fileContext,
    agentStepId,
    clientSessionId,
    userInputId,
    fullResponse,
    writeToClient: onResponseChunk,
    requestClientToolCall: async (
      clientToolCall: ClientToolCall<T extends ClientToolName ? T : never>,
    ) => {
      if (!checkLiveUserInput(userId, userInputId, clientSessionId)) {
        return []
      }

      const clientToolResult = await requestToolCall(
        ws,
        userInputId,
        clientToolCall.toolName,
        clientToolCall.input,
      )
      return clientToolResult.output as CodebuffToolOutput<T>
    },
    toolCall,
    getLatestState: () => state,
    state,
  }) as ReturnType<CodebuffToolHandlerFunction<T>>

  for (const [key, value] of Object.entries(stateUpdate ?? {})) {
    if (key === 'agentState' && typeof value === 'object' && value !== null) {
      // Replace the agentState reference to ensure all updates are captured
      state.agentState = value
    } else {
      state[key] = value
    }
  }

  return toolResultPromise.then((result) => {
    const toolResult: ToolResultPart = {
      type: 'tool-result',
      toolName,
      toolCallId: toolCall.toolCallId,
      output: result,
    }
    logger.info(
      {
        input,
        toolResult,
        agentType: agentTemplate.id,
        isSetOutput: toolName === 'set_output',
        resultUndefined: result === undefined,
        resultLength: Array.isArray(result) ? result.length : 'not-array',
      },
      `executeToolCall: Tool '${toolName}' completed with result (${toolResult.toolCallId})`,
    )
    if (result === undefined) {
      logger.warn(
        {
          toolName,
          toolCallId: toolCall.toolCallId,
          agentType: agentTemplate.id,
        },
        `executeToolCall: Tool '${toolName}' returned undefined result`,
      )
      return
    }

    onResponseChunk({
      type: 'tool_result',
      toolCallId: toolResult.toolCallId,
      output: toolResult.output,
    })

    toolResults.push(toolResult)

    if (!excludeToolFromMessageHistory) {
      state.messages.push({
        role: 'tool' as const,
        content: toolResult,
      })
    }
  })
}

export function parseRawCustomToolCall(
  customToolDefs: z.infer<typeof customToolDefinitionsSchema>,
  rawToolCall: {
    toolName: string
    toolCallId: string
    input: Record<string, unknown>
  },
  autoInsertEndStepParam: boolean = false,
): CustomToolCall | ToolCallError {
  const toolName = rawToolCall.toolName

  if (!(toolName in customToolDefs)) {
    return {
      toolName,
      toolCallId: rawToolCall.toolCallId,
      input: rawToolCall.input,
      error: `Tool ${toolName} not found`,
    }
  }

  const processedParameters: Record<string, any> = {}
  for (const [param, val] of Object.entries(rawToolCall.input ?? {})) {
    processedParameters[param] = val
  }

  // Add the required codebuff_end_step parameter with the correct value for this tool if requested
  if (autoInsertEndStepParam) {
    processedParameters[endsAgentStepParam] =
      customToolDefs[toolName].endsAgentStep
  }

  const jsonSchema = JSON.parse(
    JSON.stringify(customToolDefs[toolName].inputJsonSchema),
  )
  if (customToolDefs[toolName].endsAgentStep) {
    if (!jsonSchema.properties) {
      jsonSchema.properties = {}
    }
    jsonSchema.properties[endsAgentStepParam] = {
      const: true,
      type: 'boolean',
      description: 'Easp flag must be set to true',
    }
    if (!jsonSchema.required) {
      jsonSchema.required = []
    }
    jsonSchema.required.push(endsAgentStepParam)
  }
  const paramsSchema = convertJsonSchemaToZod(jsonSchema)
  const result = paramsSchema.safeParse(
    processedParameters,
  ) as z.ZodSafeParseResult<any>

  if (!result.success) {
    return {
      toolName: toolName,
      toolCallId: rawToolCall.toolCallId,
      input: rawToolCall.input,
      error: `Invalid parameters for ${toolName}: ${JSON.stringify(
        result.error.issues,
        null,
        2,
      )}`,
    }
  }

  const input = JSON.parse(JSON.stringify(rawToolCall.input))
  if (endsAgentStepParam in input) {
    delete input[endsAgentStepParam]
  }
  return {
    toolName: toolName,
    input,
    toolCallId: rawToolCall.toolCallId,
  }
}

export function executeCustomToolCall({
  toolName,
  input,
  toolCalls,
  toolResults,
  previousToolCallFinished,
  ws,
  agentTemplate,
  fileContext,
  clientSessionId,
  userInputId,
  onResponseChunk,
  state,
  userId,
  autoInsertEndStepParam = false,
  excludeToolFromMessageHistory = false,
}: ExecuteToolCallParams<string>): Promise<void> {
  const toolCall: CustomToolCall | ToolCallError = parseRawCustomToolCall(
    fileContext.customToolDefinitions,
    {
      toolName,
      toolCallId: generateCompactId(),
      input,
    },
    autoInsertEndStepParam,
  )
  if ('error' in toolCall) {
    toolResults.push({
      type: 'tool-result',
      toolName,
      toolCallId: toolCall.toolCallId,
      output: [
        {
          type: 'json',
          value: {
            errorMessage: toolCall.error,
          },
        },
      ],
    })
    logger.debug(
      { toolCall, error: toolCall.error },
      `${toolName} error: ${toolCall.error}`,
    )
    return previousToolCallFinished
  }

  onResponseChunk({
    type: 'tool_call',
    toolCallId: toolCall.toolCallId,
    toolName,
    input: toolCall.input,
  })

  toolCalls.push(toolCall)

  // Filter out restricted tools in ask mode unless exporting summary
  if (!(agentTemplate.toolNames as string[]).includes(toolCall.toolName)) {
    toolResults.push({
      type: 'tool-result',
      toolName,
      toolCallId: toolCall.toolCallId,
      output: [
        {
          type: 'json',
          value: {
            errorMessage: `Tool \`${toolName}\` is not currently available. Make sure to only use tools listed in the system instructions.`,
          },
        },
      ],
    })
    return previousToolCallFinished
  }

  return previousToolCallFinished
    .then(async () => {
      if (!checkLiveUserInput(userId, userInputId, clientSessionId)) {
        return null
      }

      const clientToolResult = await requestToolCall(
        ws,
        userInputId,
        toolCall.toolName,
        toolCall.input,
      )
      return clientToolResult.output satisfies ToolResultOutput[]
    })
    .then((result) => {
      if (result === null) {
        return
      }
      const toolResult = {
        type: 'tool-result',
        toolName,
        toolCallId: toolCall.toolCallId,
        output: result,
      } satisfies ToolResultPart
      logger.debug(
        { input, toolResult },
        `${toolName} custom tool call & result (${toolResult.toolCallId})`,
      )
      if (result === undefined) {
        return
      }

      onResponseChunk({
        type: 'tool_result',
        toolCallId: toolResult.toolCallId,
        output: toolResult.output,
      })

      toolResults.push(toolResult)

      if (!excludeToolFromMessageHistory) {
        state.messages.push({
          role: 'tool' as const,
          content: toolResult,
        } satisfies Message)
      }
      return
    })
}
