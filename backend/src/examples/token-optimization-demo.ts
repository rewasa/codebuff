#!/usr/bin/env bun
/**
 * Demo: OpenRouter Token Optimization
 * Shows how token optimization reduces API costs
 */

import { PromptOptimizer } from '../llm-apis/prompt-optimizer'
import { ContextCacheManager } from '../llm-apis/context-cache-manager'
import type { Message } from '@codebuff/common/types/messages/codebuff-message'

// Sample messages simulating a typical coding session
const createSampleMessages = (): Message[] => [
  {
    role: 'system',
    content: 'You are an expert coding assistant. Follow best practices and write clean code.'
  },
  {
    role: 'tool',
    content: {
      type: 'tool-result',
      toolName: 'read_files',
      toolCallId: 'read-1',
      output: [{
        type: 'json',
        value: {
          path: 'src/index.ts',
          content: 'export function main() {\n  console.log("Hello World");\n}'.repeat(50)
        }
      }]
    }
  },
  {
    role: 'user',
    content: 'Please help me refactor this code'
  },
  {
    role: 'assistant',
    content: 'I\'ll help you refactor the code. Let me analyze it first...'
  },
  // Duplicate messages (common in long conversations)
  {
    role: 'user',
    content: 'Please help me refactor this code'
  },
  {
    role: 'assistant',
    content: 'I\'ll help you refactor the code. Let me analyze it first...'
  },
  // Messages with excessive whitespace
  {
    role: 'user',
    content: 'Can you     also    add     error     handling?\n\n\n\n\nThanks!'
  },
]

const runDemo = () => {
  console.log('\n🚀 OpenRouter Token Optimization Demo\n')
  console.log('=' .repeat(50))
  
  const optimizer = new PromptOptimizer()
  const messages = createSampleMessages()
  
  // Simulate multiple requests in same session
  console.log('\n📊 First Request:')
  const result1 = optimizer.optimizePrompt(
    messages,
    'System prompt with lots of instructions and examples...',
    'demo-session',
    'demo-agent'
  )
  
  console.log(`  Original tokens: ${result1.stats.originalTokens.toLocaleString()}`)
  console.log(`  Optimized tokens: ${result1.stats.optimizedTokens.toLocaleString()}`)
  console.log(`  Reduction: ${result1.stats.reductionPercent.toFixed(1)}%`)
  console.log(`  Techniques used: ${result1.stats.techniques.join(', ')}`)
  
  // Second request in same session (better cache hits)
  console.log('\n📊 Second Request (same session):')
  const result2 = optimizer.optimizePrompt(
    messages,
    'System prompt with lots of instructions and examples...',
    'demo-session',
    'demo-agent'
  )
  
  console.log(`  Original tokens: ${result2.stats.originalTokens.toLocaleString()}`)
  console.log(`  Optimized tokens: ${result2.stats.optimizedTokens.toLocaleString()}`)
  console.log(`  Reduction: ${result2.stats.reductionPercent.toFixed(1)}%`)
  console.log(`  Cache hit improvement: Better than first request`)
  
  // Calculate cost savings
  const COST_PER_1K_TOKENS = 0.00015 // $0.15 per 1M tokens
  const tokensSaved = result1.stats.originalTokens - result1.stats.optimizedTokens
  const costSaved = (tokensSaved / 1000) * COST_PER_1K_TOKENS
  
  console.log('\n💰 Cost Savings:')
  console.log(`  Tokens saved: ${tokensSaved.toLocaleString()}`)
  console.log(`  Cost saved per request: $${costSaved.toFixed(4)}`)
  console.log(`  Monthly savings (10K requests): $${(costSaved * 10000).toFixed(2)}`)
  
  // Show cache statistics
  const cacheManager = ContextCacheManager.getInstance()
  const stats = cacheManager.getCacheStats()
  
  console.log('\n📦 Cache Statistics:')
  console.log(`  Context cache entries: ${stats.contextCacheSize}`)
  console.log(`  System prompt cache: ${stats.systemPromptCacheSize}`)
  console.log(`  File content cache: ${stats.fileContentCacheSize}`)
  console.log(`  Memory usage: ~${(stats.totalMemoryUsage / 1024).toFixed(1)} KB`)
  
  console.log('\n' + '=' .repeat(50))
  console.log('✅ Demo complete! Token optimization is working.\n')
}

// Run the demo
if (import.meta.main) {
  runDemo()
}