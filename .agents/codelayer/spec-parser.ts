import type { AgentDefinition } from '../types/agent-definition'

const definition: AgentDefinition = {
  id: 'spec-parser',
  publisher: 'codelayer',
  model: 'google/gemini-2.5-flash',
  displayName: 'Specification Parser',
  
  toolNames: ['set_output'],
  
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'User request to parse into trackable requirements'
    },
  },
  
  outputMode: 'structured_output',
  outputSchema: {
    type: 'object',
    properties: {
      requirements: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            description: { type: 'string' },
            type: { 
              type: 'string', 
              enum: ['code_change', 'test_update', 'schema_update', 'documentation'] 
            },
            priority: { 
              type: 'string', 
              enum: ['critical', 'high', 'medium', 'low'] 
            },
            dependencies: { 
              type: 'array', 
              items: { type: 'string' } 
            },
            estimatedFiles: {
              type: 'array',
              items: { type: 'string' }
            }
          },
          required: ['id', 'description', 'type', 'priority']
        }
      },
      complexity: {
        type: 'string',
        enum: ['simple', 'moderate', 'complex']
      },
      isMultiPart: {
        type: 'boolean'
      }
    },
    required: ['requirements', 'complexity', 'isMultiPart']
  },
  
  spawnerPrompt: 'Parse user requests into structured, trackable requirements for systematic implementation and verification',
  
  systemPrompt: 'You are a specification parser that breaks down user requests into discrete, trackable requirements. Your job is to ensure no part of a complex request gets missed by creating a comprehensive checklist.',
  
  instructionsPrompt: `Parse the user request into structured requirements. For each requirement:

1. **Identify discrete tasks** - Break complex requests into specific, actionable items
2. **Categorize by type** - code_change, test_update, schema_update, documentation
3. **Assign priority** - critical (must work), high (important), medium (nice-to-have), low (optional)
4. **Note dependencies** - Which requirements must be completed before others
5. **Estimate files** - Which files might be affected

**Key Analysis Points:**
- Look for multi-part specifications that mention "and", "also", "additionally"
- Identify implicit requirements like "update tests" or "add documentation"
- Consider schema/migration needs for database changes
- Flag requirements that affect multiple files or components

**Output Requirements:**
- Each requirement must be specific and verifiable
- IDs should be sequential (req-1, req-2, etc.)
- Dependencies should reference other requirement IDs
- Mark complexity as simple (1-2 requirements), moderate (3-5), complex (6+)

Focus on completeness - it's better to over-specify than miss requirements.`,
}

export default definition
