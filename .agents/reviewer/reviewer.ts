import { publisher } from './constants';
import { reviewer } from './factory/reviewer';

import type { SecretAgentDefinition } from './types/secret-agent-definition';

const definition: SecretAgentDefinition = {
  id: 'reviewer',
  publisher,
  ...reviewer('google/gemini-2.5-pro'),
  reasoningOptions: {
    effort: 'low',
    exclude: true,
  },
};

export default definition;
