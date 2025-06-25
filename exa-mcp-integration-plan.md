# Exa MCP Integration Plan

## Overview
Add the Exa MCP server to Codebuff's MCP system. Exa provides advanced web search capabilities but requires API key authentication.

## Implementation Steps

### 1. Add Exa MCP Package
- Add `exa-mcp-server` to `packages/internal/package.json`
- Run `bun install` to trigger auto-discovery and tool generation

### 2. Handle API Key Authentication
Since Exa requires an API key, we need to:
- Add `EXA_API_KEY` to the environment variables system
- Update the generated MCP tool handler to pass the API key to the Exa process
- Ensure the API key is available in the backend environment

### 3. Environment Variable Setup
- Add `EXA_API_KEY` to the backend environment configuration
- Update the MCP tool generation script to handle environment variables for authenticated tools
- Modify the tool handler to inject the API key when spawning the Exa MCP process

### 4. Tool Generation Customization
The auto-generated tool will need to:
- Check for the presence of `EXA_API_KEY` environment variable
- Pass the API key to the spawned Exa MCP process via environment variables
- Handle authentication errors gracefully

### 5. Testing
- Add integration tests for Exa tools
- Test with and without API key to ensure proper error handling
- Verify all Exa tools work correctly (web_search_exa, research_paper_search, etc.)

## Key Considerations

### Security
- API keys should never be logged or exposed in error messages
- Use environment variables for secure key management
- Fail gracefully when API key is missing

### Tool Selection
Exa provides multiple tools:
- `web_search_exa`: Real-time web searches
- `research_paper_search`: Academic paper search
- `company_research`: Company information gathering
- `crawling`: URL content extraction
- `competitor_finder`: Competitor identification
- `linkedin_search`: LinkedIn search
- `wikipedia_search_exa`: Wikipedia search
- `github_search`: GitHub repository search

### Error Handling
- Handle API key validation errors
- Provide clear error messages for missing/invalid keys
- Graceful degradation when Exa service is unavailable
