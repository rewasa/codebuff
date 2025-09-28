import { providerModelNames } from '@codebuff/common/old-constants'

import { promptAiSdkStream } from './llm-apis/vercel-ai-sdk/ai-sdk'
import { globalStopSequence } from './tools/constants'
import { env } from '@codebuff/internal/env'
import { openRouterLanguageModel } from './llm-apis/openrouter'

import type { AgentTemplate } from './templates/types'
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
  enableTokenOptimization?: boolean

  template: AgentTemplate
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
    const options: Parameters<typeof promptAiSdkStream>[0] = {
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
      agentId
    }

    // Add Gemini-specific options if needed
    const primaryModel = Array.isArray(effectiveModel) ? (effectiveModel as any[])[0] : (effectiveModel as any)
    const provider =
      providerModelNames[primaryModel as keyof typeof providerModelNames]

    if (!options.providerOptions) {
      options.providerOptions = {}
    }
    if (provider === 'gemini') {
      if (!options.providerOptions.gemini) {
        options.providerOptions.gemini = {}
      }
      if (!options.providerOptions.gemini.thinkingConfig) {
        options.providerOptions.gemini.thinkingConfig = { thinkingBudget: 128 }
      }
    }
    if (!options.providerOptions.openrouter) {
      options.providerOptions.openrouter = {}
    }
    ;(
      options.providerOptions.openrouter as OpenRouterProviderOptions
    ).reasoning = template.reasoningOptions

    return promptAiSdkStream(options)
  }

  return { getStream }
}
