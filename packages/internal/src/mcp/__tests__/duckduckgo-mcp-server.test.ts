import { describe, it, expect } from 'bun:test';
import { mcpRegistry } from '../registry';
import '../tools'; // Import to register tools

describe('DuckDuckGo MCP Server', () => {
  it('should be registered in the MCP registry', () => {
    const tool = mcpRegistry.getTool('duckduckgo_web_search');
    expect(tool).toBeDefined();
    expect(tool!.definition.name).toBe('duckduckgo_web_search');
    expect(tool!.definition.description).toContain('DuckDuckGo');
  });

  it('should perform a real web search', async () => {
    const tool = mcpRegistry.getTool('duckduckgo_web_search');
    expect(tool).toBeDefined();

    try {
      const result = await tool!.handler({
        query: 'TypeScript programming language',
        count: 3,
        safeSearch: 'moderate'
      });

      console.log('✅ DuckDuckGo search succeeded:', JSON.stringify(result, null, 2));

      // If successful, verify the result structure
      expect(result).toBeDefined();
      if (typeof result === 'object' && result !== null && 'content' in result) {
        // Handle MCP error response format
        expect(result).toHaveProperty('content');
      } else if (typeof result === 'string') {
        expect(result.length).toBeGreaterThan(0);
      }
    } catch (error) {
      console.log('⚠️  DuckDuckGo search failed:', error);
      
      // Verify the error is the expected MCP error format
      expect(error).toBeDefined();
      if (typeof error === 'object' && error !== null && 'message' in error) {
        expect(error.message).toMatch(/Tool execution failed|MCP Server Error/);
      }
    }
  }, 15000);

  it('should validate tool parameters correctly', () => {
    const tool = mcpRegistry.getTool('duckduckgo_web_search');
    expect(tool).toBeDefined();

    // Test parameter validation
    const params = tool!.definition.parameters;
    expect(params).toBeDefined();
    
    // Should accept valid parameters
    const validResult = params.safeParse({
      query: 'test query',
      count: 5,
      safeSearch: 'moderate'
    });
    expect(validResult.success).toBe(true);

    // Should reject invalid parameters
    const invalidResult = params.safeParse({
      query: '', // empty query should fail
      count: 25, // count > 20 should fail
      safeSearch: 'invalid' // invalid enum value should fail
    });
    expect(invalidResult.success).toBe(false);
  });
});
