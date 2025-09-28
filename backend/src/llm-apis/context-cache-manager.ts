import { LRUCache } from '@codebuff/common/util/lru-cache'
import { createHash } from 'crypto'
import { logger } from '../util/logger'
import { countTokensJson } from '../util/token-counter'

import type { Message } from '@codebuff/common/types/messages/codebuff-message'

/**
 * Context fingerprint for identifying unchanged content
 */
interface ContextFingerprint {
  hash: string
  tokenCount: number
  lastUsed: number
  content: any
}

/**
 * Cached context entry with metadata
 */
interface CachedContext {
  fingerprint: ContextFingerprint
  compressedContent?: any
  references: Set<string> // Track which requests reference this context
}

/**
 * Differential update between contexts
 */
interface ContextDelta {
  removed: string[]
  added: Message[]
  modified: Array<{
    index: number
    oldMessage: Message
    newMessage: Message
  }>
}

/**
 * Manages context caching and optimization for OpenRouter API calls
 */
export class ContextCacheManager {
  private static instance: ContextCacheManager
  
  // Cache for context fingerprints
  private contextCache = new LRUCache<string, CachedContext>(100)
  
  // Cache for system prompts (rarely change)
  private systemPromptCache = new LRUCache<string, ContextFingerprint>(50)
  
  // Cache for file contents (project files)
  private fileContentCache = new LRUCache<string, string>(200)
  
  // Track context relationships
  private contextLineage = new Map<string, string[]>() // current -> previous contexts
  
  private constructor() {}
  
  static getInstance(): ContextCacheManager {
    if (!ContextCacheManager.instance) {
      ContextCacheManager.instance = new ContextCacheManager()
    }
    return ContextCacheManager.instance
  }
  
  /**
   * Generate a fingerprint for content
   */
  private generateFingerprint(content: any): string {
    const contentStr = typeof content === 'string' ? content : JSON.stringify(content)
    return createHash('sha256').update(contentStr).digest('hex').substring(0, 16)
  }
  
  /**
   * Extract stable parts from messages (system prompts, file contents)
   */
  private extractStableContent(messages: Message[]): {
    stable: Message[]
    dynamic: Message[]
  } {
    const stable: Message[] = []
    const dynamic: Message[] = []
    
    for (const message of messages) {
      // System messages are usually stable
      if (message.role === 'system') {
        stable.push(message)
        continue
      }
      
      // Tool results with file contents are stable within a session
      if (message.role === 'tool' && 
          (message.content.toolName === 'read_files' || 
           message.content.toolName === 'find_files')) {
        stable.push(message)
        continue
      }
      
      // Messages marked for caching
      if (message.providerOptions?.openrouter?.cacheControl || 
          message.providerOptions?.anthropic?.cacheControl) {
        stable.push(message)
        continue
      }
      
      dynamic.push(message)
    }
    
    return { stable, dynamic }
  }
  
  /**
   * Compute delta between two message arrays
   */
  private computeDelta(oldMessages: Message[], newMessages: Message[]): ContextDelta {
    const delta: ContextDelta = {
      removed: [],
      added: [],
      modified: []
    }
    
    // Create fingerprint maps
    const oldMap = new Map<string, Message>()
    const newMap = new Map<string, Message>()
    
    oldMessages.forEach(msg => {
      const fp = this.generateFingerprint(msg)
      oldMap.set(fp, msg)
    })
    
    newMessages.forEach(msg => {
      const fp = this.generateFingerprint(msg)
      newMap.set(fp, msg)
    })
    
    // Find removed messages
    for (const [fp, msg] of oldMap) {
      if (!newMap.has(fp)) {
        delta.removed.push(fp)
      }
    }
    
    // Find added messages
    for (const [fp, msg] of newMap) {
      if (!oldMap.has(fp)) {
        delta.added.push(msg)
      }
    }
    
    return delta
  }
  
