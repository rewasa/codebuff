// Test Google Drive API access

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
  if (!response.ok) {
    throw new Error(`Failed to get access token: ${JSON.stringify(data)}`);
  }
  
  console.log('✅ Access token scopes:', data.scope);
  return data.access_token;
}

async function testDriveAccess(accessToken, folderId) {
  console.log(`\n🔍 Testing folder: ${folderId}\n`);
  
  // Test 1: List all files (no filter)
  const url1 = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents&fields=files(id,name,mimeType,parents)`;
  
  const response1 = await fetch(url1, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  
  const data1 = await response1.json();
  
  if (!response1.ok) {
    console.error('❌ Error listing files:', JSON.stringify(data1, null, 2));
    return;
  }
  
  console.log(`Found ${data1.files.length} total files:\n`);
  
  for (const file of data1.files) {
    console.log(`  - ${file.name}`);
    console.log(`    Type: ${file.mimeType}`);
    console.log(`    ID: ${file.id}\n`);
  }
  
  // Test 2: Check folder permissions
  const url2 = `https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,name,permissions,capabilities`;
  
  const response2 = await fetch(url2, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  
  const data2 = await response2.json();
  
  if (!response2.ok) {
    console.error('❌ Error getting folder info:', JSON.stringify(data2, null, 2));
    return;
  }
  
  console.log('📁 Folder Info:');
  console.log(`  Name: ${data2.name}`);
  console.log(`  Can list children: ${data2.capabilities?.canListChildren}`);
  console.log(`  Can read: ${data2.capabilities?.canRead}\n`);
}

async function main() {
  try {
    console.log('🔐 Getting access token...\n');
    const accessToken = await getAccessToken();
    
    // Test first folder (Florian Beck)
    await testDriveAccess(accessToken, '1CBXjkBBmYLNhAg7RIKwuGo-QuHz36guw');
    
    console.log('\n✅ Test completed!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
