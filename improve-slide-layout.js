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
    
    console.log('Reading presentation...');
    const pres = await getPresentation(PRES_ID, token);
    
    if (pres.slides.length < 3) {
      console.log('Not enough slides');
      return;
    }
    
    const requests = [];
    
    // Process slides 2 and 3 (indices 1 and 2)
    for (let slideIndex of [1, 2]) {
      const slide = pres.slides[slideIndex];
      
      slide.pageElements.forEach(element => {
        if (element.shape) {
          const isTitle = element.shape.placeholder?.type === 'TITLE' || 
                         element.shape.placeholder?.type === 'CENTERED_TITLE';
          const isBody = element.shape.placeholder?.type === 'BODY' || 
                        element.shape.placeholder?.type === 'SUBTITLE';
          
          if (isTitle) {
            // Position title at 10% from top
            requests.push({
              updatePageElementTransform: {
                objectId: element.objectId,
                transform: {
                  scaleX: 1,
                  scaleY: 1,
                  translateX: 50,
                  translateY: 50,
                  unit: 'PT'
                },
                applyMode: 'ABSOLUTE'
              }
            });
          } else if (isBody) {
            // Position body at 25% from top
            requests.push({
              updatePageElementTransform: {
                objectId: element.objectId,
                transform: {
                  scaleX: 1,
                  scaleY: 1,
                  translateX: 50,
                  translateY: 150,
                  unit: 'PT'
                },
                applyMode: 'ABSOLUTE'
              }
            });
          }
        }
      });
    }
    
    if (requests.length > 0) {
      console.log('Updating layout...');
      await batchUpdate(PRES_ID, requests, token);
      console.log('Done! Layout improved.');
    } else {
      console.log('No elements to update');
    }
    
    console.log('https://docs.google.com/presentation/d/' + PRES_ID);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
