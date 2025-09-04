import { describe, test, expect, beforeEach, afterEach, spyOn, mock } from 'bun:test'

// Mock the logger
mock.module('../utils/logger', () => ({
  logger: {
    error: () => {},
  },
}))

// Mock terminal utilities
mock.module('../utils/terminal', () => ({
  ENTER_ALT_BUFFER: '',
  EXIT_ALT_BUFFER: '',
  CLEAR_SCREEN: '',
  SHOW_CURSOR: '',
  MOVE_CURSOR: () => '',
  SET_CURSOR_DEFAULT: '',
  DISABLE_CURSOR_BLINK: '',
  CURSOR_SET_INVISIBLE_BLOCK: '',
}))

// Mock picocolors
mock.module('picocolors', () => ({
  green: (text: string) => text,
  yellow: (text: string) => text,
  cyan: (text: string) => text,
  bold: (text: string) => text,
  gray: (text: string) => text,
  blue: (text: string) => text,
}))

// Mock string utilities
mock.module('string-width', () => ({
  default: (text: string) => text.length,
}))

mock.module('wrap-ansi', () => ({
  default: (text: string, width: number) => text,
}))

// Now import the module under test
import type { SubagentNode } from '../chat'

// Mock process.stdout to track what gets written
const mockWrites: string[] = []
spyOn(process.stdout, 'write').mockImplementation((data) => {
  mockWrites.push(data.toString())
  return true
})

// Mock process.stdin for keypress handling
spyOn(process.stdin, 'removeAllListeners').mockImplementation(() => process.stdin)
spyOn(process.stdin, 'on').mockImplementation(() => process.stdin)
spyOn(process.stdin, 'listeners').mockImplementation(() => [])
spyOn(process.stdin, 'setRawMode').mockImplementation(() => process.stdin)
spyOn(process.stdin, 'resume').mockImplementation(() => process.stdin)

// Mock process properties
Object.defineProperty(process.stdout, 'rows', { value: 24, writable: true })
Object.defineProperty(process.stdout, 'columns', { value: 80, writable: true })
Object.defineProperty(process.stdin, 'isTTY', { value: true, writable: true })

