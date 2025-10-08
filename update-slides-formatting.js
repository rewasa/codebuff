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
    
    const slide2 = pres.slides[1];
    const slide3 = pres.slides[2];
    
    const requests = [];
    
    // Update text formatting on slides 2 and 3
    [slide2, slide3].forEach(slide => {
      if (slide.pageElements) {
        slide.pageElements.forEach(element => {
          if (element.shape && element.shape.text) {
            // Update text style: smaller font, black color
            requests.push({
              updateTextStyle: {
                objectId: element.objectId,
                style: {
                  fontSize: { magnitude: 11, unit: 'PT' },
                  foregroundColor: {
                    opaqueColor: { rgbColor: { red: 0, green: 0, blue: 0 } }
                  }
                },
                fields: 'fontSize,foregroundColor'
              }
            });
          }
        });
      }
    });
    
    // Add a simple pie chart shape to slide 2 to visualize findings
    requests.push({
      createShape: {
        objectId: 'pie_chart_' + Date.now(),
        shapeType: 'ELLIPSE',
        elementProperties: {
          pageObjectId: slide2.objectId,
          size: {
            height: { magnitude: 150, unit: 'PT' },
            width: { magnitude: 150, unit: 'PT' }
          },
          transform: {
            scaleX: 1,
            scaleY: 1,
            translateX: 450,
            translateY: 150,
            unit: 'PT'
          }
        }
      }
    });
    
    // Add text annotation for the chart
    const chartTextId = 'chart_text_' + Date.now();
    requests.push({
      createShape: {
        objectId: chartTextId,
        shapeType: 'TEXT_BOX',
        elementProperties: {
          pageObjectId: slide2.objectId,
          size: {
            height: { magnitude: 80, unit: 'PT' },
            width: { magnitude: 200, unit: 'PT' }
          },
          transform: {
            scaleX: 1,
            scaleY: 1,
            translateX: 380,
            translateY: 310,
            unit: 'PT'
          }
        }
      }
    });
    
    requests.push({
      insertText: {
        objectId: chartTextId,
        text: '7 Findings\nvs\nMillions of Lines',
        insertionIndex: 0
      }
    });
    
    requests.push({
      updateTextStyle: {
        objectId: chartTextId,
        style: {
          fontSize: { magnitude: 10, unit: 'PT' },
          foregroundColor: {
            opaqueColor: { rgbColor: { red: 0, green: 0, blue: 0 } }
          },
          bold: true
        },
        fields: 'fontSize,foregroundColor,bold'
      }
    });
    
    console.log('Applying updates...');
    await batchUpdate(PRES_ID, requests, token);
    
    console.log('Done! https://docs.google.com/presentation/d/' + PRES_ID);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
