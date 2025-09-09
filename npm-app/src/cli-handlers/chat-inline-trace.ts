import { green, yellow, bold, gray, blue, red } from 'picocolors'
import stringWidth from 'string-width'
import {
  SubagentNode,
  SubagentUIState,
  TerminalMetrics,
  wrapLine,
  createNodeId,
  formatNodeStatus,
} from './chat'

// Animation frames for running status (no longer used here, moved to formatNodeStatus)
const PULSE_FRAMES = ['○', '◔', '◑', '◕', '●', '◕', '◑', '◔']

// Helper to check if there are any running agents in the tree
function hasRunningAgents(node: SubagentNode): boolean {
  if (!node.children) return false

  for (const child of node.children) {
    if (child.status === 'running') return true
    if (hasRunningAgents(child)) return true
  }

  return false
}

// Render the inline trace view (Design 6 style)
export function renderInlineTrace(
  tree: SubagentNode,
  uiState: SubagentUIState,
  metrics: TerminalMetrics,
  messageId: string,
  timeFormatter: Intl.DateTimeFormat,
  messageTimestamp: number,
): string[] {
  const lines: string[] = []
  const timeStr = timeFormatter.format(new Date(messageTimestamp))

  // Count total agents and execution time
  const agentCount = countAgents(tree)
  const totalTime = getTotalExecutionTime(tree)

  // Main assistant header with trace toggle
  const mainNodeId = createNodeId(messageId, [])
  const isExpanded = uiState.expanded.has(mainNodeId)
  const toggleNodeId = mainNodeId + '/toggle'
  const isToggleFocused = uiState.focusNodeId === toggleNodeId

  // First line: Assistant [timestamp] (no status)
  let headerLine = `${bold(blue('Assistant'))} ${gray(`[${timeStr}]`)}`
  lines.push(' '.repeat(metrics.sidePadding) + headerLine)

  // Show assistant content or status message first
  if (tree.status === 'running' && tree.statusMessage) {
    // Show status message while running
    lines.push('') // Empty line before status
    const statusLines = wrapStatusMessage(
      tree.statusMessage,
      metrics.contentWidth,
      0,
    )
    statusLines.forEach((line) => {
      lines.push(' '.repeat(metrics.sidePadding) + gray(line))
    })
  } else if (tree.content) {
    // Show main content when not running
    lines.push('') // Empty line before content
    const contentLines = tree.content.split('\n')
    contentLines.forEach((line) => {
      if (line.trim()) {
        const wrapped = wrapLine(line, metrics.contentWidth)
        wrapped.forEach((wrappedLine) => {
          lines.push(' '.repeat(metrics.sidePadding) + wrappedLine)
        })
      }
    })
  }

  // Show trace toggle and agents after content
  if (agentCount > 0) {
    lines.push('') // Empty line before trace
    // Simple toggle indicator for trace
    const expandIndicator = isExpanded ? '[-]' : '[+]'
    const agentLabel = agentCount === 1 ? 'agent' : 'agents'
    const traceText = `${expandIndicator} View trace: ${agentCount} ${agentLabel}, ${totalTime}`
    const toggleText = isToggleFocused
      ? `\x1b[7m${traceText}\x1b[27m`
      : `${traceText}`
    lines.push(' '.repeat(metrics.sidePadding) + gray(toggleText))

    // Show agents only if expanded
    if (isExpanded) {
      renderTraceTree(tree, uiState, metrics, messageId, lines, 0, [])
    }
    // When collapsed, don't show any agents - the trace is fully closed
  }

  // Always show postContent if it exists (regardless of children completion status)
  if (tree.postContent) {
    lines.push('') // Empty line before postContent
    const postLines = tree.postContent.split('\n')
    postLines.forEach((line: string) => {
      if (line.trim()) {
        const wrapped = wrapLine(line, metrics.contentWidth)
        wrapped.forEach((wrappedLine) => {
          lines.push(' '.repeat(metrics.sidePadding) + bold(green(wrappedLine)))
        })
      }
    })
  }

  return lines
}

