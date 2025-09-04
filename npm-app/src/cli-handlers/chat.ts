import { green, yellow, cyan, bold, gray, blue } from 'picocolors'
import stringWidth from 'string-width'
import wrapAnsi from 'wrap-ansi'

import { logger } from '../utils/logger'
import {
  ENTER_ALT_BUFFER,
  EXIT_ALT_BUFFER,
  CLEAR_SCREEN,
  SHOW_CURSOR,
  MOVE_CURSOR,
  SET_CURSOR_DEFAULT,
  DISABLE_CURSOR_BLINK,
  CURSOR_SET_INVISIBLE_BLOCK,
} from '../utils/terminal'

// Constants
const SIDE_PADDING = 2
const HEADER_TEXT = '💬 Codebuff Chat'
const STATUS_TEXT = 'Enter to send • ↑/↓ to scroll • ESC or Ctrl+C to exit'
const PLACEHOLDER_TEXT = 'Type your message...'
const WELCOME_MESSAGE =
  'Welcome to Codebuff Chat! Type your messages below and press Enter to send. This is a dedicated chat interface for conversations with your AI assistant.'
const QUEUE_ARROW = '↑'
const SEPARATOR_CHAR = '─'

// Subagent tree types
export interface SubagentNode {
  id: string
  type: string
  content: string
  children: SubagentNode[]
  postContent?: string
}

export interface SubagentUIState {
  expanded: Set<string>
  focusNodeId: string | null
  firstChildProgress: Map<string, number>
}

// Interfaces
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  id: string
  isStreaming?: boolean
  subagentTree?: SubagentNode // Root node for assistant messages
  subagentUIState?: SubagentUIState // UI state for the tree
}

export interface TerminalMetrics {
  height: number
  width: number
  contentWidth: number
  sidePadding: number
}

interface ChatState {
  messages: ChatMessage[]
  currentInput: string
  scrollOffset: number
  contentLines: string[]
  isWaitingForResponse: boolean
  messageQueue: string[]
  userHasScrolled: boolean
  currentStreamingMessageId?: string
  navigationMode: boolean // New: track if we're in navigation mode
}

// State
let isInChatBuffer = false
let originalKeyHandlers: ((str: string, key: any) => void)[] = []
let chatState: ChatState = {
  messages: [],
  currentInput: '',
  scrollOffset: 0,
  contentLines: [],
  isWaitingForResponse: false,
  messageQueue: [],
  userHasScrolled: false,
  currentStreamingMessageId: undefined,
  navigationMode: false, // Initialize navigation mode
}

// Cached date formatter for performance
const timeFormatter = new Intl.DateTimeFormat([], {
  hour: '2-digit',
  minute: '2-digit',
})

// Utility functions
function getTerminalMetrics(): TerminalMetrics {
  const height = process.stdout.rows || 24
  const width = process.stdout.columns || 80
  const contentWidth = Math.max(0, width - SIDE_PADDING * 2)

  return {
    height,
    width,
    contentWidth,
    sidePadding: SIDE_PADDING,
  }
}

export function wrapLine(line: string, terminalWidth: number): string[] {
  if (!line) return ['']
  if (stringWidth(line) <= terminalWidth) {
    return [line]
  }
  const wrapped = wrapAnsi(line, terminalWidth, { hard: true })
  return wrapped.split('\n')
}

function calculateInputAreaHeight(metrics: TerminalMetrics): number {
  let inputAreaHeight = 0

  // Queue preview line (if any)
  if (chatState.messageQueue.length > 0) {
    inputAreaHeight += 1
  }

  // Separator line
  inputAreaHeight += 1

  // Input line(s) - account for wrapping
  if (chatState.currentInput.length === 0) {
    inputAreaHeight += 1 // Just the placeholder
  } else {
    const wrappedInputLines = wrapLine(
      chatState.currentInput,
      metrics.contentWidth,
    )
    inputAreaHeight += wrappedInputLines.length
  }

  // Add a blank line for spacing between input and status
  inputAreaHeight += 1

  return inputAreaHeight
}

function computeMaxContentLines(metrics: TerminalMetrics): number {
  const inputAreaHeight = calculateInputAreaHeight(metrics)
  return Math.max(0, metrics.height - inputAreaHeight - 1) // Reserve 1 line for status
}

function computeMaxScrollOffset(metrics: TerminalMetrics): number {
  const maxContentLines = computeMaxContentLines(metrics)
  return Math.max(0, chatState.contentLines.length - maxContentLines)
}

function shouldAutoScroll(): boolean {
  const metrics = getTerminalMetrics()
  const maxScrollOffset = computeMaxScrollOffset(metrics)
  return !chatState.userHasScrolled || chatState.scrollOffset >= maxScrollOffset
}

function clampScroll(newOffset: number): number {
  const metrics = getTerminalMetrics()
  const maxScrollOffset = computeMaxScrollOffset(metrics)
  return Math.max(0, Math.min(maxScrollOffset, newOffset))
}

function scrollToBottom(): void {
  const metrics = getTerminalMetrics()
  chatState.scrollOffset = computeMaxScrollOffset(metrics)
  chatState.userHasScrolled = false
}

function formatQueuePreview(
  message: string,
  queueCount: string,
  metrics: TerminalMetrics,
): string {
  const maxPreviewLength = metrics.contentWidth - 4 - stringWidth(queueCount) // Account for arrows and queue count

  if (stringWidth(message) <= maxPreviewLength) {
    return `${QUEUE_ARROW} ${message}${queueCount} ${QUEUE_ARROW}`
  }

  // Truncate with ellipsis
  const availableLength = maxPreviewLength - 3 // Account for "..."
  const truncated = message.slice(-Math.floor(availableLength))
  return `${QUEUE_ARROW} ...${truncated}${queueCount} ${QUEUE_ARROW}`
}

