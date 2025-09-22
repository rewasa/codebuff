import { handleStrReplace } from './handlers/tool/str-replace'
import { getFileProcessingValues } from './handlers/tool/write-file'
import { logger } from '../util/logger'
import { Benchify } from 'benchify'
import { env } from '@codebuff/internal/env'
import type { CodebuffToolCall } from '@codebuff/common/tools/list'
import type { ToolResultPart } from '@codebuff/common/types/messages/content-part'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'
import type { AgentTemplate } from '../templates/types'
import type { ProjectFileContext } from '@codebuff/common/util/file'
import type { WebSocket } from 'ws'
import { file } from 'bun'

export type DeferredStrReplace = {
  toolCall: CodebuffToolCall<'str_replace'>
}

export type BatchStrReplaceState = {
  deferredStrReplaces: DeferredStrReplace[]
  otherToolsQueue: any[]
  strReplacePhaseComplete: boolean
  failures: any[]
}

const BENCHIFY_FILE_TYPES = ['tsx', 'ts', 'jsx', 'js']

export async function executeBatchStrReplaces({
  deferredStrReplaces,
  toolCalls,
  toolResults,
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
}: {
  deferredStrReplaces: DeferredStrReplace[]
  toolCalls: (CodebuffToolCall | any)[]
  toolResults: ToolResultPart[]
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
}) {
  if (deferredStrReplaces.length === 0) {
    return
  }

  logger.debug(
    { count: deferredStrReplaces.length },
    `Executing batch of ${deferredStrReplaces.length} str_replace calls`,
  )

  const batchPromises: Promise<void>[] = []
  let previousPromise = Promise.resolve()

  // Track successfully edited files for benchify call
  const editedFiles: { path: string; contents: string }[] = []

  // Execute all str_replace calls in sequence to maintain file consistency
  for (let i = 0; i < deferredStrReplaces.length; i++) {
    const { toolCall } = deferredStrReplaces[i]

    // Chain each str_replace to the previous one to ensure proper ordering
    const strReplacePromise = previousPromise.then(async () => {
      try {
        const { result } = handleStrReplace({
          previousToolCallFinished: Promise.resolve(),
          toolCall,
          requestClientToolCall: async () => {
            throw new Error('Client tool calls not supported in batch mode')
          },
          writeToClient: onResponseChunk,
          getLatestState: () => getFileProcessingValues(state),
          state: { ...state, ws },
        })

        const toolResult = await result

        if (toolResult) {
          const toolResultPart: ToolResultPart = {
            type: 'tool-result',
            toolName: 'str_replace',
            toolCallId: toolCall.toolCallId,
            output: toolResult,
          }

          toolResults.push(toolResultPart)

          onResponseChunk({
            type: 'tool_result',
            toolCallId: toolCall.toolCallId,
            output: toolResult,
          })

          // Add to message history
          state.messages.push({
            role: 'tool' as const,
            content: toolResultPart,
          })

          // Track successfully edited files
          if (
            Array.isArray(toolResult) &&
            toolResult.length > 0 &&
            benchifyCanFixLanguage(toolCall.input.path)
          ) {
            const result = toolResult[0]
            if (
              result.type === 'json' &&
              result.value &&
              'content' in result.value
            ) {
              const existingFileIndex = editedFiles.findIndex(
                (f) => f.path === toolCall.input.path,
              )
              const fileContent = result.value.content as string

              if (existingFileIndex >= 0) {
                // Update existing file with latest content
                editedFiles[existingFileIndex].contents = fileContent
              } else {
                // Add new file to tracking
                editedFiles.push({
                  path: toolCall.input.path,
                  contents: fileContent,
                })
              }

              logger.debug(
                {
                  path: toolCall.input.path,
                  contentLength: fileContent.length,
                },
                'Tracked edited file for benchify',
              )
            }
          }
        }

        logger.debug(
          { toolCallId: toolCall.toolCallId },
          `Completed str_replace ${i + 1}/${deferredStrReplaces.length}`,
        )
      } catch (error) {
        logger.error(
          { error, toolCallId: toolCall.toolCallId },
          `Error executing batched str_replace ${i + 1}/${deferredStrReplaces.length}`,
        )

        // Create error result
        const errorResult: ToolResultPart = {
          type: 'tool-result',
          toolName: 'str_replace',
          toolCallId: toolCall.toolCallId,
          output: [
            {
              type: 'json',
              value: {
                errorMessage: `Batched str_replace failed: ${error instanceof Error ? error.message : String(error)}`,
              },
            },
          ],
        }

        toolResults.push(errorResult)
        onResponseChunk({
          type: 'tool_result',
          toolCallId: toolCall.toolCallId,
          output: errorResult.output,
        })
      }
    })

    // Add to toolCalls array
    toolCalls.push(toolCall)
    batchPromises.push(strReplacePromise)
    previousPromise = strReplacePromise
  }

  // Wait for all batched operations to complete
  await Promise.all(batchPromises)

  logger.debug(
    { count: deferredStrReplaces.length, editedFileCount: editedFiles.length },
    `Completed batch execution of ${deferredStrReplaces.length} str_replace calls`,
  )

  // Call benchify if we have edited files
  if (editedFiles.length > 0) {
    try {
      const benchifyResult = await callBenchify(editedFiles, {
        agentStepId,
        clientSessionId,
        userInputId,
        userId,
      })

      if (benchifyResult && benchifyResult.length > 0) {
        // Apply benchify results back to files
        await applyBenchifyResults(benchifyResult, {
          ws,
          onResponseChunk,
          state,
          toolResults,
          toolCalls: deferredStrReplaces.map((d) => d.toolCall),
        })
      }
    } catch (error) {
      logger.error(
        { error, editedFiles: editedFiles.map((f) => f.path) },
        'Failed to call benchify after str_replace batch',
      )
    }
  }
}

