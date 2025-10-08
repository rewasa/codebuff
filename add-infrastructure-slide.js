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
    
    // Create new slide at position 4
    console.log('Creating slide 4...');
    const createResult = await batchUpdate(PRES_ID, [{
      createSlide: {
        insertionIndex: 3,
        slideLayoutReference: { predefinedLayout: 'BLANK' }
      }
    }], token);
    const slideId = createResult.replies[0].createSlide.objectId;
    
    const titleId = 'title_' + Date.now();
    const bodyId = 'body_' + Date.now();
    
    const requests = [
      {
        createShape: {
          objectId: titleId,
          shapeType: 'TEXT_BOX',
          elementProperties: {
            pageObjectId: slideId,
            size: {
              width: { magnitude: 650, unit: 'PT' },
              height: { magnitude: 80, unit: 'PT' }
            },
            transform: {
              scaleX: 1,
              scaleY: 1,
              translateX: 57.6,
              translateY: 72,
              unit: 'PT'
            }
          }
        }
      },
      {
        createShape: {
          objectId: bodyId,
          shapeType: 'TEXT_BOX',
          elementProperties: {
            pageObjectId: slideId,
            size: {
              width: { magnitude: 650, unit: 'PT' },
              height: { magnitude: 360, unit: 'PT' }
            },
            transform: {
              scaleX: 1,
              scaleY: 1,
              translateX: 57.6,
              translateY: 180,
              unit: 'PT'
            }
          }
        }
      },
      {
        insertText: {
          objectId: titleId,
          text: 'Infrastruktur-Vereinfachung & Kostenoptimierung',
          insertionIndex: 0
        }
      },
      {
        updateTextStyle: {
          objectId: titleId,
          style: {
            fontSize: { magnitude: 28, unit: 'PT' },
            bold: true,
            foregroundColor: { opaqueColor: { rgbColor: { red: 0, green: 0, blue: 0 } } }
          },
          fields: 'fontSize,bold,foregroundColor'
        }
      },
      {
        insertText: {
          objectId: bodyId,
          text: '• Vereinfachung der Infrastruktur:\n  Dev/Staging/Production → Dev/Production zur Kosteneinsparung\n\n• Systemprüfung:\n  Ich werde auf Team-Mitglieder zukommen, um zu verifizieren, welche Systeme noch im Einsatz sind für kosteneffiziente Bereitstellung\n\n• Ihr Input ist gefragt:\n  Falls jemand weiß, dass ein System nicht mehr benötigt wird oder eine Alternative vorschlagen möchte, die mehrere Tools kombiniert und Kosten spart:\n  → Bitte auf mich zukommen oder Vorschlag in Notion erstellen',
          insertionIndex: 0
        }
      },
      {
        updateTextStyle: {
          objectId: bodyId,
          style: {
            fontSize: { magnitude: 14, unit: 'PT' },
            foregroundColor: { opaqueColor: { rgbColor: { red: 0, green: 0, blue: 0 } } }
          },
          fields: 'fontSize,foregroundColor'
        }
      }
    ];
    
    console.log('Adding content...');
    await batchUpdate(PRES_ID, requests, token);
    
    console.log('Done! https://docs.google.com/presentation/d/' + PRES_ID);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
