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
    
    // Get slide 2 ID
    const slide2 = pres.slides[1];
    console.log('Current Slide 2 ID:', slide2.objectId);
    
    // Step 1: Delete current content on slide 2
    const deleteRequests = [];
    if (slide2.pageElements) {
      slide2.pageElements.forEach(el => {
        if (el.objectId) {
          deleteRequests.push({ deleteObject: { objectId: el.objectId } });
        }
      });
    }
    
    if (deleteRequests.length > 0) {
      console.log('Deleting old content...');
      await batchUpdate(PRES_ID, deleteRequests, token);
    }
    
    // Step 2: Add new content to slide 2
    console.log('Adding new content to slide 2...');
    const slide2Requests = [
      {
        createShape: {
          objectId: 'title_' + Date.now(),
          shapeType: 'TEXT_BOX',
          elementProperties: {
            pageObjectId: slide2.objectId,
            size: { width: { magnitude: 720, unit: 'PT' }, height: { magnitude: 60, unit: 'PT' } },
            transform: { scaleX: 1, scaleY: 1, translateX: 0, translateY: 30, unit: 'PT' }
          }
        }
      },
      {
        insertText: {
          objectId: 'title_' + Date.now(),
          text: 'Security Check - Bug Bounty Scan',
          insertionIndex: 0
        }
      },
      {
        createShape: {
          objectId: 'body_' + Date.now(),
          shapeType: 'TEXT_BOX',
          elementProperties: {
            pageObjectId: slide2.objectId,
            size: { width: { magnitude: 680, unit: 'PT' }, height: { magnitude: 300, unit: 'PT' } },
            transform: { scaleX: 1, scaleY: 1, translateX: 20, translateY: 120, unit: 'PT' }
          }
        }
      },
      {
        insertText: {
          objectId: 'body_' + Date.now(),
          text: 'Programm-Übersicht:\n• Start: 8. September 2025\n• Ursprünglich: 1 Monat\n• Verlängert bis: 27. Oktober 2025\n• Grund: Wenige Findings = positive Nachricht!\n\nErgebnisse:\n• 7 Findings gesamt (bei Millionen Codezeilen)\n• 3 High Risk, 4 Medium Risk\n• Alle in Legacy-Code gefunden',
          insertionIndex: 0
        }
      }
    ];
    
    await batchUpdate(PRES_ID, slide2Requests, token);
    
    // Step 3: Create new slide 3
    console.log('Creating new slide 3...');
    const createSlideResult = await batchUpdate(PRES_ID, [
      {
        createSlide: {
          insertionIndex: 2,
          slideLayoutReference: { predefinedLayout: 'BLANK' }
        }
      }
    ], token);
    
    const newSlideId = createSlideResult.replies[0].createSlide.objectId;
    console.log('New Slide 3 ID:', newSlideId);
    
    // Step 4: Add content to new slide 3
    console.log('Adding content to slide 3...');
    const slide3Requests = [
      {
        createShape: {
          objectId: 'title3_' + Date.now(),
          shapeType: 'TEXT_BOX',
          elementProperties: {
            pageObjectId: newSlideId,
            size: { width: { magnitude: 720, unit: 'PT' }, height: { magnitude: 60, unit: 'PT' } },
            transform: { scaleX: 1, scaleY: 1, translateX: 0, translateY: 30, unit: 'PT' }
          }
        }
      },
      {
        insertText: {
          objectId: 'title3_' + Date.now(),
          text: 'Bug Bounty - Findings Details',
          insertionIndex: 0
        }
      },
      {
        createShape: {
          objectId: 'body3_' + Date.now(),
          shapeType: 'TEXT_BOX',
          elementProperties: {
            pageObjectId: newSlideId,
            size: { width: { magnitude: 680, unit: 'PT' }, height: { magnitude: 320, unit: 'PT' } },
            transform: { scaleX: 1, scaleY: 1, translateX: 20, translateY: 120, unit: 'PT' }
          }
        }
      },
      {
        insertText: {
          objectId: 'body3_' + Date.now(),
          text: 'Findings nach Kategorie:\n• Broken Access Control: 3\n• Security Misconfiguration: 2\n• XSS (Execute Code): 1\n• Sensitive Data Exposure: 1\n\n✅ ALLE Findings in Legacy-Code (5+ Jahre alt)\n\nPositive Bedeutung:\n• Neuer Code ist sicher\n• Validiert Cloudflare Firewall Anpassungen\n• Bestätigt OneLeet Implementierung\n\nFazit: Starke Security-Positionierung!',
          insertionIndex: 0
        }
      }
    ];
    
    await batchUpdate(PRES_ID, slide3Requests, token);
    
    console.log('\nDone! https://docs.google.com/presentation/d/' + PRES_ID);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
