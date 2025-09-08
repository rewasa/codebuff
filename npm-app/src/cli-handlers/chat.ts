import { green, yellow, cyan, bold, gray, blue, red } from 'picocolors'
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
const STATUS_UPDATE_INTERVAL = 100 // ms between status updates
// Dynamic status text that adapts to terminal width
function getStatusText(metrics: TerminalMetrics): string {
  const availableWidth = metrics.contentWidth

  // Full status text
  const fullText =
    'Tab/Shift+Tab: navigate • Space/Enter: toggle • ←/→: prev/next • ESC: exit'

  // Medium status text
  const mediumText =
    'Tab: navigate • Space: toggle • ←/→: prev/next • ESC: exit'

  // Short status text
  const shortText = 'Tab: nav • Space: toggle • ESC: exit'

  // Minimal status text
  const minimalText = 'ESC: exit'

  if (availableWidth >= fullText.length) {
    return fullText
  } else if (availableWidth >= mediumText.length) {
    return mediumText
  } else if (availableWidth >= shortText.length) {
    return shortText
  } else {
    return minimalText
  }
}
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
  status?: 'pending' | 'running' | 'complete' | 'error'
  statusMessage?: string
  startTime?: number
  endTime?: number
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
  currentlyStreamingNodeId?: string
  inputBarFocused: boolean
  shouldScrollToFocusedToggle: boolean
  userInteractedDuringStream?: boolean
  scrollPositionBeforeToggle?: number // Store scroll position before toggle action
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
  currentlyStreamingNodeId: undefined,
  inputBarFocused: true, // Start with input bar focused
  shouldScrollToFocusedToggle: false,
  scrollPositionBeforeToggle: undefined,
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

function scrollToToggle(toggleNodeId: string, messageId: string): void {
  // We'll find the focused toggle after content is updated by looking for the highlighted toggle
  // Set a flag to scroll to the focused toggle after the next render
  chatState.shouldScrollToFocusedToggle = true
}

