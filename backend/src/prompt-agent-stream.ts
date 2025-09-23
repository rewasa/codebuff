import { providerModelNames } from '@codebuff/common/old-constants'

import { globalStopSequence } from './tools/constants'
import { env } from '@codebuff/internal/env'

import type { AgentTemplate } from './templates/types'
import type { PromptAiSdkStreamFn } from '@codebuff/common/types/contracts/llm'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ParamsOf } from '@codebuff/common/types/function-params'
import type { Message } from '@codebuff/common/types/messages/codebuff-message'
import type { OpenRouterProviderOptions } from '@codebuff/internal/openrouter-ai-sdk'

export const getAgentStreamFromTemplate = (params: {
  clientSessionId: string
  fingerprintId: string
  userInputId: string
  userId: string | undefined
  onCostCalculated?: (credits: number) => Promise<void>
  agentId?: string
  includeCacheControl?: boolean

  template: AgentTemplate
  logger: Logger
  promptAiSdkStream: PromptAiSdkStreamFn
}) => {
  const {
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    onCostCalculated,
    agentId,
    includeCacheControl,
    template,
    logger,
    promptAiSdkStream,
  } = params

  if (!template) {
    throw new Error('Agent template is null/undefined')
  }

  const { model } = template

  // Optional override: In lite mode, prefer OpenRouter free model when enabled
  let effectiveModel = model as any
  try {
    const isLiteAgent = typeof template.id === 'string' && template.id.includes('base-lite')
    const enabled = env.OPENROUTER_LITE_FREE_ENABLED === 'true'
    if (enabled && isLiteAgent) {
      const current = Array.isArray(model) ? (model as any[])[0] : (model as any)
      const alreadyFree = typeof current === 'string' && current.includes(':free')
      if (!alreadyFree) {
        const freeSlug = env.OPENROUTER_LITE_FREE_MODEL || 'x-ai/grok-4-fast:free'
        effectiveModel = freeSlug as any
      }
    }
  } catch {}

  const getStream = (messages: Message[]) => {
    const aiSdkStreamParams: ParamsOf<PromptAiSdkStreamFn> = {
      messages,
      model: effectiveModel,
      stopSequences: [globalStopSequence],
      clientSessionId,
      fingerprintId,
      userInputId,
      userId,
      maxOutputTokens: 32_000,
      onCostCalculated,
      includeCacheControl,
      agentId,
      maxRetries: 3,
      logger,
    }

    // Add Gemini-specific options if needed
    const primaryModel = Array.isArray(effectiveModel) ? (effectiveModel as any[])[0] : (effectiveModel as any)
    const provider =
      providerModelNames[primaryModel as keyof typeof providerModelNames]

    if (!aiSdkStreamParams.providerOptions) {
      aiSdkStreamParams.providerOptions = {}
    }
    if (!aiSdkStreamParams.providerOptions.openrouter) {
      aiSdkStreamParams.providerOptions.openrouter = {}
    }
    ;(
      aiSdkStreamParams.providerOptions.openrouter as OpenRouterProviderOptions
    ).reasoning = template.reasoningOptions

    return promptAiSdkStream(aiSdkStreamParams)
  }

  return { getStream }
}