function resetChatState(): void {
  chatState = {
    messages: [],
    currentInput: '',
    scrollOffset: 0,
    contentLines: [],
    isWaitingForResponse: false,
    messageQueue: [],
    userHasScrolled: false,
    currentStreamingMessageId: undefined,
    navigationMode: false,
  }
}

function setupRealCursor(): void {
  // Hide cursor using invisible block style
  process.stdout.write(CURSOR_SET_INVISIBLE_BLOCK)

  // Disable cursor blinking for better invisibility
  process.stdout.write(DISABLE_CURSOR_BLINK)
}

function restoreDefaultRealCursor(): void {
  // Restore cursor to default style and visibility
  process.stdout.write(SET_CURSOR_DEFAULT)
}

function positionRealCursor(): void {
  // Position cursor at the input area where typing occurs
  // Cursor hiding is handled separately in setupRealCursor()
  const metrics = getTerminalMetrics()
  const inputAreaHeight = calculateInputAreaHeight(metrics)

  // Calculate where the input area starts
  let inputLinePosition = metrics.height - inputAreaHeight

  // Skip queue preview line if present
  if (chatState.messageQueue.length > 0) {
    inputLinePosition += 1
  }
  // Skip separator line
  inputLinePosition += 1

  // Now inputLinePosition points to the actual input line
  if (chatState.currentInput.length === 0) {
    // Position cursor at start of input area (after side padding)
    process.stdout.write(
      MOVE_CURSOR(inputLinePosition, metrics.sidePadding + 1),
    )
  } else {
    // Calculate cursor position within the input text
    const wrappedInputLines = wrapLine(
      chatState.currentInput,
      metrics.contentWidth,
    )
    const lastLineIndex = wrappedInputLines.length - 1
    const lastLineLength = stringWidth(wrappedInputLines[lastLineIndex] || '')

    const cursorRow = inputLinePosition + lastLineIndex
    const cursorCol = metrics.sidePadding + 1 + lastLineLength

    process.stdout.write(MOVE_CURSOR(cursorRow, cursorCol))
  }
}

export function isInChatMode(): boolean {
  return isInChatBuffer
}

export function enterChatBuffer(rl: any, onExit: () => void) {
  if (isInChatBuffer) {
    process.stdout.write(yellow('Already in chat mode!'))
    return
  }

  resetChatState()

  // Enter alternate screen buffer
  process.stdout.write(ENTER_ALT_BUFFER)
  process.stdout.write(CLEAR_SCREEN)
  process.stdout.write(MOVE_CURSOR(1, 1))

  // Setup the real cursor
  setupRealCursor()

  isInChatBuffer = true

  // Setup key handling
  setupChatKeyHandler(rl, onExit)

  // Delay initial render to avoid flicker and ensure terminal is ready
  setTimeout(() => {
    addMessage('assistant', WELCOME_MESSAGE, true)
    positionRealCursor()
  }, 50)
}

export function exitChatBuffer(rl: any) {
  if (!isInChatBuffer) {
    return
  }

  resetChatState()
  restoreDefaultRealCursor()

  // Restore all original key handlers
  if (originalKeyHandlers.length > 0) {
    process.stdin.removeAllListeners('keypress')
    originalKeyHandlers.forEach((handler) => {
      process.stdin.on('keypress', handler)
    })
    originalKeyHandlers = []
  }

  // Exit alternate screen buffer
  process.stdout.write(SHOW_CURSOR)
  process.stdout.write(EXIT_ALT_BUFFER)

  isInChatBuffer = false
}

