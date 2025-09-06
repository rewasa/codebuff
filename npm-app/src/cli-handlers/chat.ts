import { green, yellow, cyan, bold, gray, blue } from 'picocolors'
import stringWidth from 'string-width'
import wrapAnsi from 'wrap-ansi'

import { logger } from '../utils/logger'
import {
  ENTER_ALT_BUFFER,
  EXIT_ALT_BUFFER,
  CLEAR_SCREEN,
  SHOW_CURSOR,
  HIDE_CURSOR,
  MOVE_CURSOR,
  SET_CURSOR_DEFAULT,
} from '../utils/terminal'

// Constants
const SIDE_PADDING = 2
const HEADER_TEXT = '💬 Codebuff Chat'
const STATUS_TEXT = 'Tab to navigate • Space/Enter to toggle • ESC to exit'
const PLACEHOLDER_TEXT = 'Type your message...'
const WELCOME_MESSAGE =
  'Welcome to Codebuff Chat! Type your messages below and press Enter to send. This is a dedicated chat interface for conversations with your AI assistant.'
const QUEUE_ARROW = '↑'
const SEPARATOR_CHAR = '─'
const PREVIEW_LINES = 5
const MAX_LINES_PER_NODE_WHEN_COLLAPSED = 5
const INPUT_BAR_NODE_ID = 'input-bar'

// Response structure interface
export interface ResponseChild {
  content: string
  postContent: string
  agent: string
  children: ResponseChild[]
}

export interface AssistantResponse {
  content: string
  postContent: string
  agent: string
  children: ResponseChild[]
}

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
  inputBarFocused: boolean
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
  inputBarFocused: true, // Start with input bar focused
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
    inputBarFocused: true, // Start with input bar focused
  }
}

function setupRealCursor(): void {
  if (chatState.inputBarFocused) {
    // Show cursor when input bar is focused
    process.stdout.write(SHOW_CURSOR)
    process.stdout.write(SET_CURSOR_DEFAULT)
  } else {
    // Hide cursor when navigating toggles
    process.stdout.write(HIDE_CURSOR)
  }
}

function restoreDefaultRealCursor(): void {
  // Restore cursor to default style and visibility
  process.stdout.write(SET_CURSOR_DEFAULT)
}

