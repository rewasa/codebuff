import { green, yellow, cyan, bold, gray, blue, red, magenta } from 'picocolors'
import stringWidth from 'string-width'
import wrapAnsi from 'wrap-ansi'

import { Client } from '../client'
import {
  ENTER_ALT_BUFFER,
  EXIT_ALT_BUFFER,
  CLEAR_SCREEN,
  HIDE_CURSOR,
  SHOW_CURSOR,
  MOVE_CURSOR,
} from '../utils/terminal'
import { Spinner } from '../utils/spinner'
import { logger } from '../utils/logger'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  id: string
}

let isInChatBuffer = false
let originalKeyHandlers: ((str: string, key: any) => void)[] = []
let chatMessages: ChatMessage[] = []
let currentInput = ''
let scrollOffset = 0
let contentLines: string[] = []
let isWaitingForResponse = false
let messageQueue: string[] = []
let userHasScrolled = false

/**
 * Wrap a line to fit within terminal width using robust npm packages
 */
function wrapLine(line: string, terminalWidth: number): string[] {
  if (!line) return ['']
  if (stringWidth(line) <= terminalWidth) {
    return [line]
  }
  const wrapped = wrapAnsi(line, terminalWidth, { hard: true })
  return wrapped.split('\n')
}

export function isInChatMode(): boolean {
  return isInChatBuffer
}

export function enterChatBuffer(rl: any, onExit: () => void) {
  if (isInChatBuffer) {
    console.log(yellow('Already in chat mode!'))
    return
  }

  // Reset state
  chatMessages = []
  currentInput = ''
  scrollOffset = 0
  isWaitingForResponse = false
  messageQueue = []
  userHasScrolled = false

  // Enter alternate screen buffer
  process.stdout.write(ENTER_ALT_BUFFER)
  process.stdout.write(CLEAR_SCREEN)
  process.stdout.write(MOVE_CURSOR(1, 1))
  process.stdout.write(HIDE_CURSOR)

  isInChatBuffer = true

  // Add welcome message
  addMessage(
    'assistant',
    'Welcome to Codebuff Chat! Type your messages below and press Enter to send. This is a dedicated chat interface for conversations with your AI assistant.',
    true,
  )

  // Setup key handling
  setupChatKeyHandler(rl, onExit)

  // Initial render
  updateContentLines()
  renderChat()
}