// Render the trace tree structure
function renderTraceTree(
  node: SubagentNode,
  uiState: SubagentUIState,
  metrics: TerminalMetrics,
  messageId: string,
  lines: string[],
  depth: number,
  path: number[],
): void {
  if (!node.children || node.children.length === 0) return

  node.children.forEach((child, index) => {
    const childPath = [...path, index]
    const childNodeId = createNodeId(messageId, childPath)
    const hasChildren = child.children && child.children.length > 0
    const isExpanded = uiState.expanded.has(childNodeId)
    const toggleNodeId = childNodeId + '/toggle'
    const isToggleFocused = uiState.focusNodeId === toggleNodeId // Tree structure characters - positioned at fixed column
    const isLast = index === node.children.length - 1
    // Indent nested children to align with their parent's content
    const prefix = ' '.repeat(depth * 7)
    const connector = isLast ? '└─' : '├─'

    // Agent name and status
    const agentName = child.type.charAt(0).toUpperCase() + child.type.slice(1)
    const status = formatNodeStatus(child)

    // Toggle indicator
    const expandIndicator = isExpanded ? '[-]' : '[+]'

    // Build the line with clear column separation: tree structure | toggle | agent info
    // Tree symbols at fixed position, not part of indentation
    const treeColumn = connector
    const toggleColumn = expandIndicator
    const agentInfo = `${agentName} ${status}`

    let agentLine: string
    if (isToggleFocused) {
      // Highlight toggle and agent name only (not status)
      agentLine = `${prefix}${treeColumn} \x1b[7m${toggleColumn} ${agentName}\x1b[27m ${status}`
    } else {
      agentLine = `${prefix}${treeColumn} ${toggleColumn} ${agentInfo}`
    }

    // Add status message on same line if running
    if (child.status === 'running' && child.statusMessage) {
      // Calculate remaining width for status message with proper column spacing
      const prefixWidth = stringWidth(prefix)
      const treeColumnWidth = stringWidth(treeColumn)
      const toggleColumnWidth = stringWidth(toggleColumn)
      const agentInfoWidth = stringWidth(agentInfo)
      const totalUsedWidth =
        prefixWidth +
        treeColumnWidth +
        1 +
        toggleColumnWidth +
        1 +
        agentInfoWidth // +1 for spaces between columns
      const remainingWidth = metrics.contentWidth - totalUsedWidth - 3 // 3 for " - "

      if (remainingWidth > 10) {
        const truncatedStatus = truncateStatusMessage(
          child.statusMessage,
          remainingWidth,
        )
        agentLine += gray(` - ${truncatedStatus}`)
      }
    }

    lines.push(' '.repeat(metrics.sidePadding) + agentLine)

    // Show content only when expanded
    if (isExpanded) {
      // Content indent: aligns with agent name (after tree symbol and toggle)
      // For nested levels, this becomes the base indentation for child agents
      const contentIndent = ' '.repeat(7) // Width of '├─ [+] '

      // Show full status message if it was truncated or multiline
      if (child.status === 'running' && child.statusMessage) {
        // Calculate actual indentation width for proper wrapping
        const actualIndentWidth = stringWidth(prefix + contentIndent)
        const availableWidth = Math.max(
          10,
          metrics.contentWidth - actualIndentWidth,
        )
        const statusLines = wrapStatusMessage(
          child.statusMessage,
          availableWidth,
          depth + 1,
        )
        if (statusLines.length > 1 || child.statusMessage.length > 50) {
          statusLines.forEach((line) => {
            lines.push(
              ' '.repeat(metrics.sidePadding) +
                prefix +
                contentIndent +
                gray(line),
            )
          })
        }
      }

      // Show full content when expanded (no truncation)
      if (child.content) {
        const contentLines = child.content.split('\n')
        contentLines.forEach((line) => {
          if (line.trim()) {
            // Calculate actual indentation width for proper wrapping
            const actualIndentWidth = stringWidth(prefix + contentIndent)
            const availableWidth = Math.max(
              10,
              metrics.contentWidth - actualIndentWidth,
            )
            const wrapped = wrapLine(line, availableWidth)
            wrapped.forEach((wrappedLine) => {
              lines.push(
                ' '.repeat(metrics.sidePadding) +
                  prefix +
                  contentIndent +
                  wrappedLine,
              )
            })
          }
        })
      }
    }

    // Recursively render children if expanded, or show summary if collapsed
    if (isExpanded && hasChildren) {
      // For nested children, they should align with parent's content indentation
      // The parent's content starts at: prefix + contentIndent (7 spaces)
      // So children should use this as their new base prefix
      renderTraceTree(
        child,
        uiState,
        metrics,
        messageId,
        lines,
        depth + 1,
        childPath,
      )
    } else if (hasChildren) {
      // When collapsed, show "+x agents" summary
      const childCount = countAgents(child)
      const continuationPrefix = '  '
      const agentLabel = childCount === 1 ? 'agent' : 'agents'
      const childrenSummary = `+ ${childCount} ${agentLabel}`

      const contentIndent = ' '.repeat(7) // Width of '├─ [+] '
      lines.push(
        ' '.repeat(metrics.sidePadding) +
          prefix +
          contentIndent +
          gray(`\x1b[3m${childrenSummary}\x1b[23m`),
      )
    }

    // Show postContent if it exists and node is expanded (after children)
    if (isExpanded && child.postContent) {
      const postLines = child.postContent.split('\n')
      postLines.forEach((line) => {
        if (line.trim()) {
          const contentIndent = ' '.repeat(7) // Width of '├─ [+] '
          // Calculate actual indentation width for proper wrapping
          const actualIndentWidth = stringWidth(prefix + contentIndent)
          const availableWidth = Math.max(
            10,
            metrics.contentWidth - actualIndentWidth,
          )
          const wrapped = wrapLine(line, availableWidth)
          wrapped.forEach((wrappedLine) => {
            lines.push(
              ' '.repeat(metrics.sidePadding) +
                prefix +
                contentIndent +
                bold(green(wrappedLine)),
            )
          })
        }
      })
    }
  })
}

