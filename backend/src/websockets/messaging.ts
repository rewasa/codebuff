import { ServerAction } from '@codebuff/common/actions'
import { WebSocket } from 'ws'
import { sendMessage } from './server'

/**
 * Interface for sending WebSocket messages to avoid circular dependencies
 */
export interface WebSocketMessenger {
  sendAction(action: ServerAction): void
  sendSubagentChunk(data: {
    userInputId: string
    agentId: string
    agentType: string
    chunk: string
    prompt?: string
  }): void
}

/**
 * Creates a WebSocket messenger instance
 */
export const createWebSocketMessenger = (
  ws: WebSocket
): WebSocketMessenger => ({
  sendAction: (action: ServerAction) => {
    sendMessage(ws, {
      type: 'action',
      data: action,
    })
  },

  sendSubagentChunk: ({ userInputId, agentId, agentType, chunk, prompt }) => {
    sendMessage(ws, {
      type: 'action',
      data: {
        type: 'subagent-response-chunk',
        userInputId,
        agentId,
        agentType,
        chunk,
        prompt,
      },
    })
  },
})
