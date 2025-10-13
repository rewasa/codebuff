import https from 'https'
import http from 'http'
import fs from 'fs'

const CONSULTANTS = {
  florian_beck: {
    name: 'Florian Beck',
    jobTitle: 'Immobilien- & Bewertungsexperte',
    email: 'florian.beck@agentselly.ch',
    phone: '+41 41 530 69 40',
    profilePicture:
      'https://www.agentselly.ch/data/static/hubdb/images/032fb2550d6da14f9bc446b4e2fe350a-237x237.webp',
    properties: [
      { id: 'k8iaevd5azinaij3', folderId: '1CBXjkBBmYLNhAg7RIKwuGo-QuHz36guw' },
      { id: 'vivafskcttq1zhon', folderId: '1oWoaWhagrF3zqXjmBnZaQ-7dj0lfLsWP' },
      { id: 'l4fs9wcrxuqaaw44', folderId: '19MhGQsC7k4tLJPyNekVT3pVApjkkOpPS' },
      { id: 'qvg4c1ftahwf4hy1', folderId: '1WZwIXN35kjWZOVkAmdMY16GywU6rqqFL' },
      { id: '9xwb8ghe0a61rhj8', folderId: '1WlbIjcJoL1iFMli1mddgtMQwJTcFdIWL' },
      { id: 'ut8w3ybwaa5isvux', folderId: '18X9WTDseWYjbZE_HcEyiMsJnr3XArPox' },
    ],
  },
  martin_heim: {
    name: 'Martin Heim',
    jobTitle: 'Head of Sales',
    email: 'martin.heim@agentselly.ch',
    phone: '+41 41 530 69 40',
    profilePicture:
      'https://www.agentselly.ch/data/static/hubdb/images/0e647d91fb1bf1b2ac86af0c4208acee-375x375.webp',
    properties: [
      { id: 'b81uygxpjny4fx1s', folderId: '1aElb--J-f8CeCLJ8CEduAA2FzlLDR_oA' },
      { id: '156zayo41f2v36hq', folderId: '1drMtW4CIBV6BuV4RFduLiFwvOTaJ_yI0' },
      { id: 'ptog37sfo0139zp5', folderId: '14JHooEfciG7FR5Jrwe7W71fIIo-GPKy7' },
    ],
  },
  alissa_balatsky: {
    name: 'Alissa Balatsky',
    jobTitle: 'Immobilien- & Bewertungsexpertin',
    email: 'alissa.balatsky@agentselly.ch',
    phone: '+41 41 530 69 40',
    profilePicture:
      'https://www.agentselly.ch/data/static/hubdb/images/f10b3f7e11b4577546ff140f35209ea5-400x400.webp',
    properties: [
      { id: 'ynguhq5m7w5bce0e', folderId: '1UsGuHVZpFUzdajeF9jZBgVklsbHR72R6' },
      { id: 'l7gsgudy70qgzakc', folderId: '1wOf967G4NHbHgToZvwnESXUU4LsKclEL' },
      { id: 'wiqy04ije6avckrr', folderId: '1VxdA2LfKj2fmJayj_Ac4jJgvNHJhjoLf' },
      { id: 'yr00z3w1qta9x9fp', folderId: '1JO2opXx3ABpWw7BQJonx1mij13LE1mfg' },
      { id: 'xhqkfoy06j0hdaaw', folderId: '1moTVjkO-u1peOr5uP5fSeTMyPGUaHN4y' },
      { id: 'u0bm7wzucntc94th', folderId: '1_fEsHoTfTSDyYQ4PyPSD6lu48deho3zx' },
      { id: '1cuiswlfuiyzoh69', folderId: '1B1Q2RcPnpBpwh6hhXejHgPO1F66GXFEv' },
    ],
  },
}

function httpsRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const protocol = urlObj.protocol === 'https:' ? https : http

    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    }

    const req = protocol.request(requestOptions, (res) => {
      let data = ''
      res.on('data', (chunk) => {
        data += chunk
      })
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch (e) {
          resolve(data)
        }
      })
    })

    req.on('error', reject)

    if (options.body) {
      req.write(
        typeof options.body === 'string'
          ? options.body
          : JSON.stringify(options.body),
      )
    }

    req.end()
  })
}

async function getAccessToken() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing Google OAuth credentials in environment variables')
  }

  const response = await httpsRequest('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: {
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    },
  })

  if (!response.access_token) {
    throw new Error('Failed to get access token: ' + JSON.stringify(response))
  }

  return response.access_token
}