// Helper to count total agents in tree
function countAgents(node: SubagentNode): number {
  if (!node.children) return 0
  let count = node.children.length
  node.children.forEach((child) => {
    count += countAgents(child)
  })
  return count
}

// Helper to get total execution time
function getTotalExecutionTime(node: SubagentNode): string {
  if (!node.startTime) return '0s'

  const endTime = node.endTime || Date.now()
  const duration = Math.round((endTime - node.startTime) / 1000)
  const minutes = Math.floor(duration / 60)
  const seconds = duration % 60

  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
}

// Helper to wrap status messages with proper indentation
function wrapStatusMessage(
  message: string,
  width: number,
  depth: number,
): string[] {
  if (!message) return []

  const lines = message.split('\n')
  const wrappedLines: string[] = []

  lines.forEach((line) => {
    if (line.trim()) {
      const wrapped = wrapLine(line, width)
      wrappedLines.push(...wrapped)
    }
  })

  return wrappedLines
}

// Helper to truncate status message for inline display
function truncateStatusMessage(message: string, maxWidth: number): string {
  // Remove newlines and extra spaces
  const singleLine = message.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()

  if (stringWidth(singleLine) <= maxWidth) {
    return singleLine
  }

  // Truncate with ellipsis
  const ellipsis = '...'
  const targetWidth = maxWidth - stringWidth(ellipsis)
  let truncated = ''

  for (const char of singleLine) {
    if (stringWidth(truncated + char) > targetWidth) break
    truncated += char
  }

  return truncated + ellipsis
}

// Render condensed view of agents when trace is collapsed
function renderCondensedAgents(
  node: SubagentNode,
  metrics: TerminalMetrics,
  lines: string[],
  depth: number,
): void {
  if (!node.children || node.children.length === 0) return

  // Collect all running or recently completed agents at all levels
  const activeAgents: Array<{ agent: SubagentNode; depth: number }> = []
  collectActiveAgents(node, activeAgents, 0)

  // Show up to 3 most relevant agents
  const agentsToShow = activeAgents
    .filter(
      (item) =>
        item.agent.status === 'running' ||
        item.agent.status === 'pending' ||
        (item.agent.status === 'complete' &&
          item.agent.endTime &&
          Date.now() - item.agent.endTime < 2000), // Show recently completed for 2 seconds
    )
    .slice(0, 3)

  if (agentsToShow.length > 0) {
    agentsToShow.forEach(({ agent, depth: agentDepth }) => {
      const indent = '  '.repeat(agentDepth)
      const agentName = agent.type.charAt(0).toUpperCase() + agent.type.slice(1)
      const status = formatNodeStatus(agent)

      let agentLine = `${indent}○ ${agentName} ${status}`

      // Add status message if running
      if (agent.status === 'running' && agent.statusMessage) {
        const remainingWidth = metrics.contentWidth - stringWidth(agentLine) - 3
        if (remainingWidth > 15) {
          const truncatedStatus = truncateStatusMessage(
            agent.statusMessage,
            remainingWidth,
          )
          agentLine += gray(` - ${truncatedStatus}`)
        }
      }

      lines.push(' '.repeat(metrics.sidePadding) + gray(agentLine))
    })

    // If there are more agents not shown, indicate that
    const totalActive = activeAgents.filter(
      (item) =>
        item.agent.status === 'running' || item.agent.status === 'pending',
    ).length

    if (totalActive > agentsToShow.length) {
      lines.push(
        ' '.repeat(metrics.sidePadding) +
          gray(`  ... and ${totalActive - agentsToShow.length} more`),
      )
    }
  }
}

// Helper to collect all active agents recursively
function collectActiveAgents(
  node: SubagentNode,
  activeAgents: Array<{ agent: SubagentNode; depth: number }>,
  depth: number,
): void {
  if (!node.children) return

  node.children.forEach((child) => {
    // Add this agent if it's active
    if (
      child.status === 'running' ||
      child.status === 'pending' ||
      (child.status === 'complete' &&
        child.endTime &&
        Date.now() - child.endTime < 2000)
    ) {
      activeAgents.push({ agent: child, depth })
    }

    // Recurse into children
    collectActiveAgents(child, activeAgents, depth + 1)
  })
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
