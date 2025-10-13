const { google } = require('googleapis');
const fs = require('fs');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;

if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
  console.error('Missing environment variables');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

const drive = google.drive({ version: 'v3', auth: oauth2Client });
const slides = google.slides({ version: 'v1', auth: oauth2Client });

const CONSULTANTS = {
  florian: {
    name: 'Florian Beck',
    jobTitle: 'Immobilien- & Bewertungsexperte',
    email: 'florian.beck@agentselly.ch',
    phone: '+41 41 530 69 40'
  },
  martin: {
    name: 'Martin Heim',
    jobTitle: 'Head of Sales',
    email: 'martin.heim@agentselly.ch',
    phone: '+41 41 530 69 40'
  },
  alissa: {
    name: 'Alissa Balatsky',
    jobTitle: 'Immobilien- & Bewertungsexpertin',
    email: 'alissa.balatsky@agentselly.ch',
    phone: '+41 41 530 69 40'
  }
};

const PROPERTY_FOLDERS = [
  { propertyId: 'k8iaevd5azinaij3', folderId: '1CBXjkBBmYLNhAg7RIKwuGo-QuHz36guw', consultant: 'florian' },
  { propertyId: 'vivafskcttq1zhon', folderId: '1oWoaWhagrF3zqXjmBnZaQ-7dj0lfLsWP', consultant: 'florian' },
  { propertyId: 'l4fs9wcrxuqaaw44', folderId: '19MhGQsC7k4tLJPyNekVT3pVApjkkOpPS', consultant: 'florian' },
  { propertyId: 'qvg4c1ftahwf4hy1', folderId: '1WZwIXN35kjWZOVkAmdMY16GywU6rqqFL', consultant: 'florian' },
  { propertyId: '9xwb8ghe0a61rhj8', folderId: '1WlbIjcJoL1iFMli1mddgtMQwJTcFdIWL', consultant: 'florian' },
  { propertyId: 'ut8w3ybwaa5isvux', folderId: '18X9WTDseWYjbZE_HcEyiMsJnr3XArPox', consultant: 'florian' },
  { propertyId: 'b81uygxpjny4fx1s', folderId: '1aElb--J-f8CeCLJ8CEduAA2FzlLDR_oA', consultant: 'martin' },
  { propertyId: '156zayo41f2v36hq', folderId: '1drMtW4CIBV6BuV4RFduLiFwvOTaJ_yI0', consultant: 'martin' },
  { propertyId: 'ptog37sfo0139zp5', folderId: '14JHooEfciG7FR5Jrwe7W71fIIo-GPKy7', consultant: 'martin' },
  { propertyId: 'ynguhq5m7w5bce0e', folderId: '1UsGuHVZpFUzdajeF9jZBgVklsbHR72R6', consultant: 'alissa' },
  { propertyId: 'l7gsgudy70qgzakc', folderId: '1wOf967G4NHbHgToZvwnESXUU4LsKclEL', consultant: 'alissa' },
  { propertyId: 'wiqy04ije6avckrr', folderId: '1VxdA2LfKj2fmJayj_Ac4jJgvNHJhjoLf', consultant: 'alissa' },
  { propertyId: 'yr00z3w1qta9x9fp', folderId: '1JO2opXx3ABpWw7BQJonx1mij13LE1mfg', consultant: 'alissa' },
  { propertyId: 'xhqkfoy06j0hdaaw', folderId: '1moTVjkO-u1peOr5uP5fSeTMyPGUaHN4y', consultant: 'alissa' },
  { propertyId: 'u0bm7wzucntc94th', folderId: '1_fEsHoTfTSDyYQ4PyPSD6lu48deho3zx', consultant: 'alissa' },
  { propertyId: '1cuiswlfuiyzoh69', folderId: '1B1Q2RcPnpBpwh6hhXejHgPO1F66GXFEv', consultant: 'alissa' }
];

async function findPresentationsInFolder(folderId) {
  try {
    const response = await drive.files.list({
      q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.presentation' and trashed=false`,
      fields: 'files(id, name)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    });
    
    const allFiles = response.data.files || [];
    return allFiles.filter(f => !f.name.includes('_attachments'));
  } catch (error) {
    console.error(`Error accessing folder ${folderId}:`, error.message);
    return [];
  }
}

async function updatePresentation(presentationId, presentationName, consultant, propertyId) {
  console.log(`\nProcessing: ${presentationName}`);
  console.log(`Property: ${propertyId}`);
  console.log(`Consultant: ${consultant.name}`);

  try {
    const requests = [
      { replaceAllText: { containsText: { text: 'Carmen Hodel', matchCase: false }, replaceText: consultant.name } },
      { replaceAllText: { containsText: { text: 'Immobilienvermarkterin', matchCase: false }, replaceText: consultant.jobTitle } },
      { replaceAllText: { containsText: { text: 'carmen.hodel@agentselly.ch', matchCase: false }, replaceText: consultant.email } },
      { replaceAllText: { containsText: { text: '+41764736557', matchCase: false }, replaceText: consultant.phone } },
      { replaceAllText: { containsText: { text: '+41 76 473 65 57', matchCase: false }, replaceText: consultant.phone } }
    ];

    await slides.presentations.batchUpdate({
      presentationId,
      requestBody: { requests }
    });

    console.log(`Successfully updated: ${presentationName}`);
    console.log(`Link: https://agency.selly.ch/su/properties/${propertyId}`);
    return true;
  } catch (error) {
    console.error(`Failed: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('Starting updates...');
  console.log(`Total folders: ${PROPERTY_FOLDERS.length}`);

  const results = [];
  
  for (const { propertyId, folderId, consultant: consultantKey } of PROPERTY_FOLDERS) {
    console.log(`\nFolder: ${propertyId}`);
    const consultant = CONSULTANTS[consultantKey];
    
    const presentations = await findPresentationsInFolder(folderId);
    
    if (presentations.length === 0) {
      console.log('No presentations found');
      results.push({ propertyId, status: 'no_presentations' });
      continue;
    }

    console.log(`Found ${presentations.length} presentation(s)`);

    for (const pres of presentations) {
      const success = await updatePresentation(pres.id, pres.name, consultant, propertyId);
      results.push({ propertyId, name: pres.name, status: success ? 'updated' : 'failed' });
    }
  }

  console.log('\nSUMMARY');
  console.log(`Updated: ${results.filter(r => r.status === 'updated').length}`);
  console.log(`Failed: ${results.filter(r => r.status === 'failed').length}`);
  console.log(`No presentations: ${results.filter(r => r.status === 'no_presentations').length}`);
  
  console.log('\nProperty Links:');
  [...new Set(results.map(r => r.propertyId))].forEach(id => {
    console.log(`https://agency.selly.ch/su/properties/${id}`);
  });
  
  fs.writeFileSync('consultant-update-results.json', JSON.stringify(results, null, 2));
}

main().catch(console.error);
