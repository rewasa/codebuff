import fetch from 'node-fetch';

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
  if (!data.access_token) {
    throw new Error('Failed to get access token: ' + JSON.stringify(data));
  }
  return data.access_token;
}

async function main() {
  const presentationId = '1FnKuZBiqL5FQWBKa8k3Ol4kxOV7L3GZQFxCH-ikMfkE';
  const accessToken = await getAccessToken();
  
  const response = await fetch(`https://slides.googleapis.com/v1/presentations/${presentationId}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  
  const presentation = await response.json();
  
  if (!presentation.slides) {
    console.log('Error: No slides found in presentation');
    console.log('Response:', JSON.stringify(presentation, null, 2));
    return;
  }
  
  console.log(`Total slides: ${presentation.slides.length}`);
  const slide = presentation.slides[1]; // Slide 2 (index 1)
  
  console.log('\n=== ALL TEXT ON SLIDE 2 ===\n');
  
  if (!slide.pageElements) {
    console.log('No page elements found');
    return;
  }
  
  for (const element of slide.pageElements) {
    if (element.shape && element.shape.text) {
      const textContent = element.shape.text.textElements
        ?.map(t => t.textRun?.content || '')
        .join('');
      
      if (textContent && textContent.trim()) {
        console.log(`Element ID: ${element.objectId}`);
        console.log(`Text: "${textContent}"`);
        console.log('---');
      }
    }
  }
}

main().catch(console.error);