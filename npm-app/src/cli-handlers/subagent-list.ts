import { green, yellow, cyan, magenta, bold, gray, blue } from 'picocolors'
import { getSubagentsChronological } from '../subagent-storage'
import { enterSubagentBuffer } from './subagent'
import {
  ENTER_ALT_BUFFER,
  EXIT_ALT_BUFFER,
  CLEAR_SCREEN,
  HIDE_CURSOR,
  SHOW_CURSOR,
  MOVE_CURSOR,
} from '../utils/terminal'

let isInSubagentListBuffer = false
let originalKeyHandler: ((str: string, key: any) => void) | null = null
let selectedIndex = 0
let scrollOffset = 0
let allContentLines: string[] = []
let subagentLinePositions: number[] = []
let subagentList: Array<{
  agentId: string
  agentType: string
  prompt?: string
  isActive: boolean
  lastActivity: number
  startTime: number
}> = []

export function isInSubagentListMode(): boolean {
  return isInSubagentListBuffer
}

export function enterSubagentListBuffer(rl: any, onExit: () => void) {
  if (isInSubagentListBuffer) {
    console.log(yellow('Already in subagent list mode!'))
    return
  }

  // Get subagents in chronological order
  subagentList = getSubagentsChronological(50) // Get more for the list

  if (subagentList.length === 0) {
    console.log(yellow('No subagents found from previous runs.'))
    console.log(
      gray(
        'Subagents will appear here after you use spawn_agents in a conversation.'
      )
    )
    return
  }

  // Select the most recent subagent (last in chronological list)
  selectedIndex = Math.max(0, subagentList.length - 1)

  // Enter alternate screen buffer
  process.stdout.write(ENTER_ALT_BUFFER)
  process.stdout.write(CLEAR_SCREEN)
  process.stdout.write(HIDE_CURSOR)

  isInSubagentListBuffer = true

  // Display subagent list
  renderSubagentList()

  // Set up key handler
  setupSubagentListKeyHandler(rl, onExit)
}

export function exitSubagentListBuffer(rl: any) {
  if (!isInSubagentListBuffer) {
    return
  }

  // Reset state
  selectedIndex = 0
  scrollOffset = 0
  allContentLines = []
  subagentLinePositions = []
  subagentList = []

  // Restore original key handler
  if (originalKeyHandler) {
    process.stdin.removeAllListeners('keypress')
    process.stdin.on('keypress', originalKeyHandler)
    originalKeyHandler = null
  }

  // Exit alternate screen buffer
  process.stdout.write(SHOW_CURSOR)
  process.stdout.write(EXIT_ALT_BUFFER)

  isInSubagentListBuffer = false
}

function autoScrollToSelection() {
  if (selectedIndex < 0 || selectedIndex >= subagentLinePositions.length) {
    return // Safety check
  }

  const terminalHeight = process.stdout.rows || 24
  const maxLines = terminalHeight - 2
  const selectedLineIndex = subagentLinePositions[selectedIndex]

  const viewportStart = scrollOffset
  const viewportEnd = scrollOffset + maxLines - 1

  if (selectedLineIndex < viewportStart) {
    // Selected item is above viewport, scroll up
    scrollOffset = Math.max(0, selectedLineIndex - 2) // Add some padding
  } else if (selectedLineIndex > viewportEnd) {
    // Selected item is below viewport, scroll down
    scrollOffset = Math.min(
      Math.max(0, allContentLines.length - maxLines),
      selectedLineIndex - maxLines + 3 // Add some padding
    )
  }
}

function buildAllContentLines() {
  const terminalWidth = process.stdout.columns || 80

  // Header with improved styling
  const lines = [
    bold(cyan('🤖 ')) + bold(magenta('Subagent History')),
    gray(
      `${subagentList.length} subagent${subagentList.length === 1 ? '' : 's'} found`
    ),
    '',
    gray('─'.repeat(terminalWidth)),
    '',
  ]
  subagentLinePositions = [] // Reset before building

  if (subagentList.length === 0) {
    lines.push(yellow('No subagents found.'))
  } else {
    // Build all content lines for all subagents
    for (let i = 0; i < subagentList.length; i++) {
      subagentLinePositions.push(lines.length) // Store the starting line number
      const agent = subagentList[i]
      const isSelected = i === selectedIndex
      const startTime = new Date(agent.startTime).toLocaleTimeString()

      // Show full prompt without truncation
      const fullPrompt = agent.prompt || '(no prompt recorded)'
      const maxLineLength = terminalWidth - 6 // Leave space for indentation and quotes

      // Split prompt into words and wrap to multiple lines (no limit)
      const words = fullPrompt.split(' ')
      const promptLines: string[] = []
      let currentLine = ''

      for (const word of words) {
        if (currentLine.length + word.length + 1 <= maxLineLength) {
          currentLine += (currentLine ? ' ' : '') + word
        } else {
          if (currentLine) promptLines.push(currentLine)
          currentLine = word
        }
      }
      if (currentLine) {
        promptLines.push(currentLine)
      }

      const prefix = isSelected ? cyan('► ') : '  '
      const agentInfo = `${bold(agent.agentType)} (${agent.agentId.substring(0, 8)}...)`
      const timeInfo = agent.isActive
        ? green(`[Active - ${startTime}]`)
        : gray(`[${startTime}]`)
      const line = `${prefix}${agentInfo} ${timeInfo}`

      lines.push(line)

      // Add each prompt line with proper indentation
      promptLines.forEach((promptLine, index) => {
        const indent = isSelected ? cyan('  ') : '  '
        const quote = index === 0 ? '"' : ' '
        const endQuote = index === promptLines.length - 1 ? '"' : ''
        lines.push(`${indent}${gray(quote + promptLine + endQuote)}`)
      })

      if (i < subagentList.length - 1) {
        lines.push('') // Empty line between items
      }
    }
  }

  allContentLines = lines
}

