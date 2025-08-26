import { plannerFactory } from './planner-factory'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  id: 'planner',
  ...plannerFactory('openai/gpt-5-chat'),
}

export default definition
