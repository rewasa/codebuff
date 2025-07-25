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
  isQueued?: boolean
}> = []
let chatInput = ''
let messageQueue: string[] = [] // Queue for messages sent during streaming
let mockStreamingContent = ''
let mockStreamingIndex = 0
let mockStreamingTimer: NodeJS.Timeout | null = null
let eventLoopKeepAlive: NodeJS.Timeout | null = null
let isStreaming = false
let streamingUpdateBuffer: string = ''
let streamingUpdateTimer: NodeJS.Timeout | null = null
let userHasManuallyScrolled = false
let needsFullRender = false

// Fake cursor state
let fakeCursorVisible = true
let fakeCursorTimer: NodeJS.Timeout | null = null
let previousInputHeight = 2 // Track previous input area height for proper clearing
let lastInputTime = 0 // Track when user last typed
let inputPauseTimer: NodeJS.Timeout | null = null
const INPUT_PAUSE_DELAY = 3000 // 3 seconds before starting to blink

// Performance optimization: cache wrapped content
let wrappedContentCache: string[] = []
let lastTerminalWidth = 0
let lastContentHash = ''

// Track what was last rendered to enable selective updates
let lastRenderedContent: string[] = []
let lastScrollOffset = -1

// Batched rendering system to reduce stdout writes
let renderBuffer: string = ''
let pendingRender: NodeJS.Timeout | null = null
const RENDER_DEBOUNCE_MS = 4 // Minimal debounce for responsive input

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
  messageQueue = []
  cleanupTimers()
  isStreaming = false
  streamingUpdateBuffer = ''
  userHasManuallyScrolled = false // Reset performance caches
  wrappedContentCache = []
  lastTerminalWidth = 0
  lastContentHash = ''

  // Reset input height tracking
  previousInputHeight = 2

  // Stop fake cursor
  stopFakeCursorBlinking()

  // Enter alternate screen buffer
  process.stdout.write(ENTER_ALT_BUFFER)
  process.stdout.write(CLEAR_SCREEN)
  process.stdout.write(MOVE_CURSOR(1, 1)) // Ensure cursor starts at top-left

  isInSubagentBuffer = true
  needsFullRender = true // Force full render on entry

  // Display subagent content
  updateSubagentContent() // Set up key handler for ESC to exit
  setupSubagentKeyHandler(rl, onExit)

  // Initialize cursor (visible, no blinking until pause)
  fakeCursorVisible = true
  lastInputTime = Date.now()
  onUserInput() // Start the pause timer
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
  messageQueue = []
  cleanupTimers()
  isStreaming = false
  streamingUpdateBuffer = ''
  userHasManuallyScrolled = false // Reset performance caches
  wrappedContentCache = []
  lastTerminalWidth = 0
  lastContentHash = ''

  // Reset input height tracking
  previousInputHeight = 2

  // Stop fake cursor
  stopFakeCursorBlinking()

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
  const terminalWidth = process.stdout.columns || 80

  // Create content hash for cache invalidation
  const contentHash = `${fullContent.length}-${chatMessages.length}-${chatMessages.map((m) => m.content.length).join(',')}`

  // Use cached content if nothing changed
  if (
    contentHash === lastContentHash &&
    terminalWidth === lastTerminalWidth &&
    wrappedContentCache.length > 0
  ) {
    contentLines = wrappedContentCache
    renderSubagentContent()
    return
  }

  // Check if content has changed
  if (fullContent.length === lastContentLength && chatMessages.length === 0) {
    return // No new content and no chat messages
  }
  lastContentLength = fullContent.length

  // Build content efficiently
  const wrappedLines = buildWrappedContent(
    agentData,
    fullContent,
    terminalWidth
  )

  // Cache the result
  wrappedContentCache = wrappedLines
  lastTerminalWidth = terminalWidth
  lastContentHash = contentHash
  contentLines = wrappedLines

  // Only reset scroll when entering a new subagent view (not when chat updates)
  if (chatMessages.length === 0) {
    scrollOffset = 0
  }
  renderSubagentContent()
}

