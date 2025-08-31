import type { AgentDefinition } from '../types/agent-definition'

const definition: AgentDefinition = {
  id: 'project-context-analyzer',
  publisher: 'codelayer',
  model: 'anthropic/claude-4-sonnet-20250522',
  displayName: 'Project Context Analyzer',
  
  toolNames: ['read_files', 'code_search', 'set_output', 'spawn_agents'],
  spawnableAgents: ['codebase-analyzer', 'codebase-pattern-finder'],
  
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'Context about what architectural analysis is needed'
    },
  },
  
  outputMode: 'structured_output',
  outputSchema: {
    type: 'object',
    properties: {
      framework: {
        type: 'string',
        description: 'Primary framework (nextjs, express, django, etc.)'
      },
      architecture: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            pattern: { type: 'string' },
            locations: { type: 'array', items: { type: 'string' } },
            description: { type: 'string' }
          }
        }
      },
      conventions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string' },
            rule: { type: 'string' },
            examples: { type: 'array', items: { type: 'string' } }
          }
        }
      },
      testingStrategy: {
        type: 'object',
        properties: {
          framework: { type: 'string' },
          patterns: { type: 'array', items: { type: 'string' } },
          locations: { type: 'array', items: { type: 'string' } }
        }
      },
      fileStructure: {
        type: 'object',
        properties: {
          sourceDirectories: { type: 'array', items: { type: 'string' } },
          testDirectories: { type: 'array', items: { type: 'string' } },
          configFiles: { type: 'array', items: { type: 'string' } },
          schemaFiles: { type: 'array', items: { type: 'string' } }
        }
      },
      packageManager: {
        type: 'string',
        enum: ['npm', 'yarn', 'pnpm', 'bun']
      }
    },
    required: ['framework', 'architecture', 'conventions', 'testingStrategy', 'fileStructure']
  },
  
  spawnerPrompt: 'Analyze project architecture, frameworks, conventions, and patterns to provide context for implementation decisions',
  
  systemPrompt: 'You are a project context analyzer that provides comprehensive architectural understanding to prevent incorrect implementation decisions.',
  
  instructionsPrompt: `Analyze the project to understand its architecture and conventions:

**Framework Detection:**
- Identify the primary framework (Next.js, Express, Django, etc.)
- Look at package.json, framework-specific config files
- Note any meta-frameworks or additional tools

**Architecture Patterns:**
- Identify common patterns (MVC, hexagonal, microservices, etc.)
- Note how modules are organized
- Understand data flow and dependency patterns

**Code Conventions:**
- Naming conventions for files, functions, variables
- Import/export patterns
- Error handling approaches
- Logging and debugging patterns

**Testing Strategy:**
- Testing framework in use (Jest, Vitest, etc.)
- Test file naming and location patterns
- Test coverage expectations
- Mock/stub patterns

**File Structure:**
- Source code organization
- Test file locations
- Configuration file patterns
- Schema/migration file locations

**Package Management:**
- Detect package manager from lock files
- Note any special scripts or tooling

Use the codebase-analyzer and codebase-pattern-finder agents to gather comprehensive information, then synthesize into structured context that can guide implementation decisions.`,
  
  handleSteps: function* ({ prompt }) {
    // Parallel analysis of different aspects
    const { toolResult } = yield {
      toolName: 'spawn_agents',
      input: {
        agents: [
          {
            agent_type: 'codebase-analyzer',
            prompt: 'Analyze the overall project framework, architecture patterns, and file organization structure'
          },
          {
            agent_type: 'codebase-pattern-finder',
            prompt: 'Find common coding patterns, naming conventions, testing strategies, and implementation approaches used throughout the codebase'
          }
        ],
        cb_easp: true
      }
    }
    
    // Process and synthesize the results into structured output
    yield 'STEP_ALL'
  },
}

export default definition
