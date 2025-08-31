import type { AgentDefinition } from '../types/agent-definition'

const definition: AgentDefinition = {
  id: 'smart-discovery',
  publisher: 'codelayer',
  model: 'google/gemini-2.5-flash',
  displayName: 'Smart Discovery Agent',
  
  toolNames: ['set_output', 'spawn_agents'],
  spawnableAgents: ['codebase-locator', 'codebase-pattern-finder'],
  
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'Description of what files, patterns, or components to discover'
    },
    params: {
      type: 'object',
      properties: {
        projectContext: {
          type: 'object',
          description: 'Project context from project-context-analyzer'
        },
        requirements: {
          type: 'array',
          description: 'Parsed requirements to guide discovery'
        }
      }
    }
  },
  
  outputMode: 'structured_output',
  outputSchema: {
    type: 'object',
    properties: {
      relevantFiles: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            relevance: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
            reason: { type: 'string' },
            requirementIds: { type: 'array', items: { type: 'string' } }
          }
        }
      },
      patterns: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            exampleFiles: { type: 'array', items: { type: 'string' } },
            applicableRequirements: { type: 'array', items: { type: 'string' } }
          }
        }
      },
      dependencies: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            file: { type: 'string' },
            dependsOn: { type: 'array', items: { type: 'string' } },
            affects: { type: 'array', items: { type: 'string' } }
          }
        }
      },
      suggestedOrder: {
        type: 'array',
        items: { type: 'string' },
        description: 'Suggested order of file modifications'
      }
    },
    required: ['relevantFiles', 'patterns', 'dependencies']
  },
  
  spawnerPrompt: 'Intelligently discover relevant files and patterns for implementation, replacing brute-force searching with semantic understanding',
  
  systemPrompt: 'You are a smart discovery agent that efficiently finds relevant files and patterns using semantic understanding rather than brute-force searching.',
  
  instructionsPrompt: `Perform intelligent file and pattern discovery:

**Discovery Strategy:**
1. **Semantic Analysis** - Understand what the task requires conceptually
2. **Pattern Matching** - Find similar implementations to model after
3. **Dependency Mapping** - Understand file relationships and impacts
4. **Prioritization** - Rank files by relevance to avoid unnecessary reads

**Use Spawnable Agents:**
- **codebase-locator**: Find files related to specific features or concepts
- **codebase-pattern-finder**: Discover implementation patterns and examples

**Key Outputs:**
- **relevantFiles**: Prioritized list with clear relevance reasoning
- **patterns**: Existing patterns that should be followed
- **dependencies**: File relationships that affect implementation order
- **suggestedOrder**: Recommended sequence for modifications

**Efficiency Goals:**
- Minimize file reads by smart prioritization
- Avoid redundant searches
- Focus on files that directly impact requirements
- Leverage project context for informed decisions

Replace brute-force searching with intelligent, context-aware discovery.`,
  
  handleSteps: function* ({ prompt, params }) {
    const { projectContext, requirements } = params || {}
    
    // Use parallel discovery for efficiency
    yield {
      toolName: 'spawn_agents',
      input: {
        agents: [
          {
            agent_type: 'codebase-locator',
            prompt: `Find files relevant to: ${prompt}. Focus on files that would need modification for the requirements.`
          },
          {
            agent_type: 'codebase-pattern-finder',
            prompt: `Find implementation patterns and examples related to: ${prompt}. Look for existing patterns that should be followed or extended.`
          }
        ],
        cb_easp: true
      }
    }
    
    // Process results and create intelligent discovery output
    yield 'STEP_ALL'
  },
}

export default definition
