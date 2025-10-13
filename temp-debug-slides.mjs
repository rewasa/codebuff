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
  try {
    console.log('🔑 Getting access token...');
    const accessToken = await getAccessToken();
    
    console.log('📖 Reading presentation...');
    const presentationId = '1FnKuZBiqL5FQWBKa8k3Ol4kxOV7L3GZQFxCH-ikMfkE';
    const response = await fetch(`https://slides.googleapis.com/v1/presentations/${presentationId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    
    const presentation = await response.json();
    const slide = presentation.slides[1]; // Slide 2 (index 1)
    
    console.log('\n=== SLIDE 2 IMAGE ANALYSIS ===\n');
    console.log(`Slide ID: ${slide.objectId}`);
    console.log(`Total elements: ${slide.pageElements?.length || 0}\n`);
    
    const images = slide.pageElements?.filter(e => e.image) || [];
    console.log(`Found ${images.length} images\n`);
    
    images.forEach((element, index) => {
      console.log(`--- IMAGE ${index + 1} ---`);
      console.log(`Object ID: ${element.objectId}`);
      console.log(`\nImage properties:`);
      console.log(JSON.stringify(element.image, null, 2));
      console.log(`\nTransform/Size:`);
      console.log(JSON.stringify(element.transform || element.size, null, 2));
      console.log('\n');
    });
    
    // Also show text elements for context
    const textElements = slide.pageElements?.filter(e => e.shape?.text) || [];
    console.log(`\n=== TEXT ELEMENTS (${textElements.length}) ===\n`);
    textElements.forEach((element, index) => {
      const text = element.shape.text.textElements
        ?.map(t => t.textRun?.content || '')
        .join('')
        .trim();
      if (text) {
        console.log(`Text ${index + 1}: ${text.substring(0, 100)}`);
      }
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();