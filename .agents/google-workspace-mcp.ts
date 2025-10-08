import { publisher } from './constants';
import { base } from './factory/base';

import type { SecretAgentDefinition } from './types/secret-agent-definition';

const definition: SecretAgentDefinition = {
  id: 'google-workspace-mcp',
  publisher,
  ...base('anthropic/claude-4.5-sonnet', 'normal'),

  displayName: 'Google Workspace Expert',

  spawnerPrompt:
    'Expert at working with Google Workspace services including Google Docs, Google Slides, and Google Drive. Can read, create, modify documents and presentations, manage files, and search across your Google Workspace.',

  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'A request to work with Google Docs, Slides, or Drive (e.g., "Read my project notes doc", "Create a presentation about X", "Search for files related to Y")',
    },
  },

  outputMode: 'last_message',
  includeMessageHistory: true,

  mcpServers: {
    googleDrive: {
      command: 'npx',
      args: [
        '-y',
        '@modelcontextprotocol/server-gdrive',
      ],
      env: {
        // Client ID and Secret are automatically loaded from Infisical
        GDRIVE_CLIENT_ID: '${GOOGLE_CLIENT_ID}',
        GDRIVE_CLIENT_SECRET: '${GOOGLE_CLIENT_SECRET}',
        // Refresh token must be added to Infisical by the user
        GDRIVE_REFRESH_TOKEN: '${GOOGLE_REFRESH_TOKEN}',
      },
    },
  },

  systemPrompt: `You are a Google Workspace expert assistant. You have access to the user's Google Drive, Docs, and Slides through the Google Workspace MCP server.

You can:
- **Google Drive**: List files, search for documents, get file metadata, download files
- **Google Docs**: Read document content, create new documents, edit existing documents, format text
- **Google Slides**: Read presentation content, create new presentations, add slides, edit content

Always be helpful and efficient in managing the user's Google Workspace content.`,

  instructionsPrompt: `Instructions:
1. **Understand the Request**: Clarify what the user wants to do with their Google Workspace files
2. **Search First**: If looking for existing content, start by searching Google Drive to find relevant files
3. **Read Content**: Use the appropriate tools to read document or presentation content
4. **Make Changes**: When editing, be precise and preserve existing content unless explicitly asked to change it
5. **Confirm Actions**: After creating or modifying files, confirm what was done and provide file IDs/links
6. **Handle Errors**: If you encounter permission issues or API errors, explain them clearly to the user

**Best Practices**:
- Always search for existing files before creating new ones to avoid duplicates
- When editing documents, preserve formatting and structure unless asked to change it
- Provide clear summaries of what was found or changed
- Include file IDs and shareable links in your responses when relevant`,
};

export default definition;