function buildWrappedContent(
  agentData: any,
  fullContent: string,
  terminalWidth: number
): string[] {
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
  for (const line of contentBodyLines) {
    if (line === '') {
      wrappedLines.push('') // Preserve empty lines
    } else {
      wrappedLines.push(...wrapLine(line, terminalWidth))
    }
  }

  // Add chat messages to the content if any exist
  if (chatMessages.length > 0) {
    wrappedLines.push('') // Add spacing before chat

    chatMessages.forEach((msg, index) => {
      const content = msg.content || ''
      const timestamp = new Date(msg.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
      const roleLabel = msg.role === 'user' ? 'You' : 'Agent'
      const roleInfo = `  ${roleLabel} • ${timestamp}`

      // Create separator line with role and timestamp on the right
      const separatorChar = '─'
      const roleInfoWidth = stringWidth(roleInfo)
      const separatorLength = Math.max(0, terminalWidth - roleInfoWidth)
      const separatorLine =
        gray(separatorChar.repeat(separatorLength)) +
        '  ' +
        (msg.role === 'user' ? green(roleLabel) : cyan(roleLabel)) +
        gray(' • ') +
        gray(timestamp)

      wrappedLines.push(separatorLine)
      wrappedLines.push('') // Add spacing after separator

      // Add message content without prefix
      if (content) {
        // Wrap long messages
        const maxWidth = terminalWidth - 2 // Small margin
        if (content.length > maxWidth) {
          const wrapped = wrapLine(content, maxWidth)
          wrapped.forEach((line) => {
            wrappedLines.push(line)
          })
        } else {
          wrappedLines.push(content)
        }
      }

      // Add spacing after message (except for last message)
      if (index < chatMessages.length - 1) {
        wrappedLines.push('')
      }
    })
  }

  // Ensure we end with an empty line for spacing
  if (wrappedLines.length > 0 && wrappedLines[wrappedLines.length - 1] !== '') {
    wrappedLines.push('')
  }

  return wrappedLines
}

function cleanupTimers() {
  if (mockStreamingTimer) {
    clearInterval(mockStreamingTimer)
    mockStreamingTimer = null
  }
  if (eventLoopKeepAlive) {
    clearInterval(eventLoopKeepAlive)
    eventLoopKeepAlive = null
  }
  if (streamingUpdateTimer) {
    clearTimeout(streamingUpdateTimer)
    streamingUpdateTimer = null
  }
  if (pendingRender) {
    clearTimeout(pendingRender)
    pendingRender = null
  }
  if (fakeCursorTimer) {
    clearTimeout(fakeCursorTimer)
    fakeCursorTimer = null
  }
  if (inputPauseTimer) {
    clearTimeout(inputPauseTimer)
    inputPauseTimer = null
  }
}

function startMockStreaming(userMessage: string) {
  // Mock responses based on user input - cut in half for testing
  const responses = [
    `I understand you're asking about "${userMessage}". Let me think through this step by step.

First, I need to analyze the current codebase structure to understand how this relates to the existing implementation. Looking at the patterns I can see, there are several approaches we could take:

\`\`\`typescript
// New module structure
export interface ${userMessage.replace(/\s+/g, '')}Config {
  enabled: boolean
  options: Record<string, any>
}

export class ${userMessage.replace(/\s+/g, '')}Manager {
  constructor(private config: ${userMessage.replace(/\s+/g, '')}Config) {}

  async process(): Promise<void> {
    // Implementation here
  }
}
\`\`\`

This approach provides a clean interface and makes the functionality easily extensible. What do you think about this direction?`,
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

  isStreaming = true
  streamingUpdateBuffer = ''

  // Keep cursor blinking during streaming - no need to stop it

  // Keep event loop active during streaming
  eventLoopKeepAlive = setInterval(() => {
    // Empty interval to keep event loop active
  }, 10)

  // Start streaming simulation with optimized string building
  mockStreamingTimer = setInterval(() => {
    if (mockStreamingIndex < mockStreamingContent.length) {
      const currentMessage = chatMessages[chatMessages.length - 1]
      if (currentMessage && currentMessage.role === 'assistant') {
        // Optimize: build content in chunks instead of character by character
        const chunkSize = Math.min(
          3,
          mockStreamingContent.length - mockStreamingIndex
        )
        const chunk = mockStreamingContent.slice(
          mockStreamingIndex,
          mockStreamingIndex + chunkSize
        )
        currentMessage.content += chunk
        streamingUpdateBuffer += chunk
        mockStreamingIndex += chunkSize

        // Buffer updates and render less frequently during streaming
        scheduleStreamingUpdate()
      }
    } else {
      // Streaming complete
      isStreaming = false
      cleanupTimers()

      // Final update with complete content
      updateSubagentContent() // Reset cursor state after streaming
      onUserInput()

      // Only auto-scroll to bottom if user hasn't manually scrolled away
      if (!userHasManuallyScrolled) {
        scrollToBottom()
      }

      // Process queued messages after streaming completes
      processMessageQueue()
    }
  }, 50) // Increased delay since we're processing chunks
}

function isScrolledToBottom(): boolean {
  const { maxScrollOffset } = getLayoutDimensions()
  // Consider "at bottom" if within 2 lines of the actual bottom
  return scrollOffset >= maxScrollOffset - 2
}

function scrollToBottom() {
  const { maxScrollOffset } = getLayoutDimensions()
  // Set scroll to bottom
  scrollOffset = maxScrollOffset
}

function processMessageQueue() {
  if (messageQueue.length === 0) return

  // Process the first queued message
  const queuedMessage = messageQueue.shift()!

  // Add to chat messages with isQueued flag
  chatMessages.push({
    role: 'user',
    content: queuedMessage,
    timestamp: Date.now(),
    isQueued: true,
  })

  // Update content but don't auto-scroll for queued messages
  updateSubagentContent()

  // Start streaming response for the queued message
  setTimeout(() => startMockStreaming(queuedMessage), 500)
}
function getCursorBlinkTiming() {
  if (isStreaming) {
    // During streaming: slower blink with 2:1 ratio (visible:invisible)
    return {
      visibleDuration: 1200,
      invisibleDuration: 600,
    }
  } else {
    // Normal blinking: faster blink with 2:1 ratio (visible:invisible)
    return {
      visibleDuration: 800,
      invisibleDuration: 400,
    }
  }
}
function startFakeCursorBlinking() {
  if (fakeCursorTimer) {
    clearTimeout(fakeCursorTimer)
  }

  fakeCursorVisible = true

  function scheduleNextBlink() {
    const timing = getCursorBlinkTiming()
    const nextDelay = fakeCursorVisible
      ? timing.visibleDuration
      : timing.invisibleDuration

    fakeCursorTimer = setTimeout(() => {
      fakeCursorVisible = !fakeCursorVisible
      renderChatInputOnly({ immediate: true })
      scheduleNextBlink()
    }, nextDelay)
  }

  scheduleNextBlink()
}

function onUserInput() {
  lastInputTime = Date.now()

  // Stop current blinking and show cursor
  stopFakeCursorBlinking()
  fakeCursorVisible = true

  // Clear any existing pause timer
  if (inputPauseTimer) {
    clearTimeout(inputPauseTimer)
  }

  // Start new pause timer
  inputPauseTimer = setTimeout(() => {
    // Only start blinking if user hasn't typed recently
    if (Date.now() - lastInputTime >= INPUT_PAUSE_DELAY) {
      startFakeCursorBlinking()
    }
  }, INPUT_PAUSE_DELAY)

  // Render immediately to show cursor
  renderChatInputOnly({ immediate: true })
}

function stopFakeCursorBlinking() {
  if (fakeCursorTimer) {
    clearTimeout(fakeCursorTimer)
    fakeCursorTimer = null
  }
  fakeCursorVisible = true // Always show when not blinking
}
function buildChatInputBuffer(
  terminalWidth: number,
  terminalHeight: number
): string {
  const layout = getLayoutDimensions()
  const { chatInputHeight, inputLines } = layout
  const separatorRow = terminalHeight - chatInputHeight
  const isAtBottom = isScrolledToBottom()

  let inputBuffer = ''

  // Always hide the real cursor
  inputBuffer += '\x1b[?25l'

  // Clear the entire input area, including any previous larger area
  const maxHeightToClear = Math.max(chatInputHeight, previousInputHeight)
  const startClearRow = terminalHeight - maxHeightToClear

  for (let i = 0; i < maxHeightToClear; i++) {
    const row = startClearRow + i
    inputBuffer += `\x1b[${row};1H\x1b[K`
  }

  // Update previous height for next render
  previousInputHeight = chatInputHeight // Remove queued message display from UI

  // Build separator line
  inputBuffer += `\x1b[${separatorRow};1H`
  if (isAtBottom) {
    const separatorLine = gray('─'.repeat(terminalWidth))
    inputBuffer += separatorLine
  } else {
    const indicator = ' ↓ more below ↓ '
    const indicatorWidth = stringWidth(indicator)
    const separatorLength = Math.max(0, terminalWidth - indicatorWidth)
    const leftSeparator = '─'.repeat(Math.floor(separatorLength / 2))
    const rightSeparator = '─'.repeat(Math.ceil(separatorLength / 2))
    const separatorLine =
      gray(leftSeparator) + yellow(indicator) + gray(rightSeparator)
    inputBuffer += separatorLine
  }

  // Build input with fake cursor
  const inputPrefix = yellow('> ')
  const inputPrefixWidth = stringWidth(inputPrefix)
  const maxInputWidth = terminalWidth - inputPrefixWidth - 1 // Reserve space for fake cursor

  // Add fake cursor to the input
  const fakeCursor = fakeCursorVisible ? yellow('▌') : ' '
  const inputWithCursor = chatInput + fakeCursor

  // Handle multi-line wrapping
  const wrappedLines = wrapLine(inputWithCursor, maxInputWidth)
  const startRow = separatorRow + 1

  // Render each line of wrapped input
  wrappedLines.forEach((line, index) => {
    const row = startRow + index
    inputBuffer += `\x1b[${row};1H`

    if (index === 0) {
      // First line gets the prefix
      inputBuffer += `${inputPrefix}${line}`
    } else {
      // Continuation lines get indentation
      const indent = ' '.repeat(inputPrefixWidth)
      inputBuffer += `${indent}${line}`
    }
  })

  return inputBuffer
}

function flushRenderBuffer() {
  if (renderBuffer) {
    process.stdout.write(renderBuffer)
    renderBuffer = ''
  }
  pendingRender = null
}

function scheduleRender() {
  if (pendingRender) return
  pendingRender = setTimeout(flushRenderBuffer, RENDER_DEBOUNCE_MS)
}

function addToRenderBuffer(content: string) {
  renderBuffer += content
  scheduleRender()
}

function immediateRender(content: string) {
  if (pendingRender) {
    clearTimeout(pendingRender)
    pendingRender = null
  }
  process.stdout.write(renderBuffer + content)
  renderBuffer = ''
}

function getLayoutDimensions() {
  const terminalHeight = process.stdout.rows || 24
  const terminalWidth = process.stdout.columns || 80
  const bannerHeight = 0

  // Calculate dynamic input height based on wrapped input
  const inputPrefix = '> '
  const inputPrefixWidth = stringWidth(inputPrefix)
  const maxInputWidth = terminalWidth - inputPrefixWidth - 1 // Reserve space for fake cursor
  const fakeCursor = fakeCursorVisible ? '▌' : ' '
  const inputWithCursor = chatInput + fakeCursor
  const wrappedLines = wrapLine(inputWithCursor, maxInputWidth)
  const chatInputHeight = Math.max(3, wrappedLines.length + 2) // +2 for separator and help hint

  const maxLines = terminalHeight - bannerHeight - chatInputHeight
  const maxScrollOffset = Math.max(0, contentLines.length - maxLines)

  return {
    terminalHeight,
    terminalWidth,
    bannerHeight,
    chatInputHeight,
    maxLines,
    maxScrollOffset,
    inputLines: wrappedLines.length,
  }
}
function scheduleStreamingUpdate() {
  if (streamingUpdateTimer) return // Already scheduled

  streamingUpdateTimer = setTimeout(() => {
    streamingUpdateTimer = null

    // Check if user is at bottom before updating content
    const wasAtBottom = isScrolledToBottom()

    // Update content with buffered changes
    updateSubagentContent()

    // Only auto-scroll if user was already at bottom
    if (wasAtBottom) {
      scrollToBottom()
    }

    streamingUpdateBuffer = ''
  }, 100) // Update every 100ms during streaming instead of every character
}

function renderSubagentContent() {
  const layout = getLayoutDimensions()
  const { terminalHeight, terminalWidth, maxLines } = layout
  const visibleLines = contentLines.slice(scrollOffset, scrollOffset + maxLines)

  // Force full render on first load or terminal resize
  if (needsFullRender || terminalWidth !== (process.stdout.columns || 80)) {
    renderFullScreen(layout, visibleLines)
    needsFullRender = false
    lastRenderedContent = [...visibleLines]
    lastScrollOffset = scrollOffset
    return
  }

  // Selective rendering based on what changed
  if (scrollOffset !== lastScrollOffset) {
    renderContentArea(layout, visibleLines)
    lastRenderedContent = [...visibleLines]
    lastScrollOffset = scrollOffset
    // Update chat input to show correct scroll indicator and maintain cursor position
    renderChatInputOnly()
  } else if (
    JSON.stringify(visibleLines) !== JSON.stringify(lastRenderedContent)
  ) {
    // Content changed (streaming updates) - only update content, don't re-render chat input
    renderContentArea(layout, visibleLines)
    lastRenderedContent = [...visibleLines]
    // Don't re-render chat input during streaming to avoid separator flashing
  }
}

function renderFullScreen(layout: any, visibleLines: string[]) {
  const { terminalHeight, terminalWidth } = layout

  // Build entire screen in memory first, then write once
  let screenBuffer = ''

  // Clear screen and move cursor to top
  screenBuffer += CLEAR_SCREEN + '\x1b[1;1H'

  // Render content area (no banner)
  const contentStartRow = 1
  const contentEndRow = terminalHeight - 4

  for (let row = contentStartRow; row <= contentEndRow; row++) {
    const contentIndex = row - contentStartRow
    screenBuffer += `\x1b[${row};1H\x1b[K`

    if (contentIndex < visibleLines.length) {
      screenBuffer += visibleLines[contentIndex]
    }
  }

  // Render chat input and ensure cursor stays there
  screenBuffer += buildChatInputBuffer(terminalWidth, terminalHeight)

  // Add instructions at bottom right only when input is empty
  if (chatInput.trim() === '') {
    const instructions = gray('/help: more info • ESC: back')
    const instructionsWidth = stringWidth(instructions)
    const instructionsCol = Math.max(1, terminalWidth - instructionsWidth)
    screenBuffer += `\x1b[${terminalHeight};${instructionsCol}H${instructions}`
  }

  // Single write for entire screen
  immediateRender(screenBuffer)
}

function renderContentArea(layout: any, visibleLines: string[]) {
  const { terminalHeight } = layout
  const contentStartRow = 1
  const contentEndRow = terminalHeight - 4

  // Build content area in buffer, then write once
  let contentBuffer = ''
  for (let row = contentStartRow; row <= contentEndRow; row++) {
    const contentIndex = row - contentStartRow
    contentBuffer += `\x1b[${row};1H\x1b[K`

    if (contentIndex < visibleLines.length) {
      contentBuffer += visibleLines[contentIndex]
    }
  }

  // Don't move cursor after content updates - let chat input handle cursor positioning
  addToRenderBuffer(contentBuffer)
}

function renderChatInputOnly(options: { immediate?: boolean } = {}) {
  const layout = getLayoutDimensions()
  const { terminalHeight, terminalWidth } = layout

  // Build chat input buffer (cursor positioning included)
  const inputBuffer = buildChatInputBuffer(terminalWidth, terminalHeight)

  // Add help instructions rendering
  let helpBuffer = ''
  if (chatInput.trim() === '') {
    const instructions = gray('/help: more info • ESC: back')
    const instructionsWidth = stringWidth(instructions)
    const instructionsCol = Math.max(1, terminalWidth - instructionsWidth)
    helpBuffer += `\x1b[${terminalHeight};${instructionsCol}H${instructions}`
  } else {
    // Clear the help line when there's input
    helpBuffer += `\x1b[${terminalHeight};1H\x1b[K`
  }

  if (options.immediate) {
    // Immediate render for responsive typing
    immediateRender(inputBuffer + helpBuffer)
  } else {
    // Buffered render for other updates
    addToRenderBuffer(inputBuffer + helpBuffer)
  }
}

function setupSubagentKeyHandler(rl: any, onExit: () => void) {
  // Store all original key handlers
  const listeners = process.stdin.listeners('keypress')
  originalKeyHandlers = listeners as ((str: string, key: any) => void)[]

  // Remove existing keypress listeners
  process.stdin.removeAllListeners('keypress')

  // Handle terminal resize
  const handleResize = () => {
    // Force full render on resize
    needsFullRender = true
    updateSubagentContent()
  }

  process.stdout.on('resize', handleResize)

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
    }

    // Handle chat input (always active)
    if (key && key.name === 'return') {
      // Send message
      if (chatInput.trim()) {
        const userMessage = chatInput.trim()
        chatInput = ''

        if (isStreaming) {
          // Queue the message if streaming is active
          messageQueue.push(userMessage)

          // Only re-render the chat input, no visual queue display
          renderChatInputOnly({ immediate: true })
        } else {
          // Process immediately if not streaming
          chatMessages.push({
            role: 'user',
            content: userMessage,
            timestamp: Date.now(),
            isQueued: false,
          })

          // Update content to include the new user message
          updateSubagentContent()

          // Force full render to properly clear the input area and adjust layout
          needsFullRender = true
          renderSubagentContent()

          // Auto-scroll to bottom for non-queued messages
          if (!userHasManuallyScrolled) {
            scrollToBottom()
          }

          // Start mock streaming response
          setTimeout(() => startMockStreaming(userMessage), 500)
        }
      }
      return
    }

    if (key && key.name === 'backspace') {
      chatInput = chatInput.slice(0, -1)
      onUserInput() // Handle input activity
      return
    }

    // Add printable characters to chat input (except when using Ctrl for scrolling)
    if (str && str.length === 1 && str.charCodeAt(0) >= 32 && !key.ctrl) {
      chatInput += str
      onUserInput() // Handle input activity
      return
    }

    // Handle scrolling (use arrow keys for scrolling)
    const { maxLines, maxScrollOffset } = getLayoutDimensions()

    if (key && key.name === 'up' && !key.ctrl && !key.meta) {
      const newOffset = Math.max(0, scrollOffset - 1)
      if (newOffset !== scrollOffset) {
        scrollOffset = newOffset
        userHasManuallyScrolled = true // Mark as manually scrolled
        renderSubagentContent()
      }
      return
    }

    if (key && key.name === 'down' && !key.ctrl && !key.meta) {
      const newOffset = Math.min(maxScrollOffset, scrollOffset + 1)
      if (newOffset !== scrollOffset) {
        scrollOffset = newOffset
        // Reset manual scroll flag if user scrolls back to bottom
        if (newOffset >= maxScrollOffset) {
          userHasManuallyScrolled = false
        } else {
          userHasManuallyScrolled = true
        }
        renderSubagentContent()
      }
      return
    }

    if (key && key.name === 'pageup') {
      const newOffset = Math.max(0, scrollOffset - maxLines)
      if (newOffset !== scrollOffset) {
        scrollOffset = newOffset
        userHasManuallyScrolled = true // Mark as manually scrolled
        renderSubagentContent()
      }
      return
    }

    if (key && key.name === 'pagedown') {
      const newOffset = Math.min(maxScrollOffset, scrollOffset + maxLines)
      if (newOffset !== scrollOffset) {
        scrollOffset = newOffset
        // Reset manual scroll flag if user scrolls back to bottom
        if (newOffset >= maxScrollOffset) {
          userHasManuallyScrolled = false
        } else {
          userHasManuallyScrolled = true
        }
        renderSubagentContent()
      }
      return
    }

    if (key && key.name === 'home') {
      if (scrollOffset !== 0) {
        scrollOffset = 0
        userHasManuallyScrolled = true // Mark as manually scrolled
        renderSubagentContent()
      }
      return
    }

    if (key && key.name === 'end') {
      if (scrollOffset !== maxScrollOffset) {
        scrollOffset = maxScrollOffset
        userHasManuallyScrolled = false // Reset when going to bottom
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

  // Clean up all timers and state
  cleanupTimers()
  isStreaming = false
  streamingUpdateBuffer = ''
  userHasManuallyScrolled = false
  messageQueue = []
  renderBuffer = '' // Reset performance caches
  wrappedContentCache = []
  lastTerminalWidth = 0
  lastContentHash = ''

  // Reset input height tracking
  previousInputHeight = 2

  // Stop fake cursor
  stopFakeCursorBlinking()

  // Restore normal terminal mode
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false)
  }
}

// Register cleanup on process exit
process.on('exit', cleanupSubagentBuffer)
process.on('SIGINT', cleanupSubagentBuffer)
process.on('SIGTERM', cleanupSubagentBuffer)
