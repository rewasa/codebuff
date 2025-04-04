import React from 'react'
import { Box, Text } from 'ink'
import { useTerminalSize } from '../hooks/useTerminalSize.js' // Adjust path as needed

interface DividerProps {
  title?: string
  width?: number
  padding?: number
  titlePadding?: number
  titleColor?: string
  dividerChar?: string
  dividerColor?: string
}

const Divider: React.FC<DividerProps> = ({
  title = '',
  width,
  padding = 1,
  titlePadding = 1,
  titleColor = 'white',
  dividerChar = '─', // Changed default character
  dividerColor = 'grey',
}) => {
  const { columns: terminalWidth } = useTerminalSize()
  const availableWidth = width || terminalWidth
  const titleString = title ? ` ${title} ` : ''
  const titleWidth = titleString.length
  const titleSidePadding = title ? titlePadding * 2 : 0

  const lineLength = Math.max(
    0,
    availableWidth - titleWidth - padding * 2 - titleSidePadding
  )
  const leftLineLength = Math.floor(lineLength / 2)
  const rightLineLength = Math.ceil(lineLength / 2)

  const leftLine = dividerChar.repeat(leftLineLength)
  const rightLine = dividerChar.repeat(rightLineLength)

  return (
    <Box width={availableWidth} paddingX={padding}>
      <Text color={dividerColor}>{leftLine}</Text>
      {title && (
        <Box paddingX={titlePadding}>
          <Text color={titleColor}>{title}</Text>
        </Box>
      )}
      <Text color={dividerColor}>{rightLine}</Text>
    </Box>
  )
}

export default Divider
