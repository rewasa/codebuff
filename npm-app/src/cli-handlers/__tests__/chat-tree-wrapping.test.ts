import { describe, test, expect, beforeEach } from 'bun:test'
import {
  renderAssistantMessage,
  renderSubagentTree,
  createNodeId,
  type ChatMessage,
  type SubagentNode,
  type SubagentUIState,
  type TerminalMetrics,
} from '../chat'

// Mock terminal metrics for consistent testing
const mockMetrics: TerminalMetrics = {
  height: 24,
  width: 80,
  contentWidth: 76, // 80 - 4 (2 * SIDE_PADDING)
  sidePadding: 2,
}

const timeFormatter = new Intl.DateTimeFormat([], {
  hour: '2-digit',
  minute: '2-digit',
})

describe('Chat Tree Line Wrapping', () => {
  describe('renderAssistantMessage wrapping', () => {
    test('should wrap long assistant message content with tree prefix continuation', () => {
      const longContent =
        'This is a very long assistant message that should definitely wrap across multiple lines when displayed in the terminal because it exceeds the terminal width limit'

      const message: ChatMessage = {
        role: 'assistant',
        content: longContent,
        timestamp: Date.now(),
        id: 'test-msg-1',
        subagentTree: {
          id: createNodeId('test-msg-1', []),
          type: 'assistant',
          content: longContent,
          children: [
            {
              id: createNodeId('test-msg-1', [0]),
              type: 'file-picker',
              content: 'Child content',
              children: [],
            },
          ],
        },
        subagentUIState: {
          expanded: new Set(),
          focusNodeId: null,
          firstChildProgress: new Map(),
        },
      }

      const lines = renderAssistantMessage(message, mockMetrics, timeFormatter)

      // Should have metadata line plus wrapped content lines
      expect(lines.length).toBeGreaterThan(2)

      // First line should be metadata
      expect(lines[0]).toContain('Assistant')

      // Second line should start with simple indentation
      expect(lines[1]).toContain('    This is a very long')

      // Continuation lines should maintain proper indentation
      const continuationLines = lines.slice(2)
      for (const line of continuationLines) {
        if (line.trim()) {
          // Should have proper indentation for wrapped content
          expect(line).toMatch(/^  \s+/)
        }
      }
    })

    test('should handle multi-line assistant content with proper tree structure', () => {
      const multiLineContent =
        'First line of content\nSecond line that is very long and should wrap across multiple terminal lines\nThird line'

      const message: ChatMessage = {
        role: 'assistant',
        content: multiLineContent,
        timestamp: Date.now(),
        id: 'test-msg-2',
        subagentTree: {
          id: createNodeId('test-msg-2', []),
          type: 'assistant',
          content: multiLineContent,
          children: [],
        },
        subagentUIState: {
          expanded: new Set(),
          focusNodeId: null,
          firstChildProgress: new Map(),
        },
      }

      const lines = renderAssistantMessage(message, mockMetrics, timeFormatter)

      // Should process each line separately
      expect(lines.length).toBeGreaterThanOrEqual(4) // metadata + 3 content lines (some may wrap)

      // Each logical line should have proper indentation
      let indentedLineCount = 0
      for (const line of lines.slice(1)) {
        // Skip metadata
        if (line.trim() && line.match(/^\s{4,}/)) {
          // 4+ spaces for indented content
          indentedLineCount++
        }
      }
      expect(indentedLineCount).toBeGreaterThan(0) // Should have indented content lines
    })
  })

  describe('renderSubagentTree complex scenarios', () => {
    test('should handle deeply nested tree with wrapping content', () => {
      const tree: SubagentNode = {
        id: createNodeId('test-msg-3', []),
        type: 'assistant',
        content: 'Root content',
        children: [
          {
            id: createNodeId('test-msg-3', [0]),
            type: 'file-picker',
            content:
              'This is a very long file picker content that should wrap across multiple lines and maintain proper tree indentation',
            children: [
              {
                id: createNodeId('test-msg-3', [0, 0]),
                type: 'thinker',
                content:
                  'Nested thinker with extremely long content that definitely needs to wrap and should maintain the correct vertical tree structure with proper ancestor line continuation',
                children: [],
                postContent:
                  'Thinker post content that is also quite long and should wrap properly',
              },
            ],
            postContent: 'File picker completed successfully',
          },
          {
            id: createNodeId('test-msg-3', [1]),
            type: 'reviewer',
            content: 'Second top-level child with long content that wraps',
            children: [],
            postContent: 'Review completed',
          },
        ],
        postContent:
          'All tasks completed successfully with comprehensive results',
      }

      const uiState: SubagentUIState = {
        expanded: new Set([
          createNodeId('test-msg-3', [0]),
          createNodeId('test-msg-3', [0, 0]),
          createNodeId('test-msg-3', [1]),
        ]),
        focusNodeId: null,
        firstChildProgress: new Map(),
      }

      const lines = renderSubagentTree(tree, uiState, mockMetrics, 'test-msg-3')

      // Should have multiple lines with proper tree structure
      expect(lines.length).toBeGreaterThan(10)

      // Check for consistent indentation in the tree structure
      let hasConsistentIndentation = false
      for (const line of lines) {
        if (line.trim() && line.match(/^\s{2,}/)) {
          // 2+ spaces for any indented content
          hasConsistentIndentation = true
          break
        }
      }
      expect(hasConsistentIndentation).toBe(true)
    })

    test('should handle children of children with proper ancestor tracking', () => {
      const tree: SubagentNode = {
        id: createNodeId('test-msg-4', []),
        type: 'assistant',
        content: 'Root',
        children: [
          {
            id: createNodeId('test-msg-4', [0]),
            type: 'parent',
            content:
              'Parent content that is long enough to wrap and test continuation lines',
            children: [
              {
                id: createNodeId('test-msg-4', [0, 0]),
                type: 'child1',
                content:
                  'First child with long content that needs wrapping to test the tree structure',
                children: [],
              },
              {
                id: createNodeId('test-msg-4', [0, 1]),
                type: 'child2',
                content: 'Second child also with long content that wraps',
                children: [
                  {
                    id: createNodeId('test-msg-4', [0, 1, 0]),
                    type: 'grandchild',
                    content:
                      'Grandchild with very long content that should maintain proper tree indentation with ancestor vertical lines',
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      }

      const uiState: SubagentUIState = {
        expanded: new Set([
          createNodeId('test-msg-4', [0]),
          createNodeId('test-msg-4', [0, 1]),
        ]),
        focusNodeId: null,
        firstChildProgress: new Map(),
      }

      const lines = renderSubagentTree(tree, uiState, mockMetrics, 'test-msg-4') // Find grandchild lines and verify proper indentation
      const grandchildLines = lines.filter(
        (line) => line.includes('grandchild') || line.includes('Grandchild'),
      )

      expect(grandchildLines.length).toBeGreaterThan(0)

      // Grandchild wrapped lines should have proper indentation
      for (const line of grandchildLines) {
        if (line.trim()) {
          // Should have proper nested indentation (at least 2 spaces)
          expect(line).toMatch(/^\s{2,}/)
        }
      }
    })

    test('should handle mixed scenarios with postContent wrapping', () => {
      const tree: SubagentNode = {
        id: createNodeId('test-msg-5', []),
        type: 'assistant',
        content: 'Root',
        children: [
          {
            id: createNodeId('test-msg-5', [0]),
            type: 'worker',
            content: 'Worker content',
            children: [],
            postContent:
              'This is a very long post content message that should wrap across multiple lines while maintaining the proper tree structure and indentation',
          },
        ],
        postContent:
          'Root post content that is also quite long and should wrap properly at the end of the entire tree structure',
      }

      const uiState: SubagentUIState = {
        expanded: new Set([createNodeId('test-msg-5', [0])]),
        focusNodeId: null,
        firstChildProgress: new Map(),
      }

      const lines = renderSubagentTree(tree, uiState, mockMetrics, 'test-msg-5')

      // Should handle both child postContent and root postContent
      const postContentLines = lines.filter(
        (line) =>
          line.includes('post content') || line.includes('tree structure'),
      )

      expect(postContentLines.length).toBeGreaterThan(2)
    })
  })

  describe('edge cases', () => {
    test('should handle very narrow terminal width', () => {
      const narrowMetrics: TerminalMetrics = {
        height: 24,
        width: 40,
        contentWidth: 36,
        sidePadding: 2,
      }

      const message: ChatMessage = {
        role: 'assistant',
        content:
          'This message will definitely wrap across multiple lines when displayed in narrow terminal',
        timestamp: Date.now(),
        id: 'test-narrow',
      }

      const lines = renderAssistantMessage(
        message,
        narrowMetrics,
        timeFormatter,
      )

      // Should handle narrow width gracefully
      expect(lines.length).toBeGreaterThan(1)

      // Check that lines don't exceed width (allowing for some minor variance due to ANSI codes)
      for (const line of lines) {
        const cleanLine = line.replace(/\x1b\[[0-9;]*m/g, '') // Remove ANSI codes
        expect(cleanLine.length).toBeLessThanOrEqual(narrowMetrics.width + 5) // Allow small buffer for edge cases
      }
    })

    test('should handle empty and null content gracefully', () => {
      const message: ChatMessage = {
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        id: 'test-empty',
      }

      const lines = renderAssistantMessage(message, mockMetrics, timeFormatter)

      // Should only have metadata line for empty content
      expect(lines.length).toBe(1)
      expect(lines[0]).toContain('Assistant')
    })

    test('should handle extremely long single words', () => {
      const veryLongWord = 'a'.repeat(100) // 100 character word
      const message: ChatMessage = {
        role: 'assistant',
        content: `Short text with ${veryLongWord} embedded`,
        timestamp: Date.now(),
        id: 'test-long-word',
      }

      const lines = renderAssistantMessage(message, mockMetrics, timeFormatter)

      // Should handle gracefully without throwing errors
      expect(lines.length).toBeGreaterThan(1)
      expect(lines[0]).toContain('Assistant')
    })

    test('should handle tree structure with extremely narrow width', () => {
      const tree: SubagentNode = {
        id: createNodeId('test-msg-narrow', []),
        type: 'assistant',
        content: 'Root',
        children: [
          {
            id: createNodeId('test-msg-narrow', [0]),
            type: 'child',
            content:
              'This is a very long child content that will definitely need to wrap',
            children: [],
          },
        ],
      }

      const narrowMetrics: TerminalMetrics = {
        height: 24,
        width: 30,
        contentWidth: 26,
        sidePadding: 2,
      }

      const uiState: SubagentUIState = {
        expanded: new Set([createNodeId('test-msg-narrow', [0])]),
        focusNodeId: null,
        firstChildProgress: new Map(),
      }

      const lines = renderSubagentTree(
        tree,
        uiState,
        narrowMetrics,
        'test-msg-narrow',
      )

      // Should handle gracefully without throwing errors
      expect(lines.length).toBeGreaterThan(0)

      // No line should be completely empty or exceed reasonable bounds
      for (const line of lines) {
        if (line.trim()) {
          const cleanLine = line.replace(/\x1b\[[0-9;]*m/g, '')
          expect(cleanLine.length).toBeLessThanOrEqual(narrowMetrics.width + 10) // Allow reasonable buffer
        }
      }
    })
  })
})
