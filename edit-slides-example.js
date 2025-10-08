// Example: Add a new slide to a Google Slides presentation
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

async function addSlideWithText(presentationId, accessToken, title, body) {
  // Use batchUpdate to add a slide with text
  const requests = [
    {
      createSlide: {
        slideLayoutReference: {
          predefinedLayout: 'TITLE_AND_BODY'
        }
      }
    }
  ];
  
  const response = await fetch(
    `https://slides.googleapis.com/v1/presentations/${presentationId}:batchUpdate`,
    {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ requests })
    }
  );
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to add slide: ${response.status} ${error}`);
  }
  
  const result = await response.json();
  const newSlideId = result.replies[0].createSlide.objectId;
  
  // Get the presentation to find the text boxes
  const presentationResponse = await fetch(
    `https://slides.googleapis.com/v1/presentations/${presentationId}`,
    {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    }
  );
  
  const presentation = await presentationResponse.json();
  const newSlide = presentation.slides.find(s => s.objectId === newSlideId);
  
  if (!newSlide) {
    throw new Error('Could not find newly created slide');
  }
  
  const titleBox = newSlide.pageElements?.find(el => el.shape?.placeholder?.type === 'TITLE');
  const bodyBox = newSlide.pageElements?.find(el => el.shape?.placeholder?.type === 'BODY');
  
  const textRequests = [];
  
  if (titleBox && title) {
    textRequests.push({
      insertText: {
        objectId: titleBox.objectId,
        text: title,
        insertionIndex: 0
      }
    });
  }
  
  if (bodyBox && body) {
    textRequests.push({
      insertText: {
        objectId: bodyBox.objectId,
        text: body,
        insertionIndex: 0
      }
    });
  }
  
  if (textRequests.length > 0) {
    const textResponse = await fetch(
      `https://slides.googleapis.com/v1/presentations/${presentationId}:batchUpdate`,
      {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ requests: textRequests })
      }
    );
    
    if (!textResponse.ok) {
      const error = await textResponse.text();
      throw new Error(`Failed to add text: ${textResponse.status} ${error}`);
    }
  }
  
  return newSlideId;
}

async function main() {
  const presentationId = '1FnKuYNX_tepDU3w6G6HED-hIaR6yuyRXuLyB6Grr_FI';
  
  try {
    console.log('🔑 Getting access token...');
    const accessToken = await getAccessToken();
    console.log('✓ Access token obtained\n');
    
    console.log('📝 Adding new slide...');
    const slideId = await addSlideWithText(
      presentationId,
      accessToken,
      'Test Slide from Codebuff',
      'This slide was created automatically using the Google Slides API!'
    );
    
    console.log('\n✅ Successfully added slide!');
    console.log('New slide ID:', slideId);
    console.log('\n🔗 View presentation:', `https://docs.google.com/presentation/d/${presentationId}`);
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