function addMessage(
  role: 'user' | 'assistant',
  content: string,
  forceAutoScroll: boolean = false,
): string {
  const wasAtBottom = shouldAutoScroll()

  const messageId = `${role}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  chatState.messages.push({
    role,
    content,
    timestamp: Date.now(),
    id: messageId,
  })
  updateContentLines()

  // Reset scroll flag to enable auto-scroll when user was at bottom or when forced
  if (forceAutoScroll || wasAtBottom) {
    scrollToBottom()
  }

  renderChat()
  return messageId
}

function startStreamingMessage(role: 'user' | 'assistant'): string {
  const messageId = addMessage(role, '', true)
  if (role === 'assistant') {
    chatState.currentStreamingMessageId = messageId
    const message = chatState.messages.find((m) => m.id === messageId)
    if (message) {
      message.isStreaming = true
    }
  }
  return messageId
}

function appendToStreamingMessage(messageId: string, chunk: string): void {
  const message = chatState.messages.find((m) => m.id === messageId)
  if (!message) return

  const wasAtBottom = shouldAutoScroll()

  message.content += chunk
  updateContentLines()

  // Auto-scroll if user was at bottom or following the stream
  if (wasAtBottom) {
    scrollToBottom()
  }

  renderChat()
}

function finishStreamingMessage(messageId: string): void {
  const message = chatState.messages.find((m) => m.id === messageId)
  if (!message) return

  message.isStreaming = false
  if (chatState.currentStreamingMessageId === messageId) {
    chatState.currentStreamingMessageId = undefined
  }

  updateContentLines()
  renderChat()
}

export function renderAssistantMessage(
  message: ChatMessage,
  metrics: TerminalMetrics,
  timeFormatter: Intl.DateTimeFormat,
): string[] {
  const lines: string[] = []
  const timeStr = timeFormatter.format(new Date(message.timestamp))

  // Assistant messages: metadata on one line, content on next line with tree symbol
  const metadata = `${bold(blue('Assistant'))} ${gray(`[${timeStr}]`)}`
  lines.push(' '.repeat(metrics.sidePadding) + metadata)

  if (message.content && message.content.trim()) {
    const contentLines = message.content.split('\n')
    const hasSubagents =
      message.subagentTree &&
      message.subagentTree.children &&
      message.subagentTree.children.length > 0
    const treePrefix = hasSubagents ? '├─ ' : '└─ '

    contentLines.forEach((line) => {
      const treeLine = treePrefix + line
      const wrappedLines = wrapLine(treeLine, metrics.contentWidth)
      wrappedLines.forEach((wrappedLine, wrapIndex) => {
        if (wrapIndex === 0) {
          // First wrapped line uses the full tree line
          lines.push(' '.repeat(metrics.sidePadding) + wrappedLine)
        } else {
          // Continuation lines need to align with the content after the tree prefix
          const indentSize = stringWidth(treePrefix)
          const indentedLine = ' '.repeat(indentSize) + wrappedLine.trimStart()
          lines.push(' '.repeat(metrics.sidePadding) + indentedLine)
        }
      })
    })
  }

  return lines
}

export function renderUserMessage(
  message: ChatMessage,
  metrics: TerminalMetrics,
  timeFormatter: Intl.DateTimeFormat,
): string[] {
  const lines: string[] = []
  const timeStr = timeFormatter.format(new Date(message.timestamp))

  // User messages: keep original format
  const prefix = `${bold(green('You'))} ${gray(`[${timeStr}]`)}: `
  const contentLines = message.content.split('\n')
  contentLines.forEach((line, lineIndex) => {
    if (lineIndex === 0) {
      const fullLine = prefix + line
      const wrappedLines = wrapLine(fullLine, metrics.contentWidth)
      wrappedLines.forEach((wrappedLine) => {
        lines.push(' '.repeat(metrics.sidePadding) + wrappedLine)
      })
    } else {
      // Indent continuation lines to align with message content
      const indentSize = stringWidth(prefix)
      const indentedLine = ' '.repeat(indentSize) + line
      const wrappedLines = wrapLine(indentedLine, metrics.contentWidth)
      wrappedLines.forEach((wrappedLine) => {
        lines.push(' '.repeat(metrics.sidePadding) + wrappedLine)
      })
    }
  })

  return lines
}

function updateContentLines() {
  const metrics = getTerminalMetrics()
  const lines: string[] = []

  // Add top padding
  lines.push('')

  // Add header with side padding
  lines.push(' '.repeat(metrics.sidePadding) + bold(cyan(HEADER_TEXT)))
  lines.push(
    ' '.repeat(metrics.sidePadding) +
      gray(SEPARATOR_CHAR.repeat(metrics.contentWidth)),
  )
  lines.push('')

  if (chatState.messages.length === 0) {
    lines.push(
      ' '.repeat(metrics.sidePadding) +
        gray('Start typing to begin your conversation...'),
    )
  } else {
    // Add chat messages with side padding
    chatState.messages.forEach((message, index) => {
      if (message.role === 'assistant') {
        lines.push(...renderAssistantMessage(message, metrics, timeFormatter))
      } else {
        lines.push(...renderUserMessage(message, metrics, timeFormatter))
      }

      // Add subagent tree if this is an assistant message with a tree
      if (
        message.role === 'assistant' &&
        message.subagentTree &&
        message.subagentUIState
      ) {
        const treeLines = renderSubagentTree(
          message.subagentTree,
          message.subagentUIState,
          metrics,
          message.id,
        )
        lines.push(...treeLines)
      }

      if (index < chatState.messages.length - 1) {
        lines.push('') // Add spacing between messages
      }
    })
  }

  // Add some padding at the end
  lines.push('')
  lines.push('')

  chatState.contentLines = lines
}

function renderChat() {
  // Clear screen and move cursor to top
  process.stdout.write(CLEAR_SCREEN)
  process.stdout.write(MOVE_CURSOR(1, 1))

  const metrics = getTerminalMetrics()
  const inputAreaHeight = calculateInputAreaHeight(metrics)
  const maxContentLines = computeMaxContentLines(metrics)
  const maxScrollOffset = computeMaxScrollOffset(metrics)

  // Auto-scroll to bottom to show latest messages only if user hasn't manually scrolled
  if (!chatState.userHasScrolled) {
    chatState.scrollOffset = maxScrollOffset
  }
  // If user has scrolled but is already at the bottom, allow auto-scroll for new content
  else if (chatState.scrollOffset >= maxScrollOffset) {
    chatState.scrollOffset = maxScrollOffset
    // Don't reset userHasScrolled flag here - let user keep control
  }

  // Display chat content
  const visibleLines = chatState.contentLines.slice(
    chatState.scrollOffset,
    chatState.scrollOffset + maxContentLines,
  )
  process.stdout.write(visibleLines.join('\n'))

  // Position input area and status at bottom of terminal
  let currentLine = metrics.height - inputAreaHeight

  // Display queued message preview if there are queued messages
  if (chatState.messageQueue.length > 0) {
    const lastQueuedMessage =
      chatState.messageQueue[chatState.messageQueue.length - 1]
    const queueCount =
      chatState.messageQueue.length > 1
        ? ` (+${chatState.messageQueue.length - 1})`
        : ''
    const previewText = formatQueuePreview(
      lastQueuedMessage,
      queueCount,
      metrics,
    )

    process.stdout.write(MOVE_CURSOR(currentLine, 1))
    process.stdout.write(' '.repeat(metrics.sidePadding) + gray(previewText))
    currentLine++
  }

  // Display separator line
  process.stdout.write(MOVE_CURSOR(currentLine, 1))
  process.stdout.write(
    ' '.repeat(metrics.sidePadding) +
      gray(SEPARATOR_CHAR.repeat(metrics.contentWidth)),
  )
  currentLine++

  // Show placeholder or user input
  if (chatState.currentInput.length === 0) {
    // Show placeholder text
    const placeholder = `\x1b[2m${gray(PLACEHOLDER_TEXT)}\x1b[22m`
    process.stdout.write(MOVE_CURSOR(currentLine, 1))
    process.stdout.write(' '.repeat(metrics.sidePadding) + placeholder)
    currentLine++
  } else {
    // Show user input
    const wrappedInputLines = wrapLine(
      chatState.currentInput,
      metrics.contentWidth,
    )

    wrappedInputLines.forEach((line, index) => {
      process.stdout.write(MOVE_CURSOR(currentLine, 1))
      process.stdout.write(' '.repeat(metrics.sidePadding) + line)
      currentLine++
    })
  }

  // Status line with side padding - position at very bottom of screen
  process.stdout.write(MOVE_CURSOR(metrics.height, 1))
  process.stdout.write(' '.repeat(metrics.sidePadding) + gray(STATUS_TEXT))

  // Position the real cursor at input location
  positionRealCursor()
}

function setupChatKeyHandler(rl: any, onExit: () => void) {
  // Store all original key handlers
  const listeners = process.stdin.listeners('keypress')
  originalKeyHandlers = listeners as ((str: string, key: any) => void)[]

  // Remove existing keypress listeners
  process.stdin.removeAllListeners('keypress')

  // Add our custom handler
  process.stdin.on('keypress', (str: string, key: any) => {
    // Handle ESC or Ctrl+C to exit
    if (
      (key && key.name === 'escape') ||
      (key && key.ctrl && key.name === 'c')
    ) {
      exitChatBuffer(rl)
      onExit()
      return
    }

    // Handle subagent navigation first
    if (handleSubagentNavigation(key)) {
      return
    }

    // Check for Shift+Right to enter navigation mode
    if (key && key.shift && key.name === 'right' && !chatState.navigationMode) {
      initializeNavigationMode()
      return
    }

    // ESC exits navigation mode
    if (key && key.name === 'escape' && chatState.navigationMode) {
      chatState.navigationMode = false
      // Clear focus from all messages
      chatState.messages.forEach((message) => {
        if (message.subagentUIState) {
          message.subagentUIState.focusNodeId = null
        }
      })
      updateContentLines()
      renderChat()
      return
    }

    // Handle Enter - send message (always allow queuing)
    if (key && key.name === 'return') {
      const message = chatState.currentInput.trim()
      if (message) {
        if (chatState.isWaitingForResponse) {
          // Queue the message if we're waiting for a response
          chatState.messageQueue.push(message)
        } else {
          // Send immediately if not waiting
          sendMessage(message)
        }
        chatState.currentInput = ''
      }
      // Exit navigation mode when sending a message
      chatState.navigationMode = false
      chatState.messages.forEach((message) => {
        if (message.subagentUIState) {
          message.subagentUIState.focusNodeId = null
        }
      })
      renderChat()
      return
    }

    // Handle backspace
    if (key && key.name === 'backspace') {
      chatState.currentInput = chatState.currentInput.slice(0, -1)
      renderChat()
      return
    }

    // Handle scrolling
    if (key && key.name === 'up' && !key.meta && !key.ctrl) {
      const newOffset = clampScroll(chatState.scrollOffset - 1)
      if (newOffset !== chatState.scrollOffset) {
        chatState.scrollOffset = newOffset
        chatState.userHasScrolled = true
        renderChat()
      }
      return
    }

    if (key && key.name === 'down' && !key.meta && !key.ctrl) {
      const metrics = getTerminalMetrics()
      const maxScrollOffset = computeMaxScrollOffset(metrics)

      // Ignore scroll down if already at bottom to prevent flashing
      if (chatState.scrollOffset >= maxScrollOffset) {
        return
      }

      const newOffset = clampScroll(chatState.scrollOffset + 1)
      if (newOffset !== chatState.scrollOffset) {
        chatState.scrollOffset = newOffset
        chatState.userHasScrolled = true

        // If user scrolled to the very bottom, reset the flag so new messages auto-scroll
        if (chatState.scrollOffset === maxScrollOffset) {
          chatState.userHasScrolled = false
        }

        renderChat()
      }
      return
    }

    // Handle page up/down
    if (key && key.name === 'pageup') {
      const metrics = getTerminalMetrics()
      const maxContentLines = computeMaxContentLines(metrics)
      const newOffset = clampScroll(chatState.scrollOffset - maxContentLines)
      if (newOffset !== chatState.scrollOffset) {
        chatState.scrollOffset = newOffset
        chatState.userHasScrolled = true
        renderChat()
      }
      return
    }

    if (key && key.name === 'pagedown') {
      const metrics = getTerminalMetrics()
      const maxContentLines = computeMaxContentLines(metrics)
      const maxScrollOffset = computeMaxScrollOffset(metrics)

      // Ignore page down if already at bottom to prevent flashing
      if (chatState.scrollOffset >= maxScrollOffset) {
        return
      }

      const newOffset = clampScroll(chatState.scrollOffset + maxContentLines)
      if (newOffset !== chatState.scrollOffset) {
        chatState.scrollOffset = newOffset
        chatState.userHasScrolled = true

        // If user scrolled to the very bottom, reset the flag so new messages auto-scroll
        if (chatState.scrollOffset === maxScrollOffset) {
          chatState.userHasScrolled = false
        }

        renderChat()
      }
      return
    }

    // Add printable characters to input
    if (str && str.length === 1 && str.charCodeAt(0) >= 32) {
      chatState.currentInput += str
      renderChat()
    }
  })

  // Ensure raw mode for immediate key detection
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true)
    process.stdin.resume()
  }
}

async function sendMessage(message: string, addToChat: boolean = true) {
  // Add user message to chat (unless it's already been added from queue)
  if (addToChat) {
    addMessage('user', message, true)
  }

  chatState.isWaitingForResponse = true
  renderChat()

  try {
    // Start streaming assistant response
    const assistantMessageId = startStreamingMessage('assistant')

    // Stream the response chunk by chunk
    await simulateStreamingResponse(message, (chunk) => {
      appendToStreamingMessage(assistantMessageId, chunk)
    })

    // Finish streaming
    finishStreamingMessage(assistantMessageId)
  } catch (error) {
    logger.error({ error }, 'Error sending chat message')
    addMessage(
      'assistant',
      `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`,
      true,
    )
  } finally {
    chatState.isWaitingForResponse = false

    // Auto-focus the latest assistant message if it has subagents
    const latestMessageId = findLatestAssistantMessageWithChildren()
    if (latestMessageId && !chatState.navigationMode) {
      initializeNavigationMode()
    }

    renderChat()

    // Process queued messages
    await processMessageQueue()
  }
}

// Process queued messages sequentially
async function processMessageQueue() {
  while (chatState.messageQueue.length > 0 && !chatState.isWaitingForResponse) {
    const nextMessage = chatState.messageQueue.shift()
    if (nextMessage) {
      // Add the queued message to chat when it's being processed
      addMessage('user', nextMessage, true)

      // Send the message
      await sendMessage(nextMessage, false) // false = don't add to chat again
    }
  }
}

// Helper function to stream content from a node recursively (depth-first)
async function streamContentRecursively(
  node: {
    content: string
    agent: string
    postContent?: string
    children?: Array<{
      content: string
      agent: string
      postContent?: string
      children?: any
    }>
  },
  onChunk: (chunk: string) => void,
): Promise<void> {
  // Stream the current node's content
  const words = node.content.split(' ')

  for (let i = 0; i < words.length; i++) {
    const word = words[i]
    const isLastWord = i === words.length - 1

    // Add space before word (except for first word)
    const chunk = (i === 0 ? '' : ' ') + word
    onChunk(chunk)

    // Variable delay between words for realistic typing
    if (!isLastWord) {
      const delay = 40 + Math.random() * 120 // 40-160ms between words
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  // If this node has children, recursively stream their content
  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      // Small pause before each child
      await new Promise((resolve) =>
        setTimeout(resolve, 100 + Math.random() * 200),
      )
      await streamContentRecursively(child, onChunk)
    }
  }

  // After all children are finished, stream the postContent if it exists
  if (node.postContent) {
    // Small pause before postContent
    await new Promise((resolve) =>
      setTimeout(resolve, 100 + Math.random() * 200),
    )

    const postWords = node.postContent.split(' ')
    for (let i = 0; i < postWords.length; i++) {
      const word = postWords[i]
      const isLastWord = i === postWords.length - 1

      // Add space before word (except for first word)
      const chunk = (i === 0 ? '' : ' ') + word
      onChunk(chunk)

      // Variable delay between words for realistic typing
      if (!isLastWord) {
        const delay = 40 + Math.random() * 120 // 40-160ms between words
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }
}

// Simulates streaming AI response with chunked updates
async function simulateStreamingResponse(
  message: string,
  onChunk: (chunk: string) => void,
): Promise<void> {
  // Generate a response based on the message - now structured as tree with children and postContent
  const responses = [
    {
      content: `I'll analyze your codebase structure and implement the requested changes.`,
      agent: 'assistant',
      postContent: `All changes have been successfully applied and tested.`,
      children: [
        {
          content: `src/\n├── components/           # React UI components\n│   ├── Button.tsx        # Reusable button component\n│   ├── Modal.tsx         # Modal dialog component\n│   └── Layout/           # Layout components\n│       ├── Header.tsx    # Main navigation header\n│       └── Sidebar.tsx   # Navigation sidebar\n│\n├── hooks/               # Custom React hooks\n│   ├── useAuth.ts       # Authentication state management\n│   ├── useApi.ts        # API call abstraction\n│   └── useLocalStorage.ts # Local storage utilities\n│\n├── utils/               # Utility functions\n│   ├── validation.ts    # Form validation helpers\n│   ├── formatting.ts    # Data formatting utilities\n│   └── constants.ts     # Application constants\n│\n└── types/               # TypeScript type definitions\n    ├── api.ts          # API response types\n    └── user.ts         # User-related types`,
          agent: 'file-explorer',
          children: [],
        },
      ],
    },
    {
      content: `I'll set up the backend architecture with proper separation of concerns.`,
      agent: 'assistant',
      postContent: `Backend services are now properly organized and documented.`,
      children: [
        {
          content: `backend/\n├── api/                 # REST API endpoints\n│   ├── routes/          # Route definitions\n│   │   ├── auth.ts      # Authentication endpoints\n│   │   ├── users.ts     # User management endpoints\n│   │   └── posts.ts     # Content management endpoints\n│   │\n│   ├── middleware/      # Express middleware\n│   │   ├── auth.ts      # JWT authentication middleware\n│   │   ├── validation.ts # Request validation middleware\n│   │   └── errorHandler.ts # Global error handling\n│   │\n│   └── controllers/     # Business logic controllers\n│       ├── AuthController.ts # Authentication logic\n│       └── UserController.ts # User management logic\n│\n├── database/           # Database configuration\n│   ├── migrations/     # Database schema migrations\n│   ├── models/         # ORM models\n│   └── seeders/        # Test data seeders\n│\n└── services/           # External service integrations\n    ├── EmailService.ts # Email sending service\n    └── StorageService.ts # File storage service`,
          agent: 'file-explorer',
          children: [
            {
              content: `Database schema optimized for performance\nAPI endpoints follow RESTful conventions\nMiddleware properly handles authentication`,
              agent: 'reviewer',
              children: [],
            },
          ],
        },
      ],
    },
    {
      content: `I'll implement comprehensive testing structure for the project.`,
      agent: 'assistant',
      postContent: `Testing infrastructure is now complete with 95% code coverage.`,
      children: [
        {
          content: `tests/\n├── unit/               # Unit tests\n│   ├── components/      # Component tests\n│   │   ├── Button.test.tsx # Button component tests\n│   │   └── Modal.test.tsx  # Modal component tests\n│   │\n│   ├── utils/           # Utility function tests\n│   │   ├── validation.test.ts # Validation tests\n│   │   └── formatting.test.ts # Formatting tests\n│   │\n│   └── services/        # Service layer tests\n│       ├── AuthService.test.ts # Auth service tests\n│       └── ApiService.test.ts  # API service tests\n│\n├── integration/        # Integration tests\n│   ├── api/            # API endpoint tests\n│   │   ├── auth.test.ts # Authentication flow tests\n│   │   └── users.test.ts # User management tests\n│   │\n│   └── database/       # Database integration tests\n│       └── models.test.ts # Model relationship tests\n│\n├── e2e/               # End-to-end tests\n│   ├── user-journey.test.ts # Complete user flows\n│   └── admin-panel.test.ts  # Admin functionality tests\n│\n└── fixtures/           # Test data and mocks\n    ├── mockData.ts     # Mock API responses\n    └── testUsers.ts    # Test user accounts`,
          agent: 'file-explorer',
          children: [],
        },
      ],
    },
    {
      content: `I'll configure the development and deployment pipeline.`,
      agent: 'assistant',
      postContent: `CI/CD pipeline configured with automated testing and deployment.`,
      children: [
        {
          content: `config/\n├── docker/             # Container configuration\n│   ├── Dockerfile      # Production container setup\n│   ├── docker-compose.yml # Development environment\n│   └── nginx.conf      # Reverse proxy configuration\n│\n├── ci/                 # Continuous integration\n│   ├── .github/        # GitHub Actions workflows\n│   │   ├── test.yml    # Automated testing pipeline\n│   │   ├── build.yml   # Build and package pipeline\n│   │   └── deploy.yml  # Deployment pipeline\n│   │\n│   └── scripts/        # Build and deployment scripts\n│       ├── build.sh    # Production build script\n│       ├── test.sh     # Test execution script\n│       └── deploy.sh   # Deployment automation\n│\n├── environments/       # Environment configurations\n│   ├── development.env # Development settings\n│   ├── staging.env     # Staging environment\n│   └── production.env  # Production settings\n│\n└── monitoring/         # Application monitoring\n    ├── logging.config  # Centralized logging setup\n    ├── metrics.config  # Performance metrics\n    └── alerts.config   # Error alerting rules`,
          agent: 'file-explorer',
          children: [
            {
              content: `✅ Docker containers optimized for production\n✅ CI/CD pipeline includes security scanning\n✅ Monitoring covers all critical paths`,
              agent: 'system',
              children: [],
            },
          ],
        },
      ],
    },
    {
      content: `I'll organize the documentation and knowledge management system.`,
      agent: 'assistant',
      postContent: `Documentation is now comprehensive and easily maintainable.`,
      children: [
        {
          content: `docs/\n├── api/                # API documentation\n│   ├── openapi.yml     # OpenAPI specification\n│   ├── authentication.md # Auth guide\n│   └── endpoints/      # Detailed endpoint docs\n│       ├── users.md    # User endpoints\n│       └── posts.md    # Content endpoints\n│\n├── guides/             # Developer guides\n│   ├── getting-started.md # Quick start guide\n│   ├── development.md  # Development workflow\n│   ├── testing.md      # Testing guidelines\n│   └── deployment.md   # Deployment procedures\n│\n├── architecture/       # System architecture\n│   ├── overview.md     # High-level architecture\n│   ├── database.md     # Database design\n│   ├── security.md     # Security considerations\n│   └── performance.md  # Performance guidelines\n│\n└── examples/           # Code examples\n    ├── api-usage.md    # API usage examples\n    ├── integration.md  # Integration examples\n    └── troubleshooting.md # Common issues`,
          agent: 'file-explorer',
          children: [],
        },
      ],
    },
    {
      content: `Let me examine and refactor the existing codebase for better maintainability.`,
      agent: 'assistant',
      postContent: `Codebase has been successfully refactored with improved structure and performance.`,
      children: [
        {
          content: `refactoring/\n├── analysis/           # Code analysis results\n│   ├── complexity.json # Cyclomatic complexity metrics\n│   ├── dependencies.json # Dependency analysis\n│   └── coverage.json   # Test coverage report\n│\n├── improvements/       # Identified improvements\n│   ├── performance/    # Performance optimizations\n│   │   ├── lazy-loading.ts # Component lazy loading\n│   │   ├── memoization.ts  # React memoization\n│   │   └── bundling.ts     # Code splitting strategy\n│   │\n│   ├── maintainability/ # Code maintainability\n│   │   ├── extract-hooks.ts # Custom hook extraction\n│   │   ├── component-split.ts # Component decomposition\n│   │   └── type-safety.ts    # TypeScript improvements\n│   │\n│   └── scalability/    # Scalability enhancements\n│       ├── state-management.ts # Redux/Zustand setup\n│       ├── caching-strategy.ts # Data caching\n│       └── error-boundaries.ts # Error handling\n│\n└── migration/          # Migration strategies\n    ├── legacy-cleanup.md # Legacy code removal\n    ├── api-versioning.md # API version management\n    └── database-migration.md # Database updates`,
          agent: 'thinker',
          children: [
            {
              content: `Code complexity reduced by 40%\nBundle size optimized by 25%\nTest coverage increased to 95%`,
              agent: 'reviewer',
              children: [],
            },
          ],
        },
      ],
    },
  ]

  const selectedResponse =
    responses[Math.floor(Math.random() * responses.length)]

  // Initial delay before starting to stream
  await new Promise((resolve) => setTimeout(resolve, 800 + Math.random() * 400))

  // Stream only the main content (not the children or postContent)
  const words = selectedResponse.content.split(' ')
  for (let i = 0; i < words.length; i++) {
    const word = words[i]
    const isLastWord = i === words.length - 1
    const chunk = (i === 0 ? '' : ' ') + word
    onChunk(chunk)

    if (!isLastWord) {
      const delay = 40 + Math.random() * 120
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  // After streaming main content, set up the subagent tree
  if (chatState.currentStreamingMessageId) {
    const streamingMessage = chatState.messages.find(
      (m) => m.id === chatState.currentStreamingMessageId,
    )
    if (streamingMessage && selectedResponse.children) {
      // Build subagent tree from the selected response
      const tree = buildSubagentTree(selectedResponse)

      // Update the tree with the correct message ID
      function updateNodeIds(
        node: SubagentNode,
        path: number[] = [],
      ): SubagentNode {
        const nodeId = createNodeId(streamingMessage!.id, path)
        return {
          ...node,
          id: nodeId,
          children: node.children.map((child, index) =>
            updateNodeIds(child, [...path, index]),
          ),
        }
      }

      streamingMessage.subagentTree = updateNodeIds(tree)
      streamingMessage.subagentUIState = {
        expanded: new Set([createNodeId(streamingMessage.id, [0])]), // Auto-expand first child
        focusNodeId: null,
        firstChildProgress: new Map(),
      }

      // Add parent's postContent to tree if it exists
      if (selectedResponse.postContent) {
        streamingMessage.subagentTree.postContent = selectedResponse.postContent
      }
    }
  }

  // postContent will be rendered as part of the subagent tree, not streamed separately
}

// Cleanup function to ensure we exit chat buffer on process termination
export function cleanupChatBuffer() {
  if (isInChatBuffer) {
    restoreDefaultRealCursor()
    process.stdout.write(SHOW_CURSOR)
    process.stdout.write(EXIT_ALT_BUFFER)
    isInChatBuffer = false
  }

  // Restore normal terminal mode
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false)
  }
}

