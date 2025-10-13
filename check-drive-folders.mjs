import https from 'https';

const FOLDER_IDS = [
  { id: 'k8iaevd5azinaij3', folderId: '1CBXjkBBmYLNhAg7RIKwuGo-QuHz36guw' },
  { id: 'vivafskcttq1zhon', folderId: '1oWoaWhagrF3zqXjmBnZaQ-7dj0lfLsWP' },
  { id: 'l4fs9wcrxuqaaw44', folderId: '19MhGQsC7k4tLJPyNekVT3pVApjkkOpPS' }
];

function httpsRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = https.request(requestOptions, (res) => {
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
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  const response = await httpsRequest('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: {
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    }
  });

  return response.access_token;
}

async function listAllFilesInFolder(accessToken, folderId) {
  const url = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents&fields=files(id,name,mimeType)`;
  
  const response = await httpsRequest(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  return response;
}

async function main() {
  console.log('🔍 Checking Google Drive folders...\n');

  const accessToken = await getAccessToken();
  console.log('✅ Access token obtained\n');

  for (const folder of FOLDER_IDS) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Property ID: ${folder.id}`);
    console.log(`Folder ID: ${folder.folderId}`);
    console.log(`Link: https://drive.google.com/drive/folders/${folder.folderId}`);
    console.log('='.repeat(60));

    const response = await listAllFilesInFolder(accessToken, folder.folderId);
    
    if (!response.files || response.files.length === 0) {
      console.log('⚠️  No files found\n');
      console.log('Full response:', JSON.stringify(response, null, 2));
    } else {
      console.log(`\n📁 Found ${response.files.length} file(s):\n`);
      response.files.forEach(f => {
        console.log(`   - ${f.name}`);
        console.log(`     ID: ${f.id}`);
        console.log(`     Type: ${f.mimeType}`);
        console.log('');
      });
    }
  }
}

main().catch(console.error);