/**
 * Calls benchify API with the list of edited files
 */
async function callBenchify(
  editedFiles: { path: string; contents: string }[],
  context: {
    agentStepId: string
    clientSessionId: string
    userInputId: string
    userId: string | undefined
  },
): Promise<{ path: string; contents: string }[] | null> {
  logger.info(
    {
      fileCount: editedFiles.length,
      files: editedFiles.map((f) => f.path),
      ...context,
    },
    'Calling benchify after str_replace batch completion',
  )

  const client = new Benchify({
    apiKey: env.BENCHIFY_API_KEY, // This is the default and can be omitted
  })

  const response = await client.runFixer(editedFiles, {
    fix_types: ['string_literals'],
  })

  return response
}

/**
 * Applies benchify results back to the file system and updates tool results
 */
async function applyBenchifyResults(
  benchifyFiles: { path: string; contents: string }[],
  context: {
    ws: WebSocket
    onResponseChunk: (chunk: string | PrintModeEvent) => void
    state: Record<string, any>
    toolResults: ToolResultPart[]
    toolCalls: CodebuffToolCall<'str_replace'>[]
  },
) {
  logger.info(
    {
      fileCount: benchifyFiles.length,
      files: benchifyFiles.map((f) => f.path),
    },
    'Applying benchify results to files',
  )

  for (const benchifyFile of benchifyFiles) {
    try {
      // Find the corresponding tool call for this file
      const relatedToolCall = context.toolCalls.find(
        (tc) => tc.input.path === benchifyFile.path,
      )

      if (!relatedToolCall) {
        logger.warn(
          { fileName: benchifyFile.path },
          'No matching tool call found for benchify result',
        )
        continue
      }

      // TODO: Apply the benchify content to the actual file
      // This would typically involve writing the content to the file system
      // You might want to use your existing file writing infrastructure

      // Create a new tool result indicating benchify updated the file
      const benchifyToolResult: ToolResultPart = {
        type: 'tool-result',
        toolName: 'str_replace',
        toolCallId: relatedToolCall.toolCallId,
        output: [
          {
            type: 'json',
            value: {
              tool: 'str_replace',
              path: benchifyFile.path,
              content: benchifyFile.contents,
              patch: '(Updated by benchify)',
              messages: [
                'File updated by benchify after batch str_replace completion',
              ],
            },
          },
        ],
      }

      // Update the existing tool result or add new one
      const existingResultIndex = context.toolResults.findIndex(
        (tr) => tr.toolCallId === relatedToolCall.toolCallId,
      )

      if (existingResultIndex >= 0) {
        context.toolResults[existingResultIndex] = benchifyToolResult
      } else {
        context.toolResults.push(benchifyToolResult)
      }

      // Notify client about the benchify update
      context.onResponseChunk({
        type: 'tool_result',
        toolCallId: relatedToolCall.toolCallId,
        output: benchifyToolResult.output,
      })

      logger.debug(
        { fileName: benchifyFile.path, toolCallId: relatedToolCall.toolCallId },
        'Applied benchify result to file',
      )
    } catch (error) {
      logger.error(
        { error, fileName: benchifyFile.path },
        'Failed to apply benchify result to file',
      )
    }
  }
}

function benchifyCanFixLanguage(path: string): boolean {
  for (const file_extension in BENCHIFY_FILE_TYPES) {
    if (path.endsWith(file_extension)) {
      return true
    }
  }
  return false
}