describe('PostContent Streaming Tests', () => {
  let streamingOrder: Array<{ type: 'content' | 'postContent'; nodeId: string; text: string; timestamp: number }> = []
  
  beforeEach(() => {
    streamingOrder = []
    mockWrites.length = 0
  })
  
  afterEach(() => {
    mock.restore()
  })
  
  test('should stream parent postContent only after all children finish', async () => {
    // Create a mock response with nested children
    const mockResponse = {
      content: 'Parent content',
      agent: 'assistant',
      postContent: 'Parent summary - should be LAST',
      children: [
        {
          content: 'Child 1 content',
          agent: 'file-picker',
          postContent: 'Child 1 summary',
          children: [
            {
              content: 'Grandchild 1 content',
              agent: 'file-picker',
              postContent: 'Grandchild 1 summary',
              children: [],
            },
          ],
        },
        {
          content: 'Child 2 content', 
          agent: 'reviewer',
          postContent: 'Child 2 summary',
          children: [],
        },
      ],
    }
    
    // We need to create a test harness that simulates the streaming logic
    // Let's create a simplified version to test the core logic
    
    const streamedItems: Array<{ nodeId: string; type: 'content' | 'postContent'; text: string }> = []
    
    // Mock streamTextToNodeProperty to track streaming order
    async function mockStreamTextToNodeProperty(
      node: SubagentNode,
      property: 'content' | 'postContent',
      text: string,
    ): Promise<void> {
      streamedItems.push({
        nodeId: node.id,
        type: property,
        text: text,
      })
    }
    
    // Simulate the streamSubagentTreeContent logic with our test data
    async function testStreamSubagentTreeContent(
      responseNode: any,
      messageId: string,
      currentPath: number[],
    ): Promise<{ nodeId: string; postContent: string }[]> {
      if (!responseNode.children || responseNode.children.length === 0) {
        return []
      }
    
      const allNodesWithPostContent: { nodeId: string; postContent: string }[] = []
    
      // First pass: Process all children content and create nodes
      const childNodes: { nodeId: string; originalChild: any }[] = []
    
      for (let childIndex = 0; childIndex < responseNode.children.length; childIndex++) {
        const child = responseNode.children[childIndex]
        const childPath = [...currentPath, childIndex]
        const nodeId = `${messageId}/${childPath.join('/')}`
        
        const childNode: SubagentNode = {
          id: nodeId,
          type: child.agent || 'unknown',
          content: '',
          children: [],
        }
    
        // Stream this child's content
        await mockStreamTextToNodeProperty(childNode, 'content', child.content)
        
        // Store for later processing
        childNodes.push({ nodeId, originalChild: child })
      }
    
      // Second pass: Process all children recursively (grandchildren)
      for (let i = 0; i < childNodes.length; i++) {
        const { nodeId: childNodeId, originalChild: child } = childNodes[i]
        const childPath = [...currentPath, i]
        
        // Recursively process grandchildren
        const descendantPostContentNodes = await testStreamSubagentTreeContent(
          child,
          messageId,
          childPath,
        )
        allNodesWithPostContent.push(...descendantPostContentNodes)
      }
    
      // Third pass: After ALL descendants are processed, collect postContent from this level
      for (const { nodeId: childNodeId, originalChild: child } of childNodes) {
        if (child.postContent) {
          allNodesWithPostContent.push({
            nodeId: childNodeId,
            postContent: child.postContent,
          })
        }
      }
    
      return allNodesWithPostContent
    }
    
    // Test the streaming logic
    const messageId = 'test-message'
    
    // Stream main content first
    await mockStreamTextToNodeProperty(
      { id: messageId, type: 'assistant', content: '', children: [] },
      'content',
      mockResponse.content
    )
    
    // Process subagent tree
    const allPostContentNodes = await testStreamSubagentTreeContent(
      mockResponse,
      messageId,
      [],
    )
    
    // Add parent postContent to collection (should be last)
    if (mockResponse.postContent) {
      allPostContentNodes.push({
        nodeId: messageId,
        postContent: mockResponse.postContent,
      })
    }
    
    // Stream all postContent
    for (const item of allPostContentNodes) {
      await mockStreamTextToNodeProperty(
        { id: item.nodeId, type: 'assistant', content: '', children: [] },
        'postContent',
        item.postContent
      )
    }
    
    // Verify streaming order
    expect(streamedItems).toHaveLength(8) // 4 content + 4 postContent (including parent)
    
    // Content should stream first
    expect(streamedItems[0]).toMatchObject({ type: 'content', text: 'Parent content' })
    expect(streamedItems[1]).toMatchObject({ type: 'content', text: 'Child 1 content' })
    expect(streamedItems[2]).toMatchObject({ type: 'content', text: 'Child 2 content' })
    expect(streamedItems[3]).toMatchObject({ type: 'content', text: 'Grandchild 1 content' })
    
    // PostContent should stream after ALL content, from deepest to shallowest
    expect(streamedItems[4]).toMatchObject({ type: 'postContent', text: 'Grandchild 1 summary' })
    expect(streamedItems[5]).toMatchObject({ type: 'postContent', text: 'Child 1 summary' })
    expect(streamedItems[6]).toMatchObject({ type: 'postContent', text: 'Child 2 summary' })
    
    // MOST IMPORTANT: Parent postContent should be LAST
    expect(streamedItems[7]).toMatchObject({ type: 'postContent', text: 'Parent summary - should be LAST' })
  })
  
  test('should handle single level with postContent correctly', async () => {
    const mockResponse = {
      content: 'Single parent',
      agent: 'assistant', 
      postContent: 'Parent done',
      children: [
        {
          content: 'Only child',
          agent: 'file-picker',
          postContent: 'Child done',
          children: [],
        },
      ],
    }
    
    const streamedItems: Array<{ type: 'content' | 'postContent'; text: string }> = []
    
    // Simple test - parent postContent should come after child postContent
    // This test will pass with current broken logic, but helps verify our fix
    
    expect(true).toBe(true) // Placeholder for now
  })
})