async function listFilesInFolder(accessToken, folderId) {
  const url = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+mimeType='application/vnd.google-apps.presentation'&fields=files(id,name)`

  const response = await httpsRequest(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  return response.files || []
}

async function getPresentation(accessToken, presentationId) {
  const url = `https://slides.googleapis.com/v1/presentations/${presentationId}`

  return await httpsRequest(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}

async function updateSlideText(
  accessToken,
  presentationId,
  slideIndex,
  consultant,
) {
  const presentation = await getPresentation(accessToken, presentationId)

  if (!presentation.slides || !presentation.slides[slideIndex]) {
    console.log(`  ⚠️  Slide ${slideIndex + 1} not found`)
    return false
  }

  const slide = presentation.slides[slideIndex]
  const requests = []

  if (slide.pageElements) {
    for (const element of slide.pageElements) {
      if (element.shape && element.shape.text) {
        const textElements = element.shape.text.textElements || []

        for (const textElement of textElements) {
          if (textElement.textRun) {
            const text = textElement.textRun.content

            if (text.includes('Carmen Hodel')) {
              requests.push({
                replaceAllText: {
                  containsText: { text: 'Carmen Hodel', matchCase: false },
                  replaceText: consultant.name,
                },
              })
            }

            if (text.includes('Immobilienvermarkterin')) {
              requests.push({
                replaceAllText: {
                  containsText: {
                    text: 'Immobilienvermarkterin',
                    matchCase: false,
                  },
                  replaceText: consultant.jobTitle,
                },
              })
            }

            if (text.includes('carmen.hodel@agentselly.ch')) {
              requests.push({
                replaceAllText: {
                  containsText: {
                    text: 'carmen.hodel@agentselly.ch',
                    matchCase: false,
                  },
                  replaceText: consultant.email,
                },
              })
            }

            if (
              text.includes('+41764736557') ||
              text.includes('+41 76 473 65 57')
            ) {
              requests.push({
                replaceAllText: {
                  containsText: { text: '+41764736557', matchCase: false },
                  replaceText: consultant.phone,
                },
              })
              requests.push({
                replaceAllText: {
                  containsText: { text: '+41 76 473 65 57', matchCase: false },
                  replaceText: consultant.phone,
                },
              })
            }
          }
        }
      }
    }
  }

  if (requests.length === 0) {
    console.log(`  ℹ️  No Carmen Hodel data found on slide ${slideIndex + 1}`)
    return false
  }

  const batchUpdateUrl = `https://slides.googleapis.com/v1/presentations/${presentationId}:batchUpdate`

  await httpsRequest(batchUpdateUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: { requests },
  })

  console.log(
    `  ✅ Updated slide ${slideIndex + 1} with ${requests.length} text replacements`,
  )
  return true
}

async function processProperty(accessToken, consultant, property) {
  console.log(`\n📂 Processing property: ${property.id}`)
  console.log(`   Consultant: ${consultant.name}`)
  console.log(
    `   Folder: https://drive.google.com/drive/folders/${property.folderId}`,
  )

  try {
    const files = await listFilesInFolder(accessToken, property.folderId)

    if (!files || files.length === 0) {
      console.log('  ⚠️  No presentations found in folder')
      return { success: false, error: 'No presentations found' }
    }

    const mainSlides = files.filter((f) => !f.name.includes('_attachments'))

    if (mainSlides.length === 0) {
      console.log('  ⚠️  No main presentations found (all have _attachments)')
      return { success: false, error: 'Only attachment slides found' }
    }

    console.log(`  📄 Found ${mainSlides.length} presentation(s) to update:`)
    mainSlides.forEach((s) => console.log(`     - ${s.name} (${s.id})`))

    for (const slide of mainSlides) {
      console.log(`\n  🔄 Updating: ${slide.name}`)

      try {
        await updateSlideText(accessToken, slide.id, 1, consultant)
        await updateSlideText(accessToken, slide.id, 6, consultant)

        console.log(`  ✅ Successfully updated ${slide.name}`)
      } catch (error) {
        console.log(`  ❌ Error updating ${slide.name}: ${error.message}`)
      }
    }

    return {
      success: true,
      presentationsUpdated: mainSlides.length,
      link: `https://agency.selly.ch/su/properties/${property.id}`,
    }
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`)
    return { success: false, error: error.message }
  }
}

async function main() {
  console.log('🚀 Starting Google Slides Update Process\n')
  console.log('='.repeat(60))

  try {
    console.log('🔑 Getting Google OAuth access token...')
    const accessToken = await getAccessToken()
    console.log('✅ Access token obtained\n')

    const results = []

    for (const [key, consultant] of Object.entries(CONSULTANTS)) {
      console.log('\n' + '='.repeat(60))
      console.log(`👤 Processing consultant: ${consultant.name}`)
      console.log('='.repeat(60))

      for (const property of consultant.properties) {
        const result = await processProperty(accessToken, consultant, property)
        results.push({
          propertyId: property.id,
          consultant: consultant.name,
          ...result,
        })
      }
    }

    console.log('\n\n' + '='.repeat(60))
    console.log('📊 SUMMARY')
    console.log('='.repeat(60))

    const successful = results.filter((r) => r.success)
    const failed = results.filter((r) => !r.success)

    console.log(
      `\n✅ Successful updates: ${successful.length}/${results.length}`,
    )
    console.log(`❌ Failed updates: ${failed.length}/${results.length}\n`)

    if (successful.length > 0) {
      console.log('🔗 Property Links (Successfully Updated):\n')
      successful.forEach((r) => {
        console.log(`   ${r.propertyId}: ${r.link}`)
      })
    }

    if (failed.length > 0) {
      console.log('\n⚠️  Failed Properties:\n')
      failed.forEach((r) => {
        console.log(`   ${r.propertyId}: ${r.error}`)
      })
    }

    console.log('\n' + '='.repeat(60))
    console.log('✅ Process completed!')
    console.log('='.repeat(60))
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

main().catch(console.error)
