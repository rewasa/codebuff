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
const STATUS_TEXT = 'Shift + →/← to view agent traces • ESC or Ctrl+C to exit'
const PLACEHOLDER_TEXT = 'Type your message...'
const WELCOME_MESSAGE =
  'Welcome to Codebuff Chat! Type your messages below and press Enter to send. This is a dedicated chat interface for conversations with your AI assistant.'
const QUEUE_ARROW = '↑'
const SEPARATOR_CHAR = '─'
const PREVIEW_LINES = 5
const MAX_LINES_PER_NODE_WHEN_COLLAPSED = 5

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

  // Ensure minimum width to prevent infinite loops or empty wraps
  const safeWidth = Math.max(10, terminalWidth)

  if (stringWidth(line) <= safeWidth) {
    return [line]
  }
  const wrapped = wrapAnsi(line, safeWidth, { hard: true })
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

  // Collapse all subagent tree nodes when streaming finishes
  if (message.subagentUIState) {
    message.subagentUIState.expanded.clear()
    message.subagentUIState.focusNodeId = null
    message.subagentUIState.firstChildProgress.clear()
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

  // Check if this message has any subagents
  const hasSubagents =
    message.subagentTree &&
    message.subagentTree.children &&
    message.subagentTree.children.length > 0
  const hasPostContent =
    message.subagentTree && message.subagentTree.postContent

  // Determine expand/collapse state for the main message
  const isMainExpanded =
    hasSubagents &&
    message.subagentUIState &&
    message.subagentUIState.expanded.size > 0

  // Assistant messages: simple header without expand/collapse indicators
  const assistantHeader = `${bold(blue('Assistant'))} ${gray(`[${timeStr}]`)}`
  lines.push(' '.repeat(metrics.sidePadding) + assistantHeader)

  if (message.content && message.content.trim()) {
    // Show preview or full content based on expansion state
    const shouldShowPreview = hasSubagents && !isMainExpanded

    if (shouldShowPreview) {
      // Show preview (first PREVIEW_LINES of wrapped content)
      const contentLines = message.content.split('\n')
      const wrappedLines: string[] = []

      for (const line of contentLines) {
        const wrapped = wrapLine(line, metrics.contentWidth - 4) // Account for tree prefix
        wrappedLines.push(...wrapped)
        if (wrappedLines.length >= PREVIEW_LINES) break
      }

      // Take only first PREVIEW_LINES
      const previewLines = wrappedLines.slice(0, PREVIEW_LINES)

      previewLines.forEach((line) => {
        const indentedLine = '    ' + line // 4 spaces for assistant content
        appendWrappedLine(lines, indentedLine, 4, metrics, [], 0)
      })

      // Add "..." if content was truncated
      if (wrappedLines.length > PREVIEW_LINES) {
        const ellipsisLine = '  ' + gray('...')
        lines.push(' '.repeat(metrics.sidePadding) + ellipsisLine)
      }
    } else {
      // Show full content when expanded or no subagents
      const contentLines = message.content.split('\n')

      contentLines.forEach((line) => {
        const indentedLine = '    ' + line // 4 spaces for assistant content
        appendWrappedLine(lines, indentedLine, 4, metrics, [], 0)
      })
    }

    // Show hint line if there are subagents but everything is collapsed
    if (hasSubagents && message.subagentUIState) {
      const isFullyCollapsed = message.subagentUIState.expanded.size === 0
      if (isFullyCollapsed) {
        // Count total agent responses recursively
        const agentCount = message.subagentTree
          ? countTotalAgents(message.subagentTree)
          : 0
        const hintText = `+ ${agentCount} agent response${agentCount === 1 ? '' : 's'}`

        // Check if the hint line is focused
        const hintNodeId = createNodeId(message.id, []) + '/hint'
        const isHintFocused = message.subagentUIState.focusNodeId === hintNodeId

        const hintLine = isHintFocused
          ? `    \x1b[7m\x1b[3m${hintText}\x1b[23m\x1b[27m` // Highlighted italic text
          : `    \x1b[3m${hintText}\x1b[23m` // Regular italic text

        const prefixLength = stringWidth('    ')
        appendWrappedLine(lines, hintLine, prefixLength, metrics, [], 1)
      }
    }
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

  // User messages: structured header like assistant messages
  const userHeader = `${bold(green('You'))} ${gray(`[${timeStr}]`)}`
  lines.push(' '.repeat(metrics.sidePadding) + userHeader)

  if (message.content && message.content.trim()) {
    const contentLines = message.content.split('\n')
    contentLines.forEach((line) => {
      const indentedLine = '    ' + line // 4 spaces for user content
      appendWrappedLine(lines, indentedLine, 4, metrics, [], 0)
    })
  }

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

// Helper function to stream text to a node property word-by-word
async function streamTextToNodeProperty(
  node: SubagentNode,
  property: 'content' | 'postContent',
  text: string,
): Promise<void> {
  if (!text) return

  const words = text.split(' ')
  for (let i = 0; i < words.length; i++) {
    const word = words[i]
    const isLastWord = i === words.length - 1

    const chunk = (i === 0 ? '' : ' ') + word
    if (property === 'postContent') {
      node.postContent = (node.postContent || '') + chunk
    } else {
      node.content += chunk
    }

    updateContentLines()
    renderChat()

    if (!isLastWord) {
      const delay = 30 + Math.random() * 80
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
}

// Helper function to progressively stream and build subagent tree content
async function streamSubagentTreeContent(
  responseNode: any,
  message: ChatMessage,
  currentPath: number[],
): Promise<{ node: SubagentNode; postContent: string }[]> {
  if (!responseNode.children || responseNode.children.length === 0) {
    return []
  }

  const allNodesWithPostContent: { node: SubagentNode; postContent: string }[] =
    []

  // First pass: Process all children content and create nodes
  const childNodes: { node: SubagentNode; originalChild: any }[] = []

  for (
    let childIndex = 0;
    childIndex < responseNode.children.length;
    childIndex++
  ) {
    const child = responseNode.children[childIndex]
    const childPath = [...currentPath, childIndex]

    // Add a pause before starting each subagent
    await new Promise((resolve) =>
      setTimeout(resolve, 300 + Math.random() * 200),
    )

    // Create the child node in the tree (initially with empty content)
    const childNode: SubagentNode = {
      id: createNodeId(message.id, childPath),
      type: child.agent || 'unknown',
      content: '',
      children: [],
    }

    // Add child to parent node in tree
    if (currentPath.length === 0) {
      // Top-level child
      message.subagentTree!.children.push(childNode)
    } else {
      // Find parent node and add child
      const parentNode = findNodeByPath(message.subagentTree!, currentPath)
      if (parentNode) {
        parentNode.children.push(childNode)
      }
    }

    // Expand this node in UI
    message.subagentUIState!.expanded.add(childNode.id)

    // Trigger re-render to show the new subagent node (with empty content initially)
    updateContentLines()
    renderChat()

    // Stream this child's content word-by-word
    await streamTextToNodeProperty(childNode, 'content', child.content)

    // Store for later processing
    childNodes.push({ node: childNode, originalChild: child })
  }

  // Second pass: Process all children recursively (grandchildren)
  for (let i = 0; i < childNodes.length; i++) {
    const { node: childNode, originalChild: child } = childNodes[i]
    const childPath = [...currentPath, i]

    // Recursively process grandchildren and collect their postContent nodes
    const descendantPostContentNodes = await streamSubagentTreeContent(
      child,
      message,
      childPath,
    )
    allNodesWithPostContent.push(...descendantPostContentNodes)
  }

  // Third pass: After ALL descendants are processed, collect postContent from this level
  for (const { node: childNode, originalChild: child } of childNodes) {
    if (child.postContent) {
      allNodesWithPostContent.push({
        node: childNode,
        postContent: child.postContent,
      })
    }
  }

  // Return collected postContent nodes without streaming them
  // Only the top-level call will stream them
  return allNodesWithPostContent
}

// Simulates streaming AI response with chunked updates
async function simulateStreamingResponse(
  message: string,
  onChunk: (chunk: string) => void,
): Promise<void> {
  // Generate a response based on the message - show realistic subagent interactions with internal monologues
  const responses = [
    {
      content: `I'll help you fix that issue. Let me find the relevant files first.`,
      agent: 'assistant',
      postContent: `Issue resolved! The implementation follows best practices.`,
      children: [
        {
          content: `Let me search through the codebase systematically. I'll start by looking for files containing keywords related to "${message.toLowerCase()}"...`,
          agent: 'file-picker',
          postContent: `Found 3 relevant files: auth.ts, userService.js, and login.component.tsx`,
          children: [
            {
              content: `Hmm, I need to be strategic about which files to examine. Let me check the most recently modified ones first, then look at the core logic files...`,
              agent: 'file-picker',
              children: [],
            },
          ],
        },
        {
          content: `Now I'll carefully review these changes. Let me check for common pitfalls: null safety, type consistency, error handling...`,
          agent: 'reviewer',
          postContent: `Code review passed - all changes look good! No security issues detected.`,
          children: [
            {
              content: `The error handling looks solid, but I should double-check the edge cases. What happens if the API returns unexpected data?`,
              agent: 'reviewer',
              children: [],
            },
          ],
        },
      ],
    },
    {
      content: `I'll implement the feature you requested.`,
      agent: 'assistant',
      postContent: `Feature implementation complete with comprehensive tests.`,
      children: [
        {
          content: `@file-picker: I need to understand the current architecture before making changes`,
          agent: 'system',
          children: [
            {
              content: `Let me map out the component hierarchy first. Looking at imports and exports to understand dependencies...`,
              agent: 'file-picker',
              postContent: `Located src/components/Button.tsx, src/types/ui.ts, and src/hooks/useAuth.ts`,
              children: [
                {
                  content: `I notice this component is used in 12 different places. I need to ensure my changes don't break existing functionality...`,
                  agent: 'file-picker',
                  children: [],
                },
              ],
            },
          ],
        },
        {
          content: `Running comprehensive test suite to ensure nothing breaks...`,
          agent: 'system',
          postContent: `✅ All 28 tests passing, coverage increased to 94%`,
          children: [
            {
              content: `Tests look good, but let me also check the integration tests to make sure the new feature plays well with the existing system...`,
              agent: 'system',
              children: [],
            },
          ],
        },
      ],
    },
    {
      content: `Let me analyze the error and provide a solution.`,
      agent: 'assistant',
      postContent: `Error analysis complete. Root cause identified and fix applied successfully.`,
      children: [
        {
          content: `I'm seeing an error pattern here. Let me search for similar issues in the codebase to understand if this is systemic...`,
          agent: 'file-picker',
          postContent: `Found 2 files with similar patterns - this might be a broader issue`,
          children: [
            {
              content: `Interesting, these files all share the same async pattern. I bet the issue is in how we're handling Promise rejections...`,
              agent: 'file-picker',
              children: [],
            },
          ],
        },
        {
          content: `Let me think through this systematically. The stack trace shows the error originates in userService.getProfile()...`,
          agent: 'thinker',
          postContent: `Root cause identified: Missing null check when user session is expired`,
          children: [
            {
              content: `The issue is subtle - we're assuming the session is valid, but if it expires mid-request, the user object becomes null. Classic race condition.`,
              agent: 'thinker',
              children: [],
            },
          ],
        },
      ],
    },
    {
      content: `I'll refactor this code to improve maintainability.`,
      agent: 'assistant',
      postContent: `Refactoring complete! Code is now cleaner, more testable, and follows SOLID principles.`,
      children: [
        {
          content: `@reviewer: Let me analyze the current code structure and identify refactoring opportunities`,
          agent: 'system',
          children: [
            {
              content: `This component is doing too much - 247 lines with mixed concerns. I can see authentication logic, UI rendering, and data fetching all in one place...`,
              agent: 'reviewer',
              postContent: `Identified 4 improvement opportunities: extract custom hooks, separate business logic, add error boundaries, improve prop types`,
              children: [
                {
                  content: `The useEffect has 3 different dependencies doing unrelated things. This is a classic sign we need to split responsibilities...`,
                  agent: 'reviewer',
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      content: `I'll help you set up the testing infrastructure.`,
      agent: 'assistant',
      postContent: `Testing infrastructure complete! Achieved 95% coverage with comprehensive test suites.`,
      children: [
        {
          content: `Setting up Jest and React Testing Library. I need to configure the test environment to match the production setup...`,
          agent: 'file-picker',
          postContent: `Created jest.config.js, setupTests.ts, and test utilities`,
          children: [
            {
              content: `I should also set up MSW for API mocking - that way our tests won't depend on external services...`,
              agent: 'file-picker',
              children: [],
            },
          ],
        },
        {
          content: `Running initial test suite to verify the setup works correctly...`,
          agent: 'system',
          postContent: `✅ 12 tests passed, 0 failed. Test infrastructure ready for development.`,
          children: [
            {
              content: `Good! The coverage report shows we're testing the happy path well, but I should add some edge case tests too...`,
              agent: 'system',
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

  // Only stream the main assistant content, not the subagent tree content
  // The subagent tree will be displayed separately by renderSubagentTree
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

  // After main content is streamed, set up and progressively stream the subagent tree
  if (chatState.currentStreamingMessageId && selectedResponse.children) {
    const streamingMessage = chatState.messages.find(
      (m) => m.id === chatState.currentStreamingMessageId,
    )
    if (streamingMessage) {
      // Initialize empty tree structure (postContent will be streamed later)
      streamingMessage.subagentTree = {
        id: createNodeId(streamingMessage.id, []),
        type: 'assistant',
        content: selectedResponse.content,
        children: [],
        // postContent intentionally omitted - will be streamed after all children
      }
      streamingMessage.subagentUIState = {
        expanded: new Set(),
        focusNodeId: null,
        firstChildProgress: new Map(),
      }

      // Stream subagent tree content progressively
      const allPostContentNodes = await streamSubagentTreeContent(
        selectedResponse,
        streamingMessage,
        [],
      )

      // Add parent postContent to the collection (should be streamed last)
      if (selectedResponse.postContent) {
        allPostContentNodes.push({
          node: streamingMessage.subagentTree,
          postContent: selectedResponse.postContent,
        })
      }

      // After ALL subagents are done, stream postContent in the correct order
      for (const item of allPostContentNodes) {
        // Small pause before postContent
        await new Promise((resolve) =>
          setTimeout(resolve, 200 + Math.random() * 100),
        )

        // Initialize and stream postContent
        item.node.postContent = ''
        await streamTextToNodeProperty(
          item.node,
          'postContent',
          item.postContent,
        )
      }
    }
  }
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

// Helper function to append wrapped lines with proper indentation
function appendWrappedLine(
  lines: string[],
  textToWrap: string,
  indentationLength: number,
  metrics: TerminalMetrics,
  ancestorLines: boolean[] = [],
  depth: number = 0,
): void {
  // Gracefully handle empty text
  if (!textToWrap) {
    return
  }

  // Extract the indentation prefix and the content from the text to wrap.
  const prefix = textToWrap.substring(0, indentationLength)
  const content = textToWrap.substring(indentationLength)

  // The width available for the content is the total content width minus the prefix length.
  const availableWidth = Math.max(10, metrics.contentWidth - indentationLength)

  // Wrap only the content part.
  const wrappedContentLines = wrapLine(content, availableWidth)

  // Add each wrapped line to the output, prepending the side padding and the original prefix.
  for (const line of wrappedContentLines) {
    lines.push(' '.repeat(metrics.sidePadding) + prefix + line)
  }
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
  ): void {
    const nodeId = createNodeId(messageId, path)
    const hasChildren = node.children && node.children.length > 0
    const isExpanded = uiState.expanded.has(nodeId)

    // Progressive indentation: 4 spaces per level
    const agentName = node.type
      ? node.type.charAt(0).toUpperCase() + node.type.slice(1)
      : 'Agent'

    const now = new Date()
    const timeStr = timeFormatter.format(now)

    const expandCollapseIndicator = hasChildren
      ? isExpanded
        ? '[-]'
        : '[+]'
      : ''

    // Agent header - 4 spaces per depth level from left margin (including side padding)
    const headerIndentSpaces = 4 * depth
    const agentHeader = expandCollapseIndicator
      ? `${expandCollapseIndicator} ${bold(blue(agentName))} ${gray(`[${timeStr}]`)}`
      : `${bold(blue(agentName))} ${gray(`[${timeStr}]`)}`

    const headerPrefix = ' '.repeat(headerIndentSpaces)
    appendWrappedLine(
      lines,
      headerPrefix + agentHeader,
      stringWidth(headerPrefix),
      metrics,
    )

    // Content - 4 additional spaces beyond header indentation
    if (node.content) {
      const contentLines = node.content.split('\n')
      const contentIndentSpaces = headerIndentSpaces + 4
      const contentPrefix = ' '.repeat(contentIndentSpaces)
      contentLines.forEach((line) => {
        if (line.trim()) {
          appendWrappedLine(
            lines,
            contentPrefix + line,
            stringWidth(contentPrefix),
            metrics,
          )
        }
      })
    }

    // Render children if expanded
    if (hasChildren && isExpanded) {
      node.children.forEach((child, index) => {
        renderNode(child, depth + 1, [...path, index])
      })
    } else if (hasChildren && !isExpanded) {
      // Show hint line
      const childAgentCount = countTotalAgents(node)
      const hintText = `+ ${childAgentCount} agent response${childAgentCount === 1 ? '' : 's'}`

      const hintNodeId = nodeId + '/hint'
      const isHintFocused = uiState.focusNodeId === hintNodeId

      const hintLine = isHintFocused
        ? `\x1b[7m\x1b[3m${hintText}\x1b[23m\x1b[27m`
        : `\x1b[3m${hintText}\x1b[23m`

      const hintIndentSpaces = 4 * depth + 4 // Same as content indentation
      const hintPrefix = ' '.repeat(hintIndentSpaces)
      appendWrappedLine(
        lines,
        hintPrefix + hintLine,
        stringWidth(hintPrefix),
        metrics,
      )
    }

    // Render postContent
    if (node.postContent) {
      const postLines = node.postContent.split('\n')
      const postIndentSpaces = 4 * depth + 4 // Same as content indentation
      const postPrefix = ' '.repeat(postIndentSpaces)
      postLines.forEach((line) => {
        if (line.trim()) {
          appendWrappedLine(
            lines,
            postPrefix + bold(green(line)),
            stringWidth(postPrefix),
            metrics,
          )
        }
      })
    }
  }

  // Render children only if the tree is not fully collapsed
  if (uiState.expanded.size > 0) {
    if (tree.children && tree.children.length > 0) {
      tree.children.forEach((child, index) => {
        renderNode(child, 1, [index])
      })
    }
  }

  // Always render the parent's postContent if it exists
  if (tree.postContent) {
    const postLines = tree.postContent.split('\n')
    const postPrefix = '    '
    postLines.forEach((line) => {
      if (line.trim()) {
        appendWrappedLine(
          lines,
          postPrefix + bold(green(line)),
          stringWidth(postPrefix),
          metrics,
        )
      }
    })
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

function handleTabExpansion(): boolean {
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

  const uiState = focusedMessage.subagentUIState

  // Check if we're focused on any hint line (not just root)
  if (uiState.focusNodeId && uiState.focusNodeId.endsWith('/hint')) {
    // Extract the actual node ID by removing '/hint' suffix
    const actualNodeId = uiState.focusNodeId.slice(0, -5)

    // Expand this node
    uiState.expanded.add(actualNodeId)

    // Focus on the first child node after expansion
    const { path } = parseNodePath(actualNodeId)
    const node = findNodeByPath(focusedMessage.subagentTree, path)

    if (node && node.children && node.children.length > 0) {
      const firstChildPath = [...path, 0]
      const firstChildNodeId = createNodeId(focusedMessage.id, firstChildPath)
      uiState.focusNodeId = firstChildNodeId
    } else {
      // Fallback to the actual node if no children
      uiState.focusNodeId = actualNodeId
    }

    updateContentLines()
    renderChat()
    return true
  }

  return false
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
    // Shift+Right: Simple expansion - just expand current node and focus first child
    if (!uiState.focusNodeId) return true

    // Handle hint node focus - if focused on hint, expand that node
    if (uiState.focusNodeId.endsWith('/hint')) {
      const actualNodeId = uiState.focusNodeId.slice(0, -5)
      uiState.expanded.add(actualNodeId)

      // Focus on the first child after expansion
      const { path } = parseNodePath(actualNodeId)
      const node = findNodeByPath(tree, path)

      if (node && node.children && node.children.length > 0) {
        const firstChildPath = [...path, 0]
        const firstChildNodeId = createNodeId(focusedMessage.id, firstChildPath)
        uiState.focusNodeId = firstChildNodeId
      } else {
        uiState.focusNodeId = actualNodeId
      }

      updateContentLines()
      renderChat()
      return true
    }

    // For regular nodes, only expand if collapsed and has children
    const { path } = parseNodePath(uiState.focusNodeId)
    const focusedNode = findNodeByPath(tree, path)

    if (!focusedNode) return true

    const hasChildren = focusedNode.children && focusedNode.children.length > 0
    const isExpanded = uiState.expanded.has(uiState.focusNodeId)

    if (!isExpanded && hasChildren) {
      // Expand the node and focus on its hint line (like the reverse of Shift+Left)
      uiState.expanded.add(uiState.focusNodeId)
      // Focus on first child
      const firstChildPath = [...path, 0]
      const firstChildNodeId = createNodeId(focusedMessage.id, firstChildPath)
      uiState.focusNodeId = firstChildNodeId
    }
    // If already expanded or no children, do nothing (no jumping around)

    updateContentLines()
    renderChat()
    return true
  }
  if (key.shift && key.name === 'left') {
    // Shift+Left: Toggle-style collapse - just collapse the currently focused node
    if (!uiState.focusNodeId) return true

    // Handle hint node focus - can't collapse a hint, so move to parent
    if (uiState.focusNodeId.endsWith('/hint')) {
      const actualNodeId = uiState.focusNodeId.slice(0, -5)
      const { path } = parseNodePath(actualNodeId)

      if (path.length > 0) {
        // Move to parent node
        const parentPath = path.slice(0, -1)
        const parentNodeId = createNodeId(focusedMessage.id, parentPath)
        uiState.focusNodeId = parentNodeId
      } else {
        // Already at root, stay on root hint
        return true
      }
    } else {
      // For regular nodes, collapse this node and show its hint if it has children
      const { path } = parseNodePath(uiState.focusNodeId)
      const currentNode = findNodeByPath(tree, path)

      if (
        currentNode &&
        currentNode.children &&
        currentNode.children.length > 0
      ) {
        // Collapse this node and all its descendants
        uiState.expanded.delete(uiState.focusNodeId)
        // Remove all descendant nodes from expanded set
        const descendantPrefix = uiState.focusNodeId + '/'
        uiState.expanded.forEach((nodeId) => {
          if (nodeId.startsWith(descendantPrefix)) {
            uiState.expanded.delete(nodeId)
          }
        })

        // Focus on the hint line for this now-collapsed node
        uiState.focusNodeId = uiState.focusNodeId + '/hint'
      } else if (path.length > 0) {
        // Node has no children, move focus to parent
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

// Helper function to count total agents in a tree
function countTotalAgents(tree: SubagentNode): number {
  if (!tree.children || tree.children.length === 0) return 0

  let count = tree.children.length
  for (const child of tree.children) {
    count += countTotalAgents(child)
  }
  return count
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

  // Always focus on the hint line when entering navigation mode
  // This ensures the hint gets highlighted immediately
  message.subagentUIState.focusNodeId = createNodeId(message.id, []) + '/hint'

  chatState.navigationMode = true
  updateContentLines()
  renderChat()
}
