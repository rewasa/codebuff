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
  const PRES_ID = '1pVmowqWKloI2O6a1VxLXAVz4afPBkAi13t8rCwTnOjM';
  
  try {
    console.log('Getting token...');
    const token = await getAccessToken();
    
    console.log('Step 1: Delete graphics from slides 2-3...');
    let pres = await getPresentation(PRES_ID, token);
    
    const deleteRequests = [];
    pres.slides.forEach((slide, index) => {
      if (index === 1 || index === 2) {
        slide.pageElements?.forEach(element => {
          if (element.shape && !element.shape.placeholder && !element.shape.text) {
            deleteRequests.push({
              deleteObject: { objectId: element.objectId }
            });
          }
        });
      }
    });
    
    if (deleteRequests.length > 0) {
      console.log('Deleting', deleteRequests.length, 'graphics...');
      await batchUpdate(PRES_ID, deleteRequests, token);
    }
    
    console.log('Step 2: Apply text formatting to all slides...');
    pres = await getPresentation(PRES_ID, token);
    
    const formatRequests = [];
    pres.slides.forEach((slide, index) => {
      slide.pageElements?.forEach(element => {
        if (element.shape?.text) {
          const isTitle = element.shape.placeholder?.type === 'TITLE' || 
                         element.shape.placeholder?.type === 'CENTERED_TITLE';
          const isSubtitle = element.shape.placeholder?.type === 'SUBTITLE';
          
          formatRequests.push({
            updateTextStyle: {
              objectId: element.objectId,
              style: {
                fontSize: {
                  magnitude: isTitle ? 28 : (isSubtitle ? 18 : 14),
                  unit: 'PT'
                },
                foregroundColor: {
                  opaqueColor: {
                    rgbColor: { red: 0, green: 0, blue: 0 }
                  }
                },
                bold: isTitle
              },
              fields: 'fontSize,foregroundColor,bold'
            }
          });
        }
      });
    });
    
    console.log('Applying', formatRequests.length, 'formatting updates...');
    await batchUpdate(PRES_ID, formatRequests, token);
    
    console.log('\nDone! https://docs.google.com/presentation/d/' + PRES_ID);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
