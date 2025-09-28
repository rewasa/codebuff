import { logger } from '../util/logger'
import { countTokens, countTokensJson } from '../util/token-counter'
import { contextCacheManager } from './context-cache-manager'

import type { Message } from '@codebuff/common/types/messages/codebuff-message'

/**
 * Configuration for prompt optimization
 */
export interface OptimizationConfig {
  enableCaching: boolean
  enableCompression: boolean
  enableDeduplication: boolean
  maxContextTokens: number
  priorityWeight: {
    recent: number
    userMessages: number
    toolResults: number
    systemPrompts: number
  }
}

/**
 * Default optimization configuration
 */
const DEFAULT_CONFIG: OptimizationConfig = {
  enableCaching: true,
  enableCompression: true,
  enableDeduplication: true,
  maxContextTokens: 190_000,
  priorityWeight: {
    recent: 1.5,
    userMessages: 2.0,
    toolResults: 1.2,
    systemPrompts: 0.8
  }
}

/**
 * Optimizes prompts for OpenRouter API calls
 */
export class PromptOptimizer {
  private config: OptimizationConfig
  private deduplicationCache = new Map<string, number>() // content hash -> last index
  
  constructor(config: Partial<OptimizationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }
  
  /**
   * Main optimization entry point
   */
  public optimizePrompt(
    messages: Message[],
    systemPrompt: string,
    sessionId: string,
    agentId: string
  ): {
    messages: Message[]
    systemPrompt: string
    stats: {
      originalTokens: number
      optimizedTokens: number
      reductionPercent: number
      techniques: string[]
    }
  } {
    const originalTokens = countTokensJson(messages) + countTokens(systemPrompt)
    const techniques: string[] = []
    
    let optimizedMessages = [...messages]
    let optimizedSystem = systemPrompt
    
    // Step 1: Deduplicate messages
    if (this.config.enableDeduplication) {
      optimizedMessages = this.deduplicateMessages(optimizedMessages)
      techniques.push('deduplication')
    }
    
    // Step 2: Apply caching
    if (this.config.enableCaching) {
      const cacheResult = contextCacheManager.optimizeMessages(
        optimizedMessages,
        sessionId,
        agentId
      )
      optimizedMessages = cacheResult.optimizedMessages
      if (cacheResult.cacheStats.savedTokens > 0) {
        techniques.push('caching')
      }
    }
    
    // Step 3: Compress content
    if (this.config.enableCompression) {
      optimizedMessages = this.compressMessages(optimizedMessages)
      optimizedSystem = this.compressSystemPrompt(optimizedSystem)
      techniques.push('compression')
    }
    
    // Step 4: Smart truncation based on priority
    const truncateResult = this.smartTruncate(
      optimizedMessages,
      optimizedSystem,
      this.config.maxContextTokens
    )
    optimizedMessages = truncateResult.messages
    if (truncateResult.truncated) {
      techniques.push('smart-truncation')
    }
    
    const optimizedTokens = countTokensJson(optimizedMessages) + countTokens(optimizedSystem)
    const reduction = originalTokens - optimizedTokens
    
    return {
      messages: optimizedMessages,
      systemPrompt: optimizedSystem,
      stats: {
        originalTokens,
        optimizedTokens,
        reductionPercent: (reduction / originalTokens) * 100,
        techniques
      }
    }
  }
  
  /**
   * Remove duplicate messages
   */
  private deduplicateMessages(messages: Message[]): Message[] {
    const seen = new Set<string>()
    const deduplicated: Message[] = []
    
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      const hash = this.hashMessage(msg)
      
      if (!seen.has(hash)) {
        seen.add(hash)
        deduplicated.unshift(msg)
      } else if (msg.role === 'tool') {
        // Keep tool results even if duplicate content (might be retries)
        deduplicated.unshift(msg)
      }
    }
    
