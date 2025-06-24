import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test'
import { TEST_USER_ID } from 'common/constants'
import { getInitialSessionState } from 'common/types/session-state'
import { WebSocket } from 'ws'
import { mainPrompt } from '../main-prompt'

// Import MCP tools to trigger auto-registration
import '../../../packages/internal/src/mcp/tools'
import { mcpRegistry } from '@codebuff/internal/mcp'

// Mock imports needed for setup within the test
import { ProjectFileContext } from '@codebuff/common/util/file'
import * as checkTerminalCommandModule from '../check-terminal-command'
import * as requestFilesPrompt from '../find-files/request-files-prompt'
import * as aisdk from '../llm-apis/vercel-ai-sdk/ai-sdk'
import { logger } from '../util/logger'
import * as websocketAction from '../websockets/websocket-action'

// Mock logger
mock.module('../util/logger', () => ({
  logger: {
    debug: () => {},
    error: () => {},
    info: () => {},
    warn: () => {},
  },
  withLoggerContext: async (context: any, fn: () => Promise<any>) => fn(),
}))

// Mock analytics and bigquery
mock.module('@codebuff/common/analytics', () => ({
  initAnalytics: () => {},
  trackEvent: () => {},
}))

mock.module('@codebuff/bigquery', () => ({
  insertTrace: () => Promise.resolve(true),
}))

// --- Shared Mocks & Helpers ---

class MockWebSocket {
  send(msg: string) {}
  close() {}
  on(event: string, listener: (...args: any[]) => void) {}
  removeListener(event: string, listener: (...args: any[]) => void) {}
}

const mockFileContext: ProjectFileContext = {
  projectRoot: '/test',
  cwd: '/test',
  fileTree: [],
  fileTokenScores: {},
  knowledgeFiles: {},
  gitChanges: {
    status: '',
    diff: '',
    diffCached: '',
    lastCommitMessages: '',
  },
  changesSinceLastChat: {},
  shellConfigFiles: {},
  systemInfo: {
    platform: 'test',
    shell: 'test',
    nodeVersion: 'test',
    arch: 'test',
    homedir: '/home/test',
    cpus: 1,
  },
  fileVersions: [],
}

