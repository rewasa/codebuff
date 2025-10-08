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
    
    console.log('Creating new slide...');
    const createSlideRequest = [
      {
        createSlide: {
          insertionIndex: 1,
          slideLayoutReference: {
            predefinedLayout: 'TITLE_AND_BODY'
          }
        }
      }
    ];
    
    const createResult = await batchUpdate(PRES_ID, createSlideRequest, token);
    const newSlideId = createResult.replies[0].createSlide.objectId;
    
    console.log('Reading updated presentation...');
    const updatedPres = await getPresentation(PRES_ID, token);
    const newSlide = updatedPres.slides.find(s => s.objectId === newSlideId);
    
    const titleBox = newSlide.pageElements?.find(el => el.shape?.placeholder?.type === 'TITLE');
    const bodyBox = newSlide.pageElements?.find(el => el.shape?.placeholder?.type === 'BODY');
    
    const textRequests = [];
    
    if (titleBox) {
      textRequests.push({
        insertText: {
          objectId: titleBox.objectId,
          text: 'Security Check - Bug Bounty Scan',
          insertionIndex: 0
        }
      });
    }
    
    if (bodyBox) {
      const bodyText = `🔒 Umfassender Security-Scan abgeschlossen\n\n` +
        `📊 Ergebnisse (23.09.2025 - 03.10.2025):\n` +
        `• Nur 7 Findings bei Millionen Codezeilen\n` +
        `• 3 High Risk, 4 Medium Risk\n` +
        `• Kategorien: 3x Broken Access Control, 2x Security Misconfiguration, 1x XSS, 1x Sensitive Data Exposure\n\n` +
        `✅ Wichtigste Erkenntnis:\n` +
        `ALLE Findings in Legacy-Code (5+ Jahre alt)\n` +
        `Neuer Code zeigt exzellente Sicherheit!\n\n` +
        `🛡️ Unsere Maßnahmen validiert:\n` +
        `• Cloudflare Firewall Optimierungen\n` +
        `• OneLeet Implementation\n` +
        `• Kontinuierliche Security-Verbesserungen`;
      
      textRequests.push({
        insertText: {
          objectId: bodyBox.objectId,
          text: bodyText,
          insertionIndex: 0
        }
      });
    }
    
    console.log('Adding text to slide...');
    await batchUpdate(PRES_ID, textRequests, token);
    
    console.log('\nDone! https://docs.google.com/presentation/d/' + PRES_ID);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
