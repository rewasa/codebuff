import type { SecretAgentDefinition } from '../types/secret-agent-definition'
import { thinker } from './thinker'

const definition: SecretAgentDefinition = {
  ...thinker('anthropic/claude-4.5-sonnet'),
  id: 'thinker-lite',
  displayName: 'Thinker Lite',
  model: 'x-ai/grok-4-fast',
}

export default definition