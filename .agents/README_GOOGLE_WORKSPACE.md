# Google Workspace Agent - Quick Reference

## Agent ID

`google-workspace-mcp` or `codebuff/google-workspace-mcp@latest`

## What it does

Provides integration with Google Docs, Google Slides, and Google Drive through the Model Context Protocol (MCP).

## Setup Required

See [GOOGLE_WORKSPACE_SETUP.md](./GOOGLE_WORKSPACE_SETUP.md) for detailed setup instructions.

Required environment variables:

- `GOOGLE_CLIENT_ID` (automatically loaded from Infisical)
- `GOOGLE_CLIENT_SECRET` (automatically loaded from Infisical)
- `GOOGLE_REFRESH_TOKEN` (you need to add this to Infisical)

## Usage Examples

### From Codebuff CLI

```bash
codebuff "@google-workspace-mcp search for my project planning documents"
```

### Spawning from another agent

```typescript
yield {
  toolName: 'spawn_agents',
  input: {
    agents: [{
      agent_type: 'google-workspace-mcp',
      prompt: 'Create a presentation about Q1 results'
    }]
  }
}
```

## Capabilities

### Google Drive

- ✅ Search and list files
- ✅ Get file metadata
- ✅ Download file content

### Google Docs

- ✅ Read document content
- ✅ Create new documents
- ✅ Edit existing documents
- ✅ Format text (bold, italic, headings, etc.)

### Google Slides

- ✅ Read presentation content
- ✅ Create new presentations
- ✅ Add and edit slides
- ✅ Manage layouts

## Tips

1. **Always search first** - Before creating new files, search to avoid duplicates
2. **Use file IDs** - When referencing files, use their unique Google Drive IDs
3. **Preserve structure** - The agent preserves existing formatting unless told otherwise
4. **Check permissions** - Ensure your OAuth token has the necessary scopes

## Common Use Cases

- 📄 Reading meeting notes from Google Docs
- 📊 Creating automated reports in Google Slides
- 🔍 Searching across all your Google Drive files
- ✏️ Updating shared documents with new information
- 📁 Organizing and managing files in Google Drive