    return deduplicated
  }
  
  /**
   * Compress messages to reduce tokens
   */
  private compressMessages(messages: Message[]): Message[] {
    return messages.map(msg => {
      // Only compress text content for user and assistant messages
      if ((msg.role === 'user' || msg.role === 'assistant') && typeof msg.content === 'string') {
        return {
          ...msg,
          content: this.compressText(msg.content)
        }
      }
      
      if ((msg.role === 'user' || msg.role === 'assistant') && Array.isArray(msg.content)) {
        return {
          ...msg,
          content: msg.content.map(part => {
            if (part.type === 'text') {
              return {
                ...part,
                text: this.compressText(part.text)
              }
            }
            return part
          })
        }
      }
      
      // Don't modify tool or system messages
      return msg
    })
  }
  
  /**
   * Compress text content
   */
  private compressText(text: string): string {
    return text
      // Remove excessive whitespace
      .replace(/\s+/g, ' ')
      // Reduce multiple newlines
      .replace(/\n{3,}/g, '\n\n')
      // Remove trailing spaces
      .replace(/ +$/gm, '')
      // Remove comments in code blocks (careful!)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      // Compress repeated patterns
      .replace(/(\w+\s+)\1{2,}/g, '$1...')
      .trim()
  }
  
  /**
   * Compress system prompt
   */
  private compressSystemPrompt(prompt: string): string {
    // System prompts often have repetitive instructions
    return prompt
      .replace(/\s+/g, ' ')
      .replace(/\n{2,}/g, '\n')
      // Remove example blocks if too long
      .replace(/<example>.*?<\/example>/gs, (match) => {
        if (match.length > 500) {
          return '<example>[compressed]</example>'
        }
        return match
      })
      .trim()
  }
  
  /**
   * Smart truncation based on message priority
   */
  private smartTruncate(
    messages: Message[],
    systemPrompt: string,
    maxTokens: number
  ): {
    messages: Message[]
    truncated: boolean
  } {
    const systemTokens = countTokens(systemPrompt)
    const availableTokens = maxTokens - systemTokens
    
    // Calculate priority scores
    const scoredMessages = messages.map((msg, idx) => {
      let score = 0
      
      // Recency score
      const recencyScore = (idx / messages.length) * this.config.priorityWeight.recent
      score += recencyScore
      
      // Role-based score
      if (msg.role === 'user') {
        score += this.config.priorityWeight.userMessages
      } else if (msg.role === 'tool') {
        score += this.config.priorityWeight.toolResults
      } else if (msg.role === 'system') {
        score += this.config.priorityWeight.systemPrompts
      }
      
      // Keep messages marked for retention
      if (msg.keepDuringTruncation) {
        score += 10
      }
      
      return { message: msg, score, tokens: countTokensJson(msg) }
    })
    
    // Sort by priority (higher score = keep)
    scoredMessages.sort((a, b) => b.score - a.score)
    
    // Select messages within token budget
    const selected: typeof scoredMessages = []
    let currentTokens = 0
    
    for (const item of scoredMessages) {
      if (currentTokens + item.tokens <= availableTokens) {
        selected.push(item)
        currentTokens += item.tokens
      }
    }
    
    // Restore original order
    selected.sort((a, b) => {
      const aIdx = messages.indexOf(a.message)
      const bIdx = messages.indexOf(b.message)
      return aIdx - bIdx
    })
    
    return {
      messages: selected.map(item => item.message),
      truncated: selected.length < messages.length
    }
  }
  
  /**
   * Generate hash for message content
   */
  private hashMessage(msg: Message): string {
    const content = typeof msg.content === 'string' 
      ? msg.content 
      : JSON.stringify(msg.content)
    return `${msg.role}:${content.substring(0, 100)}`
  }
  
  /**
   * Get optimization statistics
   */
  public getStats(): {
    deduplicationRate: number
    cacheStats: any
  } {
    return {
      deduplicationRate: this.deduplicationCache.size,
      cacheStats: contextCacheManager.getCacheStats()
    }
  }
}

/**
 * Default instance
 */
export const promptOptimizer = new PromptOptimizer()