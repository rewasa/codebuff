#!/usr/bin/env node
import https from 'https';
import http from 'http';
import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGODB_URL;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;

function httpsRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol === 'https:' ? https : http;
    
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = protocol.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });

    req.on('error', reject);
    
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    
    req.end();
  });
}

async function getAccessToken() {
  const response = await httpsRequest('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: {
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token'
    }
  });
  return response.access_token;
}

function extractFolderId(url) {
  if (!url) return null;
  const match = url.match(/folders\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

async function listFilesInFolder(accessToken, folderId) {
  const url = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+mimeType='application/vnd.google-apps.presentation'&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`;
  const response = await httpsRequest(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  return response.files || [];
}

async function getPresentation(accessToken, presentationId) {
  const url = `https://slides.googleapis.com/v1/presentations/${presentationId}`;
  return await httpsRequest(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
}

async function main() {
  console.log('🔍 Debugging Google Slides Image Structure\n');

  const mongoClient = new MongoClient(MONGODB_URI);
  await mongoClient.connect();
  
  const db = mongoClient.db('heroku_q5b1c1cd');
  const propertiesCollection = db.collection('Property');

  // Get first property from allowed agents
  const property = await propertiesCollection.findOne({
    'expose2022.destinationFolderUrl': { $exists: true, $ne: '' },
    hubdbInternalAgentId: { $in: ['5303752653', '12428052', '25553264100'] }
  });

  if (!property) {
    console.log('No property found');
    await mongoClient.close();
    return;
  }

  console.log(`Property: ${property._id}`);
  console.log(`Folder: ${property.expose2022.destinationFolderUrl}\n`);

  const accessToken = await getAccessToken();
  const folderId = extractFolderId(property.expose2022.destinationFolderUrl);
  const files = await listFilesInFolder(accessToken, folderId);
  const mainSlides = files.filter(f => !f.name.toLowerCase().includes('_attachments'));

  if (mainSlides.length === 0) {
    console.log('No presentations found');
    await mongoClient.close();
    return;
  }

  const presentation = await getPresentation(accessToken, mainSlides[0].id);
  console.log(`Analyzing: ${mainSlides[0].name}\n`);

  // Analyze slide 2 (index 1)
  const slide = presentation.slides[1];
  console.log('='.repeat(80));
  console.log('SLIDE 2 (index 1) - ALL IMAGES');
  console.log('='.repeat(80));

  if (!slide.pageElements) {
    console.log('No page elements found');
  } else {
    let imageCount = 0;
    for (const element of slide.pageElements) {
      if (element.image) {
        imageCount++;
        console.log(`\n📷 IMAGE ${imageCount}:`);
        console.log(`   objectId: ${element.objectId}`);
        console.log(`   description: ${element.description || 'null'}`);
        console.log(`   title: ${element.title || 'null'}`);
        
        if (element.image.sourceUrl) {
          console.log(`   sourceUrl: ${element.image.sourceUrl}`);
        }
        if (element.image.contentUrl) {
          console.log(`   contentUrl: ${element.image.contentUrl}`);
        }
        
        console.log(`   Full image object:`);
        console.log(JSON.stringify(element.image, null, 4));
      }
    }
    console.log(`\n\nTotal images found: ${imageCount}`);
  }

  await mongoClient.close();
}

main().catch(console.error);