function scrollToFocusedToggle(): void {
  if (!chatState.shouldScrollToFocusedToggle) return

  const metrics = getTerminalMetrics()

  // Find the line number where the highlighted toggle appears
  let toggleLineIndex = -1
  for (let i = 0; i < chatState.contentLines.length; i++) {
    const line = chatState.contentLines[i]
    // Look for the highlighted toggle pattern (\x1b[7m[+]\x1b[27m or \x1b[7m[-]\x1b[27m)
    if (line.includes('\x1b[7m[') && line.includes(']\x1b[27m')) {
      toggleLineIndex = i
      break
    }
  }

  if (toggleLineIndex !== -1) {
    // Position the toggle near the top (about 3-4 lines down from the visible area)
    const targetTopOffset = 4
    const newScrollOffset = Math.max(0, toggleLineIndex - targetTopOffset)

    // Clamp the scroll offset to valid bounds
    const maxScrollOffset = computeMaxScrollOffset(metrics)
    chatState.scrollOffset = Math.min(newScrollOffset, maxScrollOffset)
    chatState.userHasScrolled = true
  }

  // Clear the flag
  chatState.shouldScrollToFocusedToggle = false
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
    currentlyStreamingNodeId: undefined,
    inputBarFocused: true, // Start with input bar focused
    shouldScrollToFocusedToggle: false,
    scrollPositionBeforeToggle: undefined,
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
  chatState.currentlyStreamingNodeId = undefined

  // Don't auto-collapse - keep subagents visible after streaming completes
  // This allows users to review the full execution without having to manually expand
  // The tree will remain in whatever state it was during execution

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

  // Check if any child subagent is expanded (for minimizing parent)
  const hasExpandedChild =
    hasSubagents &&
    message.subagentUIState &&
    Array.from(message.subagentUIState.expanded).some(
      (nodeId) =>
        nodeId !== createNodeId(message.id, []) &&
        nodeId.startsWith(`m:${message.id}/`),
    )

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

  // If a child is expanded, add ellipsis on same line as header
  if (hasExpandedChild) {
    assistantHeader += ' ' + gray('...')
  }

  lines.push(' '.repeat(metrics.sidePadding) + assistantHeader)

  // Only show content if no child is expanded
  if (!hasExpandedChild && message.content && message.content.trim()) {
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
        // Show preview - just the last 2 lines with "..." prefix for top-level assistant
        const contentLines = message.content.split('\n')
        const allWrappedLines: string[] = []

        for (const line of contentLines) {
          const wrapped = wrapLine(line, metrics.contentWidth)
          allWrappedLines.push(...wrapped)
        }

        if (allWrappedLines.length <= 2) {
          // If 2 lines or less, show all
          allWrappedLines.forEach((line) => {
            const indentedLine = line
            appendWrappedLine(lines, indentedLine, 0, metrics, [], 0)
          })
        } else {
          // Show last 2 lines with ellipsis prepended to first line
          const lastLines = allWrappedLines.slice(-2)
          lastLines.forEach((line, index) => {
            const lineWithEllipsis = index === 0 ? gray('...') + line : line
            appendWrappedLine(lines, lineWithEllipsis, 0, metrics, [], 0)
          })
        }
      } else {
        // Show full content when expanded or no subagents
        const contentLines = message.content.split('\n')

        contentLines.forEach((line) => {
          const indentedLine = line // 0 spaces to match subagent indentation
          const indentLevel = 0
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

  // Handle scroll to focused toggle if requested
  scrollToFocusedToggle()

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
  const statusText = getStatusText(metrics)
  const statusContent = ' '.repeat(metrics.sidePadding) + gray(statusText)
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

    // Handle left/right arrows for toggle open/close
    if (handleArrowToggleAction(key)) {
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

  // Track which node is currently streaming
  if (property === 'content') {
    chatState.currentlyStreamingNodeId = node.id
  }

  const words = text.split(' ')
  for (let i = 0; i < words.length; i++) {
    const word = words[i]
    const isLastWord = i === words.length - 1

    // No auto-collapse behavior when streaming postContent
    // Keep expansion state as-is

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
      content: `I'll help you fix that issue you're encountering. This looks like a complex problem that requires a systematic approach to identify the root cause and implement a robust solution. Let me start by understanding the broader context of your codebase and then dive deep into the specific area where this issue is occurring. From what I can see in your request, this involves multiple components that need to work together seamlessly, and there are likely several interdependencies that we need to carefully consider. I want to make sure I don't just patch the surface-level symptom but actually address the underlying architectural concern that's causing this problem in the first place.`,
      agent: 'assistant',
      postContent: `Issue comprehensively resolved! I've implemented a robust solution that not only fixes the immediate problem but also improves the overall architecture. The implementation follows industry best practices, includes comprehensive error handling, maintains backward compatibility, and has been thoroughly tested across multiple scenarios. The code is now more maintainable, performant, and resilient to future changes. I've also added detailed documentation and comments to help your team understand the solution and maintain it going forward.`,
      children: [
        {
          content: `Let me search through the codebase systematically to understand the full scope of this issue. I'll start by looking for files containing keywords related to "${message.toLowerCase()}" and then expand my search to include related components, utilities, and configuration files. I need to understand the data flow, component hierarchy, and any external dependencies that might be affecting this functionality. I'll also check for recent changes in the git history that might have introduced this issue, and look at how similar functionality is implemented elsewhere in the codebase to ensure consistency in our approach.`,
          agent: 'file-picker',
          postContent: `Comprehensive file analysis complete! Found 12 relevant files across multiple directories: core components (auth.ts, userService.js, login.component.tsx), utility functions (validation.utils.ts, api.helpers.js), configuration files (config.json, environment.ts), test files (auth.test.ts, integration.spec.js), and documentation (README.md, API-docs.md). I've also identified 3 recently modified files that might be related to the issue and 2 deprecated files that should be cleaned up as part of this fix.`,
          children: [
            {
              content: `Looking deeper into the file structure, I need to be strategic about which files to examine first. Let me start with the most recently modified ones, as they're most likely to contain changes that introduced this issue. I'll then move to the core logic files, followed by the configuration and utility files. I'm particularly interested in understanding the authentication flow, how user sessions are managed, and where the validation logic is implemented. I also want to check if there are any environment-specific configurations that might be causing this behavior in certain deployment scenarios.`,
              agent: 'file-picker',
              postContent: `Detailed file prioritization analysis complete! I've ranked all files by their relevance and impact on the issue. The top priority files are the recently modified authentication components, followed by the session management utilities, then the validation logic, and finally the configuration files. I've also identified several files that contain similar patterns that should be updated for consistency once we implement the fix.`,
              children: [],
            },
          ],
        },
        {
          content: `Now I'll carefully review all the identified files and their interconnections. Let me start with a comprehensive code review focusing on common pitfalls: null safety checks, type consistency across the codebase, proper error handling and propagation, memory leaks in event listeners or subscriptions, race conditions in async operations, and security vulnerabilities like XSS or injection attacks. I'll also check for performance issues, accessibility concerns, and compliance with the team's coding standards. This review will help me understand not just what's causing the current issue, but also identify any other potential problems that we should address while we're making changes.`,
          agent: 'reviewer',
          postContent: `Comprehensive code review completed successfully! The analysis reveals that while the core logic is sound, there are several areas that need attention. The main issue stems from inadequate error handling in the async authentication flow, but I've also identified opportunities for performance improvements, better type safety, enhanced security measures, and improved code organization. All changes have been thoroughly tested and validated against the existing test suite, with additional test cases added to cover the edge cases that were previously missing.`,
          children: [
            {
              content: `The error handling in the main authentication flow looks solid at first glance, but I should double-check all the edge cases to make sure we're not missing anything critical. What happens if the API returns unexpected data formats? How do we handle network timeouts or connection failures? Are we properly cleaning up resources when operations are cancelled? What about scenarios where the user's session expires mid-request, or when multiple authentication requests are made simultaneously? I need to trace through all possible execution paths to ensure our error handling is comprehensive and doesn't leave the application in an inconsistent state.`,
              agent: 'reviewer',
              postContent: `Comprehensive edge case analysis completed! I've identified and addressed 8 critical edge cases that weren't properly handled in the original implementation. The error handling is now robust and covers scenarios including network failures, malformed API responses, session expiration, concurrent authentication attempts, browser storage issues, and various timeout conditions. The implementation now gracefully degrades under adverse conditions and provides meaningful feedback to users while maintaining system stability.`,
              children: [],
            },
          ],
        },
      ],
    },
    {
      content: `I'll implement the feature you requested, but I want to make sure I do this right from the start. This feature has the potential to significantly impact user experience and system performance, so I need to think through all the implications carefully. Let me start by analyzing the current architecture to understand how this new functionality should integrate with existing systems. I'll need to consider data flow patterns, state management approaches, component lifecycle implications, and how this feature will scale as your user base grows. I also want to ensure that the implementation is accessible, performant, and maintainable for your development team going forward.`,
      agent: 'assistant',
      postContent: `Feature implementation completed successfully with comprehensive testing, documentation, and performance optimization! The new functionality integrates seamlessly with your existing architecture while following all established patterns and conventions. I've implemented proper error handling, loading states, and user feedback mechanisms. The feature includes comprehensive unit tests, integration tests, and end-to-end test scenarios, bringing overall test coverage to 96%. Performance benchmarks show excellent results with minimal impact on existing functionality. I've also created detailed documentation including implementation notes, usage examples, and maintenance guidelines for your team.`,
      children: [
        {
          content: `@file-picker: Before I start implementing this feature, I need to develop a comprehensive understanding of the current architecture and how this new functionality should integrate with existing systems. Let me analyze the component structure, data flow patterns, state management implementation, routing configuration, and API integration points. I also want to understand the current design system, styling approaches, and any architectural patterns that are already established in the codebase. This will help me ensure that the new feature feels native to the existing application and doesn't introduce any inconsistencies or technical debt.`,
          agent: 'system',
          postContent: `Comprehensive architectural analysis completed! I have a thorough understanding of the current system architecture, including component patterns, state management flows, API integration strategies, and design system conventions. I've identified the optimal integration points for the new feature and created a detailed implementation plan that maintains consistency with existing patterns while introducing minimal complexity. The analysis reveals several opportunities for code reuse and confirms that the proposed feature aligns well with the current architectural direction.`,
          children: [
            {
              content: `Let me start by mapping out the complete component hierarchy and understanding how data flows through the application. I need to identify all the imports and exports, understand the dependency graph, and see how different parts of the application communicate with each other. I'm particularly interested in understanding the state management patterns, whether you're using Redux, Context API, or another approach, and how component props are structured and validated. I also want to understand the current routing setup and how navigation is handled throughout the application.`,
              agent: 'file-picker',
              postContent: `Component hierarchy analysis complete! I've mapped out the entire application structure and identified key integration points. The analysis shows a well-organized component architecture with clear separation of concerns. Key findings include: 23 reusable UI components in src/components/, 8 custom hooks in src/hooks/, 12 utility functions in src/utils/, and a clear state management pattern using Context API with reducer patterns. The routing is handled by React Router with 15 defined routes and proper code splitting implemented.`,
              children: [
                {
                  content: `Looking at the usage patterns across the codebase, I can see that this component is used in 12 different places throughout the application. This means I need to be extremely careful with any changes to ensure I don't break existing functionality. Let me analyze each usage context to understand the different ways this component is being used, what props are passed in each case, and whether there are any edge cases or special handling requirements. I'll also check if there are any tests that specifically validate the current behavior so I can ensure those continue to pass after my changes.`,
                  agent: 'file-picker',
                  postContent: `Comprehensive usage analysis and dependency impact assessment completed! I've analyzed all 12 usage contexts and identified safe refactoring opportunities that will enhance the component without breaking existing functionality. The analysis reveals 3 different usage patterns, with 8 components using the standard pattern, 3 using extended configurations, and 1 legacy usage that can be safely modernized. I've confirmed that all existing tests will continue to pass and identified 4 additional test cases that should be added to cover the new functionality.`,
                  children: [],
                },
              ],
            },
          ],
        },
        {
          content: `Now let me run the comprehensive test suite to establish a baseline and ensure that all existing functionality is working correctly before I start making changes. I want to run unit tests, integration tests, and end-to-end tests to get a complete picture of the current system stability. I'll also run performance benchmarks and accessibility audits to establish baseline metrics that I can compare against after implementing the new feature. This will help me ensure that the new functionality doesn't introduce any regressions or performance degradations.`,
          agent: 'system',
          postContent: `✅ Comprehensive testing completed successfully! All 147 tests are passing with 94% code coverage. Performance benchmarks show excellent results with average page load times under 2 seconds and smooth 60fps animations. Accessibility audit reveals WCAG AA compliance with perfect scores for keyboard navigation and screen reader compatibility. Memory usage is stable with no detected leaks. The codebase is in excellent condition and ready for the new feature implementation.`,
          children: [
            {
              content: `The test results look excellent, but let me also run the integration tests and end-to-end test scenarios to make sure the new feature will play well with the existing system in real-world usage scenarios. I want to test user workflows that span multiple components and features to ensure that adding this new functionality won't disrupt any existing user journeys. I'll also run load tests to understand how the system behaves under stress and whether the new feature might impact performance during peak usage periods.`,
              agent: 'system',
              postContent: `Integration and end-to-end testing completed with outstanding results! All user workflows function perfectly, with seamless integration between existing and new functionality. Load testing shows the system handles 10,000 concurrent users without degradation. Cross-browser testing confirms compatibility across all major browsers and devices. The new feature enhances existing workflows without disrupting any current functionality, and performance actually improves by 15% due to optimizations made during implementation.`,
              children: [],
            },
          ],
        },
      ],
    },
    {
      content: `Let me analyze this error thoroughly and provide a comprehensive solution. Error debugging requires a systematic approach to understand not just the immediate symptom, but the underlying cause and any related issues that might be lurking in the codebase. I'll start by examining the error stack trace, understanding the execution context, and then trace back through the code path to identify exactly where and why this error is occurring. I also want to check if this is an isolated incident or part of a broader pattern that might indicate a systemic issue that needs to be addressed at a higher level.`,
      agent: 'assistant',
      postContent: `Comprehensive error analysis and resolution completed successfully! I've identified and fixed the root cause, which was a complex interaction between session management, async operations, and error handling. The solution includes proper error boundaries, improved state management, robust session validation, and comprehensive logging for future debugging. I've also implemented preventive measures to catch similar issues before they reach production, including enhanced unit tests, integration tests, and monitoring alerts. The fix has been thoroughly tested across multiple scenarios and browsers to ensure reliability.`,
      children: [
        {
          content: `I'm seeing an interesting error pattern here that suggests this might not be an isolated issue. Let me search comprehensively through the codebase to understand if this is part of a broader systemic problem that needs to be addressed. I'll look for similar error patterns, common code structures that might be prone to the same issue, and any recent changes that might have introduced this behavior. I want to understand the full scope of the problem before implementing a fix, because if this is a pattern issue, we might need to address it in multiple places to prevent similar errors from occurring in the future.`,
          agent: 'file-picker',
          postContent: `Comprehensive pattern analysis completed! I've identified 7 files with similar error-prone patterns across the authentication, data fetching, and state management modules. This appears to be a systemic issue related to how async operations are handled when user sessions become invalid. The pattern affects user authentication flows, API request handling, and local storage operations. I've categorized the findings by severity and impact, with 3 critical issues requiring immediate attention and 4 moderate issues that should be addressed as part of this fix.`,
          children: [
            {
              content: `Looking deeper into these files, I can see they all share the same fundamental async operation pattern, which is interesting and concerning. The pattern seems to assume that certain async operations will always succeed, but they don't properly handle the cases where the underlying assumptions are violated. For example, they assume the user session is valid, that the network connection is stable, and that API responses will always be in the expected format. I suspect the core issue is in how we're handling Promise rejections and error propagation throughout the async call chain.`,
              agent: 'file-picker',
              postContent: `In-depth async pattern analysis completed! The investigation confirms that all affected files use a flawed async/await pattern that doesn't properly handle Promise rejections, especially in cases where external dependencies (network, authentication, storage) fail unexpectedly. I've identified the specific anti-patterns being used and developed a standardized approach for proper async error handling that can be applied consistently across all affected files. The solution includes proper try-catch blocks, timeout handling, and graceful degradation strategies.`,
              children: [],
            },
          ],
        },
        {
          content: `Now let me think through this error systematically, starting with the stack trace analysis. The error originates in userService.getProfile(), but I need to understand the complete execution context to identify the root cause. Let me trace through the code path: what triggers this function call, what state the application is in when it's called, what external dependencies it relies on, and what assumptions it makes about the current environment. I also want to understand the timing aspects - when does this error occur, is it related to specific user actions, and are there any race conditions or timing-sensitive operations that might be contributing to the problem.`,
          agent: 'thinker',
          postContent: `Systematic root cause analysis completed! The core issue is a race condition in the session management system where user authentication state can become inconsistent during async operations. Specifically, when a user's session expires while an API request is in flight, the application doesn't properly handle the transition from authenticated to unauthenticated state. This results in null pointer exceptions when subsequent operations try to access user data that's no longer available. The fix requires implementing proper session state synchronization and graceful handling of authentication state transitions.`,
          children: [
            {
              content: `Diving deeper into this issue, I can see it's more subtle than it initially appeared. The problem occurs when we assume the user session is valid throughout the entire async operation, but if the session expires mid-request, the user object becomes null unexpectedly. This is a classic race condition where the timing of session expiration relative to ongoing operations creates an inconsistent state. The issue is compounded by the fact that different parts of the application check session validity at different times, creating windows where the application state is inconsistent.`,
              agent: 'thinker',
              postContent: `Comprehensive race condition analysis and solution implementation completed! I've implemented a robust session management system that properly handles state transitions and prevents race conditions. The solution includes: atomic session state updates, proper synchronization between authentication checks and API operations, graceful handling of session expiration during ongoing requests, and comprehensive error recovery mechanisms. The fix has been tested extensively with various timing scenarios to ensure reliability under all conditions.`,
              children: [],
            },
          ],
        },
      ],
    },
    {
      content: `I'll refactor this code to significantly improve maintainability, readability, and overall code quality. The current implementation has grown organically over time and now exhibits several code smells that make it difficult to maintain, test, and extend. I can see opportunities to apply SOLID principles, improve separation of concerns, reduce complexity, and make the code more resilient to future changes. This refactoring will not only make the code cleaner but also improve performance, reduce bugs, and make it easier for your team to work with going forward. Let me start by analyzing the current structure and identifying the most impactful improvements we can make.`,
      agent: 'assistant',
      postContent: `Comprehensive refactoring completed successfully! The code has been transformed from a monolithic, tightly-coupled structure into a clean, modular, and highly maintainable architecture. The refactoring includes: separation of concerns with dedicated custom hooks, improved component composition, enhanced type safety with strict TypeScript, comprehensive error boundaries, optimized performance with proper memoization, improved accessibility, and extensive test coverage. The codebase now follows SOLID principles, uses modern React patterns, and is significantly easier to understand, test, and extend. Code complexity has been reduced by 60% while maintaining all existing functionality.`,
      children: [
        {
          content: `@reviewer: Before I start the refactoring process, let me conduct a comprehensive analysis of the current code structure to identify all the areas that need improvement and prioritize them based on impact and complexity. I need to understand the current architecture, identify code smells and anti-patterns, analyze dependencies and coupling, assess test coverage, and evaluate performance characteristics. This analysis will help me create a systematic refactoring plan that improves the code without introducing any regressions or breaking existing functionality.`,
          agent: 'system',
          postContent: `Comprehensive code structure analysis completed! I've identified 12 major areas for improvement, including: component decomposition opportunities, state management optimizations, custom hook extractions, type safety enhancements, performance optimizations, accessibility improvements, and test coverage gaps. The analysis reveals that while the current code functions correctly, it has accumulated significant technical debt that's impacting maintainability and development velocity. I've created a prioritized refactoring roadmap that addresses the most critical issues first while maintaining system stability throughout the process.`,
          children: [
            {
              content: `Looking at this component in detail, I can see it's grown to 247 lines and is clearly doing too much. It's handling authentication logic, managing complex UI state, fetching data from multiple APIs, handling form validation, managing side effects, and rendering a complex UI structure - all in a single component. This violates the Single Responsibility Principle and makes the component extremely difficult to test, debug, and maintain. I can see authentication logic mixed with presentation logic, data fetching intertwined with UI updates, and business logic scattered throughout the component. This is a textbook example of a "God Component" that needs to be broken down into smaller, focused pieces.`,
              agent: 'reviewer',
              postContent: `Detailed component decomposition analysis completed! I've identified 8 distinct responsibilities that can be extracted into separate, focused components and custom hooks. The refactoring plan includes: extracting authentication logic into a custom useAuth hook, separating data fetching into dedicated API hooks, creating reusable UI components for form elements, implementing proper error boundaries, adding loading state management, and creating a clean component hierarchy. Each extracted piece will have a single, clear responsibility and be fully testable in isolation.`,
              children: [
                {
                  content: `The useEffect in this component is particularly problematic - it has 3 different dependencies that trigger completely unrelated side effects. One dependency handles user authentication state changes, another manages data fetching when component props change, and the third deals with cleanup operations. This is a classic anti-pattern that makes the component unpredictable and hard to debug. When any of these dependencies change, all the side effects run, even if they're not related to the specific change that occurred. This can lead to unnecessary API calls, performance issues, and race conditions.`,
                  agent: 'reviewer',
                  postContent: `UseEffect separation and optimization completed! I've split the monolithic useEffect into 4 focused effects, each with clear, single-purpose dependencies. The authentication effect only responds to auth state changes, the data fetching effect is triggered by relevant prop changes, the cleanup effect handles component unmounting, and a new effect manages real-time updates. Each effect is now predictable, testable, and performant. I've also implemented proper cleanup functions and dependency arrays to prevent memory leaks and unnecessary re-renders.`,
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

  // After main content is streamed, set up and execute the subagent tree with status
  if (chatState.currentStreamingMessageId && selectedResponse.children) {
    const streamingMessage = chatState.messages.find(
      (m) => m.id === chatState.currentStreamingMessageId,
    )
    if (streamingMessage) {
      // Initialize tree structure
      streamingMessage.subagentTree = {
        id: createNodeId(streamingMessage.id, []),
        type: 'assistant',
        content: selectedResponse.content,
        children: [],
        postContent: selectedResponse.postContent,
        status: 'complete',
      }
      streamingMessage.subagentUIState = {
        expanded: new Set([createNodeId(streamingMessage.id, [])]), // Default assistant toggle to expanded
        focusNodeId: null,
        firstChildProgress: new Map(),
      }

      // Execute subagent tree with status updates
      await executeSubagentTree(selectedResponse, streamingMessage, [])
    }
  }
}

// Helper function to update node status during execution
async function updateNodeStatus(
  node: SubagentNode,
  status: 'pending' | 'running' | 'complete' | 'error',
  statusMessage: string = '',
): Promise<void> {
  node.status = status
  node.statusMessage = statusMessage

  if (status === 'running' && !node.startTime) {
    node.startTime = Date.now()
  } else if ((status === 'complete' || status === 'error') && !node.endTime) {
    node.endTime = Date.now()
  }

  updateContentLines()
  renderChat()
}

// Helper function to simulate node execution with status updates
async function simulateNodeExecution(
  node: SubagentNode,
  content: string,
  statusMessages: string[],
): Promise<void> {
  // Start with running status
  await updateNodeStatus(node, 'running', statusMessages[0] || 'Starting...')

  // Simulate work with status updates
  for (let i = 0; i < statusMessages.length; i++) {
    await updateNodeStatus(node, 'running', statusMessages[i])
    await new Promise((resolve) =>
      setTimeout(resolve, 500 + Math.random() * 1000),
    )
  }

  // Store the full content but don't stream it
  node.content = content

  // Mark as complete
  await updateNodeStatus(node, 'complete', 'Done')
  await new Promise((resolve) => setTimeout(resolve, 200))

  // Clear status message after completion
  node.statusMessage = ''
  updateContentLines()
  renderChat()
}

// Helper function to progressively build and execute subagent tree
async function executeSubagentTree(
  responseNode: any,
  message: ChatMessage,
  currentPath: number[],
): Promise<void> {
  if (!responseNode.children || responseNode.children.length === 0) {
    return
  }

  // Process children in parallel groups for realistic execution
  const children = responseNode.children

  for (let childIndex = 0; childIndex < children.length; childIndex++) {
    const child = children[childIndex]
    const childPath = [...currentPath, childIndex]

    // Create the child node in the tree
    const childNode: SubagentNode = {
      id: createNodeId(message.id, childPath),
      type: child.agent || 'unknown',
      content: child.content || '',
      children: [],
      postContent: child.postContent,
      status: 'pending',
      statusMessage: '',
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

    // Don't auto-expand during execution - keep view clean
    // message.subagentUIState!.expanded.add(childNode.id)

    // Trigger re-render to show the new subagent node
    updateContentLines()
    renderChat()

    // Execute this child with status updates
    const statusMessages = getStatusMessagesForAgent(child.agent)
    await simulateNodeExecution(childNode, child.content, statusMessages)

    // Process grandchildren if any
    if (child.children && child.children.length > 0) {
      await executeSubagentTree(child, message, childPath)
    }
  }
}

// Get realistic status messages for different agent types
function getStatusMessagesForAgent(agentType: string): string[] {
  const messages: { [key: string]: string[] } = {
    'file-picker': [
      'Scanning codebase...',
      'Analyzing file patterns...',
      'Finding relevant files...',
    ],
    reviewer: [
      'Analyzing code changes...',
      'Checking for issues...',
      'Validating patterns...',
    ],
    system: [
      'Running tests...',
      'Executing commands...',
      'Processing results...',
    ],
    thinker: [
      'Analyzing problem...',
      'Evaluating solutions...',
      'Formulating approach...',
    ],
  }

  return messages[agentType] || ['Processing...', 'Working...', 'Finalizing...']
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
    isFirstChild: boolean = false,
    isLastChild: boolean = false,
    parentPath: number[] = [],
  ): void {
    const nodeId = createNodeId(messageId, path)
    const hasChildren =
      (node.children && node.children.length > 0) || !!node.postContent
    const isExpanded = uiState.expanded.has(nodeId)

    // Check if any sibling at this level is expanded
    const hasSiblingExpanded =
      depth > 0 &&
      Array.from(uiState.expanded).some((expandedId) => {
        // Check if it's a sibling (same parent, different index)
        if (!expandedId.startsWith(`m:${messageId}/`)) return false
        const expandedPath = expandedId
          .substring(`m:${messageId}/`.length)
          .split('/')
          .map(Number)
        if (expandedPath.length !== path.length) return false
        if (parentPath.length > 0) {
          // Check same parent
          for (let i = 0; i < parentPath.length; i++) {
            if (expandedPath[i] !== parentPath[i]) return false
          }
        }
        // Different index at current level
        return expandedPath[path.length - 1] !== path[path.length - 1]
      })

    // Check if any descendant is expanded (for minimizing this node when child/grandchild is expanded)
    const hasDescendantExpanded = Array.from(uiState.expanded).some(
      (expandedId) => {
        if (!expandedId.startsWith(nodeId + '/')) return false
        // It's a descendant if it starts with our nodeId followed by '/'
        return true
      },
    )

    // Minimize if a sibling is expanded and this node is not, OR if this node has an expanded descendant
    const shouldMinimize =
      (hasSiblingExpanded && !isExpanded) ||
      (isExpanded && hasDescendantExpanded)

    // Add spacing above expanded nodes for better visual separation
    if (isExpanded && depth > 0) {
      lines.push('') // Empty line for visual spacing
    }

    // Progressive indentation: 4 spaces per level
    const agentName = node.type
      ? node.type.charAt(0).toUpperCase() + node.type.slice(1)
      : 'Agent'

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
    const statusText = formatNodeStatus(node)

    if (expandCollapseIndicator) {
      const toggleText = isToggleFocused
        ? `\x1b[7m${expandCollapseIndicator}\x1b[27m` // Highlighted toggle
        : expandCollapseIndicator // Regular toggle
      agentHeader = `${toggleText} ${bold(blue(agentName))} ${statusText}`
    } else {
      agentHeader = `${bold(blue(agentName))} ${statusText}`
    }

    // Add status message if present
    if (node.statusMessage) {
      agentHeader += ` ${gray(node.statusMessage)}`
    }

    // Add ellipsis on same line if minimized
    if (shouldMinimize) {
      agentHeader += ' ' + gray('...')
    }

    const headerPrefix = ' '.repeat(headerIndentSpaces)
    appendWrappedLine(
      lines,
      headerPrefix + agentHeader,
      stringWidth(headerPrefix),
      metrics,
    )

    // Content - Show content if expanded (even if not complete) and not minimized
    if (shouldMinimize) {
      // Skip content for minimized siblings (ellipsis already added to header)
    } else if (node.content && isExpanded) {
      const contentLines = node.content.split('\n')
      const contentIndentSpaces = 4 * depth
      const contentPrefix = ' '.repeat(contentIndentSpaces)

      // Show full content when expanded
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

      // Show postContent at the same indentation if expanded and node is complete
      if (
        node.postContent &&
        (node.status === 'complete' || node.status === undefined)
      ) {
        const postLines = node.postContent.split('\n')
        postLines.forEach((line) => {
          if (line.trim()) {
            appendWrappedLine(
              lines,
              contentPrefix + gray(line),
              stringWidth(contentPrefix),
              metrics,
            )
          }
        })
      }
    }

    // Render children if expanded
    if (hasChildren && isExpanded) {
      if (node.children && node.children.length > 0) {
        node.children.forEach((child, index) => {
          const isFirstChild = index === 0
          const isLastChild = index === node.children.length - 1
          renderNode(
            child,
            depth + 1,
            [...path, index],
            isFirstChild,
            isLastChild,
            path,
          )
        })
        // Add spacing after the last child
        lines.push('')
      }
    } else if (
      !shouldMinimize &&
      hasChildren &&
      !isExpanded &&
      node.postContent &&
      (node.status === 'complete' || node.status === undefined)
    ) {
      // Show full postContent for collapsed nodes when the node itself is complete (unless minimized)
      const postLines = node.postContent.split('\n')
      const postIndentSpaces = 4 * depth
      const postPrefix = ' '.repeat(postIndentSpaces)

      postLines.forEach((line) => {
        if (line.trim()) {
          appendWrappedLine(
            lines,
            postPrefix + gray(line),
            stringWidth(postPrefix),
            metrics,
          )
        }
      })
    }
  }

  // Check if the root assistant node is expanded (any node is expanded means root is expanded)
  const isRootExpanded = uiState.expanded.size > 0
  
  // Only render children if the root assistant node is expanded
  if (isRootExpanded && tree.children && tree.children.length > 0) {
    tree.children.forEach((child, index) => {
      const isFirstChild = index === 0
      const isLastChild = index === tree.children.length - 1
      renderNode(child, 1, [index], isFirstChild, isLastChild, [])
    })
  } else if (!isRootExpanded) {
    // Root is collapsed - show status or postContent
    if (tree.status && tree.status !== 'complete') {
      // Show status message while running
      const statusMsg = tree.statusMessage || 'Processing...'
      appendWrappedLine(lines, gray(statusMsg), 0, metrics)
    } else if (
      tree.postContent &&
      tree.status === 'complete' &&
      allChildrenComplete(tree)
    ) {
      // Show full postContent only when the parent AND all children are complete
      const postLines = tree.postContent.split('\n')
      postLines.forEach((line) => {
        if (line.trim()) {
          appendWrappedLine(lines, bold(green(line)), 0, metrics)
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

        // Auto-scroll to position the focused toggle near the top of the chat
        // This is reserved for tab/shift+tab navigation only
        scrollToToggle(targetNode.nodeId, targetMessage.id)
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

    // Find the focused toggle line index before changes
    const oldToggleIndex = findFocusedToggleLineIndex(chatState.contentLines)
    const screenRow = oldToggleIndex !== -1 ? oldToggleIndex - chatState.scrollOffset : -1

    if (isExpanded) {
      // Check if any descendants are currently streaming - if so, don't allow collapse
      if (isAnyDescendantStreaming(actualNodeId, focusedMessage.id)) {
        return true // Consume the key press but don't collapse
      }

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

    // Mark that user interacted during stream
    if (chatState.currentStreamingMessageId) {
      chatState.userInteractedDuringStream = true
    }

    updateContentLines()
    
    // Restore scroll to keep focused toggle at same screen position
    if (screenRow !== -1) {
      const newToggleIndex = findFocusedToggleLineIndex(chatState.contentLines)
      if (newToggleIndex !== -1) {
        const newScrollOffset = clampScroll(newToggleIndex - screenRow)
        chatState.scrollOffset = newScrollOffset
        chatState.userHasScrolled = true
      }
    }
    
    renderChat()
    return true
  }

  return false
}

function handleArrowToggleAction(key: any): boolean {
  // Handle left/right arrows for toggle actions
  if (!key || (key.name !== 'left' && key.name !== 'right')) return false

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

  const uiState = focusedMessage.subagentUIState

  // Handle toggle node focus - if focused on toggle, open/close that node
  if (uiState.focusNodeId && uiState.focusNodeId.endsWith('/toggle')) {
    const actualNodeId = uiState.focusNodeId.slice(0, -7) // Remove '/toggle'
    const isExpanded = uiState.expanded.has(actualNodeId)

    if (key.name === 'left') {
      // Left arrow: close (collapse) if expanded, otherwise navigate to previous toggle
      if (isExpanded) {
        // Find the focused toggle line index before changes
        const oldToggleIndex = findFocusedToggleLineIndex(chatState.contentLines)
        const screenRow = oldToggleIndex !== -1 ? oldToggleIndex - chatState.scrollOffset : -1
        
        // Check if any descendants are currently streaming - if so, don't allow collapse
        if (isAnyDescendantStreaming(actualNodeId, focusedMessage.id)) {
          return true // Consume the key press but don't collapse
        }

        uiState.expanded.delete(actualNodeId)
        // Remove all descendant nodes from expanded set
        const descendantPrefix = actualNodeId + '/'
        uiState.expanded.forEach((nodeId) => {
          if (nodeId.startsWith(descendantPrefix)) {
            uiState.expanded.delete(nodeId)
          }
        })
        updateContentLines()
        
        // Restore scroll to keep focused toggle at same screen position
        if (screenRow !== -1) {
          const newToggleIndex = findFocusedToggleLineIndex(chatState.contentLines)
          if (newToggleIndex !== -1) {
            const newScrollOffset = clampScroll(newToggleIndex - screenRow)
            chatState.scrollOffset = newScrollOffset
            chatState.userHasScrolled = true
          }
        }
        
        renderChat()
      } else {
        // Already closed, navigate to previous toggle (like Shift+Tab)
        return handleTabNavigation({ name: 'tab', shift: true })
      }
    } else if (key.name === 'right') {
      // Right arrow: open (expand) if closed, otherwise navigate to next toggle
      if (!isExpanded) {
        // Find the focused toggle line index before changes
        const oldToggleIndex = findFocusedToggleLineIndex(chatState.contentLines)
        const screenRow = oldToggleIndex !== -1 ? oldToggleIndex - chatState.scrollOffset : -1
        
        uiState.expanded.add(actualNodeId)
        updateContentLines()
        
        // Restore scroll to keep focused toggle at same screen position
        if (screenRow !== -1) {
          const newToggleIndex = findFocusedToggleLineIndex(chatState.contentLines)
          if (newToggleIndex !== -1) {
            const newScrollOffset = clampScroll(newToggleIndex - screenRow)
            chatState.scrollOffset = newScrollOffset
            chatState.userHasScrolled = true
          }
        }
        
        renderChat()
      } else {
        // Already open, navigate to next toggle (like Tab)
        return handleTabNavigation({ name: 'tab', shift: false })
      }
    }

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
      const childHasChildren =
        (child.children && child.children.length > 0) || !!child.postContent

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

function isAnyDescendantStreaming(nodeId: string, messageId: string): boolean {
  // Check if the current streaming node is this node or any of its descendants
  if (
    chatState.currentlyStreamingNodeId &&
    chatState.currentStreamingMessageId === messageId
  ) {
    // If the streaming node starts with our nodeId followed by '/', it's a descendant
    // Or if it's exactly our nodeId, we're streaming
    return (
      chatState.currentlyStreamingNodeId === nodeId ||
      chatState.currentlyStreamingNodeId.startsWith(nodeId + '/')
    )
  }
  return false
}

function autoFocusLatestToggle(): void {
  const latestMessageId = findLatestAssistantMessageWithChildren()
  if (!latestMessageId) return

  const message = chatState.messages.find((m) => m.id === latestMessageId)
  if (!message || !message.subagentTree) return

  // Initialize UI state if not exists
  if (!message.subagentUIState) {
    message.subagentUIState = {
      expanded: new Set([createNodeId(message.id, [])]), // Default assistant toggle to expanded
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
      status: 'pending',
      statusMessage: '',
    }
  }

  return convertNode(mockResponse)
}

// Helper function to check if all children in a node are complete
function allChildrenComplete(node: SubagentNode): boolean {
  if (!node.children || node.children.length === 0) {
    return true
  }

  for (const child of node.children) {
    // Child is not complete if it's still pending/running or if any of its children are not complete
    if (
      child.status &&
      child.status !== 'complete' &&
      child.status !== 'error'
    ) {
      return false
    }
    if (!allChildrenComplete(child)) {
      return false
    }
  }

  return true
}

function formatNodeStatus(node: SubagentNode): string {
  const now = Date.now()
  let timeStr = ''

  if (node.startTime) {
    if (node.endTime) {
      // Show completion time
      const duration = Math.round((node.endTime - node.startTime) / 1000)
      const minutes = Math.floor(duration / 60)
      const seconds = duration % 60
      timeStr =
        minutes > 0
          ? `${minutes}:${seconds.toString().padStart(2, '0')}`
          : `${seconds}s`
    } else {
      // Show elapsed time for running tasks
      const elapsed = Math.round((now - node.startTime) / 1000)
      const minutes = Math.floor(elapsed / 60)
      const seconds = elapsed % 60
      timeStr =
        minutes > 0
          ? `${minutes}:${seconds.toString().padStart(2, '0')}`
          : `${seconds}s`
    }
  }

  let statusText = ''
  switch (node.status) {
    case 'pending':
      statusText = gray('[Pending]')
      break
    case 'running':
      statusText = yellow(`[Running ${timeStr}]`)
      break
    case 'complete':
      statusText = green(`[OK ${timeStr}]`)
      break
    case 'error':
      statusText = red(`[Error ${timeStr}]`)
      break
    default:
      statusText = ''
  }

  return statusText
}

// Helper function to find the line index of the focused toggle
function findFocusedToggleLineIndex(contentLines: string[]): number {
  for (let i = 0; i < contentLines.length; i++) {
    const line = contentLines[i]
    // Look for the highlighted toggle pattern (\x1b[7m[+]\x1b[27m or \x1b[7m[-]\x1b[27m)
    if (line.includes('\x1b[7m[') && line.includes(']\x1b[27m')) {
      return i
    }
  }
  return -1
}
