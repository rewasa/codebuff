import {
  green,
  yellow,
  cyan,
  magenta,
  bold,
  gray,
  blue,
  italic,
} from 'picocolors'
import { pluralize } from '@codebuff/common/util/string'
import {
  getSubagentData,
  getSubagentFullContent,
  getSubagentFormattedContent,
  getAllSubagentIds,
  getRecentSubagents,
  SubagentData,
} from '../subagent-storage'
import { logger } from '../utils/logger'
import {
  ENTER_ALT_BUFFER,
  EXIT_ALT_BUFFER,
  CLEAR_SCREEN,
  HIDE_CURSOR,
  SHOW_CURSOR,
  MOVE_CURSOR,
} from '../utils/terminal'
import { enterSubagentListBuffer } from './subagent-list'
import wrapAnsi from 'wrap-ansi'
import stringWidth from 'string-width'

/**
 * Wrap a line to fit within terminal width using robust npm packages
 */
function wrapLine(line: string, terminalWidth: number): string[] {
  if (!line) return ['']

  // Use string-width to check actual display width
  if (stringWidth(line) <= terminalWidth) {
    return [line]
  }

  // Use wrap-ansi for robust ANSI-aware wrapping
  const wrapped = wrapAnsi(line, terminalWidth, { hard: true })
  return wrapped.split('\n')
}

let isInSubagentBuffer = false
let originalKeyHandlers: ((str: string, key: any) => void)[] = []
let scrollOffset = 0
let contentLines: string[] = []
let currentAgentId: string | null = null
let lastContentLength = 0

// Chat interface state
let chatMessages: Array<{
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}> = []
let chatInput = ''
let mockStreamingContent = ''
let mockStreamingIndex = 0
let mockStreamingTimer: NodeJS.Timeout | null = null
let eventLoopKeepAlive: NodeJS.Timeout | null = null

export function isInSubagentBufferMode(): boolean {
  return isInSubagentBuffer
}

/**
 * Display a formatted list of subagents with enhanced styling
 */
export function displaySubagentList(agents: SubagentData[]) {
  console.log(bold(cyan('🤖 Available Subagents')))
  console.log(gray(`Found ${pluralize(agents.length, 'subagent')}`))
  console.log()
  if (agents.length === 0) {
    console.log(gray('  (none)'))
  } else {
    agents.forEach((agent) => {
      const status = agent.isActive ? green('●') : gray('○')
      const promptPreview = agent.prompt
        ? gray(agent.prompt)
        : gray('(no prompt)')
      console.log(
        `  ${status} ${bold(agent.agentId)} ${gray(`(${agent.agentType})`)}`
      )
      console.log(`    ${promptPreview}`)
      console.log()
    })
  }
}

export function enterSubagentBuffer(
  rl: any,
  agentId: string,
  onExit: () => void
) {
  if (isInSubagentBuffer) {
    console.log(yellow('Already in subagent buffer mode!'))
    return
  }

  // Validate agent ID exists
  const agentData = getSubagentData(agentId)
  if (!agentData) {
    console.log(yellow(`No subagent found with ID: ${agentId}`))
    const recentSubagents = getRecentSubagents(5)
    displaySubagentList(recentSubagents)
    return
  }

  currentAgentId = agentId

  // Reset scroll state to ensure clean start
  scrollOffset = 0
  contentLines = []
  lastContentLength = 0

  // Reset chat state
  chatMessages = []
  chatInput = ''
  if (mockStreamingTimer) {
    clearInterval(mockStreamingTimer)
    mockStreamingTimer = null
  }
  if (eventLoopKeepAlive) {
    clearInterval(eventLoopKeepAlive)
    eventLoopKeepAlive = null
  }

  // Enter alternate screen buffer
  process.stdout.write(ENTER_ALT_BUFFER)
  process.stdout.write(CLEAR_SCREEN)
  process.stdout.write(MOVE_CURSOR(1, 1)) // Ensure cursor starts at top-left

  isInSubagentBuffer = true

  // Display subagent content
  updateSubagentContent()

  // Set up key handler for ESC to exit
  setupSubagentKeyHandler(rl, onExit)
}