export function exitChatBuffer(rl: any) {
  if (!isInChatBuffer) {
    return
  }

  // Reset state
  chatMessages = []
  currentInput = ''
  scrollOffset = 0
  isWaitingForResponse = false
  messageQueue = []
  userHasScrolled = false

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

function isUserAtBottom(): boolean {
  const terminalHeight = process.stdout.rows || 24
  const maxContentLines = terminalHeight - 4
  const maxScrollOffset = Math.max(0, contentLines.length - maxContentLines)
  return !userHasScrolled || scrollOffset >= maxScrollOffset
}

function addMessage(
  role: 'user' | 'assistant',
  content: string,
  forceAutoScroll: boolean = false,
) {
  const wasAtBottom = isUserAtBottom()

  chatMessages.push({
    role,
    content,
    timestamp: Date.now(),
    id: `${role}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  })
  updateContentLines()

  // Reset scroll flag to enable auto-scroll when user was at bottom or when forced
  if (forceAutoScroll || wasAtBottom) {
    userHasScrolled = false
  }

  renderChat()
}

function updateContentLines() {
  const terminalWidth = process.stdout.columns || 80
  const sidePadding = 2
  const contentWidth = terminalWidth - sidePadding * 2
  const lines: string[] = []

  // Add top padding
  lines.push('')

  // Add header with side padding
  const headerText = '💬 Codebuff Chat'
  lines.push(' '.repeat(sidePadding) + bold(cyan(headerText)))
  lines.push(' '.repeat(sidePadding) + gray('─'.repeat(contentWidth)))
  lines.push('')

  if (chatMessages.length === 0) {
    lines.push(
      ' '.repeat(sidePadding) +
        gray('Start typing to begin your conversation...'),
    )
  } else {
    // Add chat messages with side padding
    chatMessages.forEach((message, index) => {
      const timeStr = new Date(message.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })

      const prefix =
        message.role === 'assistant'
          ? `${bold(blue('Assistant'))} ${gray(`[${timeStr}]`)}: `
          : `${bold(green('You'))} ${gray(`[${timeStr}]`)}: `

      const contentLines = message.content.split('\n')
      contentLines.forEach((line, lineIndex) => {
        if (lineIndex === 0) {
          const fullLine = prefix + line
          const wrappedLines = wrapLine(fullLine, contentWidth)
          wrappedLines.forEach((wrappedLine) => {
            lines.push(' '.repeat(sidePadding) + wrappedLine)
          })
        } else {
          // Indent continuation lines to align with message content
          const indentSize = stringWidth(prefix)
          const indentedLine = ' '.repeat(indentSize) + line
          const wrappedLines = wrapLine(indentedLine, contentWidth)
          wrappedLines.forEach((wrappedLine) => {
            lines.push(' '.repeat(sidePadding) + wrappedLine)
          })
        }
      })

      if (index < chatMessages.length - 1) {
        lines.push('') // Add spacing between messages
      }
    })
  }

  // Add some padding at the end
  lines.push('')
  lines.push('')

  contentLines = lines
}

function renderChat() {
  // Clear screen and move cursor to top
  process.stdout.write(CLEAR_SCREEN)
  process.stdout.write(MOVE_CURSOR(1, 1))

  const terminalHeight = process.stdout.rows || 24
  const terminalWidth = process.stdout.columns || 80
  const inputAreaHeight = 4 // Space for input area and status
  const maxContentLines = terminalHeight - inputAreaHeight

  // Auto-scroll to bottom to show latest messages only if user hasn't manually scrolled
  const totalLines = contentLines.length
  const maxScrollOffset = Math.max(0, totalLines - maxContentLines)

  // Only auto-scroll if user hasn't manually scrolled
  if (!userHasScrolled) {
    scrollOffset = maxScrollOffset
  }
  // If user has scrolled but is already at the bottom, allow auto-scroll for new content
  else if (scrollOffset >= maxScrollOffset) {
    scrollOffset = maxScrollOffset
    // Don't reset userHasScrolled flag here - let user keep control
  }

  // Display chat content
  const visibleLines = contentLines.slice(
    scrollOffset,
    scrollOffset + maxContentLines,
  )
  process.stdout.write(visibleLines.join('\n'))

  // Fill remaining space
  const remainingLines = maxContentLines - visibleLines.length
  if (remainingLines > 0) {
    process.stdout.write('\n'.repeat(remainingLines))
  }

  // Display queued message preview above separator if there are queued messages
  const sidePadding = 2
  const contentWidth = terminalWidth - sidePadding * 2

  if (messageQueue.length > 0) {
    const lastQueuedMessage = messageQueue[messageQueue.length - 1]
    const queueCount =
      messageQueue.length > 1 ? ` (+${messageQueue.length - 1})` : ''
    const maxPreviewLength = contentWidth - 4 - stringWidth(queueCount) // Account for "↑ " and " ↑" and queue count

    let messagePreview = lastQueuedMessage
    let needsEllipsis = false

    if (stringWidth(lastQueuedMessage) > maxPreviewLength) {
      // Truncate and add ellipsis
      const availableLength = maxPreviewLength - 6 // Account for "..." before and after
      const halfLength = Math.floor(availableLength / 2)
      messagePreview = `...${lastQueuedMessage.slice(-halfLength)}`
      needsEllipsis = true
    }

    const previewText = needsEllipsis
      ? `↑ ...${messagePreview}...${queueCount} ↑`
      : `↑ ${messagePreview}${queueCount} ↑`

    process.stdout.write(`\n${' '.repeat(sidePadding)}${gray(previewText)}`)
  }

  process.stdout.write(
    '\n' + ' '.repeat(sidePadding) + gray('─'.repeat(contentWidth)),
  )
  // Show placeholder or user input
  if (currentInput.length === 0) {
    // Show dimmed placeholder when no input
    const placeholder = `\x1b[2m${gray('Type your message...')}\x1b[22m`
    process.stdout.write(`\n${' '.repeat(sidePadding)}${placeholder}`)
  } else {
    // Show user input with cursor when typing
    const cursor = gray('|')
    const inputWithCursor = currentInput + cursor
    const wrappedInputLines = wrapLine(inputWithCursor, contentWidth)

    wrappedInputLines.forEach((line, index) => {
      process.stdout.write(`\n${' '.repeat(sidePadding)}${line}`)
    })
  }

  // Status line with side padding
  let statusText = gray('Enter to send • ↑/↓ to scroll • ESC or Ctrl+C to exit')

  process.stdout.write(`\n${' '.repeat(sidePadding)}${statusText}`)

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
      const message = currentInput.trim()
      if (message) {
        if (isWaitingForResponse) {
          // Queue the message if we're waiting for a response
          messageQueue.push(message)
        } else {
          // Send immediately if not waiting
          sendMessage(message)
        }
        currentInput = ''
      }
      renderChat()
      return
    }

    // Handle backspace
    if (key && key.name === 'backspace') {
      currentInput = currentInput.slice(0, -1)
      renderChat()
      return
    }

    // Handle scrolling
    if (key && key.name === 'up' && !key.meta && !key.ctrl) {
      const newOffset = Math.max(0, scrollOffset - 1)
      if (newOffset !== scrollOffset) {
        scrollOffset = newOffset
        userHasScrolled = true // Mark that user has manually scrolled
        renderChat()
      }
      return
    }

    if (key && key.name === 'down' && !key.meta && !key.ctrl) {
      const terminalHeight = process.stdout.rows || 24
      const maxContentLines = terminalHeight - 4
      const maxScrollOffset = Math.max(0, contentLines.length - maxContentLines)
      const newOffset = Math.min(maxScrollOffset, scrollOffset + 1)
      if (newOffset !== scrollOffset) {
        scrollOffset = newOffset
        userHasScrolled = true // Mark that user has manually scrolled

        // If user scrolled to the very bottom, reset the flag so new messages auto-scroll
        if (scrollOffset === maxScrollOffset) {
          userHasScrolled = false
        }

        renderChat()
      }
      return
    }

    // Handle page up/down
    if (key && key.name === 'pageup') {
      const terminalHeight = process.stdout.rows || 24
      const maxContentLines = terminalHeight - 4
      const newOffset = Math.max(0, scrollOffset - maxContentLines)
      if (newOffset !== scrollOffset) {
        scrollOffset = newOffset
        userHasScrolled = true // Mark that user has manually scrolled
        renderChat()
      }
      return
    }

    if (key && key.name === 'pagedown') {
      const terminalHeight = process.stdout.rows || 24
      const maxContentLines = terminalHeight - 4
      const maxScrollOffset = Math.max(0, contentLines.length - maxContentLines)
      const newOffset = Math.min(
        maxScrollOffset,
        scrollOffset + maxContentLines,
      )
      if (newOffset !== scrollOffset) {
        scrollOffset = newOffset
        userHasScrolled = true // Mark that user has manually scrolled

        // If user scrolled to the very bottom, reset the flag so new messages auto-scroll
        if (scrollOffset === maxScrollOffset) {
          userHasScrolled = false
        }

        renderChat()
      }
      return
    }

    // Add printable characters to input
    if (str && str.length === 1 && str.charCodeAt(0) >= 32) {
      currentInput += str
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

  isWaitingForResponse = true
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
    isWaitingForResponse = false
    renderChat()

    // Process queued messages
    await processMessageQueue()
  }
}

// Process queued messages sequentially
async function processMessageQueue() {
  while (messageQueue.length > 0 && !isWaitingForResponse) {
    const nextMessage = messageQueue.shift()
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
