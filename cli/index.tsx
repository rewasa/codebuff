import React, { useState, useMemo, useEffect, useRef } from 'react'
import { render, Box, Text, Static, Spacer, Newline } from 'ink'
import { useTextInput } from './hooks/useTextInput'
import { useTerminalSize } from './hooks/useTerminalSize'

import Divider from './components/Divider.js'
import HelperBar from './components/HelperBar.js'

const COMMAND_ITEMS = ['help', 'undo', 'diff', 'checkpoints', 'quit']
const SHORTCUT_ITEMS = ['↑/↓ history', 'Shift+Tab expand']
const DETAIL_SHORTCUT_ITEMS = ['Shift+Tab return']

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

function MessageDetail({
  message,
  messages,
}: {
  message: Message
  messages: Message[]
}) {
  const { rows } = useTerminalSize()
  const messageGroup = messages.filter(
    (m) => m.id === message.id || m.userMessageId === message.id
  )

  return (
    <Box flexDirection="column" paddingY={1} height={rows}>
      {messageGroup.map((msg, i) => (
        <Box
          key={i}
          flexDirection="column"
          flexGrow={i === messageGroup.length - 1 ? 1 : 0}
        >
          <Box>
            <Text bold>
              {msg.type === 'assistant' ? 'Assistant' : 'You'}
              <Text> • </Text>
              <Text dimColor>{msg.timestamp.toLocaleTimeString()}</Text>
            </Text>
          </Box>

          <Box padding={1}>
            <Text>{msg.content}</Text>
          </Box>
        </Box>
      ))}

      <Box flexDirection="column">
        <Divider dividerColor="grey" />
        <HelperBar leftItems={[]} rightItems={DETAIL_SHORTCUT_ITEMS} />
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
      content: `Welcome to Codebuff • Reading/writing to ${process.cwd()}\n\nI'm Codebuff, an AI assistant. I can help you understand and modify code, explain concepts, and answer questions.\nI'll try to be clear and concise in my responses.`,
      timestamp: new Date(),
    },
  ])
  const [renderedMessageIds, setRenderedMessageIds] = useState(
    () => new Set<string>()
  )
  const isUpdatingRenderedIds = useRef(false)

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
        process.stdout.write('\x1b[2J\x1b[0;0H')
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
      const lastIndex = userMessages.length - 1

      if (currentIndex === -1) {
        if (userMessages.length > 0) {
          const nextIndex = lastIndex
          const content = userMessages[nextIndex].content
          setInput(content)
          setOffset(content.length)
          return nextIndex
        } else {
          return -1
        }
      } else if (currentIndex === 0) {
        return 0
      } else {
        const nextIndex = currentIndex - 1
        const content = userMessages[nextIndex].content
        setInput(content)
        setOffset(content.length)
        return nextIndex
      }
    })
  }

  const handleHistoryDown = () => {
    if (previewMode) return
    setSelectedIndex((prev) => {
      const currentIndex = userMessages.findIndex((_, idx) => idx === prev)
      const lastIndex = userMessages.length - 1

      if (currentIndex === -1) {
        return -1
      } else if (currentIndex === lastIndex) {
        setInput('')
        setOffset(0)
        return -1
      } else {
        const nextIndex = currentIndex + 1
        const content = userMessages[nextIndex].content
        setInput(content)
        setOffset(content.length)
        return nextIndex
      }
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

  useEffect(() => {
    if (isUpdatingRenderedIds.current || previewMode) {
      return
    }

    const newIdsToAdd = messages
      .filter((msg) => !renderedMessageIds.has(msg.id))
      .map((msg) => msg.id)

    if (newIdsToAdd.length > 0) {
      isUpdatingRenderedIds.current = true
      setRenderedMessageIds((prevIds) => {
        const newSet = new Set(prevIds)
        newIdsToAdd.forEach((id) => newSet.add(id))
        return newSet
      })
      queueMicrotask(() => {
        isUpdatingRenderedIds.current = false
      })
    }
  }, [messages, previewMode, renderedMessageIds])

  if (previewMode && selectedIndex >= 0) {
    const selectedMessage = userMessages[selectedIndex]
    return (
      <Box height="100%" width="100%">
        <MessageDetail message={selectedMessage} messages={messages} />
      </Box>
    )
  }

  return (
    <>
      <Static
        items={messages
          .filter((msg) => !renderedMessageIds.has(msg.id))
          .map((msg) => (
            <Box
              key={msg.id}
              paddingX={1}
              paddingY={0}
              marginTop={msg.type === 'user' ? 1 : 0}
            >
              <MessagePreview message={msg} width={width} />
            </Box>
          ))}
      >
        {(item) => item}
      </Static>
      <Spacer />

      <Box marginTop={1}>
        <Divider dividerColor="grey" />
      </Box>

      <Box marginTop={1} marginBottom={1} paddingX={1}>
        <Text bold>→ </Text>
        {input ? (
          <Text>
            {renderedValue.beforeCursor}
            <Text inverse>{renderedValue.atCursor}</Text>
            {renderedValue.afterCursor}
          </Text>
        ) : (
          <Text dimColor italic>
            what would you'd like help with?
          </Text>
        )}
      </Box>

      <Divider dividerColor="grey" />

      <HelperBar leftItems={COMMAND_ITEMS} rightItems={SHORTCUT_ITEMS} />
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
