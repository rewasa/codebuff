import fetch from 'node-fetch';
import { MongoClient } from 'mongodb';

async function getAccessToken() {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token'
    })
  });
  const data = await response.json();
  return data.access_token;
}

function extractPresentationId(url) {
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

async function main() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db('agentselly_production');
  
  const property = await db.collection('properties').findOne({
    'expose2022.destinationFolderUrl': { $exists: true, $ne: '' },
    hubdbInternalAgentId: { $in: ['5303752653', '12428052', '25553264100'] }
  });
  
  const presentationId = extractPresentationId(property.expose2022.destinationFolderUrl);
  console.log('Presentation ID:', presentationId);
  
  const accessToken = await getAccessToken();
  const response = await fetch(`https://slides.googleapis.com/v1/presentations/${presentationId}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  
  const presentation = await response.json();
  const slide = presentation.slides[1];
  
  console.log('\nIMAGES ON SLIDE 2:');
  slide.pageElements.filter(e => e.image).forEach(img => {
    console.log('\nImage:', img.objectId);
    console.log('sourceUrl:', img.image.sourceUrl || 'N/A');
    console.log('contentUrl:', img.image.contentUrl || 'N/A');
  });
  
  await client.close();
}

main().catch(console.error);