function renderSubagentList() {
  // Build all content if not already built or if selection changed
  buildAllContentLines()

  // Clear screen and move cursor to top
  process.stdout.write(CLEAR_SCREEN)

  const terminalHeight = process.stdout.rows || 24
  const terminalWidth = process.stdout.columns || 80
  const maxLines = terminalHeight - 2 // Leave space for status line

  const totalLines = allContentLines.length

  // Calculate visible lines based on scroll offset
  const visibleLines = allContentLines.slice(
    scrollOffset,
    scrollOffset + maxLines
  )

  // Display content
  process.stdout.write(visibleLines.join('\n'))

  // Add padding to fill remaining space
  const remainingLines = maxLines - visibleLines.length
  if (remainingLines > 0) {
    process.stdout.write('\n'.repeat(remainingLines))
  }

  // Display status line at bottom
  const statusLine = `\n${gray(`Use ↑/↓/j/k to select, PgUp/PgDn to scroll, Enter to view, ESC to exit`)}`

  process.stdout.write(statusLine)
  process.stdout.write(HIDE_CURSOR)
}

function setupSubagentListKeyHandler(rl: any, onExit: () => void) {
  // Store the original key handler
  const listeners = process.stdin.listeners('keypress')
  if (listeners.length > 0) {
    originalKeyHandler = listeners[0] as (str: string, key: any) => void
  }

  // Remove existing keypress listeners
  process.stdin.removeAllListeners('keypress')

  // Add our custom handler
  process.stdin.on('keypress', (str: string, key: any) => {
    if (key && key.name === 'escape') {
      exitSubagentListBuffer(rl)
      onExit()
      return
    }

    // Handle Ctrl+C - exit to main screen instead of exiting program
    if (key && key.ctrl && key.name === 'c') {
      exitSubagentListBuffer(rl)
      onExit()
      return
    }

    // Handle Enter - select current subagent
    if (key && key.name === 'return') {
      if (subagentList.length > 0 && selectedIndex < subagentList.length) {
        const selectedAgent = subagentList[selectedIndex]
        exitSubagentListBuffer(rl)

        // Enter the individual subagent buffer
        enterSubagentBuffer(rl, selectedAgent.agentId, onExit)
      }
      return
    }

    // Handle scrolling through content
    const terminalHeight = process.stdout.rows || 24
    const maxLines = terminalHeight - 2
    const maxScrollOffset = Math.max(0, allContentLines.length - maxLines)

    if (key && key.name === 'pageup') {
      const newOffset = Math.max(0, scrollOffset - maxLines)
      if (newOffset !== scrollOffset) {
        scrollOffset = newOffset
        renderSubagentList()
      }
      return
    }

    if (key && key.name === 'pagedown') {
      const newOffset = Math.min(maxScrollOffset, scrollOffset + maxLines)
      if (newOffset !== scrollOffset) {
        scrollOffset = newOffset
        renderSubagentList()
      }
      return
    }

    if (key && key.name === 'home') {
      if (scrollOffset !== 0) {
        scrollOffset = 0
        renderSubagentList()
      }
      return
    }

    if (key && key.name === 'end') {
      if (scrollOffset !== maxScrollOffset) {
        scrollOffset = maxScrollOffset
        renderSubagentList()
      }
      return
    }

    // Handle item navigation with up/down arrows
    if (key && key.name === 'up') {
      if (selectedIndex > 0) {
        selectedIndex--
        // Auto-scroll to keep selected item visible
        autoScrollToSelection()
        renderSubagentList()
      }
      return
    }

    if (key && key.name === 'down') {
      if (selectedIndex < subagentList.length - 1) {
        selectedIndex++
        // Auto-scroll to keep selected item visible
        autoScrollToSelection()
        renderSubagentList()
      }
      return
    }

    // Handle selection navigation (j/k keys for vim-like navigation)
    if (key && key.name === 'j') {
      if (selectedIndex < subagentList.length - 1) {
        selectedIndex++
        // Auto-scroll to keep selected item visible
        autoScrollToSelection()
        renderSubagentList()
      }
      return
    }

    if (key && key.name === 'k') {
      if (selectedIndex > 0) {
        selectedIndex--
        // Auto-scroll to keep selected item visible
        autoScrollToSelection()
        renderSubagentList()
      }
      return
    }
  })

  // Ensure raw mode for immediate key detection
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true)
  }
}

// Cleanup function to ensure we exit subagent list buffer on process termination
export function cleanupSubagentListBuffer() {
  if (isInSubagentListBuffer) {
    process.stdout.write(SHOW_CURSOR)
    process.stdout.write(EXIT_ALT_BUFFER)
    isInSubagentListBuffer = false
  }

  // Restore normal terminal mode
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false)
  }
}

// Register cleanup on process exit
process.on('exit', cleanupSubagentListBuffer)
process.on('SIGINT', cleanupSubagentListBuffer)
process.on('SIGTERM', cleanupSubagentListBuffer)
