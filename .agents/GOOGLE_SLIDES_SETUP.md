# Google Slides API Agent - Setup Guide

This guide explains how to set up the Google Slides API agent to work with your Google Slides presentations.

## Quick Start

1. **Environment Variables** (automatically from Infisical):
   - ✅ `GOOGLE_CLIENT_ID` - Already configured in Infisical
   - ✅ `GOOGLE_CLIENT_SECRET` - Already configured in Infisical
   - ❌ `GOOGLE_REFRESH_TOKEN` - **You need to add this to Infisical**

## Getting Your Refresh Token

### Option 1: Using the Helper Script (Easiest)

We've created a helper script that automates the OAuth flow:

```bash
# Run the helper script
infisical run -- node get-google-refresh-token.js
```

This will:

1. Start a local server on port 3000
2. Open your browser to authorize Google Slides access
3. Automatically exchange the code for a refresh token
4. Display the refresh token in your terminal
5. Guide you to add it to Infisical

### Option 2: Using OAuth Playground

1. Go to [Google OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)

2. Click the gear icon (⚙️) in the top right

   - Check "Use your own OAuth credentials"
   - Enter your Client ID and Client Secret (from Infisical)
   - Click "Close"

3. In Step 1 (Select & authorize APIs):

   - Scroll down and find "Google Slides API v1"
   - Select: `https://www.googleapis.com/auth/presentations`
   - Click "Authorize APIs"

4. Sign in with your Google account and grant access

5. In Step 2 (Exchange authorization code for tokens):

   - Click "Exchange authorization code for tokens"
   - Copy the `refresh_token` value

6. Add to Infisical:
   ```bash
   # In your Infisical dashboard, add:
   GOOGLE_REFRESH_TOKEN=<your_refresh_token_here>
   ```

### Option 2: Manual OAuth Flow

If you prefer to do it programmatically:

```javascript
// 1. Get authorization code
const authUrl =
  `https://accounts.google.com/o/oauth2/v2/auth?` +
  `client_id=${CLIENT_ID}&` +
  `redirect_uri=http://localhost:3000&` +
  `response_type=code&` +
  `scope=https://www.googleapis.com/auth/presentations&` +
  `access_type=offline&` +
  `prompt=consent`;

// Open this URL in browser and get the code from callback

// 2. Exchange code for tokens
const response = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code: AUTHORIZATION_CODE,
    grant_type: 'authorization_code',
    redirect_uri: 'http://localhost:3000',
  }),
});

const { refresh_token } = await response.json();
// Save this refresh_token to Infisical
```

## Testing the Setup

Once you've added the refresh token to Infisical:

```bash
# Test reading a presentation
infisical run -- node test-slides-read.js
```

Or use the agent directly:

```bash
codebuff "@google-slides-api read presentation 1FnKuYNX_tepDU3w6G6HED-hIaR6yuyRXuLyB6Grr_FI"
```

## Usage Examples

### Read a Presentation

```bash
codebuff "@google-slides-api show me the content of presentation ID: 1FnKu..."
```

### Create a New Presentation

```bash
codebuff "@google-slides-api create a new presentation titled 'Q1 Results'"
```

### Add Content to Slides

```bash
codebuff "@google-slides-api add a slide with title 'Summary' to presentation 1FnKu..."
```

## How It Works

The agent:

1. Uses the refresh token to get a short-lived access token
2. Makes authenticated requests to the Google Slides API
3. Parses the presentation structure and content
4. Returns formatted results

## API Endpoints Used

- **Read**: `GET https://slides.googleapis.com/v1/presentations/{id}`
- **Create**: `POST https://slides.googleapis.com/v1/presentations`
- **Update**: `POST https://slides.googleapis.com/v1/presentations/{id}:batchUpdate`

## Troubleshooting

### "Missing required parameter: refresh_token"

**Problem**: The `GOOGLE_REFRESH_TOKEN` environment variable is not set.

**Solution**: Follow the "Getting Your Refresh Token" section above and add it to Infisical.

### "invalid_grant" or "Token has been expired or revoked"

**Problem**: Your refresh token has expired or been revoked.

**Solution**: Generate a new refresh token following the steps above. Make sure to:

- Use `access_type=offline` in the auth URL
- Use `prompt=consent` to force a new refresh token

### "The caller does not have permission"

**Problem**: The Google Slides API is not enabled for your project.

**Solution**:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Enable the "Google Slides API"
3. Generate a new refresh token

### "Requested entity was not found"

**Problem**: The presentation ID doesn't exist or you don't have access to it.

**Solution**:

- Check the presentation ID is correct
- Make sure the presentation is shared with the Google account you used for OAuth

## Security Notes

- The refresh token provides long-term access to your Google Slides
- Keep it secure in Infisical - never commit it to version control
- Regularly review OAuth permissions in [Google Account Settings](https://myaccount.google.com/permissions)
- Consider using a dedicated Google account for automation

## Additional Resources

- [Google Slides API Documentation](https://developers.google.com/slides/api)
- [OAuth 2.0 for Desktop Apps](https://developers.google.com/identity/protocols/oauth2/native-app)
- [Google Slides API Samples](https://developers.google.com/slides/samples)
