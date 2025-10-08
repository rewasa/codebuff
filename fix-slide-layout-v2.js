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
    
    const pageWidth = pres.pageSize.width.magnitude;
    const pageHeight = pres.pageSize.height.magnitude;
    
    console.log('Page size:', pageWidth, 'x', pageHeight, 'EMU');
    
    const requests = [];
    
    // Process slides 2 and 3
    for (let slideIndex of [1, 2]) {
      if (slideIndex >= pres.slides.length) continue;
      
      const slide = pres.slides[slideIndex];
      const elements = slide.pageElements || [];
      
      let titleElement = null;
      let bodyElements = [];
      
      // Categorize elements
      elements.forEach(element => {
        if (!element.shape?.text) return;
        
        const hasText = element.shape.text.textElements?.some(te => 
          te.textRun?.content && te.textRun.content.trim().length > 0
        );
        
        if (!hasText) return;
        
        const textContent = element.shape.text.textElements
          .map(te => te.textRun?.content || '')
          .join('');
        
        const currentY = element.transform?.translateY || 0;
        
        // First text box (at top) is title
        if (!titleElement || currentY < (titleElement.transform?.translateY || Infinity)) {
          if (titleElement) bodyElements.push(titleElement);
          titleElement = element;
        } else {
          bodyElements.push(element);
        }
      });
      
      // Position title at 10% from top
      if (titleElement) {
        const titleY = pageHeight * 0.10;
        const titleX = pageWidth * 0.08;
        
        requests.push({
          updatePageElementTransform: {
            objectId: titleElement.objectId,
            transform: {
              scaleX: 1,
              scaleY: 1,
              translateX: titleX,
              translateY: titleY,
              unit: 'EMU'
            },
            applyMode: 'ABSOLUTE'
          }
        });
      }
      
      // Position body elements starting at 25% from top
      bodyElements.forEach((element, idx) => {
        const bodyY = pageHeight * (0.25 + idx * 0.15);
        const bodyX = pageWidth * 0.08;
        
        requests.push({
          updatePageElementTransform: {
            objectId: element.objectId,
            transform: {
              scaleX: 1,
              scaleY: 1,
              translateX: bodyX,
              translateY: bodyY,
              unit: 'EMU'
            },
            applyMode: 'ABSOLUTE'
          }
        });
      });
    }
    
    if (requests.length > 0) {
      console.log('Applying', requests.length, 'layout updates...');
      await batchUpdate(PRES_ID, requests, token);
      console.log('Done! Layout improved.');
    }
    
    console.log('\nhttps://docs.google.com/presentation/d/' + PRES_ID);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
