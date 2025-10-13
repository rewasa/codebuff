# Plan: Fix Google Slides Image Upload

## Problem
- Google Slides API rejects ALL external URLs (agentselly.ch, imgbb.com)
- Need images publicly accessible in format Slides API accepts
- Should cache uploads per agent to avoid re-uploading

## Solution: Upload ONCE to Google Drive per Agent

### Step 1: Pre-upload Script
Create separate script `upload-agent-images.mjs` that:
1. Downloads all 3 agent images from agentselly.ch (with User-Agent header)
2. Converts WebP to PNG using `dwebp`
3. Uploads to Drive folder `1XEcxiJUkvdyeR1nZ9wK5V3rbMdYQC8Nv`
4. Makes publicly accessible
5. Saves mapping: `{ agentId: driveFileId }` to `agent-images.json`

### Step 2: Modify update-expose-slides-agents.mjs
1. Load `agent-images.json` at startup
2. For each agent, use pre-uploaded Drive URL: `https://drive.google.com/uc?export=view&id=${fileId}`
3. No runtime uploads - just use existing URLs

### Step 3: Update Logic
1. Check if agent has entry in `agent-images.json`
2. If yes: use that Drive URL
3. If no: skip image update with warning

## Benefits
- Upload once, use many times
- Guaranteed Slides API compatibility
- No runtime dependencies on external services
- Fast execution