export function exitSubagentBuffer(rl: any) {
  if (!isInSubagentBuffer) {
    return
  }

  // Reset state
  scrollOffset = 0
  contentLines = []
  currentAgentId = null
  lastContentLength = 0

  // Reset chat state
  chatMessages = []
  chatInput = ''
  if (mockStreamingTimer) {
    clearInterval(mockStreamingTimer)
    mockStreamingTimer = null
  }
  if (eventLoopKeepAlive) {
    clearInterval(eventLoopKeepAlive)
    eventLoopKeepAlive = null
  }

  // Restore all original key handlers
  if (originalKeyHandlers.length > 0) {
    process.stdin.removeAllListeners('keypress')
    originalKeyHandlers.forEach((handler) => {
      process.stdin.on('keypress', handler)
    })
    originalKeyHandlers = []
  }

  // Remove resize listener
  process.stdout.removeAllListeners('resize')

  // Exit alternate screen buffer
  process.stdout.write(SHOW_CURSOR)
  process.stdout.write(EXIT_ALT_BUFFER)

  isInSubagentBuffer = false
}

function updateSubagentContent() {
  if (!currentAgentId) return

  const agentData = getSubagentData(currentAgentId)
  if (!agentData) return

  const fullContent = getSubagentFormattedContent(currentAgentId)

  // Check if content has changed
  if (fullContent.length === lastContentLength) {
    return // No new content
  }
  lastContentLength = fullContent.length

  // Split content into lines and wrap them properly
  const terminalWidth = process.stdout.columns || 80
  const contentBodyLines = fullContent
    ? fullContent.split('\n')
    : ['(no content yet)']

  const wrappedLines: string[] = []

  // Add prompt if exists (but don't duplicate if it's already in the content)
  if (
    agentData.prompt &&
    !fullContent.includes(`Prompt: ${agentData.prompt}`)
  ) {
    const promptLine = bold(gray(`Prompt: ${agentData.prompt}`))
    wrappedLines.push(...wrapLine(promptLine, terminalWidth))
    wrappedLines.push('') // Add spacing after prompt
  }

  // Wrap each content line, preserving empty lines
  for (let i = 0; i < contentBodyLines.length; i++) {
    const line = contentBodyLines[i]
    if (line === '') {
      wrappedLines.push('') // Preserve empty lines
    } else {
      const wrapped = wrapLine(line, terminalWidth)
      wrappedLines.push(...wrapped)
    }
  }

  // Ensure we end with an empty line for spacing
  if (wrappedLines.length > 0 && wrappedLines[wrappedLines.length - 1] !== '') {
    wrappedLines.push('')
  }

  contentLines = wrappedLines

  // Always start at the top when entering a new subagent view
  scrollOffset = 0

  renderSubagentContent()
}

function startMockStreaming(userMessage: string) {
  // Mock responses based on user input
  const responses = [
    "I understand you're asking about that. Let me think through this step by step...",
    "That's an interesting question! Based on the codebase context, I can see that...",
    'Great point! Looking at the current implementation, I notice that we could improve this by...',
    'Let me analyze the code structure here. It appears that the main issue is...',
    "I see what you're getting at. The pattern I'm observing suggests that...",
  ]

  const randomResponse = responses[Math.floor(Math.random() * responses.length)]
  mockStreamingContent = randomResponse
  mockStreamingIndex = 0

  // Add assistant message placeholder
  chatMessages.push({
    role: 'assistant',
    content: '',
    timestamp: Date.now(),
  })

  // Keep event loop active during streaming
  eventLoopKeepAlive = setInterval(() => {
    // Empty interval to keep event loop active
  }, 10)

  // Start streaming simulation
  mockStreamingTimer = setInterval(() => {
    if (mockStreamingIndex < mockStreamingContent.length) {
      const currentMessage = chatMessages[chatMessages.length - 1]
      if (currentMessage.role === 'assistant') {
        currentMessage.content += mockStreamingContent[mockStreamingIndex]
        mockStreamingIndex++
        renderSubagentContent() // Re-render to show streaming
      }
    } else {
      // Streaming complete
      if (mockStreamingTimer) {
        clearInterval(mockStreamingTimer)
        mockStreamingTimer = null
      }
      if (eventLoopKeepAlive) {
        clearInterval(eventLoopKeepAlive)
        eventLoopKeepAlive = null
      }
    }
  }, 50) // 50ms delay between characters for realistic streaming
}

