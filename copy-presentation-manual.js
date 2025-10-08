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
  if (!response.ok) throw new Error('Token failed');
  return data.access_token;
}

async function getPresentation(id, token) {
  const r = await fetch('https://slides.googleapis.com/v1/presentations/' + id, {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  if (!r.ok) throw new Error('Get failed');
  return r.json();
}

async function copyViaFileId(origFileId, newTitle, token) {
  const r = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { 
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: newTitle,
      mimeType: 'application/vnd.google-apps.presentation'
    })
  });
  
  if (!r.ok) throw new Error('Create failed: ' + await r.text());
  const newFile = await r.json();
  
  // Copy via Drive API export/import
  const exportR = await fetch(
    'https://www.googleapis.com/drive/v3/files/' + origFileId + '/export?mimeType=application/vnd.openxmlformats-officedocument.presentationml.presentation',
    { headers: { 'Authorization': 'Bearer ' + token } }
  );
  
  if (!exportR.ok) throw new Error('Export failed');
  const blob = await exportR.blob();
  
  const importR = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files/' + newFile.id + '?uploadType=media',
    {
      method: 'PATCH',
      headers: { 
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      },
      body: blob
    }
  );
  
  if (!importR.ok) throw new Error('Import failed: ' + await importR.text());
  
  return newFile.id;
}

async function batchUpdate(id, requests, token) {
  const r = await fetch(
    'https://slides.googleapis.com/v1/presentations/' + id + ':batchUpdate',
    {
      method: 'POST',
      headers: { 
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ requests })
    }
  );
  if (!r.ok) throw new Error('Update failed: ' + await r.text());
  return r.json();
}

async function main() {
  const ORIG_ID = '1FnKuYNX_tepDU3w6G6HED-hIaR6yuyRXuLyB6Grr_FI';
  const NEW_TITLE = '39 Oktober update - Team Event';
  
  try {
    console.log('Getting token...');
    const token = await getAccessToken();
    
    console.log('Copying via export/import...');
    const newId = await copyViaFileId(ORIG_ID, NEW_TITLE, token);
    console.log('Created:', newId);
    
    // Wait for Google to process the file
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('Reading new presentation...');
    const pres = await getPresentation(newId, token);
    
    const slideIds = [];
    if (pres.slides.length > 1) slideIds.push(pres.slides[1].objectId);
    if (pres.slides.length > 2) slideIds.push(pres.slides[2].objectId);
    if (pres.slides.length > 3) slideIds.push(pres.slides[3].objectId);
    
    const requests = [
      ...slideIds.map(id => ({ deleteObject: { objectId: id } })),
      { replaceAllText: { containsText: { text: 'august', matchCase: false }, replaceText: 'oktober' } },
      { replaceAllText: { containsText: { text: 'August', matchCase: false }, replaceText: 'Oktober' } }
    ];
    
    console.log('Updating...');
    await batchUpdate(newId, requests, token);
    
    console.log('Done! https://docs.google.com/presentation/d/' + newId);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