// Register cleanup on process exit
process.on('exit', cleanupChatBuffer)
process.on('SIGINT', cleanupChatBuffer)
process.on('SIGTERM', cleanupChatBuffer)

// New: Subagent tree utilities
export function createNodeId(messageId: string, path: number[] = []): string {
  if (path.length === 0) return `m:${messageId}`
  return `m:${messageId}/${path.join('/')}`
}

function parseNodePath(nodeId: string): { messageId: string; path: number[] } {
  const parts = nodeId.split('/')
  const messageId = parts[0].substring(2) // Remove 'm:' prefix
  const path = parts.slice(1).map(Number)
  return { messageId, path }
}

function findNodeByPath(
  tree: SubagentNode,
  path: number[],
): SubagentNode | null {
  let current = tree
  for (const index of path) {
    if (!current.children || index >= current.children.length) {
      return null
    }
    current = current.children[index]
  }
  return current
}

function buildSubagentTree(mockResponse: any): SubagentNode {
  function convertNode(node: any, path: number[] = []): SubagentNode {
    const nodeId = createNodeId('temp', path)
    const children = (node.children || []).map((child: any, index: number) =>
      convertNode(child, [...path, index]),
    )

    return {
      id: nodeId,
      type: node.agent || 'unknown',
      content: node.content || '',
      children,
      postContent: node.postContent,
    }
  }

  return convertNode(mockResponse)
}

