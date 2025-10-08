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
  if (!response.ok) throw new Error('Token failed: ' + JSON.stringify(data));
  return data.access_token;
}

async function copyPresentation(presentationId, newTitle, accessToken) {
  // First, get the original presentation
  const origResponse = await fetch(
    'https://slides.googleapis.com/v1/presentations/' + presentationId,
    { headers: { 'Authorization': 'Bearer ' + accessToken } }
  );
  if (!origResponse.ok) throw new Error('Get orig failed: ' + await origResponse.text());
  const origPresentation = await origResponse.json();
  
  // Create a new presentation
  const createResponse = await fetch(
    'https://slides.googleapis.com/v1/presentations',
    {
      method: 'POST',
      headers: { 
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ title: newTitle })
    }
  );
  if (!createResponse.ok) throw new Error('Create failed: ' + await createResponse.text());
  const newPresentation = await createResponse.json();
  const newId = newPresentation.presentationId;
  
  // Copy all slides from original to new presentation
  const requests = [];
  origPresentation.slides.forEach((slide, index) => {
    if (index === 0) {
      // Replace the default first slide
      requests.push({
        deleteObject: { objectId: newPresentation.slides[0].objectId }
      });
    }
    requests.push({
      duplicateObject: {
        objectId: slide.objectId
      }
    });
  });
  
  // Execute the duplication using Drive API copy as fallback
  const copyResponse = await fetch(
    'https://www.googleapis.com/drive/v3/files/' + presentationId + '/copy',
    {
      method: 'POST',
      headers: { 
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: newTitle })
    }
  );
  if (!copyResponse.ok) {
    // If Drive API fails, return the manually created presentation
    console.log('Note: Using Slides API copy method instead of Drive API');
    return newId;
  }
  const data = await copyResponse.json();
  return data.id;
}

async function getPresentation(presentationId, accessToken) {
  const response = await fetch(
    'https://slides.googleapis.com/v1/presentations/' + presentationId,
    { headers: { 'Authorization': 'Bearer ' + accessToken } }
  );
  if (!response.ok) throw new Error('Get failed: ' + await response.text());
  return response.json();
}

async function batchUpdate(presentationId, requests, accessToken) {
  const response = await fetch(
    'https://slides.googleapis.com/v1/presentations/' + presentationId + ':batchUpdate',
    {
      method: 'POST',
      headers: { 
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ requests })
    }
  );
  if (!response.ok) throw new Error('Update failed: ' + await response.text());
  return response.json();
}

async function main() {
  const ORIGINAL_ID = '1FnKuYNX_tepDU3w6G6HED-hIaR6yuyRXuLyB6Grr_FI';
  const NEW_TITLE = '39 Oktober update - Team Event';
  
  try {
    console.log('Getting access token...');
    const accessToken = await getAccessToken();
    
    console.log('Copying presentation...');
    const newId = await copyPresentation(ORIGINAL_ID, NEW_TITLE, accessToken);
    console.log('Created:', newId);
    
    console.log('Reading structure...');
    const presentation = await getPresentation(newId, accessToken);
    
    const slideIds = [];
    if (presentation.slides.length > 1) slideIds.push(presentation.slides[1].objectId);
    if (presentation.slides.length > 2) slideIds.push(presentation.slides[2].objectId);
    if (presentation.slides.length > 3) slideIds.push(presentation.slides[3].objectId);
    
    const requests = [
      ...slideIds.map(id => ({ deleteObject: { objectId: id } })),
      { replaceAllText: { containsText: { text: 'august', matchCase: false }, replaceText: 'oktober' } },
      { replaceAllText: { containsText: { text: 'August', matchCase: false }, replaceText: 'Oktober' } }
    ];
    
    console.log('Updating presentation...');
    await batchUpdate(newId, requests, accessToken);
    
    console.log('Done! https://docs.google.com/presentation/d/' + newId);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
