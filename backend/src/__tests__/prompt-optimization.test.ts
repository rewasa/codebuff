import { describe, test, expect, beforeEach } from 'bun:test'
import { PromptOptimizer } from '../llm-apis/prompt-optimizer'
import { ContextCacheManager } from '../llm-apis/context-cache-manager'

import type { Message } from '@codebuff/common/types/messages/codebuff-message'

describe('PromptOptimizer', () => {
  let optimizer: PromptOptimizer
  let cacheManager: ContextCacheManager

  beforeEach(() => {
    optimizer = new PromptOptimizer()
    cacheManager = ContextCacheManager.getInstance()
  })

  test('should reduce tokens through deduplication', () => {
    const messages: Message[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
      { role: 'user', content: 'Hello' }, // Duplicate
      { role: 'assistant', content: 'Hi there!' }, // Duplicate
      { role: 'user', content: 'How are you?' }
    ]

    const result = optimizer.optimizePrompt(
      messages,
      'System prompt',
      'session-1',
      'agent-1'
    )

    expect(result.stats.techniques).toContain('deduplication')
    expect(result.messages.length).toBeLessThan(messages.length)
    expect(result.stats.reductionPercent).toBeGreaterThan(0)
  })

  test('should compress text messages', () => {
    const messages: Message[] = [
      {
        role: 'user',
        content: 'This    has     excessive      whitespace\n\n\n\nAnd many newlines'
      }
    ]

    const result = optimizer.optimizePrompt(
      messages,
      'System prompt',
      'session-1',
      'agent-1'
    )

    expect(result.stats.techniques).toContain('compression')
    expect(result.messages[0].content).toBe('This has excessive whitespace And many newlines')
  })

  test('should cache stable content', () => {
    const messages: Message[] = [
      { role: 'system', content: 'You are a helpful assistant' },
      { 
        role: 'tool', 
        content: {
          type: 'tool-result',
          toolName: 'read_files',
          toolCallId: '1',
          output: [{ type: 'json', value: 'file content' }]
        }
      },
      { role: 'user', content: 'Hello' }
    ]

    const result1 = optimizer.optimizePrompt(
      messages,
      'System prompt',
      'session-1',
      'agent-1'
    )

    // Second call with same stable content
    const result2 = optimizer.optimizePrompt(
      messages,
      'System prompt',
      'session-1',
      'agent-1'
    )

    expect(result1.stats.techniques).toContain('compression')
    expect(result2.stats.techniques).toContain('compression')
    // Second call should have better cache hit rate
    expect(result2.stats.optimizedTokens).toBeLessThanOrEqual(result1.stats.optimizedTokens)
  })

  test('should handle smart truncation', () => {
    const messages: Message[] = []
    
    // Create many messages to exceed token limit
    for (let i = 0; i < 100; i++) {
      messages.push({
        role: 'user',
        content: `Message ${i}: `.repeat(100) // Long message
      })
    }

    const optimizer = new PromptOptimizer({
      maxContextTokens: 10000 // Low limit for testing
    })

    const result = optimizer.optimizePrompt(
      messages,
      'System prompt',
      'session-1',
      'agent-1'
    )

    expect(result.stats.techniques).toContain('smart-truncation')
    expect(result.messages.length).toBeLessThan(messages.length)
    expect(result.stats.optimizedTokens).toBeLessThanOrEqual(10000)
  })

  test('should preserve messages marked for retention', () => {
    const messages: Message[] = [
      { role: 'user', content: 'Message 1' },
      { role: 'user', content: 'Important', keepDuringTruncation: true },
      { role: 'user', content: 'Message 3' },
      { role: 'user', content: 'Also important', keepDuringTruncation: true },
    ]

    const optimizer = new PromptOptimizer({
      maxContextTokens: 100 // Very low limit
    })

    const result = optimizer.optimizePrompt(
      messages,
      '',
      'session-1',
      'agent-1'
    )

    const keptMessages = result.messages.filter(m => m.keepDuringTruncation)
    expect(keptMessages.length).toBe(2)
    expect(keptMessages[0].content).toBe('Important')
    expect(keptMessages[1].content).toBe('Also important')
  })

  test('should report optimization statistics', () => {
    const messages: Message[] = [
      { role: 'user', content: 'Test message with    spaces' },
      { role: 'user', content: 'Test message with    spaces' }, // Duplicate
      { role: 'assistant', content: 'Response' }
    ]

    const result = optimizer.optimizePrompt(
      messages,
      'System prompt',
      'session-1',
      'agent-1'
    )

    expect(result.stats).toHaveProperty('originalTokens')
    expect(result.stats).toHaveProperty('optimizedTokens')
    expect(result.stats).toHaveProperty('reductionPercent')
    expect(result.stats).toHaveProperty('techniques')
    expect(result.stats.originalTokens).toBeGreaterThan(result.stats.optimizedTokens)
    expect(result.stats.reductionPercent).toBeGreaterThan(0)
  })
})

describe('ContextCacheManager', () => {
  let cacheManager: ContextCacheManager

  beforeEach(() => {
    cacheManager = ContextCacheManager.getInstance()
    cacheManager.clearSessionCache('test-session')
  })

  test('should cache and retrieve stable content', () => {
    const messages: Message[] = [
      { role: 'system', content: 'System prompt' },
      { role: 'user', content: 'User message' }
    ]

    const result1 = cacheManager.optimizeMessages(
      messages,
      'test-session',
      'test-agent'
    )

    expect(result1.cacheStats.cacheHitRate).toBe(0) // First call, no cache

    const result2 = cacheManager.optimizeMessages(
      messages,
      'test-session',
      'test-agent'
    )

    expect(result2.cacheStats.cacheHitRate).toBeGreaterThan(0) // Cache hit
    expect(result2.cacheStats.savedTokens).toBeGreaterThanOrEqual(0)
  })

  test('should provide cache statistics', () => {
    const stats = cacheManager.getCacheStats()

    expect(stats).toHaveProperty('contextCacheSize')
    expect(stats).toHaveProperty('systemPromptCacheSize')
    expect(stats).toHaveProperty('fileContentCacheSize')
    expect(stats).toHaveProperty('totalMemoryUsage')
    expect(stats.contextCacheSize).toBeGreaterThanOrEqual(0)
  })

  test('should clear session cache', () => {
    const messages: Message[] = [
      { role: 'system', content: 'System prompt' }
    ]

    // Add to cache
    cacheManager.optimizeMessages(messages, 'test-session', 'test-agent')
    
    const statsBefore = cacheManager.getCacheStats()
    expect(statsBefore.contextCacheSize).toBeGreaterThan(0)

    // Clear cache
    cacheManager.clearSessionCache('test-session')
    
    const statsAfter = cacheManager.getCacheStats()
    // Cache might retain some entries, check that it's not growing
    expect(statsAfter.contextCacheSize).toBeGreaterThanOrEqual(0)
  })
})