  /**
   * Compress messages by deduplicating and referencing cached content
   */
  public optimizeMessages(
    messages: Message[],
    sessionId: string,
    agentId: string
  ): {
    optimizedMessages: Message[]
    cacheStats: {
      originalTokens: number
      optimizedTokens: number
      cacheHitRate: number
      savedTokens: number
    }
  } {
    const startTokens = countTokensJson(messages)
    
    // Extract stable vs dynamic content
    const { stable, dynamic } = this.extractStableContent(messages)
    
    // Cache stable content
    const stableFingerprint = this.generateFingerprint(stable)
    const cacheKey = `${sessionId}-${agentId}-${stableFingerprint}`
    
    let cacheHits = 0
    let totalChecks = 0
    
    // Check if stable content is already cached
    const cachedStable = this.contextCache.get(cacheKey)
    if (cachedStable) {
      cacheHits++
      cachedStable.references.add(sessionId)
      cachedStable.fingerprint.lastUsed = Date.now()
    } else {
      // Cache new stable content
      this.contextCache.set(cacheKey, {
        fingerprint: {
          hash: stableFingerprint,
          tokenCount: countTokensJson(stable),
          lastUsed: Date.now(),
          content: stable
        },
        references: new Set([sessionId])
      })
    }
    totalChecks++
    
    // Optimize dynamic messages
    const optimizedDynamic = this.compressMessages(dynamic)
    
    // Combine with cache references
    const optimizedMessages: Message[] = []
    
    // Add reference to cached stable content if it exists
    if (cachedStable && stable.length > 0) {
      // For now, just add the stable messages directly instead of using cache references
      // This would require changes to the OpenRouter API to support cache references
      optimizedMessages.push(...stable)
    } else {
      optimizedMessages.push(...stable)
    }
    
    optimizedMessages.push(...optimizedDynamic)
    
    const endTokens = countTokensJson(optimizedMessages)
    
    return {
      optimizedMessages,
      cacheStats: {
        originalTokens: startTokens,
        optimizedTokens: endTokens,
        cacheHitRate: totalChecks > 0 ? cacheHits / totalChecks : 0,
        savedTokens: Math.max(0, startTokens - endTokens)
      }
    }
  }
  
  /**
   * Compress messages using various techniques
   */
  private compressMessages(messages: Message[]): Message[] {
    return messages.map(msg => {
      if (msg.role === 'tool' && msg.content.toolName === 'run_terminal_command') {
        // Compress terminal output
        return this.compressTerminalMessage(msg)
      }
      
      if (msg.role === 'user' || msg.role === 'assistant') {
        // Apply text compression
        return this.compressTextMessage(msg)
      }
      
      return msg
    })
  }
  
  /**
   * Compress terminal command output
   */
  private compressTerminalMessage(msg: Message): Message {
    // Already handled by simplifyTerminalCommandResults
    // Add additional compression if needed
    return msg
  }
  
  /**
   * Compress text messages
   */
  private compressTextMessage(msg: Message): Message {
    if (typeof msg.content === 'string') {
      // Remove excessive whitespace
      const compressed = msg.content
        .replace(/\s+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
      
      return {
        ...msg,
        content: compressed
      }
    }
    
    return msg
  }
  
  /**
   * Clear cache for a session
   */
  public clearSessionCache(sessionId: string): void {
    // Remove all entries referencing this session
    const keysToRemove: string[] = []
    
    this.contextCache['cache'].forEach((value, key) => {
      if (value.references.has(sessionId)) {
        value.references.delete(sessionId)
        if (value.references.size === 0) {
          keysToRemove.push(key)
        }
      }
    })
    
    keysToRemove.forEach(key => {
      this.contextCache['cache'].delete(key)
    })
  }
  
  /**
   * Get cache statistics
   */
  public getCacheStats(): {
    contextCacheSize: number
    systemPromptCacheSize: number
    fileContentCacheSize: number
    totalMemoryUsage: number
  } {
    const contextSize = this.contextCache.size
    const systemSize = this.systemPromptCache.size
    const fileSize = this.fileContentCache.size
    
    // Rough memory estimation
    const memoryUsage = (contextSize * 10000) + (systemSize * 5000) + (fileSize * 2000)
    
    return {
      contextCacheSize: contextSize,
      systemPromptCacheSize: systemSize,
      fileContentCacheSize: fileSize,
      totalMemoryUsage: memoryUsage
    }
  }
}

/**
 * Singleton instance export
 */
export const contextCacheManager = ContextCacheManager.getInstance()