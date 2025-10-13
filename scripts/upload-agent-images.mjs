#!/usr/bin/env node
import https from 'https'
import http from 'http'
import { promises as fs } from 'fs'
import { exec } from 'child_process'
import { promisify } from 'util'
import { google } from 'googleapis'

const execAsync = promisify(exec)

// Configuration
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN
const DRIVE_FOLDER_ID = '1XEcxiJUkvdyeR1nZ9wK5V3rbMdYQC8Nv'

// Agent images to upload
const AGENT_IMAGES = [
  {
    agentId: '12428052',
    name: 'Florian Beck',
    url: 'https://www.agentselly.ch/data/static/hubdb/images/032fb2550d6da14f9bc446b4e2fe350a-237x237.webp',
  },
  {
    agentId: '25553264100',
    name: 'Martin Heim',
    url: 'https://www.agentselly.ch/data/static/hubdb/images/0e647d91fb1bf1b2ac86af0c4208acee-375x375.webp',
  },
  {
    agentId: '5303752653',
    name: 'Alissa Balatsky',
    url: 'https://www.agentselly.ch/data/static/hubdb/images/f10b3f7e11b4577546ff140f35209ea5-400x400.webp',
  },
]

async function uploadImage(imageData) {
  const tempWebp = `/tmp/agent-${imageData.agentId}.webp`
  const tempPng = `/tmp/agent-${imageData.agentId}.png`

  try {
    console.log(`\n📥 Processing ${imageData.name}...`)

    // Download with User-Agent header
    const response = await fetch(imageData.url, {
      headers: {
        'User-Agent': 'as-external-request-ua-agentselly',
      },
    })

    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`)
    }

    const buffer = await response.arrayBuffer()
    await fs.writeFile(tempWebp, Buffer.from(buffer))
    console.log(`  ✓ Downloaded`)

    // Convert to PNG
    await execAsync(`dwebp "${tempWebp}" -o "${tempPng}"`)
    console.log(`  ✓ Converted to PNG`)

    // Upload to Google Drive
    const auth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET)
    auth.setCredentials({ refresh_token: REFRESH_TOKEN })
    const drive = google.drive({ version: 'v3', auth })

    const pngStream = (await import('fs')).createReadStream(tempPng)

    const file = await drive.files.create({
      requestBody: {
        name: `agent-${imageData.agentId}-${imageData.name.replace(/ /g, '-')}.png`,
        parents: [DRIVE_FOLDER_ID]
      },
      media: {
        mimeType: 'image/png',
        body: pngStream,
      },
      fields: 'id',
    })

    // Make publicly accessible
    await drive.permissions.create({
      fileId: file.data.id,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    })

    const driveUrl = `https://drive.google.com/uc?export=view&id=${file.data.id}`
    console.log(`  ✓ Uploaded to Drive: ${file.data.id}`)

    // Cleanup
    await fs.unlink(tempWebp).catch(() => {})
    await fs.unlink(tempPng).catch(() => {})

    return {
      agentId: imageData.agentId,
      driveFileId: file.data.id,
      driveUrl: driveUrl,
    }
  } catch (error) {
    console.error(`  ✗ Error: ${error.message}`)
    await fs.unlink(tempWebp).catch(() => {})
    await fs.unlink(tempPng).catch(() => {})
    return null
  }
}

async function main() {
  console.log('🚀 Uploading agent profile images to Google Drive\n')

  const results = []
  for (const imageData of AGENT_IMAGES) {
    const result = await uploadImage(imageData)
    if (result) {
      results.push(result)
    }
  }

  // Save mapping to JSON file
  const mapping = {}
  results.forEach((r) => {
    mapping[r.agentId] = r
  })

  await fs.writeFile(
    'scripts/agent-images.json',
    JSON.stringify(mapping, null, 2),
  )

  console.log(`\n✅ Uploaded ${results.length}/${AGENT_IMAGES.length} images`)
  console.log(`\n💾 Saved mapping to scripts/agent-images.json`)

  // Display results
  console.log('\n📋 Image URLs:')
  results.forEach((r) => {
    console.log(`  ${r.agentId}: ${r.driveUrl}`)
  })
}

main().catch(console.error)
