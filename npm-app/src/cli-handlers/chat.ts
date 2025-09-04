import { green, yellow, cyan, bold, gray, blue, red, magenta } from 'picocolors'
import stringWidth from 'string-width'
import wrapAnsi from 'wrap-ansi'

import {
  ENTER_ALT_BUFFER,
  EXIT_ALT_BUFFER,
  CLEAR_SCREEN,
  HIDE_CURSOR,
  SHOW_CURSOR,
  MOVE_CURSOR,
} from '../utils/terminal'
import { logger } from '../utils/logger'

// Constants
const SIDE_PADDING = 2
const HEADER_TEXT = '💬 Codebuff Chat'
const STATUS_TEXT = 'Enter to send • ↑/↓ to scroll • ESC or Ctrl+C to exit'
const PLACEHOLDER_TEXT = 'Type your message...'
const WELCOME_MESSAGE =
  'Welcome to Codebuff Chat! Type your messages below and press Enter to send. This is a dedicated chat interface for conversations with your AI assistant.'
const QUEUE_ARROW = '↑'
const SEPARATOR_CHAR = '─'
const CURSOR_CHAR = '▋'
const CURSOR_BLINK_INTERVAL = 1000 // ms
const INACTIVITY_THRESHOLD = 2000 // ms

// Interfaces
interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  id: string
}

interface TerminalMetrics {
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
  lastInputTime: number
  cursorVisible: boolean
}

// State
let isInChatBuffer = false
let originalKeyHandlers: ((str: string, key: any) => void)[] = []
let blinkInterval: NodeJS.Timeout | null = null
let chatState: ChatState = {
  messages: [],
  currentInput: '',
  scrollOffset: 0,
  contentLines: [],
  isWaitingForResponse: false,
  messageQueue: [],
  userHasScrolled: false,
  lastInputTime: Date.now(),
  cursorVisible: true,
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

function wrapLine(line: string, terminalWidth: number): string[] {
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
    const cursor = chatState.cursorVisible ? bold(gray(CURSOR_CHAR)) : ' '
    const inputWithCursor = chatState.currentInput + cursor
    const wrappedInputLines = wrapLine(inputWithCursor, metrics.contentWidth)
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
    lastInputTime: Date.now(),
    cursorVisible: true,
  }
}

function startCursorBlink(): void {
  if (blinkInterval) {
    clearInterval(blinkInterval)
  }

  blinkInterval = setInterval(() => {
    const now = Date.now()
    const timeSinceLastInput = now - chatState.lastInputTime

    // Only blink if user hasn't typed recently
    if (timeSinceLastInput > INACTIVITY_THRESHOLD) {
      chatState.cursorVisible = !chatState.cursorVisible
      renderChat()
    } else {
      // Always show cursor when user is actively typing
      if (!chatState.cursorVisible) {
        chatState.cursorVisible = true
        renderChat()
      }
    }
  }, CURSOR_BLINK_INTERVAL)
}

function stopCursorBlink(): void {
  if (blinkInterval) {
    clearInterval(blinkInterval)
    blinkInterval = null
  }
}

function updateLastInputTime(): void {
  chatState.lastInputTime = Date.now()
  chatState.cursorVisible = true // Always show cursor immediately on input
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
  process.stdout.write(HIDE_CURSOR)

  isInChatBuffer = true

  // Add welcome message
  addMessage('assistant', WELCOME_MESSAGE, true)

  // Setup key handling
  setupChatKeyHandler(rl, onExit)

  // Start cursor blinking
  startCursorBlink()

  // Initial render
  updateContentLines()
  renderChat()
}

export function exitChatBuffer(rl: any) {
  if (!isInChatBuffer) {
    return
  }

  resetChatState()
  stopCursorBlink()

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
) {
  const wasAtBottom = shouldAutoScroll()

  chatState.messages.push({
    role,
    content,
    timestamp: Date.now(),
    id: `${role}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  })
  updateContentLines()

  // Reset scroll flag to enable auto-scroll when user was at bottom or when forced
  if (forceAutoScroll || wasAtBottom) {
    scrollToBottom()
  }

  renderChat()
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
      const timeStr = timeFormatter.format(new Date(message.timestamp))

      const prefix =
        message.role === 'assistant'
          ? `${bold(blue('Assistant'))} ${gray(`[${timeStr}]`)}: `
          : `${bold(green('You'))} ${gray(`[${timeStr}]`)}: `

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
    // Show blinking cursor in front of placeholder text
    const cursor = chatState.cursorVisible ? bold(gray(CURSOR_CHAR)) : ' '
    const placeholder = `${cursor}\x1b[2m${gray(PLACEHOLDER_TEXT)}\x1b[22m`
    process.stdout.write(MOVE_CURSOR(currentLine, 1))
    process.stdout.write(' '.repeat(metrics.sidePadding) + placeholder)
    currentLine++
  } else {
    // Show user input with cursor when typing
    const cursor = chatState.cursorVisible ? bold(gray(CURSOR_CHAR)) : ' '
    const inputWithCursor = chatState.currentInput + cursor
    const wrappedInputLines = wrapLine(inputWithCursor, metrics.contentWidth)

    wrappedInputLines.forEach((line, index) => {
      process.stdout.write(MOVE_CURSOR(currentLine, 1))
      process.stdout.write(' '.repeat(metrics.sidePadding) + line)
      currentLine++
    })
  }

  // Status line with side padding - position at very bottom of screen
  process.stdout.write(MOVE_CURSOR(metrics.height, 1))
  process.stdout.write(' '.repeat(metrics.sidePadding) + gray(STATUS_TEXT))

  process.stdout.write(HIDE_CURSOR)
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
      updateLastInputTime()
      renderChat()
      return
    }

    // Handle backspace
    if (key && key.name === 'backspace') {
      chatState.currentInput = chatState.currentInput.slice(0, -1)
      updateLastInputTime()
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
      updateLastInputTime()
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
    // TODO: Replace with actual client integration
    const response = await simulateAssistantResponse(message)
    addMessage('assistant', response, true)
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

// Dummy function to simulate AI response - replace with actual client integration later
async function simulateAssistantResponse(message: string): Promise<string> {
  // Simulate processing delay
  await new Promise((resolve) =>
    setTimeout(resolve, 1000 + Math.random() * 2000),
  )

  // Generate a dummy response based on the message
  const responses = [
    `I understand you said: "${message}". I'm ready to help with your coding tasks!`,
    `Thanks for your message: "${message}". How can I assist you with your project?`,
    `Got it! You mentioned: "${message}". What would you like me to work on?`,
    `I see you're asking about: "${message}". I can help you implement this feature.`,
    `Regarding "${message}" - I can definitely help with that. What specific changes do you need?`,
  ]

  return responses[Math.floor(Math.random() * responses.length)]
}

// Cleanup function to ensure we exit chat buffer on process termination
export function cleanupChatBuffer() {
  if (isInChatBuffer) {
    stopCursorBlink()
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