describe('MCP Integration', () => {
  afterEach(() => {
    mock.restore()
  })

  it('should call resolve-library-id MCP tool when asked about library docs', async () => {
    // Mock necessary non-LLM functions
    spyOn(logger, 'debug').mockImplementation(() => {})
    spyOn(logger, 'error').mockImplementation(() => {})
    spyOn(logger, 'info').mockImplementation(() => {})
    spyOn(logger, 'warn').mockImplementation(() => {})
    spyOn(requestFilesPrompt, 'requestRelevantFiles').mockResolvedValue([])
    spyOn(checkTerminalCommandModule, 'checkTerminalCommand').mockResolvedValue(null)
    spyOn(websocketAction, 'requestFiles').mockResolvedValue({})

    // Mock the AI to return a resolve-library-id tool call
    const mockResponse = `I'll help you get documentation for React. Let me first resolve the library ID.

<resolve-library-id>
<libraryName>react</libraryName>
</resolve-library-id>`

    spyOn(aisdk, 'promptAiSdkStream').mockImplementation(async function* () {
      yield mockResponse
    })

    const sessionState = getInitialSessionState(mockFileContext)
    const action = {
      type: 'prompt' as const,
      prompt: 'Get documentation for React',
      sessionState,
      fingerprintId: 'test-mcp-integration',
      costMode: 'normal' as const,
      promptId: 'test-mcp-id',
      toolResults: [],
    }

    const { toolCalls } = await mainPrompt(
      new MockWebSocket() as unknown as WebSocket,
      action,
      {
        userId: TEST_USER_ID,
        clientSessionId: 'test-session-mcp',
        onResponseChunk: () => {},
        selectedModel: undefined,
        readOnlyMode: false,
      }
    )

    // Verify that the resolve-library-id tool was called
    expect(toolCalls).toHaveLength(1)
    expect(toolCalls[0].toolName).toBe('resolve-library-id')
    expect(toolCalls[0].args).toEqual({ libraryName: 'react' })
  }, 60000)

  it('should call get-library-docs MCP tool with library ID', async () => {
    // Mock necessary non-LLM functions
    spyOn(logger, 'debug').mockImplementation(() => {})
    spyOn(logger, 'error').mockImplementation(() => {})
    spyOn(logger, 'info').mockImplementation(() => {})
    spyOn(logger, 'warn').mockImplementation(() => {})
    spyOn(requestFilesPrompt, 'requestRelevantFiles').mockResolvedValue([])
    spyOn(checkTerminalCommandModule, 'checkTerminalCommand').mockResolvedValue(null)
    spyOn(websocketAction, 'requestFiles').mockResolvedValue({})

    // Mock the AI to return a get-library-docs tool call
    const mockResponse = `I'll get the React documentation for you.

<get-library-docs>
<context7CompatibleLibraryID>/facebook/react</context7CompatibleLibraryID>
<topic>hooks</topic>
<tokens>5000</tokens>
</get-library-docs>`

    spyOn(aisdk, 'promptAiSdkStream').mockImplementation(async function* () {
      yield mockResponse
    })

    const sessionState = getInitialSessionState(mockFileContext)
    const action = {
      type: 'prompt' as const,
      prompt: 'Get React hooks documentation from /facebook/react',
      sessionState,
      fingerprintId: 'test-mcp-integration-2',
      costMode: 'normal' as const,
      promptId: 'test-mcp-id-2',
      toolResults: [],
    }

    const { toolCalls } = await mainPrompt(
      new MockWebSocket() as unknown as WebSocket,
      action,
      {
        userId: TEST_USER_ID,
        clientSessionId: 'test-session-mcp-2',
        onResponseChunk: () => {},
        selectedModel: undefined,
        readOnlyMode: false,
      }
    )

    // Verify that the get-library-docs tool was called
    expect(toolCalls).toHaveLength(1)
    expect(toolCalls[0].toolName).toBe('get-library-docs')
    expect(toolCalls[0].args).toEqual({
      context7CompatibleLibraryID: '/facebook/react',
      topic: 'hooks',
      tokens: '5000', // XML parser returns strings, not numbers
    })
  }, 60000)

  it('should handle MCP tool execution errors gracefully', async () => {
    // Mock necessary non-LLM functions
    spyOn(logger, 'debug').mockImplementation(() => {})
    spyOn(logger, 'error').mockImplementation(() => {})
    spyOn(logger, 'info').mockImplementation(() => {})
    spyOn(logger, 'warn').mockImplementation(() => {})
    spyOn(requestFilesPrompt, 'requestRelevantFiles').mockResolvedValue([])
    spyOn(checkTerminalCommandModule, 'checkTerminalCommand').mockResolvedValue(null)
    spyOn(websocketAction, 'requestFiles').mockResolvedValue({})

    // Mock the AI to return an invalid MCP tool call
    const mockResponse = `<invalidMcpTool>
<someParam>invalid</someParam>
</invalidMcpTool>`

    spyOn(aisdk, 'promptAiSdkStream').mockImplementation(async function* () {
      yield mockResponse
    })

    const sessionState = getInitialSessionState(mockFileContext)
    const action = {
      type: 'prompt' as const,
      prompt: 'Test invalid MCP tool',
      sessionState,
      fingerprintId: 'test-mcp-error',
      costMode: 'normal' as const,
      promptId: 'test-mcp-error-id',
      toolResults: [],
    }

    const { toolCalls } = await mainPrompt(
      new MockWebSocket() as unknown as WebSocket,
      action,
      {
        userId: TEST_USER_ID,
        clientSessionId: 'test-session-mcp-error',
        onResponseChunk: () => {},
        selectedModel: undefined,
        readOnlyMode: false,
      }
    )

    // Should not crash and should return empty tool calls for invalid tools
    expect(toolCalls).toHaveLength(0)
  }, 60000)
})
