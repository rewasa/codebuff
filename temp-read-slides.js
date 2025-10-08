// Read Google Slides presentation: 1FnKuYNX_tepDU3w6G6HED-hIaR6yuyRXuLyB6Grr_FI

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

async function main() {
  const presentationId = '1FnKuYNX_tepDU3w6G6HED-hIaR6yuyRXuLyB6Grr_FI';
  
  try {
    const accessToken = await getAccessToken();
    
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
      throw new Error(`API error: ${response.status} ${error}`);
    }
    
    const presentation = await response.json();
    
    console.log('\n=== PRESENTATION ===');
    console.log('Title:', presentation.title);
    console.log('Slides:', presentation.slides?.length || 0);
    console.log('\n=== CONTENT ===\n');
    
    if (presentation.slides) {
      presentation.slides.forEach((slide, index) => {
        console.log(`--- Slide ${index + 1} ---`);
        
        if (slide.pageElements) {
          slide.pageElements.forEach(element => {
            if (element.shape?.text?.textElements) {
              const text = element.shape.text.textElements
                .filter(te => te.textRun?.content)
                .map(te => te.textRun.content)
                .join('')
                .trim();
              
              if (text) {
                console.log(text);
              }
            }
          });
        }
        console.log('');
      });
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
