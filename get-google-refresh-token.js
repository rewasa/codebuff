// Helper script to get Google Refresh Token
// This will guide you through the OAuth flow

import http from 'http';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const PORT = 3333;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;
const SCOPES = [
  'https://www.googleapis.com/auth/presentations',
  'https://www.googleapis.com/auth/presentations.readonly',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file'
].join(' ');

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ Error: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in environment');
  console.error('\nRun this script with: infisical run -- node get-google-refresh-token.js');
  process.exit(1);
}

console.log('\n🔐 Google OAuth 2.0 Refresh Token Generator\n');
console.log('This will open a browser window to authorize access to Google Slides.\n');

let server;

const startServer = () => {
  return new Promise((resolve, reject) => {
    server = http.createServer(async (req, res) => {
      if (req.url?.startsWith('/oauth2callback')) {
        const url = new URL(req.url, `http://localhost:3000`);
        const code = url.searchParams.get('code');
        
        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<h1>Error: No authorization code received</h1>');
          reject(new Error('No authorization code'));
          return;
        }
        
        try {
          // Exchange code for tokens
          const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              client_id: CLIENT_ID,
              client_secret: CLIENT_SECRET,
              code: code,
              grant_type: 'authorization_code',
              redirect_uri: REDIRECT_URI
            })
          });
          
          const data = await response.json();
          
          if (!response.ok) {
            throw new Error(`Token exchange failed: ${JSON.stringify(data)}`);
          }
          
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto;">
                <h1 style="color: #4CAF50;">✅ Success!</h1>
                <p>Your refresh token has been generated. Check your terminal for the next steps.</p>
                <p>You can close this window now.</p>
              </body>
            </html>
          `);
          
          resolve(data.refresh_token);
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'text/html' });
          res.end(`<h1>Error: ${error.message}</h1>`);
          reject(error);
        }
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    
    server.listen(PORT, () => {
      console.log(`✓ Local server started on http://localhost:${PORT}\n`);
    });
  });
};

async function main() {
  try {
    // Start local server
    const tokenPromise = startServer();
    
    // Build authorization URL
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', SCOPES);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    
    console.log('📝 Opening browser for authorization...\n');
    console.log('If the browser doesn\'t open automatically, visit this URL:\n');
    console.log(authUrl.toString());
    console.log('\n');
    
    // Open browser (works on macOS, Linux, and Windows)
    const openCommand = process.platform === 'darwin' ? 'open' 
                      : process.platform === 'win32' ? 'start' 
                      : 'xdg-open';
    
    try {
      await execAsync(`${openCommand} "${authUrl.toString()}"`);
    } catch (error) {
      console.log('⚠️  Could not open browser automatically. Please copy the URL above.\n');
    }
    
    console.log('Waiting for authorization...\n');
    
    const refreshToken = await tokenPromise;
    
    server.close();
    
    console.log('\n✅ SUCCESS!\n');
    console.log('━'.repeat(80));
    console.log('\n📋 Your Google Refresh Token:\n');
    console.log(refreshToken);
    console.log('\n━'.repeat(80));
    console.log('\n📝 Next Steps:\n');
    console.log('1. Go to your Infisical dashboard');
    console.log('2. Add a new secret: GOOGLE_REFRESH_TOKEN');
    console.log('3. Paste the token above as the value');
    console.log('4. Save the secret\n');
    console.log('After that, you can use the Google Slides agent!\n');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (server) server.close();
    process.exit(1);
  }
}

main();
