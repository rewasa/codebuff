import { green, yellow, cyan, magenta, bold, gray } from 'picocolors'

// ANSI escape sequences for alternate screen buffer
const ENTER_ALT_BUFFER = '\x1b[?1049h'
const EXIT_ALT_BUFFER = '\x1b[?1049l'
const CLEAR_SCREEN = '\x1b[2J\x1b[H'
const HIDE_CURSOR = '\x1b[?25l'
const SHOW_CURSOR = '\x1b[?25h'

let isInAltBuffer = false
let originalKeyHandler: ((str: string, key: any) => void) | null = null
let scrollOffset = 0
let contentLines: string[] = []

export function isInAltBufferMode(): boolean {
  return isInAltBuffer
}

export function enterAltBuffer(rl: any, onExit: () => void) {
  if (isInAltBuffer) {
    console.log(yellow('Already in alt buffer mode!'))
    return
  }

  // Enter alternate screen buffer
  process.stdout.write(ENTER_ALT_BUFFER)
  process.stdout.write(CLEAR_SCREEN)
  process.stdout.write(HIDE_CURSOR)

  isInAltBuffer = true

  // Display dummy content
  displayAltBufferContent()

  // Set up key handler for ESC to exit
  setupAltBufferKeyHandler(rl, onExit)
}

export function exitAltBuffer(rl: any) {
  if (!isInAltBuffer) {
    return
  }

  // Reset scroll state
  scrollOffset = 0
  contentLines = []

  // Restore original key handler
  if (originalKeyHandler) {
    process.stdin.removeAllListeners('keypress')
    process.stdin.on('keypress', originalKeyHandler)
    originalKeyHandler = null
  }

  // Exit alternate screen buffer
  process.stdout.write(SHOW_CURSOR)
  process.stdout.write(EXIT_ALT_BUFFER)

  isInAltBuffer = false
}

function displayAltBufferContent() {
  // Generate content with line numbers for scrolling demo
  contentLines = [
    bold(cyan('🚀 ALTERNATE SCREEN BUFFER DEMO 🚀')),
    '',
    green('Welcome to the alternate screen buffer!'),
    '',
    "This is a separate screen area that doesn't affect your main terminal.",
    'You can think of this as a "clean slate" for full-screen applications.',
    '',
    yellow('Features demonstrated:'),
    '• Separate screen buffer from main terminal',
    '• No interference with scrollback history',
    '• Clean restoration when exiting',
    '• Perfect for full-screen CLI apps',
    '• Scrolling with arrow keys and Page Up/Down',
    '',
    magenta('Examples of apps that use alt buffers:'),
    '• vim/nvim (text editors)',
    '• less/more (pagers)',
    '• htop (system monitor)',
    '• tmux (terminal multiplexer)',
    '• git log (when using a pager)',
    '',
    cyan('Technical details:'),
    '• Entered with: \\x1b[?1049h',
    '• Exited with:  \\x1b[?1049l',
    '• Saves/restores cursor position',
    '• Preserves main screen content',
    '',
    bold(green('Navigation:')),
    '• Press ESC to exit and return to main terminal',
    '• Use ↑/↓ arrow keys to scroll line by line',
    '• Use Page Up/Page Down to scroll by page',
    '• Use Home/End to go to top/bottom',
    '',
    yellow('Scrolling Demo - More content below:'),
    '',
  ]

  // Add numbered lines for scrolling demonstration
  for (let i = 1; i <= 50; i++) {
    contentLines.push(
      `${cyan(`Line ${i.toString().padStart(2, '0')}:`)} This is scrollable content line ${i}. Try scrolling with arrow keys!`
    )
  }

  contentLines.push('')
  contentLines.push(
    bold(magenta('🎉 You reached the end! Use Page Up or ↑ to scroll back up.'))
  )

  renderContent()
}

function renderContent() {
  // Clear screen and move cursor to top
  process.stdout.write(CLEAR_SCREEN)

  const terminalHeight = process.stdout.rows || 24
  const maxLines = terminalHeight - 2 // Leave space for status line

  // Calculate visible lines based on scroll offset
  const visibleLines = contentLines.slice(scrollOffset, scrollOffset + maxLines)

  // Display content
  process.stdout.write(visibleLines.join('\n'))

  // Display scroll indicator at bottom
  const totalLines = contentLines.length
  const scrollPercent =
    totalLines > maxLines
      ? Math.round((scrollOffset / (totalLines - maxLines)) * 100)
      : 0
  const statusLine = `\n${gray(`[${scrollOffset + 1}-${Math.min(scrollOffset + maxLines, totalLines)}/${totalLines}] ${scrollPercent}% - Use ↑/↓/PgUp/PgDn to scroll, ESC to exit`)}`

  process.stdout.write(statusLine)
}

function setupAltBufferKeyHandler(rl: any, onExit: () => void) {
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
      exitAltBuffer(rl)
      onExit()
      return
    }

    // Handle Ctrl+C
    if (key && key.ctrl && key.name === 'c') {
      exitAltBuffer(rl)
      process.exit(0)
      return
    }

    // Handle scrolling
    const terminalHeight = process.stdout.rows || 24
    const maxLines = terminalHeight - 2
    const maxScrollOffset = Math.max(0, contentLines.length - maxLines)

    if (key && key.name === 'up') {
      const newOffset = Math.max(0, scrollOffset - 1)
      if (newOffset !== scrollOffset) {
        scrollOffset = newOffset
        renderContent()
      }
      return
    }

    if (key && key.name === 'down') {
      const newOffset = Math.min(maxScrollOffset, scrollOffset + 1)
      if (newOffset !== scrollOffset) {
        scrollOffset = newOffset
        renderContent()
      }
      return
    }

    if (key && key.name === 'pageup') {
      const newOffset = Math.max(0, scrollOffset - maxLines)
      if (newOffset !== scrollOffset) {
        scrollOffset = newOffset
        renderContent()
      }
      return
    }

    if (key && key.name === 'pagedown') {
      const newOffset = Math.min(maxScrollOffset, scrollOffset + maxLines)
      if (newOffset !== scrollOffset) {
        scrollOffset = newOffset
        renderContent()
      }
      return
    }

    if (key && key.name === 'home') {
      if (scrollOffset !== 0) {
        scrollOffset = 0
        renderContent()
      }
      return
    }

    if (key && key.name === 'end') {
      if (scrollOffset !== maxScrollOffset) {
        scrollOffset = maxScrollOffset
        renderContent()
      }
      return
    }

    // For other keys, just ignore them in this demo
    // (Previously we had echo functionality, but scrolling is more useful)
  })

  // Ensure raw mode for immediate key detection
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true)
  }
}

// Cleanup function to ensure we exit alt buffer on process termination
export function cleanupAltBuffer() {
  if (isInAltBuffer) {
    process.stdout.write(SHOW_CURSOR)
    process.stdout.write(EXIT_ALT_BUFFER)
    isInAltBuffer = false
  }

  // Restore normal terminal mode
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false)
  }
}

// Register cleanup on process exit
process.on('exit', cleanupAltBuffer)
process.on('SIGINT', cleanupAltBuffer)
process.on('SIGTERM', cleanupAltBuffer)
