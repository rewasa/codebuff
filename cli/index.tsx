import React, { useState, useMemo, useEffect, useRef } from 'react'
import { render, Box, Text, Spacer, Newline, Static } from 'ink'
import { useTextInput } from './hooks/useTextInput.js'
import { useTerminalSize } from './hooks/useTerminalSize.js'
import { useStaticMessages } from './hooks/useStaticMessages.js'

import Divider from './components/Divider.js'
import HelperBar from './components/HelperBar.js'

const COMMAND_ITEMS = ['help', 'undo', 'diff', 'checkpoints', 'quit']
const SHORTCUT_ITEMS = ['↑/↓ history', 'Shift+Tab expand']
const DETAIL_SHORTCUT_ITEMS = ['Shift+Tab return']
const STREAM_DELAY_MS = 100

const WELCOME_MESSAGE_CONTENT = `Welcome to Codebuff • Reading/writing to ${process.cwd()}\n\nI'm Codebuff, an AI assistant. I can help you understand and modify code, explain concepts, and answer questions.\nI'll try to be clear and concise in my responses.`

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
  messageGroup.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())

  return (
    <Box flexDirection="column" paddingY={1} height={rows}>
      {messageGroup.map((msg, i) => (
        <Box
          key={msg.id}
          flexDirection="column"
          flexGrow={i === messageGroup.length - 1 ? 1 : 0}
          marginBottom={i < messageGroup.length - 1 ? 1 : 0}
        >
          <Box>
            <Text bold>
              {msg.type === 'assistant' ? 'Assistant' : 'You'}
              <Text> • </Text>
              <Text dimColor>{msg.timestamp.toLocaleTimeString()}</Text>
            </Text>
          </Box>

          <Box paddingLeft={1} paddingTop={1}>
            <Text>{msg.content}</Text>
          </Box>
        </Box>
      ))}

      <Spacer />

      <Box flexDirection="column">
        <Divider dividerColor="grey" />
        <HelperBar leftItems={[]} rightItems={DETAIL_SHORTCUT_ITEMS} />
      </Box>
    </Box>
  )
}

const welcomeMessage: Message = {
  id: 'welcome',
  type: 'assistant',
  content: WELCOME_MESSAGE_CONTENT,
  timestamp: new Date(),
}

function Demo() {
  const { columns: width } = useTerminalSize()
  const [input, setInput] = useState('')
  const [offset, setOffset] = useState(0)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [previewMode, setPreviewMode] = useState(false)
  const [showWelcomeMessage, setShowWelcomeMessage] = useState(true)
  const [messages, setMessages] = useState<Message[]>([])

  const latestMessage = messages[messages.length - 1]
  const historicalMessages = messages.slice(0, -1)

  const historicalMessagesElements = useStaticMessages(
    historicalMessages,
    (msg: Message) => (
      <Box
        key={msg.id}
        paddingX={1}
        paddingY={0}
        marginTop={msg.type === 'user' ? 1 : 0}
      >
        <MessagePreview message={msg} width={width} />
      </Box>
    )
  )

  const [streamedMessageContent, setStreamedMessageContent] = useState<
    string | undefined
  >(undefined)
  const streamTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const wordsRef = useRef<string[]>([])
  const currentWordIndexRef = useRef<number>(0)

  useEffect(() => {
    if (streamTimeoutRef.current) {
      clearTimeout(streamTimeoutRef.current)
      streamTimeoutRef.current = null
    }

    if (latestMessage?.type === 'assistant') {
      const fullContent = latestMessage.content
      wordsRef.current = fullContent.split(/(\s+)/)
      currentWordIndexRef.current = 0
      const totalWords = wordsRef.current.length
      const initialDelay = STREAM_DELAY_MS
      setStreamedMessageContent('')

      const stream = () => {
        if (currentWordIndexRef.current < totalWords) {
          const chunkSize = Math.floor(Math.random() * 4) + 1
          const nextWordIndex = Math.min(
            currentWordIndexRef.current + chunkSize,
            totalWords
          )
          const nextChunkText = wordsRef.current
            .slice(0, nextWordIndex)
            .join('')

          setStreamedMessageContent(nextChunkText)
          currentWordIndexRef.current = nextWordIndex

          if (currentWordIndexRef.current < totalWords) {
            streamTimeoutRef.current = setTimeout(
              stream,
              STREAM_DELAY_MS
            ) as NodeJS.Timeout
          } else {
            setStreamedMessageContent(undefined)
            streamTimeoutRef.current = null
          }
        } else {
          setStreamedMessageContent(undefined)
          streamTimeoutRef.current = null
        }
      }
      streamTimeoutRef.current = setTimeout(
        stream,
        initialDelay
      ) as NodeJS.Timeout
    } else {
      setStreamedMessageContent(undefined)
      wordsRef.current = []
      currentWordIndexRef.current = 0
    }

    return () => {
      if (streamTimeoutRef.current) {
        clearTimeout(streamTimeoutRef.current)
      }
    }
  }, [latestMessage?.id])

  useEffect(() => {
    return () => {
      if (previewMode) {
        process.stdout.write('\x1b[?1049l')
      }
    }
  }, [previewMode])

  const togglePreviewMode = () => {
    const currentUserMessages = messages.filter((m) => m.type === 'user')
    const actualSelectedIndex =
      selectedIndex >= 0 && selectedIndex < currentUserMessages.length
        ? selectedIndex
        : -1

    if (!previewMode && actualSelectedIndex >= 0) {
      try {
        process.stdout.write('\x1b[?1049h')
        process.stdout.write('\x1b[2J\x1b[0;0H')
        setPreviewMode(true)
        setShowWelcomeMessage(false)
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
    setMessages((currentMessages) => {
      const userMessages = currentMessages.filter((m) => m.type === 'user')
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
      return currentMessages
    })
  }

  const handleHistoryDown = () => {
    if (previewMode) return
    setMessages((currentMessages) => {
      const userMessages = currentMessages.filter((m) => m.type === 'user')
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
      return currentMessages
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
    setOffset(0)
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

  const selectedUserMessage = useMemo(() => {
    if (previewMode && selectedIndex >= 0) {
      const currentUserMessages = messages.filter((m) => m.type === 'user')
      return currentUserMessages[selectedIndex]
    }
    return undefined
  }, [previewMode, selectedIndex, messages])

  const latestMessageDisplayContent =
    latestMessage?.type === 'assistant'
      ? streamedMessageContent !== undefined
        ? streamedMessageContent
        : latestMessage.content
      : latestMessage?.content

  if (selectedUserMessage) {
    return (
      <Box height="100%" width="100%">
        <MessageDetail message={selectedUserMessage} messages={messages} />
      </Box>
    )
  }

  return (
    <>
      {showWelcomeMessage && (
        <Static items={[welcomeMessage]}>
          {(element) => (
            <Box paddingX={1} paddingY={0} key={element.id}>
              <Text>{element.content}</Text>
            </Box>
          )}
        </Static>
      )}

      {historicalMessagesElements && (
        <Static items={historicalMessagesElements}>
          {(element) => element}
        </Static>
      )}

      {latestMessage && (
        <Box
          paddingX={1}
          paddingY={0}
          marginTop={latestMessage.type === 'user' ? 1 : 0}
        >
          <Text>
            {latestMessage.type === 'user' ? '→ ' : '  '}
            {latestMessageDisplayContent}
            {latestMessage.type === 'assistant' &&
              streamedMessageContent !== undefined && <Text> </Text>}
          </Text>
        </Box>
      )}

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