export function renderSubagentTree(
  tree: SubagentNode,
  uiState: SubagentUIState,
  metrics: TerminalMetrics,
  messageId: string,
): string[] {
  const lines: string[] = []

  function renderNode(
    node: SubagentNode,
    depth: number,
    path: number[] = [],
    isLastChild: boolean = false,
    ancestorLines: boolean[] = [],
  ): void {
    const nodeId = createNodeId(messageId, path)
    const hasChildren = node.children && node.children.length > 0
    const isExpanded = uiState.expanded.has(nodeId)
    const isFocused = uiState.focusNodeId === nodeId

    // Build tree prefix with proper vertical connectors for hierarchical structure
    let treePrefix = ''

    // Add vertical lines and spaces for ancestor levels
    for (let i = 0; i < depth; i++) {
      if (i < ancestorLines.length && ancestorLines[i]) {
        treePrefix += '│   ' // Vertical line for continuing ancestors
      } else {
        treePrefix += '    ' // Empty space for finished ancestors
      }
    }

    // Add connector for current level
    treePrefix += isLastChild ? '└─ ' : '├─ '

    // Create type label
    const typeLabel = node.type ? `[${node.type}] ` : ''
    const firstLine = node.content.split('\n')[0] || '(empty)'

    // Build header line with proper tree structure
    const header = `${treePrefix}${typeLabel}${firstLine}`

    // Apply focus highlighting
    const displayLine = isFocused ? `\x1b[7m${header}\x1b[27m` : header

    // Wrap the line properly with side padding
    const wrappedLines = wrapLine(displayLine, metrics.contentWidth)
    wrappedLines.forEach((wrappedLine) => {
      lines.push(' '.repeat(metrics.sidePadding) + wrappedLine)
    })

    // Render children if expanded
    if (hasChildren && isExpanded) {
      node.children.forEach((child, index) => {
        const isChildLastChild = index === node.children.length - 1
        // Build new ancestor lines array: current node contributes a line if not the last child
        const newAncestorLines = [...ancestorLines]
        if (depth < newAncestorLines.length) {
          newAncestorLines[depth] = !isLastChild
        } else {
          newAncestorLines.push(!isLastChild)
        }

        renderNode(
          child,
          depth + 1,
          [...path, index],
          isChildLastChild,
          newAncestorLines,
        )
      })
    }

    // Render postContent after children (if it has any and node is expanded)
    if (node.postContent && isExpanded) {
      const postLines = node.postContent.split('\n')
      postLines.forEach((line) => {
        if (line.trim()) {
          // Build prefix for postContent - appears as final child of this node
          let postPrefix = ''
          for (let i = 0; i < depth; i++) {
            if (i < ancestorLines.length && ancestorLines[i]) {
              postPrefix += '│   '
            } else {
              postPrefix += '    '
            }
          }
          if (depth > 0) {
            postPrefix += '└─ ' // PostContent is always the last item
          }

          const postLine = `${postPrefix}${line}`
          const wrappedPostLines = wrapLine(postLine, metrics.contentWidth)
          wrappedPostLines.forEach((wrappedLine) => {
            lines.push(' '.repeat(metrics.sidePadding) + wrappedLine)
          })
        }
      })
    }
  }

  // Only render if there are children to show
  if (tree.children && tree.children.length > 0) {
    // Render each top-level child starting from depth 1 to nest them inside parent content
    tree.children.forEach((child, index) => {
      const isLastChild = index === tree.children.length - 1
      renderNode(child, 1, [index], isLastChild, [true]) // Start at depth 1 with parent line
    })

    // Render parent's postContent after all subagent children (if it exists)
    if (tree.postContent) {
      const postLines = tree.postContent.split('\n')
      postLines.forEach((line) => {
        if (line.trim()) {
          const postLine = `└─ ${line}` // Simple connector for parent postContent
          const wrappedPostLines = wrapLine(postLine, metrics.contentWidth)
          wrappedPostLines.forEach((wrappedLine) => {
            lines.push(' '.repeat(metrics.sidePadding) + wrappedLine)
          })
        }
      })
    }
  }

  return lines
}

