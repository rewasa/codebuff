import { publisher } from '../constants';
import baseLite from './base-lite';

import type { SecretAgentDefinition } from '../types/secret-agent-definition';

const definition: SecretAgentDefinition = {
  ...baseLite,
  id: 'base-lite-codex',
  publisher,
  model: 'openai/gpt-5-codex',
  reasoningOptions: {
    enabled: true,
    effort: 'medium',
  },
};

export default definition;
