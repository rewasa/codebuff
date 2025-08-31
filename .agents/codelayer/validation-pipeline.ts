import type { AgentDefinition } from '../types/agent-definition'

const definition: AgentDefinition = {
  id: 'validation-pipeline',
  publisher: 'codelayer',
  model: 'google/gemini-2.5-flash',
  displayName: 'Validation Pipeline',
  
  toolNames: ['run_terminal_command', 'read_files', 'code_search', 'set_output'],
  
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'Context about what needs validation'
    },
    params: {
      type: 'object',
      properties: {
        changedFiles: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of files that were modified'
        },
        requirements: {
          type: 'array',
          description: 'Original requirements from spec-parser'
        },
        projectContext: {
          type: 'object',
          description: 'Project context from project-context-analyzer'
        }
      },
      required: ['changedFiles', 'requirements']
    }
  },
  
  outputMode: 'structured_output',
  outputSchema: {
    type: 'object',
    properties: {
      overallValid: {
        type: 'boolean'
      },
      validationResults: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            stage: { type: 'string' },
            passed: { type: 'boolean' },
            issues: { type: 'array', items: { type: 'string' } },
            warnings: { type: 'array', items: { type: 'string' } }
          }
        }
      },
      criticalIssues: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            file: { type: 'string' },
            issue: { type: 'string' },
            recommendation: { type: 'string' }
          }
        }
      },
      missingComponents: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string' },
            description: { type: 'string' },
            suggestedAction: { type: 'string' }
          }
        }
      }
    },
    required: ['overallValid', 'validationResults']
  },
  
  spawnerPrompt: 'Validate code changes through multiple stages to prevent critical failures and ensure quality',
  
  systemPrompt: 'You are a validation pipeline that prevents the deployment of broken or incomplete code through systematic multi-stage validation.',
  
  instructionsPrompt: `Run comprehensive validation through multiple stages:

**Validation Stages:**

1. **Syntax Validation**
   - Run TypeScript compiler check (tsc --noEmit)
   - Check for compilation errors
   - Verify import/export correctness

2. **Test Validation**
   - Check if test files exist for modified code
   - Verify test files can run without errors
   - Look for missing test coverage

3. **Schema Validation**
   - Check for database schema changes
   - Verify migrations exist for schema updates
   - Validate GraphQL schema updates

4. **Pattern Validation**
   - Verify adherence to project conventions
   - Check naming patterns
   - Validate architectural consistency

5. **Dependency Validation**
   - Check for broken imports
   - Verify all dependencies are satisfied
   - Look for circular dependencies

**Critical Checks:**
- No compilation errors
- No broken imports
- Test files exist for new logic
- Schema changes include migrations
- Code follows project patterns

**Output Guidelines:**
- Mark overallValid as false if ANY critical issue found
- Categorize issues by severity
- Provide specific recommendations for fixes
- Focus on preventing the 37% critical failure rate

Be thorough but efficient - this is the safety net.`,
  
  handleSteps: function* ({ params }) {
    const { changedFiles, requirements, projectContext } = params || {}
    
    // Stage 1: Syntax validation
    yield {
      toolName: 'run_terminal_command',
      input: {
        command: 'bun run typecheck',
        timeout_seconds: 60,
        cb_easp: true
      }
    }
    
    // Stage 2: Test validation
    if (changedFiles && changedFiles.length > 0) {
      // Check for test files
      for (const file of changedFiles.filter((f: string) => !f.includes('.test.'))) {
        const testFile = file.replace(/\.(ts|js)$/, '.test.$1')
        yield {
          toolName: 'read_files',
          input: {
            paths: [testFile],
            cb_easp: true
          }
        }
      }
    }
    
    // Continue with other validation stages
    yield 'STEP_ALL'
  },
}

export default definition