function findLatestAssistantMessageWithChildren(): string | null {
  // Find the most recent completed assistant message that has children
  for (let i = chatState.messages.length - 1; i >= 0; i--) {
    const message = chatState.messages[i]
    if (
      message.role === 'assistant' &&
      !message.isStreaming &&
      message.subagentTree &&
      message.subagentTree.children &&
      message.subagentTree.children.length > 0
    ) {
      return message.id
    }
  }
  return null
}

function handleSubagentNavigation(key: any): boolean {
  if (!chatState.navigationMode) return false

  // Find the currently focused message
  const focusedMessage = chatState.messages.find(
    (m) => m.subagentUIState?.focusNodeId,
  )

  if (
    !focusedMessage ||
    !focusedMessage.subagentTree ||
    !focusedMessage.subagentUIState
  ) {
    return false
  }

  const tree = focusedMessage.subagentTree
  const uiState = focusedMessage.subagentUIState

  if (key.shift && key.name === 'right') {
    // Shift+Right: Open or navigate deeper
    if (!uiState.focusNodeId) return true

    const { path } = parseNodePath(uiState.focusNodeId)
    const focusedNode = findNodeByPath(tree, path)

    if (!focusedNode) return true

    const isExpanded = uiState.expanded.has(uiState.focusNodeId)

    if (!isExpanded) {
      // Open the focused node and close all its descendants
      uiState.expanded.add(uiState.focusNodeId)
      // Remove any descendant nodes from expanded set
      const descendantPrefix = uiState.focusNodeId + '/'
      uiState.expanded.forEach((nodeId) => {
        if (nodeId.startsWith(descendantPrefix)) {
          uiState.expanded.delete(nodeId)
        }
      })
      uiState.firstChildProgress.set(uiState.focusNodeId, 0)
    } else {
      // Navigate to first child or next sibling in DFS order
      const progress = uiState.firstChildProgress.get(uiState.focusNodeId) || 0

      if (focusedNode.children && progress < focusedNode.children.length) {
        const childPath = [...path, progress]
        const childNodeId = createNodeId(focusedMessage.id, childPath)
        uiState.focusNodeId = childNodeId
        uiState.firstChildProgress.set(uiState.focusNodeId, 0)
        uiState.firstChildProgress.set(focusedMessage.id, progress + 1)
      }
    }

    updateContentLines()
    renderChat()
    return true
  }

  if (key.shift && key.name === 'left') {
    // Shift+Left: Close or navigate up
    if (!uiState.focusNodeId) return true

    const isExpanded = uiState.expanded.has(uiState.focusNodeId)

    if (isExpanded) {
      // Close the focused node
      uiState.expanded.delete(uiState.focusNodeId)
      // Remove all descendant nodes from expanded set
      const descendantPrefix = uiState.focusNodeId + '/'
      uiState.expanded.forEach((nodeId) => {
        if (nodeId.startsWith(descendantPrefix)) {
          uiState.expanded.delete(nodeId)
        }
      })
    } else {
      // Move focus to parent
      const { path } = parseNodePath(uiState.focusNodeId)
      if (path.length > 0) {
        const parentPath = path.slice(0, -1)
        const parentNodeId = createNodeId(focusedMessage.id, parentPath)
        uiState.focusNodeId = parentNodeId
      }
    }

    updateContentLines()
    renderChat()
    return true
  }

  return false
}

function initializeNavigationMode(): void {
  if (chatState.navigationMode) return

  const latestMessageId = findLatestAssistantMessageWithChildren()
  if (!latestMessageId) return

  const message = chatState.messages.find((m) => m.id === latestMessageId)
  if (!message || !message.subagentTree) return

  // Initialize UI state if not exists
  if (!message.subagentUIState) {
    message.subagentUIState = {
      expanded: new Set(),
      focusNodeId: null,
      firstChildProgress: new Map(),
    }
  }

  // Set focus to the root node
  message.subagentUIState.focusNodeId = createNodeId(message.id, [])

  chatState.navigationMode = true
  updateContentLines()
  renderChat()
}