function renderChatInterface(terminalWidth: number) {
  // Chat separator
  process.stdout.write(`\n${gray('─'.repeat(terminalWidth))}\n`)

  // Show last 2 chat messages
  const recentMessages = chatMessages.slice(-2)
  const chatLines: string[] = []

  recentMessages.forEach((msg) => {
    const prefix = msg.role === 'user' ? green('You: ') : cyan('Agent: ')
    const content = msg.content
    // Wrap long messages
    const maxWidth = terminalWidth - 10
    if (content.length > maxWidth) {
      const wrapped = wrapLine(content, maxWidth)
      chatLines.push(prefix + wrapped[0])
      wrapped.slice(1).forEach((line) => {
        chatLines.push('      ' + line) // Indent continuation lines
      })
    } else {
      chatLines.push(prefix + content)
    }
  })

  // Ensure we have exactly 2 lines for chat history (pad if needed)
  while (chatLines.length < 2) {
    chatLines.unshift('') // Add empty lines at the beginning
  }
  if (chatLines.length > 2) {
    chatLines.splice(0, chatLines.length - 2) // Keep only last 2 lines
  }

  // Display chat history
  process.stdout.write(chatLines.join('\n'))

  // Chat input line (always visible)
  const inputPrefix = yellow('> ')
  process.stdout.write(`\n${inputPrefix}${chatInput}`)
}

function renderSubagentContent() {
  // Clear screen and move cursor to top
  process.stdout.write(CLEAR_SCREEN)

  const terminalHeight = process.stdout.rows || 24
  const terminalWidth = process.stdout.columns || 80

  // Display banner at top
  const bannerText =
    'Type to chat, Enter to send | ↑/↓ to scroll | ESC to go back'
  const bannerPadding = Math.max(
    0,
    Math.floor((terminalWidth - bannerText.length) / 2)
  )
  const banner =
    ' '.repeat(bannerPadding) + bannerText + ' '.repeat(bannerPadding)
  const bannerLine = cyan('═'.repeat(terminalWidth))

  process.stdout.write(`${bannerLine}\n`)
  process.stdout.write(`${bold(banner)}\n`)
  process.stdout.write(`${bannerLine}\n\n`)

  // Reserve space for chat interface (5 lines: separator + 3 chat lines + input) + banner (3 lines)
  const chatInterfaceHeight = 5
  const bannerHeight = 4 // 3 banner lines + 1 spacing
  const maxContentLines = terminalHeight - chatInterfaceHeight - bannerHeight

  // Calculate visible lines based on scroll offset
  const visibleLines = contentLines.slice(
    scrollOffset,
    scrollOffset + maxContentLines
  )

  // Display main content
  process.stdout.write(visibleLines.join('\n'))

  // Add padding to fill remaining content space
  const remainingContentLines = maxContentLines - visibleLines.length
  if (remainingContentLines > 0) {
    process.stdout.write('\n'.repeat(remainingContentLines))
  }

  // Render chat interface
  renderChatInterface(terminalWidth)

  // Always show cursor for chat input
  process.stdout.write(SHOW_CURSOR)
}

