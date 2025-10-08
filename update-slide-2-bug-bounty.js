async function getAccessToken() {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token'
    })
  });
  const data = await r.json();
  if (!r.ok) throw new Error('Auth failed');
  return data.access_token;
}

async function main() {
  const ID = '1pVmowqWKloI2O6a1VxLXAVz4afPBkAi13t8rCwTnOjM';
  const token = await getAccessToken();
  
  const pres = await (await fetch('https://slides.googleapis.com/v1/presentations/' + ID, {
    headers: { 'Authorization': 'Bearer ' + token }
  })).json();
  
  const slide2 = pres.slides[1];
  const bodyBox = slide2.pageElements.find(el => el.shape?.placeholder?.type === 'BODY');
  
  const text = '\n\n📅 Bug Bounty Update:\n• Start: 8.9.2025 (1 Monat)\n• Verlängert: 27.10.2025\n• Grund: Wenige Findings = POSITIV!\n• Zeigt: Code ist sicher';
  
  await fetch('https://slides.googleapis.com/v1/presentations/' + ID + ':batchUpdate', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [{
      insertText: { objectId: bodyBox.objectId, text: text, insertionIndex: 506 }
    }]})
  });
  
  console.log('✅ https://docs.google.com/presentation/d/' + ID);
}

main().catch(e => { console.error(e.message); process.exit(1); });