function positionRealCursor(): void {
  if (!chatState.inputBarFocused) {
    return
  }

  const metrics = getTerminalMetrics()

  // Position cursor at the input area where typing occurs
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

  // Check if the main assistant toggle is focused
  const mainToggleNodeId = createNodeId(message.id, []) + '/toggle'
  const isMainToggleFocused =
    message.subagentUIState?.focusNodeId === mainToggleNodeId

  // Assistant messages: header with expand/collapse toggle if has subagents
  let assistantHeader = ''
  if (hasSubagents) {
    const expandCollapseIndicator = isMainExpanded ? '[-]' : '[+]'
    const toggleText = isMainToggleFocused
      ? `\x1b[7m${expandCollapseIndicator}\x1b[27m` // Highlighted toggle
      : expandCollapseIndicator // Regular toggle
    assistantHeader = `${toggleText} ${bold(blue('Assistant'))} ${gray(`[${timeStr}]`)}`
  } else {
    assistantHeader = `${bold(blue('Assistant'))} ${gray(`[${timeStr}]`)}`
  }
  lines.push(' '.repeat(metrics.sidePadding) + assistantHeader)

  if (message.content && message.content.trim()) {
    // Check if we should show only postContent (when collapsed and has postContent)
    const isFullyCollapsed =
      hasSubagents &&
      message.subagentUIState &&
      message.subagentUIState.expanded.size === 0
    const hasPostContentToShow =
      message.subagentTree && message.subagentTree.postContent
    const shouldShowOnlyPostContent = isFullyCollapsed && hasPostContentToShow

    if (!shouldShowOnlyPostContent) {
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
          const indentedLine = '    ' + line // 4 spaces for assistant content with subagents
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
          const indentedLine = hasSubagents ? '    ' + line : line // 4 spaces if has subagents, 0 if simple message
          const indentLevel = hasSubagents ? 4 : 0
          appendWrappedLine(lines, indentedLine, indentLevel, metrics, [], 0)
        })
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
      const indentedLine = line // no additional indentation beyond side padding
      appendWrappedLine(lines, indentedLine, 0, metrics, [], 0)
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

function padLine(line: string, width: number): string {
  const visibleWidth = stringWidth(line)
  const padding = Math.max(0, width - visibleWidth)
  return line + ' '.repeat(padding)
}

function renderChat() {
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

  // Build the complete screen content
  const screenLines: string[] = []

  // Display chat content
  const visibleLines = chatState.contentLines.slice(
    chatState.scrollOffset,
    chatState.scrollOffset + maxContentLines,
  )

  // Pad visible lines to fill the available content area
  for (let i = 0; i < maxContentLines; i++) {
    const line = visibleLines[i] || ''
    screenLines.push(padLine(line, metrics.width))
  }

  // Add input area lines
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
    const queueLine = ' '.repeat(metrics.sidePadding) + gray(previewText)
    screenLines.push(padLine(queueLine, metrics.width))
    currentLine++
  }

  // Display separator line
  const separatorContent =
    ' '.repeat(metrics.sidePadding) +
    gray(SEPARATOR_CHAR.repeat(metrics.contentWidth))
  screenLines.push(padLine(separatorContent, metrics.width))
  currentLine++

  // Show placeholder or user input
  if (chatState.currentInput.length === 0) {
    // Show placeholder text
    const placeholder = `\x1b[2m${gray(PLACEHOLDER_TEXT)}\x1b[22m`
    const placeholderContent = ' '.repeat(metrics.sidePadding) + placeholder
    screenLines.push(padLine(placeholderContent, metrics.width))
    currentLine++
  } else {
    // Show user input
    const wrappedInputLines = wrapLine(
      chatState.currentInput,
      metrics.contentWidth,
    )

    wrappedInputLines.forEach((line, index) => {
      const inputContent = ' '.repeat(metrics.sidePadding) + line
      screenLines.push(padLine(inputContent, metrics.width))
      currentLine++
    })
  }

  // Pad remaining input area with empty lines, leaving one for the status bar
  while (screenLines.length < metrics.height - 1) {
    screenLines.push(' '.repeat(metrics.width))
  }

  // Status line with side padding - position at very bottom of screen
  const statusContent = ' '.repeat(metrics.sidePadding) + gray(STATUS_TEXT)
  screenLines.push(padLine(statusContent, metrics.width))

  // Write the entire screen content at once
  process.stdout.write(MOVE_CURSOR(1, 1) + screenLines.join('\n'))

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
    // Handle ESC - clear focus first, or exit if no focus
    if (key && key.name === 'escape') {
      const hadFocus = clearAllFocus()
      if (hadFocus) {
        // Focus input bar when clearing other focus
        chatState.inputBarFocused = true
        setupRealCursor()
        updateContentLines()
        renderChat()
        return
      } else {
        // No focus to clear, exit chat
        exitChatBuffer(rl)
        onExit()
        return
      }
    }

    // Handle Ctrl+C to exit
    if (key && key.ctrl && key.name === 'c') {
      exitChatBuffer(rl)
      onExit()
      return
    }

    // Handle Tab navigation for hints
    if (handleTabNavigation(key)) {
      return
    }

    // Handle Space/Enter for toggle
    if (handleToggleAction(key)) {
      return
    }

    // Handle Enter - send message only if input bar is focused
    if (key && key.name === 'return') {
      if (chatState.inputBarFocused) {
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
        renderChat()
        return
      }
      // If not input focused, let handleToggleAction handle it
    }

    // Handle backspace for text input only if input bar is focused
    if (key && key.name === 'backspace') {
      if (chatState.inputBarFocused) {
        chatState.currentInput = chatState.currentInput.slice(0, -1)
        renderChat()
        return
      }
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

    // Add printable characters to input only if input bar is focused
    if (str && str.length === 1 && str.charCodeAt(0) >= 32) {
      if (chatState.inputBarFocused) {
        chatState.currentInput += str
        renderChat()
      }
      // Ignore input when toggles are focused
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

  // If streaming postContent, automatically collapse this node to hide previous content
  if (property === 'postContent') {
    // Find the message that contains this node and collapse it
    const currentStreamingMessage = chatState.messages.find(
      (m) => m.id === chatState.currentStreamingMessageId,
    )
    if (currentStreamingMessage && currentStreamingMessage.subagentUIState) {
      const uiState = currentStreamingMessage.subagentUIState

      // Collapse this specific node
      uiState.expanded.delete(node.id)

      // Also collapse any child nodes of this node
      const childPrefix = node.id + '/'
      uiState.expanded.forEach((nodeId) => {
        if (nodeId.startsWith(childPrefix)) {
          uiState.expanded.delete(nodeId)
        }
      })
    }
  }

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
  const responses: AssistantResponse[] = [
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
              postContent: `Analysis complete - prioritizing recently modified auth files for detailed review`,
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
              postContent: `Edge case analysis complete - error handling is robust and handles all scenarios properly`,
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
          postContent: `Architectural analysis complete - ready to proceed with changes`,
          children: [
            {
              content: `Let me map out the component hierarchy first. Looking at imports and exports to understand dependencies...`,
              agent: 'file-picker',
              postContent: `Located src/components/Button.tsx, src/types/ui.ts, and src/hooks/useAuth.ts`,
              children: [
                {
                  content: `I notice this component is used in 12 different places. I need to ensure my changes don't break existing functionality...`,
                  agent: 'file-picker',
                  postContent: `Dependency analysis complete - identified safe refactoring points with minimal impact`,
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
              postContent: `Integration tests pass - new feature integrates seamlessly with existing system`,
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
              postContent: `Pattern analysis complete - confirmed Promise rejection handling issue across multiple files`,
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
              postContent: `Root cause confirmed - implemented session validation fix to prevent race condition`,
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
          postContent: `Code structure analysis complete - refactoring opportunities identified`,
          children: [
            {
              content: `This component is doing too much - 247 lines with mixed concerns. I can see authentication logic, UI rendering, and data fetching all in one place...`,
              agent: 'reviewer',
              postContent: `Identified 4 improvement opportunities: extract custom hooks, separate business logic, add error boundaries, improve prop types`,
              children: [
                {
                  content: `The useEffect has 3 different dependencies doing unrelated things. This is a classic sign we need to split responsibilities...`,
                  agent: 'reviewer',
                  postContent: `Refactoring plan ready - separated concerns into focused custom hooks with clear responsibilities`,
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
              postContent: `MSW setup complete - API mocking configured for isolated, reliable testing`,
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
              postContent: `Edge case tests added - comprehensive test coverage now includes error scenarios and boundary conditions`,
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
    const hasChildren = (node.children && node.children.length > 0) || !!node.postContent
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

    // Check if this node's toggle is focused
    const toggleNodeId = nodeId + '/toggle'
    const isToggleFocused = uiState.focusNodeId === toggleNodeId

    // Agent header - 4 spaces per depth level from left margin (including side padding)
    const headerIndentSpaces = 4 * depth
    let agentHeader = ''
    if (expandCollapseIndicator) {
      const toggleText = isToggleFocused
        ? `\x1b[7m${expandCollapseIndicator}\x1b[27m` // Highlighted toggle
        : expandCollapseIndicator // Regular toggle
      agentHeader = `${toggleText} ${bold(blue(agentName))} ${gray(`[${timeStr}]`)}`
    } else {
      agentHeader = `${bold(blue(agentName))} ${gray(`[${timeStr}]`)}`
    }

    const headerPrefix = ' '.repeat(headerIndentSpaces)
    appendWrappedLine(
      lines,
      headerPrefix + agentHeader,
      stringWidth(headerPrefix),
      metrics,
    )

    // Content - 4 additional spaces beyond header indentation
    // Only show content if expanded or has no children
    if (node.content && (isExpanded || !hasChildren)) {
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
      if (node.children && node.children.length > 0) {
        node.children.forEach((child, index) => {
          renderNode(child, depth + 1, [...path, index])
        })
      }
    } else if (hasChildren && !isExpanded && node.postContent) {
      // Show postContent for collapsed nodes with children
      const postLines = node.postContent.split('\n')
      const postIndentSpaces = 4 * depth // Same as header indentation
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

  // Only render the parent's postContent if the root node is collapsed
  const rootNodeId = tree.id
  if (tree.postContent && !uiState.expanded.has(rootNodeId)) {
    const postLines = tree.postContent.split('\n')
    const postPrefix = ''
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

function handleTabNavigation(key: any): boolean {
  // Only handle Tab (with or without Shift)
  if (!key || key.name !== 'tab') return false

  const allTargets = getAllNavigationTargets()
  if (allTargets.length === 0) return false

  const currentFocusId = getCurrentFocusedNodeId()
  let currentIndex = currentFocusId
    ? allTargets.findIndex((t) => t.nodeId === currentFocusId)
    : -1

  if (key.shift) {
    // Shift+Tab: backward (previous target)
    currentIndex = currentIndex <= 0 ? allTargets.length - 1 : currentIndex - 1
  } else {
    // Tab: forward (next target)
    currentIndex = currentIndex >= allTargets.length - 1 ? 0 : currentIndex + 1
  }

  const targetNode = allTargets[currentIndex]
  if (targetNode) {
    // Clear all focus first
    clearAllToggleFocus()
    chatState.inputBarFocused = false

    if (targetNode.type === 'input') {
      // Focus input bar
      chatState.inputBarFocused = true
    } else {
      // Focus toggle
      const targetMessage = chatState.messages.find(
        (m) => m.id === targetNode.messageId,
      )
      if (targetMessage && targetMessage.subagentUIState) {
        targetMessage.subagentUIState.focusNodeId = targetNode.nodeId
      }
    }

    // Update cursor visibility
    setupRealCursor()
    updateContentLines()
    renderChat()
    return true
  }

  return false
}

function handleToggleAction(key: any): boolean {
  // Handle Space or Enter for toggle actions
  if (!key || (key.name !== 'space' && key.name !== 'return')) return false

  // Only handle if a toggle is currently focused
  const currentFocusId = getCurrentFocusedToggleNodeId()
  if (!currentFocusId) return false

  // Don't handle if input bar is focused - prioritize chat functionality
  if (chatState.inputBarFocused) return false

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

  // Handle toggle node focus - if focused on toggle, expand/collapse that node
  if (uiState.focusNodeId && uiState.focusNodeId.endsWith('/toggle')) {
    const actualNodeId = uiState.focusNodeId.slice(0, -7) // Remove '/toggle'
    const isExpanded = uiState.expanded.has(actualNodeId)

    if (isExpanded) {
      // Collapse the node
      uiState.expanded.delete(actualNodeId)
      // Remove all descendant nodes from expanded set
      const descendantPrefix = actualNodeId + '/'
      uiState.expanded.forEach((nodeId) => {
        if (nodeId.startsWith(descendantPrefix)) {
          uiState.expanded.delete(nodeId)
        }
      })
    } else {
      // Expand the node
      uiState.expanded.add(actualNodeId)
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

function getAllNavigationTargets(): Array<{
  messageId: string | null
  nodeId: string
  depth: number
  type: 'toggle' | 'input'
}> {
  const targets: Array<{
    messageId: string | null
    nodeId: string
    depth: number
    type: 'toggle' | 'input'
  }> = []

  // Add toggle nodes
  chatState.messages.forEach((message) => {
    if (
      message.role === 'assistant' &&
      message.subagentTree &&
      message.subagentUIState
    ) {
      // Check if main assistant message has subagents (and thus a toggle)
      const hasSubagents =
        message.subagentTree.children &&
        message.subagentTree.children.length > 0
      if (hasSubagents) {
        const mainToggleNodeId = createNodeId(message.id, []) + '/toggle'
        targets.push({
          messageId: message.id,
          nodeId: mainToggleNodeId,
          depth: 0,
          type: 'toggle',
        })
      }

      // Collect toggle nodes from this message's tree
      collectToggleNodesFromTree(
        message.subagentTree,
        message.id,
        message.subagentUIState,
        targets,
        1, // Start at depth 1 since main assistant is depth 0
      )
    }
  })

  // Add input bar as navigation target
  targets.push({
    messageId: null,
    nodeId: INPUT_BAR_NODE_ID,
    depth: -1, // Special depth for input bar
    type: 'input',
  })

  return targets
}

function getAllToggleNodes(): Array<{
  messageId: string
  nodeId: string
  depth: number
}> {
  return getAllNavigationTargets()
    .filter((target) => target.type === 'toggle')
    .map((target) => ({
      messageId: target.messageId!,
      nodeId: target.nodeId,
      depth: target.depth,
    }))
}

function collectToggleNodesFromTree(
  node: SubagentNode,
  messageId: string,
  uiState: SubagentUIState,
  targets: Array<{
    messageId: string | null
    nodeId: string
    depth: number
    type: 'toggle' | 'input'
  }>,
  depth: number,
  path: number[] = [],
): void {
  // If this node has children, it has a toggle
  if (node.children && node.children.length > 0) {
    node.children.forEach((child, index) => {
      const childPath = [...path, index]
      const childNodeId = createNodeId(messageId, childPath)
      const childHasChildren = (child.children && child.children.length > 0) || !!child.postContent

      // Only add toggle if this child has children AND this node is currently expanded (making child visible)
      const nodeId = createNodeId(messageId, path)
      const isNodeExpanded = uiState.expanded.has(nodeId)

      if (childHasChildren && isNodeExpanded) {
        const toggleNodeId = childNodeId + '/toggle'
        targets.push({ messageId, nodeId: toggleNodeId, depth, type: 'toggle' })
      }

      // Only recurse into this child if the current node is expanded (making child visible)
      if (isNodeExpanded) {
        collectToggleNodesFromTree(
          child,
          messageId,
          uiState,
          targets,
          depth + 1,
          childPath,
        )
      }
    })
  }
}

function getCurrentFocusedNodeId(): string | null {
  // Check if input bar is focused
  if (chatState.inputBarFocused) {
    return INPUT_BAR_NODE_ID
  }

  // Check for focused toggle
  for (const message of chatState.messages) {
    if (message.subagentUIState?.focusNodeId?.endsWith('/toggle')) {
      return message.subagentUIState.focusNodeId
    }
  }
  return null
}

function getCurrentFocusedToggleNodeId(): string | null {
  for (const message of chatState.messages) {
    if (message.subagentUIState?.focusNodeId?.endsWith('/toggle')) {
      return message.subagentUIState.focusNodeId
    }
  }
  return null
}

function clearAllFocus(): boolean {
  let hadFocus = false

  // Clear input bar focus
  if (chatState.inputBarFocused) {
    chatState.inputBarFocused = false
    hadFocus = true
  }

  // Clear toggle focus
  chatState.messages.forEach((message) => {
    if (message.subagentUIState?.focusNodeId) {
      message.subagentUIState.focusNodeId = null
      hadFocus = true
    }
  })

  return hadFocus
}

function clearAllToggleFocus(): boolean {
  let hadFocus = false
  chatState.messages.forEach((message) => {
    if (message.subagentUIState?.focusNodeId) {
      message.subagentUIState.focusNodeId = null
      hadFocus = true
    }
  })
  return hadFocus
}

function autoFocusLatestToggle(): void {
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

  // Only auto-focus if nothing else is focused and input bar is not focused
  if (!getCurrentFocusedToggleNodeId() && chatState.inputBarFocused) {
    // Clear input bar focus and focus on the main assistant toggle
    chatState.inputBarFocused = false
    message.subagentUIState.focusNodeId =
      createNodeId(message.id, []) + '/toggle'
    setupRealCursor()
  }

  updateContentLines()
  renderChat()
}