function setupSubagentKeyHandler(rl: any, onExit: () => void) {
  // Store all original key handlers
  const listeners = process.stdin.listeners('keypress')
  originalKeyHandlers = listeners as ((str: string, key: any) => void)[]

  // Remove existing keypress listeners
  process.stdin.removeAllListeners('keypress')

  // Handle terminal resize
  const handleResize = () => {
    // Recalculate content with new terminal dimensions
    updateSubagentContent()
  }

  process.stdout.on('resize', handleResize)

  // Note: Mouse wheel support temporarily disabled to prevent escape sequences in chat
  // Users can use arrow keys for scrolling instead

  // Add our custom keypress handler
  process.stdin.on('keypress', (str: string, key: any) => {
    // Filter out mouse events from keypress to prevent them appearing in chat
    if (str && (str.includes('\x1b[<') || /\d+;\d+;\d+[Mm]/.test(str))) {
      return // Ignore mouse events in keypress handler
    }
    if (key && key.name === 'escape') {
      exitSubagentBuffer(rl)
      // Return to subagent list, preserving the current selection
      enterSubagentListBuffer(rl, onExit)
      return
    }

    // Handle Ctrl+C - exit to main screen instead of exiting program
    if (key && key.ctrl && key.name === 'c') {
      exitSubagentBuffer(rl)
      onExit()
      return
    } // Handle chat input (always active)
    if (key && key.name === 'return') {
      // Send message
      if (chatInput.trim()) {
        chatMessages.push({
          role: 'user',
          content: chatInput.trim(),
          timestamp: Date.now(),
        })

        const userMessage = chatInput.trim()
        chatInput = ''

        renderSubagentContent()

        // Start mock streaming response
        setTimeout(() => startMockStreaming(userMessage), 500)
      }
      return
    }

    if (key && key.name === 'backspace') {
      chatInput = chatInput.slice(0, -1)
      renderSubagentContent()
      return
    }

    // Add printable characters to chat input (except when using Ctrl for scrolling)
    if (str && str.length === 1 && str.charCodeAt(0) >= 32 && !key.ctrl) {
      chatInput += str
      renderSubagentContent()
      return
    }

    // Handle scrolling (use arrow keys for scrolling)
    const terminalHeight = process.stdout.rows || 24
    const chatInterfaceHeight = 5
    const maxLines = terminalHeight - chatInterfaceHeight - 1
    const maxScrollOffset = Math.max(0, contentLines.length - maxLines)

    if (key && key.name === 'up' && !key.ctrl && !key.meta) {
      const newOffset = Math.max(0, scrollOffset - 1)
      if (newOffset !== scrollOffset) {
        scrollOffset = newOffset
        renderSubagentContent()
      }
      return
    }

    if (key && key.name === 'down' && !key.ctrl && !key.meta) {
      const newOffset = Math.min(maxScrollOffset, scrollOffset + 1)
      if (newOffset !== scrollOffset) {
        scrollOffset = newOffset
        renderSubagentContent()
      }
      return
    }

    if (key && key.name === 'pageup') {
      const newOffset = Math.max(0, scrollOffset - maxLines)
      if (newOffset !== scrollOffset) {
        scrollOffset = newOffset
        renderSubagentContent()
      }
      return
    }

    if (key && key.name === 'pagedown') {
      const newOffset = Math.min(maxScrollOffset, scrollOffset + maxLines)
      if (newOffset !== scrollOffset) {
        scrollOffset = newOffset
        renderSubagentContent()
      }
      return
    }

    if (key && key.name === 'home') {
      if (scrollOffset !== 0) {
        scrollOffset = 0
        renderSubagentContent()
      }
      return
    }

    if (key && key.name === 'end') {
      if (scrollOffset !== maxScrollOffset) {
        scrollOffset = maxScrollOffset
        renderSubagentContent()
      }
      return
    }

    // For other keys, just ignore them
  })

  // Ensure raw mode for immediate key detection
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true)
    // Force stdin to be readable to ensure keypress events are captured
    process.stdin.resume()
  }

  // Mouse wheel support disabled to prevent escape sequences in chat input
}

/**
 * Update the display if we're currently viewing this agent
 */
export function refreshSubagentDisplay(agentId: string) {
  if (isInSubagentBuffer && currentAgentId === agentId) {
    updateSubagentContent()
  }
}

// Cleanup function to ensure we exit subagent buffer on process termination
export function cleanupSubagentBuffer() {
  if (isInSubagentBuffer) {
    process.stdout.write(SHOW_CURSOR)
    process.stdout.write(EXIT_ALT_BUFFER)
    isInSubagentBuffer = false
  }

  // Clean up mock streaming timer
  if (mockStreamingTimer) {
    clearInterval(mockStreamingTimer)
    mockStreamingTimer = null
  }
  if (eventLoopKeepAlive) {
    clearInterval(eventLoopKeepAlive)
    eventLoopKeepAlive = null
  }

  // Mouse reporting was not enabled

  // Restore normal terminal mode
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false)
  }
}

// Register cleanup on process exit
process.on('exit', cleanupSubagentBuffer)
process.on('SIGINT', cleanupSubagentBuffer)
process.on('SIGTERM', cleanupSubagentBuffer)
