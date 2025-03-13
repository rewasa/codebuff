import React, { useState, useMemo } from "react";
import { render, Box, Text } from "ink";
import { useTextInput } from "./hooks/useTextInput";
import { useTerminalSize } from "./hooks/useTerminalSize";

type Message = {
  type: "user" | "assistant";
  content: string;
  timestamp: Date;
};

const MessageView = ({
  message,
  isSelected,
  width,
  userMessage,
}: {
  message: Message;
  isSelected: boolean;
  width: number;
  userMessage?: Message;
}) =>
  message.type === "user" ? (
    !isSelected && <Text>→ {message.content}</Text>
  ) : isSelected ? (
    <Box flexDirection="column" width="100%">
      <Text>
        {"─".repeat(width - (userMessage ? userMessage.content.length + 5 : 3))}
      </Text>
      <Box width="100%" marginBottom={1}>
        {userMessage && <Text>→ {userMessage.content} </Text>}
      </Box>
      <Box width="100%">
        <Box width="50%" paddingRight={1}>
          <Text color="white">{message.content}</Text>
        </Box>
        <Box flexGrow={0} width={1}>
          <Text>{"│"}</Text>
        </Box>
        <Box width="50%" paddingLeft={1}>
          <Text dimColor>
            Assistant response • {message.timestamp.toLocaleTimeString()} •{" "}
            {message.content.length} chars • {message.content.split("\n").length}{" "}
            lines
          </Text>
        </Box>
      </Box>
      <Box width="100%" marginTop={1}>
        <Text>{"─".repeat(width - 2)}</Text>
      </Box>
    </Box>
  ) : (
    <Text>
      {" "}
      {message.content.split("\n")[0] +
        (message.content.includes("\n") ? "..." : "")}
    </Text>
  );

function Demo() {
  const { columns: width } = useTerminalSize();

  const [messages, setMessages] = useState<Message[]>([
    {
      type: "assistant",
      content:
        "I'm Claude, an AI assistant. I can help you understand and modify code, explain concepts, and answer questions.\nI'll try to be clear and concise in my responses.\nWhat would you like help with?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const assistantMessages = useMemo(
    () =>
      messages
        .map((msg, idx) => ({ msg, idx }))
        .filter(({ msg }) => msg.type === "assistant"),
    [messages],
  );

  const handleSubmit = (value: string) => {
    if (!value.trim()) return;
    const userMessage = {
      type: "user" as const,
      content: value.trim(),
      timestamp: new Date(),
    };
    const [response] = getAssistantResponses(value.trim());
    setMessages((prev) => [...prev, userMessage, response]);
  };

  const handleHistoryUp = () => {
    setSelectedIndex((prev) => {
      if (prev === -1)
        return assistantMessages[assistantMessages.length - 1]?.idx ?? -1;
      const currentAssistantIndex = assistantMessages.findIndex(
        ({ idx }) => idx === prev,
      );
      if (currentAssistantIndex <= 0) return assistantMessages[0]?.idx ?? -1;
      return assistantMessages[currentAssistantIndex - 1]?.idx ?? -1;
    });
  };

  const handleHistoryDown = () => {
    setSelectedIndex((prev) => {
      if (prev === -1) return -1;
      const currentAssistantIndex = assistantMessages.findIndex(
        ({ idx }) => idx === prev,
      );
      if (currentAssistantIndex >= assistantMessages.length - 1) return -1;
      return assistantMessages[currentAssistantIndex + 1]?.idx ?? -1;
    });
  };

  const { renderedValue } = useTextInput({
    value: input,
    onChange: setInput,
    onSubmit: handleSubmit,
    onHistoryUp: handleHistoryUp,
    onHistoryDown: handleHistoryDown,
    multiline: true,
    disableCursorMovementForUpDownKeys: true,
  });

  return (
    <>
      <Box flexDirection="column" width="100%">
        {messages.map((msg, i) => {
          const userMessage =
            msg.type === "assistant" && i > 0 ? messages[i - 1] : undefined;
          const nextAssistantSelected =
            msg.type === "user" &&
            i + 1 < messages.length &&
            selectedIndex === i + 1;

          return (
            <Box key={i} flexDirection="column">
              <Box
                paddingLeft={1}
                paddingRight={1}
                marginTop={msg.type === "user" ? 1 : 0}
              >
                <MessageView
                  message={msg}
                  isSelected={nextAssistantSelected || selectedIndex === i}
                  width={width}
                  userMessage={userMessage}
                />
              </Box>
            </Box>
          );
        })}
      </Box>

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
            Ask a question or describe what you'd like help with...
          </Text>
        )}
      </Box>
    </>
  );
}

const getAssistantResponses = (userMessage: string): Message[] => {
  return [
    {
      type: "assistant",
      content: [
        `I understand you're asking about "${userMessage}". Let me help with that.`,
        `Here's what I think about "${userMessage}"...`,
        `Would you like to know more about "${userMessage}"?`,
      ].join("\n"),
      timestamp: new Date(),
    },
  ];
};

render(<Demo />, { exitOnCtrlC: false });
