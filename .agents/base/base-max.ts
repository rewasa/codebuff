import { publisher } from '../constants';
import { base } from './base-factory';

import type { SecretAgentDefinition } from '../types/secret-agent-definition';

const definition: SecretAgentDefinition = {
  id: 'base-max',
  publisher,
  ...base('anthropic/claude-opus-4.1', 'max'),
};

export default definition;
