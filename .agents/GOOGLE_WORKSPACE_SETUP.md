# Google Workspace Agent Setup Guide

This guide explains how to set up and use the Google Workspace agent to work with Google Docs, Slides, and Drive.

## Prerequisites

1. A Google account with access to Google Workspace
2. Node.js and npm/npx installed
3. Codebuff installed and configured

## Setup Steps

### 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the following APIs:
   - Google Drive API
   - Google Docs API
   - Google Slides API

### 2. Configure OAuth 2.0 Credentials

1. In Google Cloud Console, go to **APIs & Services > Credentials**
2. Click **Create Credentials > OAuth client ID**
3. Choose **Desktop app** as the application type
4. Download the credentials JSON file

### 3. Get Refresh Token

You need to obtain a refresh token to allow the agent to access your Google Workspace:

```bash
# Install the MCP server to get the auth helper
npx @modelcontextprotocol/server-google-workspace
```

Follow the authentication flow to get:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`

### 4. Configure Environment Variables

**Note:** `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are automatically loaded from Infisical. You only need to add `GOOGLE_REFRESH_TOKEN` to Infisical:

```bash
# Add only this to Infisical:
GOOGLE_REFRESH_TOKEN=your_refresh_token_here
```

The Client ID and Client Secret are already configured in Infisical and will be automatically available to the agent.

## Usage

### Spawn the Agent

```typescript
// In your code or via Codebuff CLI
spawn_agents([
  {
    agent_type: 'google-workspace-mcp',
    prompt: 'Search for documents related to project planning',
  },
]);
```

### Example Use Cases

**Search for files:**

```
"Find all documents with 'budget' in the title"
```

**Read a document:**

```
"Read the content of my project notes document"
```

**Create a new document:**

```
"Create a new Google Doc titled 'Meeting Notes' with today's agenda"
```

**Edit a document:**

```
"Add a section about Q1 goals to my planning document"
```

**Create a presentation:**

```
"Create a presentation about our product roadmap with 5 slides"
```

**List recent files:**

```
"Show me my 10 most recently modified documents"
```

## Available Capabilities

### Google Drive

- List and search files
- Get file metadata (name, size, modified date, etc.)
- Download file content
- Manage file permissions (with proper scopes)

### Google Docs

- Read full document content with formatting
- Create new documents
- Edit existing documents
- Add/modify text, headings, lists, tables
- Apply text formatting (bold, italic, etc.)

### Google Slides

- Read presentation content
- Create new presentations
- Add new slides
- Edit slide content
- Manage slide layouts

## Troubleshooting

### "Invalid credentials" error

- Verify your environment variables are set correctly
- Make sure the refresh token hasn't expired
- Re-authenticate to get a new refresh token

### "Insufficient permissions" error

- Check that the required APIs are enabled in Google Cloud Console
- Verify the OAuth scopes include Drive, Docs, and Slides access

### MCP server not starting

- Ensure `@modelcontextprotocol/server-google-workspace` is accessible via npx
- Check that Node.js version is compatible (14.x or higher recommended)

## Security Notes

- Keep your credentials secure and never commit them to version control
- The refresh token provides ongoing access to your Google Workspace - treat it like a password
- Regularly review and revoke access in your [Google Account Security Settings](https://myaccount.google.com/permissions)
- Consider using a dedicated Google account for automation if working with sensitive data

## Additional Resources

- [Google Workspace APIs Documentation](https://developers.google.com/workspace)
- [OAuth 2.0 for Desktop Apps](https://developers.google.com/identity/protocols/oauth2/native-app)
- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
