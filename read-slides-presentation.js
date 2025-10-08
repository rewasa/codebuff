// Script to read Google Slides presentation
// Presentation ID: 1FnKuYNX_tepDU3w6G6HED-hIaR6yuyRXuLyB6Grr_FI

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
  
  if (!response.ok) {
    throw new Error(`Failed to get access token: ${JSON.stringify(data)}`);
  }
  
  return data.access_token;
}

async function getPresentation(presentationId, accessToken) {
  const response = await fetch(
    `https://slides.googleapis.com/v1/presentations/${presentationId}`,
    {
      headers: { 
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    }
  );
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get presentation: ${response.status} ${error}`);
  }
  
  return response.json();
}

async function main() {
  const presentationId = '1FnKuYNX_tepDU3w6G6HED-hIaR6yuyRXuLyB6Grr_FI';
  
  try {
    console.log('🔑 Getting access token...');
    const accessToken = await getAccessToken();
    console.log('✓ Access token obtained\n');
    
    console.log(`📊 Fetching presentation ${presentationId}...`);
    const presentation = await getPresentation(presentationId, accessToken);
    
    console.log('\n✅ Presentation Details:\n');
    console.log('Title:', presentation.title);
    console.log('Slides:', presentation.slides?.length || 0);
    console.log('\n--- Slide Content ---\n');
    
    if (presentation.slides) {
      presentation.slides.forEach((slide, index) => {
        console.log(`\n📄 Slide ${index + 1} (${slide.objectId})`);
        
        if (slide.pageElements) {
          slide.pageElements.forEach(element => {
            if (element.shape?.text?.textElements) {
              const text = element.shape.text.textElements
                .filter(te => te.textRun?.content)
                .map(te => te.textRun.content)
                .join('')
                .trim();
              
              if (text) {
                console.log('  →', text);
              }
            }
          });
        }
      });
    }
    
    console.log('\n🔗 URL: https://docs.google.com/presentation/d/' + presentationId);
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
