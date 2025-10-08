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
    
    console.log('Presentation has', pres.slides.length, 'slides');
    
    // Analyze slide 2 and 3 structure
    for (let i = 1; i <= 2 && i < pres.slides.length; i++) {
      console.log('\nSlide', i + 1, 'elements:');
      pres.slides[i].pageElements?.forEach((el, idx) => {
        console.log('  ', idx + 1, ':', el.shape?.shapeType, '-', el.shape?.placeholder?.type || 'no placeholder');
        if (el.transform) {
          console.log('      Position: x=' + el.transform.translateX + ', y=' + el.transform.translateY);
        }
      });
    }
    
    const requests = [];
    const pageWidth = pres.pageSize.width.magnitude;
    const pageHeight = pres.pageSize.height.magnitude;
    
    // Process slides 2 and 3
    for (let slideIndex of [1, 2]) {
      if (slideIndex >= pres.slides.length) continue;
      
      const slide = pres.slides[slideIndex];
      const elements = slide.pageElements || [];
      
      // Find title and body text boxes by checking text content
      elements.forEach(element => {
        if (!element.shape?.text) return;
        
        const hasText = element.shape.text.textElements?.some(te => 
          te.textRun?.content && te.textRun.content.trim().length > 0
        );
        
        if (!hasText) return;
        
        const text = element.shape.text.textElements
          .map(te => te.textRun?.content || '')
          .join('')
          .toLowerCase();
        
        // Heuristic: if text is short and at top, it's likely title
        const isTitle = text.length < 100 && element.size.height.magnitude < 100;
        
        if (isTitle) {
          // Position title at 8% from top with margins
          requests.push({
            updatePageElementTransform: {
              objectId: element.objectId,
              transform: {
                scaleX: 1,
                scaleY: 1,
                translateX: pageWidth * 0.08,
                translateY: pageHeight * 0.08,
                unit: 'EMU'
              },
              applyMode: 'ABSOLUTE'
            }
          });
          
          // Update size to 84% width
          requests.push({
            updatePageElementSize: {
              objectId: element.objectId,
              size: {
                width: { magnitude: pageWidth * 0.84, unit: 'EMU' },
                height: element.size.height
              }
            }
          });
        } else {
          // Position body content at 22% from top
          requests.push({
            updatePageElementTransform: {
              objectId: element.objectId,
              transform: {
                scaleX: 1,
                scaleY: 1,
                translateX: pageWidth * 0.08,
                translateY: pageHeight * 0.22,
                unit: 'EMU'
              },
              applyMode: 'ABSOLUTE'
            }
          });
          
          // Update size
          requests.push({
            updatePageElementSize: {
              objectId: element.objectId,
              size: {
                width: { magnitude: pageWidth * 0.84, unit: 'EMU' },
                height: { magnitude: pageHeight * 0.68, unit: 'EMU' }
              }
            }
          });
        }
      });
    }
    
    if (requests.length > 0) {
      console.log('\nApplying', requests.length, 'layout updates...');
      await batchUpdate(PRES_ID, requests, token);
      console.log('Done!');
    }
    
    console.log('\nhttps://docs.google.com/presentation/d/' + PRES_ID);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
