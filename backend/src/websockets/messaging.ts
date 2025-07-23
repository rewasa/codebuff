export type SendSubagentChunk = (data: {
  userInputId: string
  agentId: string
  agentType: string
  chunk: string
  prompt?: string
}) => void
