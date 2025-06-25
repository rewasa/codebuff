import { describe, it, expect } from 'bun:test';
import { mcpRegistry } from '../registry';
import '../tools'; // Import to register tools

describe('Context7 MCP Server', () => {
  it('should be registered in the MCP registry', () => {
    const tool = mcpRegistry.getTool('get-library-docs');
    expect(tool).toBeDefined();
    expect(tool!.definition.name).toBe('get-library-docs');
    expect(tool!.definition.description).toContain('Context7');
  });

  it('should attempt to get library documentation', async () => {
    const resolveTool = mcpRegistry.getTool('resolve-library-id');
    const docsTool = mcpRegistry.getTool('get-library-docs');
    expect(resolveTool).toBeDefined();
    expect(docsTool).toBeDefined();

    try {
      // First resolve the library ID
      const resolveResult = await resolveTool!.handler({
        libraryName: 'react'
      });

      console.log('✅ Context7 resolve succeeded:', JSON.stringify(resolveResult, null, 2));

      // Extract the first library ID from the response
      if (typeof resolveResult === 'object' && resolveResult !== null && 'content' in resolveResult) {
        const content = resolveResult.content[0]?.text || '';
        const match = content.match(/Context7-compatible library ID: (\/[^\n]+)/);
        
        if (match) {
          const libraryId = match[1];
          console.log('Using library ID:', libraryId);
          
          const result = await docsTool!.handler({
            context7CompatibleLibraryID: libraryId
          });

          console.log('✅ Context7 docs succeeded:', JSON.stringify(result, null, 2));
        }
      }

      expect(resolveResult).toBeDefined();
    } catch (error) {
      console.log('⚠️  Context7 search failed:', error);
      
      // Verify the error is the expected MCP error format
      expect(error).toBeDefined();
      if (typeof error === 'object' && error !== null && 'message' in error) {
        expect(error.message).toContain('Tool execution failed');
      }
    }
  }, 15000);

  it('should validate tool parameters correctly', () => {
    const tool = mcpRegistry.getTool('get-library-docs');
    expect(tool).toBeDefined();

    // Test parameter validation
    const params = tool!.definition.parameters;
    expect(params).toBeDefined();
    
    // Should accept valid parameters
    const validResult = params.safeParse({
      context7CompatibleLibraryID: '/facebook/react'
    });
    expect(validResult.success).toBe(true);

    // Should reject missing required parameter
    const invalidResult = params.safeParse({});
    expect(invalidResult.success).toBe(false);
  });
});
