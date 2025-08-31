import type { AgentDefinition } from '../types/agent-definition'

const definition: AgentDefinition = {
  id: 'completion-verifier',
  publisher: 'codelayer',
  model: 'google/gemini-2.5-flash',
  displayName: 'Completion Verifier',
  
  toolNames: ['read_files', 'code_search', 'set_output'],
  
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'Context about what should be verified for completion'
    },
    params: {
      type: 'object',
      properties: {
        requirements: {
          type: 'array',
          description: 'Original requirements from spec-parser'
        },
        completedSubgoals: {
          type: 'array',
          description: 'List of completed subgoal IDs'
        }
      },
      required: ['requirements']
    }
  },
  
  outputMode: 'structured_output',
  outputSchema: {
    type: 'object',
    properties: {
      overallComplete: {
        type: 'boolean'
      },
      completedRequirements: {
        type: 'array',
        items: { type: 'string' }
      },
      missingRequirements: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            description: { type: 'string' },
            reason: { type: 'string' }
          }
        }
      },
      qualityIssues: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            file: { type: 'string' },
            issue: { type: 'string' },
            severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] }
          }
        }
      }
    },
    required: ['overallComplete', 'completedRequirements', 'missingRequirements']
  },
  
  spawnerPrompt: 'Verify that all requirements from a user request have been properly completed and implemented',
  
  systemPrompt: 'You are a completion verifier that ensures all parts of a user request have been properly implemented. Your job is to prevent the common failure mode of dropping requirements.',
  
  instructionsPrompt: `Verify completion by checking each requirement against actual implementation:

**Verification Process:**
1. **Cross-reference requirements** - Check each requirement against completed work
2. **File existence checks** - Verify expected files were created/modified
3. **Test coverage verification** - Ensure test files exist for code changes
4. **Schema/migration checks** - Verify database changes include proper migrations
5. **Documentation updates** - Check for changelog, README, or other doc updates

**Key Verification Points:**
- Code changes: Verify the actual code was modified as required
- Test updates: Check that test files exist and cover new functionality
- Schema updates: Ensure migrations or schema files were updated
- Documentation: Verify any required docs were updated

**Quality Checks:**
- Look for obvious bugs or architectural issues
- Check for incomplete implementations
- Verify imports and dependencies are correct
- Ensure no dead code was left behind

**Output Guidelines:**
- Mark overallComplete as false if ANY requirement is missing
- Provide specific reasons for missing requirements
- Flag quality issues by severity
- Be thorough but efficient in verification

This is a critical safety step - be comprehensive in your verification.`,
}

export default definition
