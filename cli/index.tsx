import React, { useState, useMemo, useEffect } from 'react'
import { render, Box, Text, Static } from 'ink'
import { useTextInput } from './hooks/useTextInput'
import { useTerminalSize } from './hooks/useTerminalSize'
import figlet from 'figlet'

type Message = {
  type: 'user' | 'assistant'
  content: string
  timestamp: Date
}

const MessageView = ({
  message,
  width,
  userMessage,
}: {
  message: Message
  width: number
  userMessage?: Message
}) =>
  message.type === 'user' ? (
    <Text>→ {message.content}</Text>
  ) : (
    <Text>
      {' '}
      {message.content.split('\n')[0].slice(0, width - 10) +
        (message.content.includes('\n') || message.content.length > width - 10
          ? '...'
          : '')}
    </Text>
  )

function Demo() {
  const { columns: width } = useTerminalSize()
  const [input, setInput] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [previewMode, setPreviewMode] = useState(false)

  const [messages, setMessages] = useState<Message[]>([
    {
      type: 'assistant',
      content:
        "I'm Claude, an AI assistant. I can help you understand and modify code, explain concepts, and answer questions.\nI'll try to be clear and concise in my responses.\nWhat would you like help with?",
      timestamp: new Date(),
    },
  ])

  useEffect(() => {
    return () => {
      if (previewMode) {
        try {
          process.stdout.write('\x1b[?1049l')
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    }
  }, [previewMode])

  const togglePreviewMode = () => {
    if (!previewMode && selectedIndex >= 0) {
      try {
        process.stdout.write('\x1b[?1049h')
        setPreviewMode(true)
      } catch (e) {
        console.error('Failed to enter alternate screen mode:', e)
      }
    } else if (previewMode) {
      try {
        process.stdout.write('\x1b[?1049l')
        setPreviewMode(false)
      } catch (e) {
        console.error('Failed to leave alternate screen mode:', e)
        setPreviewMode(false)
      }
    }
  }

  const handleHistoryUp = () => {
    if (previewMode) return
    setSelectedIndex((prev) => {
      const currentIndex = messages.findIndex((_, idx) => idx === prev)
      if (currentIndex <= 0) return messages.length - 1
      return currentIndex - 1
    })
  }

  const handleHistoryDown = () => {
    if (previewMode) return
    setSelectedIndex((prev) => {
      const currentIndex = messages.findIndex((_, idx) => idx === prev)
      if (currentIndex >= messages.length - 1) return -1
      return currentIndex + 1
    })
  }

  const asciiArt = useMemo(() => {
    return figlet.textSync('Welcome to Codebuff', {
      font: 'Standard',
      width: width - 4,
    })
  }, [width])

  const handleSubmit = (value: string) => {
    if (!value.trim()) return
    const userMessage = {
      type: 'user' as const,
      content: value.trim(),
      timestamp: new Date(),
    }
    const [response] = getAssistantResponses(value.trim())
    setMessages((prev) => [...prev, userMessage, response])
  }

  const { renderedValue } = useTextInput({
    value: input,
    onChange: setInput,
    onSubmit: handleSubmit,
    onHistoryUp: handleHistoryUp,
    onHistoryDown: handleHistoryDown,
    onTogglePreview: togglePreviewMode,
    multiline: true,
    disableCursorMovementForUpDownKeys: true,
  })

  if (previewMode && selectedIndex >= 0) {
    const selectedMessage = messages[selectedIndex]
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold>
            {selectedMessage.type === 'assistant' ? 'Assistant' : 'You'}
            <Text> • </Text>
            <Text dimColor>{selectedMessage.timestamp.toLocaleTimeString()}</Text>
            <Text dimColor> • Press Tab to return to chat</Text>
          </Text>
        </Box>
        <Box marginBottom={1}>
          <Text>{'─'.repeat(width - 2)}</Text>
        </Box>
        <Box>
          <Text>{selectedMessage.content}</Text>
        </Box>
      </Box>
    )
  }

  return (
    <>
      <Static
        key={`static-message`}
        items={[
          <Box key="welcome-message" borderStyle="single" padding={1}>
            <Text bold>Welcome to Codebuff</Text>
            <Text> • </Text>
            <Text dimColor>{process.cwd()}</Text>
          </Box>,
          <Box
            key="info-message"
            paddingX={2}
            paddingY={1}
            flexDirection="column"
          >
            <Text>
              Press <Text bold>Ctrl+C</Text> twice to exit •{' '}
              <Text bold>↑/↓</Text> to navigate history •{' '}
              <Text bold>Ctrl+V</Text> to paste images
            </Text>
          </Box>,
          ...messages.map((msg, i) => {
            const userMessage =
              msg.type === 'assistant' && i > 0 ? messages[i - 1] : undefined

            return (
              <Box key={i} flexDirection="column">
                <Box
                  paddingLeft={1}
                  paddingRight={1}
                  marginTop={msg.type === 'user' ? 1 : 0}
                >
                  <MessageView
                    message={msg}
                    width={width}
                    userMessage={userMessage}
                  />
                </Box>
              </Box>
            )
          }),
        ]}
      >
        {(_) => _}
      </Static>

      <Box marginTop={1}>
        <Text>→ </Text>
        {input ? (
          <Text>
            {renderedValue.beforeCursor}
            <Text inverse>{renderedValue.atCursor}</Text>
            {renderedValue.afterCursor}
          </Text>
        ) : (
          <Text dimColor>
            Ask a question or describe what you'd like help with... (↑/↓ to view history, Tab to expand)
          </Text>
        )}
      </Box>
    </>
  )
}

const getAssistantResponses = (userMessage: string): Message[] => {
  return [
    {
      type: 'assistant',
      content: [
        `I understand you're asking about "${userMessage}". Let me help with that.`,
        `Here's what I think about "${userMessage}"...`,
        `Would you like to know more about "${userMessage}"?`,
      ].join('\n'),
      timestamp: new Date(),
    },
  ]
}

render(<Demo />, { exitOnCtrlC: false })
