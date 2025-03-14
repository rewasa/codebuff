import React, { useState, useMemo, useEffect } from 'react'
import { render, Box, Text, Static, Spacer, Newline } from 'ink'
import { useTextInput } from './hooks/useTextInput'
import { useTerminalSize } from './hooks/useTerminalSize'
import figlet from 'figlet'

type Message = {
  id: string
  type: 'user' | 'assistant'
  content: string
  timestamp: Date
  userMessageId?: string
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

function MessagePreview({
  message,
  width,
}: {
  message: Message
  width: number
}) {
  return (
    <Text>
      {message.type === 'user' ? '→ ' : '  '}
      {message.content.split('\n')[0].slice(0, width - 10) +
        (message.content.includes('\n') || message.content.length > width - 10
          ? '...'
          : '')}
    </Text>
  )
}

function MessageDetail({ message }: { message: Message }) {
  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold>
          {message.type === 'assistant' ? 'Assistant' : 'You'}
          <Text> • </Text>
          <Text dimColor>{message.timestamp.toLocaleTimeString()}</Text>
          <Text dimColor> • Press Shift+Tab to return to chat</Text>
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text>{'─'.repeat(process.stdout.columns - 2)}</Text>
      </Box>
      <Box>
        <Text>{message.content}</Text>
      </Box>
    </Box>
  )
}

function Demo() {
  const { columns: width } = useTerminalSize()
  const [input, setInput] = useState('')
  const [offset, setOffset] = useState(0)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [previewMode, setPreviewMode] = useState(false)

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      type: 'assistant',
      content:
        "I'm Claude, an AI assistant. I can help you understand and modify code, explain concepts, and answer questions.\nI'll try to be clear and concise in my responses.\nWhat would you like help with?",
      timestamp: new Date(),
    },
  ])

  const getMessageGroup = (userMessageId: string) => {
    return messages.filter(
      (m) => m.id === userMessageId || m.userMessageId === userMessageId
    )
  }

  const userMessages = messages.filter((m) => m.type === 'user')

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
      const currentIndex = userMessages.findIndex((_, idx) => idx === prev)
      const nextIndex =
        currentIndex <= 0 ? userMessages.length - 1 : currentIndex - 1
      if (nextIndex >= 0) {
        const content = userMessages[nextIndex].content
        setInput(content)
        setOffset(content.length)
      }
      return nextIndex
    })
  }

  const handleHistoryDown = () => {
    if (previewMode) return
    setSelectedIndex((prev) => {
      const currentIndex = userMessages.findIndex((_, idx) => idx === prev)
      if (currentIndex >= userMessages.length - 1) {
        setInput('')
        setOffset(0)
        return -1
      }
      const nextIndex = currentIndex + 1
      const content = userMessages[nextIndex].content
      setInput(content)
      setOffset(content.length)
      return nextIndex
    })
  }

  const handleSubmit = (value: string) => {
    if (!value.trim()) return
    const userMessageId = Math.random().toString(36).slice(2)
    const userMessage = {
      id: userMessageId,
      type: 'user' as const,
      content: value.trim(),
      timestamp: new Date(),
    }
    const [response] = getAssistantResponses(value.trim())
    setMessages((prev) => [
      ...prev,
      userMessage,
      { ...response, userMessageId },
    ])
    setInput('')
    setSelectedIndex(-1)
  }

  const { renderedValue } = useTextInput({
    value: input,
    onChange: setInput,
    offset,
    setOffset,
    onSubmit: handleSubmit,
    onHistoryUp: handleHistoryUp,
    onHistoryDown: handleHistoryDown,
    onTogglePreview: togglePreviewMode,
    multiline: true,
    disableCursorMovementForUpDownKeys: true,
  })

  if (previewMode && selectedIndex >= 0) {
    const selectedMessage = userMessages[selectedIndex]
    const messageGroup = getMessageGroup(selectedMessage.id)
    return (
      <Box flexDirection="column">
        {messageGroup.map((msg, i) => (
          <MessageDetail key={i} message={msg} />
        ))}
      </Box>
    )
  }

  return (
    <>
      <Static
        items={[
          <Box key="welcome-message" padding={1} flexDirection="column">
            <Box flexDirection="row">
              <Text bold>Welcome to Codebuff</Text>
              <Text> • </Text>
              <Text dimColor>Using {process.cwd()}</Text>
            </Box>
            <Newline />
            <Box flexDirection="row">
              <Text>
                Press <Text bold>Ctrl+C</Text> twice to exit •{' '}
                <Text bold>↑/↓</Text> to navigate history •{' '}
                <Text bold>Shift+Tab</Text> to expand messages •{' '}
                <Text bold>Ctrl+V</Text> to paste images
              </Text>
            </Box>
          </Box>,
          ...messages.slice(0, -1).map((msg, i) => (
            <Box
              key={i}
              paddingX={1}
              paddingY={0}
              marginTop={msg.type === 'user' ? 1 : 0}
            >
              <MessagePreview message={msg} width={width} />
            </Box>
          )),
        ]}
      >
        {(item) => item}
      </Static>
      <Spacer />

      {messages.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Box paddingX={1}>
            <Text>
              {messages[messages.length - 1]?.type === 'user' ? '→ ' : '  '}
            </Text>
            <Text>{messages[messages.length - 1]?.content}</Text>
          </Box>
        </Box>
      )}

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
            Ask a question or describe what you'd like help with... (↑/↓ to view
            history, Shift+Tab to expand)
          </Text>
        )}
      </Box>
    </>
  )
}

const getAssistantResponses = (userMessage: string): Message[] => {
  return [
    {
      id: Math.random().toString(36).slice(2),
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
