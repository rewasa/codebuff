import { models } from '@codebuff/common/old-constants'
import { isExplicitlyDefinedModel } from '@codebuff/common/util/model-utils'
import { env } from '@codebuff/internal/env'
import { createOpenRouter } from '@codebuff/internal/openrouter-ai-sdk'
import { promptOptimizer } from './prompt-optimizer'
import { logger } from '../util/logger'

import type { Model } from '@codebuff/common/old-constants'
import type { Message } from '@codebuff/common/types/messages/codebuff-message'

// Provider routing documentation: https://openrouter.ai/docs/features/provider-routing
const providerOrder = {
  [models.openrouter_claude_sonnet_4]: [
    'Google',
    'Anthropic',
    'Amazon Bedrock',
  ],
  [models.openrouter_claude_sonnet_4_5]: [
    'Google',
    'Anthropic',
    'Amazon Bedrock',
  ],
  [models.openrouter_claude_opus_4]: ['Google', 'Anthropic'],
} as const

export function openRouterLanguageModel(
  model: Model,
  options?: {
    sessionId?: string
    agentId?: string
    enableOptimization?: boolean
  }
) {
  const extraBody: Record<string, any> = {
    transforms: ['middle-out'],
  }

  // Set allow_fallbacks based on whether model is explicitly defined
  const isExplicitlyDefined = isExplicitlyDefinedModel(model)

  extraBody.provider = {
    order: providerOrder[model as keyof typeof providerOrder],
    allow_fallbacks: !isExplicitlyDefined,
  }

  const openRouter = createOpenRouter({
    apiKey: env.OPEN_ROUTER_API_KEY,
    baseURL: env.OPENROUTER_BASE_URL,
    headers: {
      'HTTP-Referer': 'https://codebuff.com',
      'X-Title': 'Codebuff',
    },
    extraBody,
  })

  const languageModel = openRouter.languageModel(model, {
    usage: { include: true },
    logprobs: true,
  })

  // Wrap the language model with optimization if enabled
  if (options?.enableOptimization && options.sessionId && options.agentId) {
    const originalDoGenerate = languageModel.doGenerate?.bind(languageModel)
    const originalDoStream = languageModel.doStream?.bind(languageModel)

    if (originalDoGenerate) {
      languageModel.doGenerate = async (callOptions) => {
        // Optimize messages before sending
        if (callOptions.prompt && Array.isArray(callOptions.prompt)) {
          const messages = callOptions.prompt as unknown as Message[]
          const systemMessages = messages.filter(m => m.role === 'system')
          const nonSystemMessages = messages.filter(m => m.role !== 'system')
          
          const optimization = promptOptimizer.optimizePrompt(
            nonSystemMessages,
            systemMessages.map(m => m.content).join('\n'),
            options.sessionId!,
            options.agentId!
          )
          
          if (optimization.stats.reductionPercent > 5) {
            logger.debug(
              {
                originalTokens: optimization.stats.originalTokens,
                optimizedTokens: optimization.stats.optimizedTokens,
                reduction: `${optimization.stats.reductionPercent.toFixed(1)}%`,
                techniques: optimization.stats.techniques
              },
              'OpenRouter prompt optimization applied'
            )
          }
          
          callOptions.prompt = optimization.messages as any
        }
        
        return originalDoGenerate(callOptions)
      }
    }

    if (originalDoStream) {
      languageModel.doStream = async (callOptions) => {
        // Optimize messages before streaming
        if (callOptions.prompt && Array.isArray(callOptions.prompt)) {
          const messages = callOptions.prompt as unknown as Message[]
          const systemMessages = messages.filter(m => m.role === 'system')
          const nonSystemMessages = messages.filter(m => m.role !== 'system')
          
          const optimization = promptOptimizer.optimizePrompt(
            nonSystemMessages,
            systemMessages.map(m => m.content).join('\n'),
            options.sessionId!,
            options.agentId!
          )
          
          if (optimization.stats.reductionPercent > 5) {
            logger.debug(
              {
                originalTokens: optimization.stats.originalTokens,
                optimizedTokens: optimization.stats.optimizedTokens,
                reduction: `${optimization.stats.reductionPercent.toFixed(1)}%`,
                techniques: optimization.stats.techniques
              },
              'OpenRouter stream optimization applied'
            )
          }
          
          callOptions.prompt = optimization.messages as any
        }
        
        return originalDoStream(callOptions)
      }
    }
  }

  return languageModel
}
