#!/usr/bin/env node
import { exec } from 'child_process'
import { promisify } from 'util'

import https from 'https'
import http from 'http'

import { google } from 'googleapis'
import { MongoClient } from 'mongodb'
import { promises as fs } from 'fs'

const execAsync = promisify(exec)

// Command line arguments
const args = process.argv.slice(2)
const isDryRun = args.includes('--dry-run')
const specificAgent = args
  .find((arg) => arg.startsWith('--agent='))
  ?.split('=')[1]
const specificProperty = args
  .find((arg) => arg.startsWith('--property='))
  ?.split('=')[1]

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGODB_URL
if (!MONGODB_URI) {
  console.error('❌ Missing MONGODB_URI environment variable')
  process.exit(1)
}

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
  console.error('❌ Missing Google OAuth credentials in environment variables')
  process.exit(1)
}

// Google Drive folder ID for agent images
const DRIVE_FOLDER_ID = '1XEcxiJUkvdyeR1nZ9wK5V3rbMdYQC8Nv'

// Agent API URL
const AGENT_API_URL =
  'https://www.agentselly.ch/data/static/hubdb/public_internal_agent.json'

// Agent images configuration (from upload-agent-images.mjs)
const AGENT_IMAGES = [
  {
    agentId: '12428052',
    name: 'Florian Beck',
    url: 'https://www.agentselly.ch/data/static/hubdb/images/032fb2550d6da14f9bc446b4e2fe350a-237x237.webp',
  },
  {
    agentId: '25553264100',
    name: 'Martin Heim',
    url: 'https://www.agentselly.ch/data/static/hubdb/images/0e647d91fb1bf1b2ac86af0c4208acee-375x375.webp',
  },
  {
    agentId: '5303752653',
    name: 'Alissa Balatsky',
    url: 'https://www.agentselly.ch/data/static/hubdb/images/f10b3f7e11b4577546ff140f35209ea5-400x400.webp',
  },
]

// Valiant external advisors data
const VALIANT_ADVISORS = [
  {
    id: '222782823618',
    reference: 12427551,
    gender: 'male',
    firstname: 'Remo',
    lastname: 'Lüscher',
    name: 'Remo Lüscher',
    email: 'remo.luescher@valiant.ch',
    phone: ' +41 62 837 80 93',
    profile_picture:
      '/data/static/hubdb/images/6a10c54490524a443aa97bd6e73e978a-237x237.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782823619',
    reference: 12567751,
    gender: 'female',
    firstname: 'Andrea',
    lastname: 'Widmer',
    name: 'Andrea Widmer',
    email: 'andrea.widmer@valiant.ch',
    phone: ' +41 62 777 25 88',
    profile_picture:
      '/data/static/hubdb/images/96ddb3201abb13cfc1869b11c5c67a4e-237x237.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782823620',
    reference: 12499101,
    gender: 'male',
    firstname: 'Christian',
    lastname: 'Tschannen',
    name: 'Christian Tschannen',
    email: 'christian.tschannen@valiant.ch',
    phone: ' +41 56 204 20 87',
    profile_picture:
      '/data/static/hubdb/images/3e0115a5e068d3185e9d2b657e34a4d8-237x237.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782823621',
    reference: 12554152,
    gender: 'male',
    firstname: 'Francesco',
    lastname: 'Mazzotta',
    name: 'Francesco Mazzotta',
    email: 'francesco.mazzotta@valiant.ch',
    phone: '+41 56 204 20 54',
    profile_picture:
      '/data/static/hubdb/images/e8356197aa6f5e3c6870bf1a7baec49a-237x237.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782823622',
    reference: 12518901,
    gender: 'male',
    firstname: 'Michele',
    lastname: 'Colamonico',
    name: 'Michele Colamonico',
    email: 'michele.colamonico@valiant.ch',
    phone: ' +41 62 837 80 95',
    profile_picture:
      '/data/static/hubdb/images/65ef6ae2fc2c51300a7760943f4ccfc1-237x237.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782823625',
    reference: 17494506709,
    gender: 'female',
    firstname: 'Simona',
    lastname: 'Bronner',
    name: 'Simona Bronner',
    email: 'simona.bronner@valiant.ch',
    phone: ' +41 61 201 11 11',
    profile_picture:
      '/data/static/hubdb/images/2e02a02964db91f97e26d02e3d0e15e5-1024x1024.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782823626',
    reference: 16813251,
    gender: 'male',
    firstname: 'Steven',
    lastname: 'Bleuler',
    name: 'Steven Bleuler',
    email: 'steven.bleuler@valiant.ch',
    phone: ' +41 61 201 11 14',
    profile_picture:
      '/data/static/hubdb/images/1da2e8718f3a6a6589b7bd546dc04317-237x237.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782823627',
    reference: 12418601,
    gender: 'male',
    firstname: 'Patrick',
    lastname: 'Kummli',
    name: 'Patrick Kummli',
    email: 'patrick.kummli@valiant.ch',
    phone: ' +41 56 204 20 95',
    profile_picture:
      '/data/static/hubdb/images/42a86ac2bc1dfb7589506b9c1ee94851-1024x1024.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782823628',
    reference: 13252902,
    gender: 'female',
    firstname: 'Beatrice',
    lastname: 'Beetschen',
    name: 'Beatrice Beetschen',
    email: 'beatrice.beetschen@valiant.ch',
    phone: ' +41 33 729 39 41',
    profile_picture:
      '/data/static/hubdb/images/f4e93b33c79b7fc66b9b8809540e18ca-237x237.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782823629',
    reference: 12571401,
    gender: 'male',
    firstname: 'Dario',
    lastname: 'Burkhalter',
    name: 'Dario Burkhalter',
    email: 'dario.burkhalter@valiant.ch',
    phone: ' +41 34 409 42 31',
    profile_picture:
      '/data/static/hubdb/images/e0c8c7953a4c42257a8ebbc61fd3f9c7-237x237.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782823630',
    reference: 12552151,
    gender: 'male',
    firstname: 'Diogo',
    lastname: 'Gonçalves Pires',
    name: 'Diogo Gonçalves Pires',
    email: 'diogo.goncalvespires@valiant.ch',
    phone: ' +41 31 818 21 62',
    profile_picture:
      '/data/static/hubdb/images/711bac96d7e60d8c297d0d90181521b6-237x237.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782823631',
    reference: 13855901,
    gender: 'male',
    firstname: 'Dominik',
    lastname: 'Amport',
    name: 'Dominik Amport',
    email: 'dominik.amport@valiant.ch',
    phone: ' +41 31 320 95 28',
    profile_picture:
      '/data/static/hubdb/images/447c3729b7b103f5ec1b2798bd1b92d8-237x237.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782823633',
    reference: 13388752,
    gender: 'male',
    firstname: 'Pascal',
    lastname: 'Blaser',
    name: 'Pascal Blaser',
    email: 'pascal.blaser@valiant.ch',
    phone: ' +41 34 409 43 13',
    profile_picture:
      '/data/static/hubdb/images/99abfc778ffcd1d2593751623fbe9db8-237x237.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782823634',
    reference: 13786601,
    gender: 'male',
    firstname: 'Simon',
    lastname: 'Rölli',
    name: 'Simon Rölli',
    email: 'simon.roelli@valiant.ch',
    phone: '+41 33 439 22 66',
    profile_picture:
      '/data/static/hubdb/images/21bfdfd904c5dd4ee3812b19aa8afab3-237x237.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782823635',
    reference: 12420151,
    gender: 'female',
    firstname: 'Stepahnie',
    lastname: 'Klaus',
    name: 'Stephanie Klaus',
    email: 'stephanie.klaus@valiant.ch',
    phone: ' +41 31 320 94 59',
    profile_picture:
      '/data/static/hubdb/images/61de77d9f69c57829ac2b4e8dc275120-237x237.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782823636',
    reference: 17494715385,
    gender: 'male',
    firstname: 'Fabio',
    lastname: 'Rotolo',
    name: 'Fabio Rotolo',
    email: 'fabio.rotolo@valiant.ch',
    phone: '+41 61 717 50 53',
    profile_picture:
      '/data/static/hubdb/images/0afab155eed566ea81dd92ee5258090c-237x237.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782823637',
    reference: 17494267356,
    gender: 'male',
    firstname: 'Matteo',
    lastname: 'Tarantino',
    name: 'Matteo Tarantino',
    email: 'matteo.tarantino@valiant.ch',
    phone: '+41 61 228 29 09',
    profile_picture:
      '/data/static/hubdb/images/68f656d6e9c9f3f3f4ffb11bb2c44326-237x237.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782823638',
    reference: 17495153865,
    gender: 'male',
    firstname: 'Roman',
    lastname: 'Zürcher',
    name: 'Roman Zürcher',
    email: 'roman.zuercher@valiant.ch',
    phone: '+51 61 228 29 04',
    profile_picture:
      '/data/static/hubdb/images/35509a4631a3b28a11746c5d5caf908e-237x237.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782823639',
    reference: 13173601,
    gender: 'male',
    firstname: 'Alessio',
    lastname: 'Scaccianoce',
    name: 'Alessio Scaccianoce',
    email: 'alessio.scaccianoce@valiant.ch',
    phone: '+41 61 765 52 23',
    profile_picture:
      '/data/static/hubdb/images/229cf28550a66c885f0f774cbe9fdd03-561x561.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782823640',
    reference: 16528301,
    gender: 'female',
    firstname: 'Cristina',
    lastname: 'Marquez',
    name: 'Cristina Marquez',
    email: 'cristina.marquez@valiant.ch',
    phone: '+41 41 925 69 54',
    profile_picture:
      '/data/static/hubdb/images/b2b033d7899e01a303bdd0316181d2ff-237x237.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782823641',
    reference: 111897623795,
    gender: 'female',
    firstname: 'Daniela',
    lastname: 'Frey',
    name: 'Daniela Frey',
    email: 'daniela.frey@valiant.ch',
    phone: ' +41 62 772 36 44',
    profile_picture:
      '/data/static/hubdb/images/199b7af82bbbfe6a20f8379198bc319c-237x237.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782823642',
    reference: 12012851,
    gender: 'female',
    firstname: 'Vanessa',
    lastname: 'Egli',
    name: 'Vanessa Egli',
    email: 'vanessa.egli@valiant.ch',
    phone: ' +41 41 989 84 54',
    profile_picture:
      '/data/static/hubdb/images/ea191bd75c40d0ec4a63b3c337769b2f-1024x1024.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782823643',
    reference: 13041201,
    gender: 'male',
    firstname: 'Moreno',
    lastname: 'di Meo',
    name: 'Moreno di Meo',
    email: 'moreno.dimeo@valiant.ch',
    phone: ' +41 62 923 69 43',
    profile_picture:
      '/data/static/hubdb/images/c991ec93a8e67dc33a3771213b8a17b9-237x237.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782823645',
    reference: 8577801,
    gender: 'female',
    firstname: 'Cornelia',
    lastname: 'Muster',
    name: 'Cornelia Muster',
    email: 'cornelia.muster@valiant.ch',
    phone: '+41 31 764 64 73',
    profile_picture:
      '/data/static/hubdb/images/1ebbd9e9c0242f7ae9f0f6d3debeefcd-237x237.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782823646',
    reference: 13362251,
    gender: 'male',
    firstname: 'Ivan',
    lastname: 'Riedo',
    name: 'Ivan Riedo',
    email: 'ivan.riedo@valiant.ch',
    phone: '+41 31 744 14 47',
    profile_picture:
      '/data/static/hubdb/images/3373dd0675e7c919a87d16c5913bf021-237x237.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782823647',
    reference: 12551451,
    gender: 'male',
    firstname: 'Jan',
    lastname: 'Müllener',
    name: 'Jan Müllener',
    email: 'jan.muellener@valiant.ch',
    phone: '+41 31 764 64 78',
    profile_picture:
      '/data/static/hubdb/images/b80543ce4d0c1c09b5d62028c8dc7d3c-237x237.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782823648',
    reference: 16357351,
    gender: 'female',
    firstname: 'Laura',
    lastname: 'Dasen',
    name: 'Laura Dasen',
    email: 'laura.dasen@valiant.ch',
    phone: ' +41 31 859 37 87',
    profile_picture:
      '/data/static/hubdb/images/a7bc668f6403ab153ba6474c04340a4c-236x236.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782823649',
    reference: 16458501,
    gender: 'male',
    firstname: 'Marc-Roland',
    lastname: 'Stadelmann',
    name: 'Marc-Roland Stadelmann',
    email: 'marc-roland.stadelmann@valiant.ch',
    phone: '+41 31 755 67 11',
    profile_picture:
      '/data/static/hubdb/images/a3999249ae75484bec521308f0738923-237x237.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782823650',
    reference: 11029701,
    gender: 'male',
    firstname: 'Riccardo',
    lastname: 'Gregorio',
    name: 'Riccardo Gregorio',
    email: 'riccardo.gregorio@valiant.ch',
    phone: ' +41 31 868 10 32',
    profile_picture:
      '/data/static/hubdb/images/8be1daab1484620918e1720e80946839-237x237.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782823651',
    reference: 12449701,
    gender: 'male',
    firstname: 'Rolf',
    lastname: 'Blum',
    name: 'Rolf Blum',
    email: 'rolf.blum@valiant.ch',
    phone: ' +41 32 626 30 22',
    profile_picture:
      '/data/static/hubdb/images/fc74b725d82b181bd617f5b02e212b12-237x237.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782823653',
    reference: 13137401,
    gender: 'male',
    firstname: 'Athanasios',
    lastname: 'Missiaris',
    name: 'Athanasios Missiaris',
    email: 'athanasios.missiaris@valiant.ch',
    phone: '+41 71 913 20 35',
    profile_picture:
      '/data/static/hubdb/images/fcc931d9a8a12bd637c2bacadad22437-237x237.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782823654',
    reference: 12582301,
    gender: 'male',
    firstname: 'Daniele',
    lastname: 'Corrado',
    name: 'Daniele Corrado',
    email: 'daniele.corrado@valiant.ch',
    phone: ' +41 55 220 06 25',
    profile_picture:
      '/data/static/hubdb/images/660e0178d662eb4f337e09dc945197b0-237x237.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782823655',
    reference: 14507651,
    gender: 'male',
    firstname: 'Pascal',
    lastname: 'Studer',
    name: 'Pascal Studer',
    email: 'pascal.studer@valiant.ch',
    phone: '+41 71 727 10 13',
    profile_picture:
      '/data/static/hubdb/images/62f4e6c8b0133fda7c21432d93e25840-237x237.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782823656',
    reference: 12727751,
    gender: 'male',
    firstname: 'Ralph',
    lastname: 'Müller',
    name: 'Ralph Müller',
    email: 'ralph.mueller@valiant.ch',
    phone: '+41 71 727 10 12',
    profile_picture:
      '/data/static/hubdb/images/5dc7b9ab188c99b66546346d9e703130-237x237.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782823657',
    reference: 13176801,
    gender: 'male',
    firstname: 'Steven',
    lastname: 'Nell',
    name: 'Steven Nell',
    email: 'steven.nell@valiant.ch',
    phone: '+41 52 630 02 54',
    profile_picture:
      '/data/static/hubdb/images/8594e3b64cdd33a03066f2702b3740fd-90x90.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782823658',
    reference: 12551801,
    gender: 'female',
    firstname: 'Melanie',
    lastname: 'Felder',
    name: 'Melanie Felder',
    email: 'melanie.felder@valiant.ch',
    phone: ' +41 41 496 60 81',
    profile_picture:
      '/data/static/hubdb/images/9873afcf742b6269cfa3bfe41b5405ee-237x237.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782823659',
    reference: 3316261324,
    gender: 'female',
    firstname: 'Natascha',
    lastname: 'Schärer',
    name: 'Natascha Schärer',
    email: 'natascha.schaerer@valiant.ch',
    phone: '+41 41 531 28 23',
    profile_picture:
      '/data/static/hubdb/images/ab07d67237ff9719590fdb82df43ee25-1024x1024.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782823660',
    reference: 12583701,
    gender: 'male',
    firstname: 'Tobias',
    lastname: 'Graber',
    name: 'Tobias Graber',
    email: 'tobias.graber@valiant.ch',
    phone: ' +41 41 248 66 74',
    profile_picture:
      '/data/static/hubdb/images/b0ed81e4301d72856d683d16a6c3ebf8-602x602.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782823661',
    reference: 13872551,
    gender: 'male',
    firstname: 'Christian',
    lastname: 'Ehrat',
    name: 'Christian Ehrat',
    email: 'christian.ehrat@valiant.ch',
    phone: ' +41 41 377 44 92',
    profile_picture:
      '/data/static/hubdb/images/26b615a0e806c08286ace4bb81f37f7e-90x90.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782823662',
    reference: 12499551,
    gender: 'female',
    firstname: 'Ajla',
    lastname: 'Murati',
    name: 'Ajla Murati',
    email: 'ajla.murati@valiant.ch',
    profile_picture:
      '/data/static/hubdb/images/51774748a87fd46d338aa5bb97197a1f-237x237.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782823663',
    reference: 14511701,
    gender: 'male',
    firstname: 'Daniel',
    lastname: 'Herkenrath',
    name: 'Daniel Herkenrath',
    email: 'daniel.herkenrath@valiant.ch',
    phone: ' +41 44 783 47 01',
    profile_picture:
      '/data/static/hubdb/images/4011237eb4c15b241923d299bbf57770-237x237.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782823666',
    reference: 12497702,
    gender: 'male',
    firstname: 'Paulo',
    lastname: 'Andrade Ruy',
    name: 'Paulo Andrade Ruy',
    email: 'pauloruy.andrade@valiant.ch',
    phone: ' +41 44 205 94 73',
    profile_picture:
      '/data/static/hubdb/images/fcf9350d54eb939a02b238814ee3a052-Paulo_Andrade_Ruy_modified_1-99x99.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782823672',
    reference: 6457814770,
    gender: 'male',
    firstname: 'Markus-Lukas',
    lastname: 'Luginbühl',
    name: 'Markus-Lukas Luginbühl',
    email: 'markus-lukas.luginbuehl@valiant.ch',
    phone: ' +41 31 320 95 22',
    profile_picture:
      '/data/static/hubdb/images/4247cb2cafb0743a3ce2b29c83e69206-1024x1024.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782823673',
    reference: 8063481808,
    gender: 'female',
    firstname: 'Anastasija',
    lastname: 'Vasic',
    name: 'Anastasija Vasic',
    email: 'anastasija.vasic@valiant.ch',
    phone: ' +41 41 925 69 72',
    profile_picture:
      '/data/static/hubdb/images/fa6126958fb9dd320bdf9b6216521b9a-90x90.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782824634',
    reference: 14133001,
    gender: 'female',
    firstname: 'Fatma',
    lastname: 'Yilmaz',
    name: 'Fatma Yilmaz',
    email: 'fatma.yilmaz@valiant.ch',
    phone: ' +41 62 837 80 77',
    profile_picture:
      '/data/static/hubdb/images/33ed4619439d5719d67f8024aaf977da-1024x1024.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782824635',
    reference: 5308641987,
    gender: 'female',
    firstname: 'Marlene',
    lastname: 'Styner',
    name: 'Marlene Styner',
    email: 'marlene.styner@valiant.ch',
    phone: ' +41 62 738 37 23',
    profile_picture:
      '/data/static/hubdb/images/919ac4320bcc68c87d9c15877036b5b9-1024x1024.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782824636',
    reference: 17485718720,
    gender: 'male',
    firstname: 'Randy',
    lastname: 'Berglas',
    name: 'Randy Berglas',
    email: 'randy.berglas@valiant.ch',
    profile_picture:
      '/data/static/hubdb/images/795f2b0bc32f16e4080001afa9be9e14-1024x1024.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782824637',
    reference: 17494611695,
    gender: 'male',
    firstname: 'Christian',
    lastname: 'Schwarz',
    name: 'Christian Schwarz',
    email: 'christian.schwarz@valiant.ch',
    phone: ' +41 56 204 20 86',
    profile_picture:
      '/data/static/hubdb/images/7c1be62de718450b129c5b662ad30c15-1024x1024.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782824638',
    reference: 14926651,
    gender: 'male',
    firstname: 'Jason Leeroy',
    lastname: 'Buntschu',
    name: 'Jason Leeroy Buntschu',
    email: 'jason.buntschu@valiant.ch',
    phone: ' +41 62 765 65 15',
    profile_picture:
      '/data/static/hubdb/images/76f5fb5a41f2453dcb45f46e3c4aabae-1024x1024.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782824639',
    reference: 15364708056,
    gender: 'female',
    firstname: 'Jasmin',
    lastname: 'Moccand',
    name: 'Jasmin Moccand',
    email: 'jasmin.moccand@valiant.ch',
    phone: ' +41 62 765 65 03',
    profile_picture:
      '/data/static/hubdb/images/ff2217c86b43ff6714eac85511d07fdb-1024x1024.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782824640',
    reference: 11465438456,
    gender: 'male',
    firstname: 'Philipp',
    lastname: 'Hänseler',
    name: 'Philipp Hänseler ',
    email: 'philipp.haenseler@valiant.ch',
    phone: ' +41 44 864 10 24',
    profile_picture:
      '/data/static/hubdb/images/4792e8895582bf61c9fd6bc2a55db996-1024x1024.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782824641',
    reference: 29905507064,
    gender: 'male',
    firstname: 'Sanji',
    lastname: 'Lingam',
    name: 'Sanji Lingam',
    email: 'sanji.lingam@valiant.ch',
    phone: ' +41 44 925 35 62',
    profile_picture:
      '/data/static/hubdb/images/df211d70236e46c36de15f86e6faac79-1024x1024.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782824642',
    reference: 32838055882,
    gender: 'male',
    firstname: 'Pascal',
    lastname: 'Hinderling',
    name: 'Pascal Hinderling',
    email: 'pascal.hinderling@valiant.ch',
    phone: ' +41 44 864 10 23',
    profile_picture:
      '/data/static/hubdb/images/c2f91254ef6cb92dffda380f3d344869-Hinderling_Pascal_hdp_bea_modified_png-180x180.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782824643',
    reference: 18925187059,
    gender: 'male',
    firstname: 'Carmine',
    lastname: 'Scagnoli',
    name: 'Carmine Scagnoli',
    email: 'carmine.scagnoli@valiant.ch',
    phone: ' +41 44 943 36 03',
    profile_picture:
      '/data/static/hubdb/images/f91e8a12e199320ebdbb6aae9e4cbccd-1024x1024.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782824644',
    reference: 29905507063,
    gender: 'male',
    firstname: 'Arbnor',
    lastname: 'Bekiri',
    name: 'Arbnor Bekiri',
    email: 'arbnor.bekiri@valiant.ch',
    phone: ' +41 44 439 10 93',
    profile_picture:
      '/data/static/hubdb/images/dcd27a17bc2dd0dc4900f0238629f9bc-1024x1024.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782824646',
    reference: 14254901,
    gender: 'male',
    firstname: 'Yago',
    lastname: 'Bellón',
    name: 'Yago Bellón',
    email: 'yago.bellon@valiant.ch',
    phone: ' +41 52 304 80 51',
    profile_picture:
      '/data/static/hubdb/images/45c8dfb98a1af4934a6af37e246b3ae4-1024x1024.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782824647',
    reference: 29914245341,
    gender: 'male',
    firstname: 'Ueli',
    lastname: 'Bucher',
    name: 'Ueli Bucher',
    email: 'ueli.bucher@valiant.ch',
    phone: ' +41 41 269 00 42',
    profile_picture:
      '/data/static/hubdb/images/c253b9588ef5ebb1f5b8f24c5b5d1a3a-1024x1024.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782824648',
    reference: 17116314070,
    gender: 'female',
    firstname: 'Carla',
    lastname: 'Sutter',
    name: 'Carla Sutter',
    email: 'carlalina.sutter@valiant.ch',
    phone: ' +41 41 930 45 52',
    profile_picture:
      '/data/static/hubdb/images/fb0fb1926bce9d87a14e589bbd60e1ed-1024x1024.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782824649',
    reference: 70840793311,
    gender: 'male',
    firstname: 'Yannick',
    lastname: 'Demierre',
    name: 'Yannick Demierre',
    email: 'yannick.demierre@valiant.ch',
    phone: ' +41 41 530 69 40',
    profile_picture:
      '/data/static/hubdb/images/ce188041e5b01274e35096128e793634-199x199.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '222782824650',
    reference: 17485455335,
    gender: 'male',
    firstname: 'Diego',
    lastname: 'Meyenberg',
    name: 'Diego Meyenberg',
    email: 'diego.meyenberg@valiant.ch',
    phone: ' +41 62 739 25 14',
    profile_picture:
      '/data/static/hubdb/images/9898f1cb6d8d590b91e0d9df381e6afa-237x237.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '236253660365',
    reference: 291072286956,
    gender: 'male',
    firstname: 'Robert',
    lastname: 'Herrmann',
    name: 'Robert Herrmann',
    email: 'robert.herrmann@visionproject.ch',
    phone: '+41 61 511 34 55',
    profile_picture:
      '/data/static/hubdb/images/e1a3881d223a46a16c9c70d58732ea9f-Robert_Herrmann_VisionProject-1024x1024.webp',
    partner: ['public_partner/236253660366'],
  },
  {
    id: '236257122512',
    reference: 17494255090,
    gender: 'male',
    firstname: 'Beat',
    lastname: 'Frei',
    name: 'Beat Frei',
    email: 'beat.frei@visionproject.ch',
    phone: '+41 61 511 34 54',
    profile_picture:
      '/data/static/hubdb/images/daf43b3bac7381762a2b3c423db8d1c7-Beat_Frei_jpg_modified-1024x1024.webp',
    partner: ['public_partner/236253660366'],
  },
  {
    id: '243956642026',
    reference: 13408701,
    gender: 'male',
    firstname: 'Sascha',
    lastname: 'Markovic',
    name: 'Sascha Markovic',
    email: 'sascha.markovic@valiant.ch',
    phone: '+41 31 818 21 05',
    profile_picture:
      '/data/static/hubdb/images/258f1164a7656833ac986e9ce321062e-Team_Valiant_Markovic_Sascha-1024x1024.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '243956642027',
    reference: 317393534184,
    gender: 'male',
    firstname: 'Elkanah',
    lastname: 'Kamalendram',
    name: 'Elkanah Kamalendram',
    email: 'elkanah.kamalendram@valiant.ch',
    phone: '+41 31 818 21 06',
    profile_picture:
      '/data/static/hubdb/images/bd9976d92f5f2d5f7e6378a37518048b-Team_Valiant_Kamalendram_Elkanah-1024x1024.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '250016068800',
    reference: 196353843447,
    gender: 'male',
    firstname: 'Vincenzo',
    lastname: 'Gulli',
    name: 'Vincenzo Gulli',
    email: 'vincenzo.gulli@valiant.ch',
    phone: '+41 41 269 00 43',
    profile_picture:
      '/data/static/hubdb/images/91f479f5ec1af6be6c4221d49997bc09-Gulli_Vincenzo_gvi_10295_bea_modified-1024x1024.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '264315818211',
    reference: 370772387019,
    gender: 'female',
    firstname: 'Amanda',
    lastname: 'Semaane',
    name: 'Amanda Semaane',
    email: 'amanda.semaane@valiant.ch',
    phone: '+41 41 935 10 11',
    profile_picture:
      '/data/static/hubdb/images/12e0ad34cca651ff535c758630d719f1-Amanda_Semaane-945x945.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '267307259116',
    reference: 176632076492,
    gender: 'female',
    firstname: 'Romina',
    lastname: 'Buchle',
    name: 'Romina Buchle',
    email: 'romina.buchle@agentselly.ch',
    phone: '+41 76 216 1299',
    partner: [],
  },
  {
    id: '269978534100',
    reference: 12637751,
    gender: 'male',
    firstname: 'Armend',
    lastname: 'Aliu',
    name: 'Armend Aliu',
    email: 'armend.aliu@valiant.ch',
    phone: '+41 52 304 80 52',
    profile_picture:
      '/data/static/hubdb/images/0b99300c1e84e34b9f1b00570dce79d0-Val_Team_Armend_Aliu-1024x1024.webp',
    partner: ['public_partner/222804179182'],
  },
  {
    id: '276753673434',
    reference: 442451252467,
    gender: 'male',
    firstname: 'Marvin',
    lastname: 'Turrini',
    name: 'Marvin Turrini',
    email: 'm.turrini@armidafinance.ch',
    phone: '+41 41 792 74 71',
    profile_picture:
      '/data/static/hubdb/images/8862449983ed76b518359d92ed400ca0-Armida_Finance_Marvini_Turini_jpg_modified-1024x1024.webp',
    partner: ['public_partner/276753673436'],
  },
  {
    id: '276753673437',
    reference: 444032884939,
    gender: 'female',
    firstname: 'Laëtitia',
    lastname: 'Schumacher',
    name: 'Laëtitia Schumacher',
    email: 'l.schumacher@armidafinance.ch',
    phone: '+41 41 792 74 83',
    profile_picture:
      '/data/static/hubdb/images/563c7476b5d44514395098e6477ce811-Armida_Finance_Letizia_Schumacher_jpg_modified-1024x1024.webp',
    partner: ['public_partner/276753673436'],
  },
  {
    id: '276753673440',
    reference: 247244999897,
    gender: 'male',
    firstname: 'Asdren',
    lastname: 'Sopi',
    name: 'Asdren Sopi',
    email: 'a.sopi@armidafinance.ch',
    phone: '+41 41 792 74 72',
    profile_picture:
      '/data/static/hubdb/images/f7bed7e5a01552a3bafc68d3b6f0db76-Armida_Finance_Asdren_Sopi_jpg_modified-942x942.webp',
    partner: ['public_partner/276753673436'],
  },
  {
    id: '281402010849',
    reference: 461748020446,
    gender: 'male',
    firstname: 'Florian',
    lastname: 'Hammel',
    name: 'Florian Hammel',
    email: 'florian.hammel@valiant.ch',
    phone: '+41 61 789 96 58',
    profile_picture:
      '/data/static/hubdb/images/718a335d47bcaa1fc49adc2431f069b9-Valiant_Team_Florian_Hammel-1024x1024.webp',
    partner: ['public_partner/222804179182'],
  },
]

/**
 * Find external advisor by email on slide 7
 */
function findExternalAdvisorByEmail(slide) {
  if (!slide.pageElements) return null

  console.log(`  🔍 Slide 7: Looking for external advisor email...`)

  // Extract all text from slide to find email addresses
  let slideText = ''
  slide.pageElements.forEach((element) => {
    if (element.shape?.text?.textElements) {
      const text = element.shape.text.textElements
        .map((t) => t.textRun?.content || '')
        .join('')
      slideText += text + ' '
    }
  })

  // Look for email patterns (especially @valiant.ch)
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g
  const emails = slideText.match(emailRegex) || []

  console.log(`  📧 Found emails on slide: ${emails.join(', ')}`)

  // Separate valiant and agentselly emails
  const valiantEmails = emails.filter((email) => email.includes('@valiant.ch'))
  const agentsellyEmails = emails.filter((email) =>
    email.includes('@agentselly.ch'),
  )
  const otherEmails = emails.filter(
    (email) =>
      !email.includes('@valiant.ch') && !email.includes('@agentselly.ch'),
  )

  console.log(`  📧 Valiant emails: ${valiantEmails.join(', ')}`)
  console.log(`  📧 Agentselly emails: ${agentsellyEmails.join(', ')}`)
  console.log(`  📧 Other emails: ${otherEmails.join(', ')}`)

  // Priority 1: Look for valiant emails first (external advisors)
  for (const email of valiantEmails) {
    const advisor = VALIANT_ADVISORS.find((a) => a.email === email)
    if (advisor) {
      console.log(`  ✅ Found Valiant advisor: ${advisor.name} (${email})`)
      return { advisor, type: 'valiant' }
    }
  }

  // Priority 2: Look for other external advisor emails
  for (const email of otherEmails) {
    const advisor = VALIANT_ADVISORS.find((a) => a.email === email)
    if (advisor) {
      console.log(`  ✅ Found external advisor: ${advisor.name} (${email})`)
      return { advisor, type: 'external' }
    }
  }

  // Priority 3: Look for agentselly emails (internal agents)
  for (const email of agentsellyEmails) {
    const agent = findAgentsellyAgentByEmail(email)
    if (agent) {
      console.log(`  ✅ Found agentselly agent: ${agent.name} (${email})`)
      return { advisor: agent, type: 'agentselly' }
    }
  }

  console.log(`  ⚠️  No advisor email found on slide 7`)
  return null
}

/**
 * Find agentselly agent by email from AGENT_IMAGES configuration
 */
function findAgentsellyAgentByEmail(email) {
  // Map emails to agent IDs based on known agents
  const emailToAgentMap = {
    'florian.beck@agentselly.ch': '12428052',
    'martin.heim@agentselly.ch': '25553264100',
    'alissa.balatsky@agentselly.ch': '5303752653',
  }

  const agentId = emailToAgentMap[email]
  if (!agentId) {
    console.log(`  ⚠️  No agentselly agent found for email: ${email}`)
    return null
  }

  const agentConfig = AGENT_IMAGES.find((img) => img.agentId === agentId)
  if (!agentConfig) {
    console.log(`  ⚠️  No agent configuration found for ID: ${agentId}`)
    return null
  }

  return {
    reference: agentId,
    name: agentConfig.name,
    profile_picture: agentConfig.url.replace('https://www.agentselly.ch', ''),
  }
}

/**
 * Get or upload advisor image to Google Drive (works for any advisor type)
 */
async function getExternalAdvisorImageUrl(advisor) {
  if (!advisor) {
    console.log(`  ⚠️  No advisor found`)
    return null
  }

  // Load existing mapping
  const mapping = await loadAgentImagesMapping()

  // Check if we already have this advisor uploaded
  if (mapping[advisor.reference]) {
    console.log(
      `  📎 Using existing image for advisor ${advisor.reference}: ${mapping[advisor.reference].driveUrl}`,
    )
    return mapping[advisor.reference].driveUrl
  }

  // Create image data for this advisor
  let imageUrl
  if (advisor.profile_picture) {
    imageUrl = `https://www.agentselly.ch${advisor.profile_picture}`
  } else {
    // For agentselly agents, use the AGENT_IMAGES URL
    const agentConfig = AGENT_IMAGES.find(
      (img) => img.agentId === advisor.reference.toString(),
    )
    if (agentConfig) {
      imageUrl = agentConfig.url
    } else {
      console.log(`  ⚠️  No image URL found for advisor ${advisor.reference}`)
      return null
    }
  }

  const imageData = {
    agentId: advisor.reference.toString(),
    name: advisor.name,
    url: imageUrl,
  }

  // Upload the image
  const result = await uploadToGoogleDrive(imageData)
  if (result) {
    // Update mapping
    mapping[advisor.reference] = result
    await fs.writeFile(
      'scripts/agent-images.json',
      JSON.stringify(mapping, null, 2),
    )
    console.log(`  💾 Saved mapping to scripts/agent-images.json`)
    return result.driveUrl
  }

  return null
}

/**
 * Make HTTPS request helper
 */
function httpsRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const protocol = urlObj.protocol === 'https:' ? https : http

    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    }

    const req = protocol.request(requestOptions, (res) => {
      let data = ''
      res.on('data', (chunk) => {
        data += chunk
      })
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch (e) {
          resolve(data)
        }
      })
    })

    req.on('error', reject)

    if (options.body) {
      req.write(
        typeof options.body === 'string'
          ? options.body
          : JSON.stringify(options.body),
      )
    }

    req.end()
  })
}

/**
 * Get Google OAuth access token
 */
async function getAccessToken() {
  const response = await httpsRequest('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: {
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    },
  })

  if (!response.access_token) {
    throw new Error('Failed to get access token: ' + JSON.stringify(response))
  }

  return response.access_token
}

/**
 * Fetch all agents from AgentSelly API
 */
async function fetchAgents() {
  console.log('📋 Fetching agents from AgentSelly API...')
  const agents = await httpsRequest(AGENT_API_URL)
  console.log(`✅ Loaded ${agents.length} agents\n`)
  return agents
}

/**
 * Find agent by reference ID
 */
function findAgentByReference(agents, referenceId) {
  return agents.find((a) => a.reference?.toString() === referenceId?.toString())
}

/**
 * Extract Google Drive folder ID from URL
 */
function extractFolderId(url) {
  if (!url) return null
  const match = url.match(/folders\/([a-zA-Z0-9_-]+)/)
  return match ? match[1] : null
}

/**
 * List presentations in Google Drive folder
 */
async function listFilesInFolder(folderId) {
  const url = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+mimeType='application/vnd.google-apps.presentation'&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`

  // Get access token for Google Drive API
  const accessToken = await getAccessToken()

  const response = await httpsRequest(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  return response.files || []
}

/**
 * Get presentation details
 */
async function getPresentation(presentationId) {
  const url = `https://slides.googleapis.com/v1/presentations/${presentationId}`

  // Get access token for Google Slides API
  const accessToken = await getAccessToken()

  return await httpsRequest(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}

/**
 * Find profile image object ID - tries URL pattern first, then proximity to text
 */
function findProfileImage(slide, agentName, agentEmail) {
  if (!slide.pageElements) return null

  // Strategy 1: Find by URL pattern (most reliable)
  for (const element of slide.pageElements) {
    if (element.image) {
      const sourceUrl = element.image.sourceUrl || ''
      const contentUrl = element.image.contentUrl || ''

      // Check both sourceUrl and contentUrl for the pattern
      if (
        sourceUrl.includes('image.agentselly.ch/public/person/') ||
        contentUrl.includes('image.agentselly.ch/public/person/')
      ) {
        console.log(`  ✅ Found profile image by URL: ${element.objectId}`)
        console.log(`     sourceUrl: ${sourceUrl || 'N/A'}`)
        console.log(`     contentUrl: ${contentUrl || 'N/A'}`)
        return element.objectId
      }
    }
  }

  console.log(
    `  🔍 No image with agentselly URL pattern found, trying proximity search...`,
  )

  // Strategy 2: Find image near agent text (fallback)
  const textElements = slide.pageElements.filter((e) => {
    if (!e.shape?.text?.textElements) return false
    const text = e.shape.text.textElements
      .map((t) => t.textRun?.content || '')
      .join('')
      .toLowerCase()
    return (
      text.includes(agentName.toLowerCase()) ||
      text.includes(agentEmail.toLowerCase())
    )
  })

  if (textElements.length === 0) {
    console.log(`  ⚠️  No text elements with agent name/email found`)
    return null
  }

  // Find closest image to text
  const images = slide.pageElements.filter((e) => e.image)
  if (images.length === 0) {
    console.log(`  ⚠️  No images found on slide`)
    return null
  }

  let closestImage = null
  let minDistance = Infinity

  for (const image of images) {
    for (const textElement of textElements) {
      const distance = calculateDistance(image, textElement)
      if (distance < minDistance) {
        minDistance = distance
        closestImage = image
      }
    }
  }

  if (closestImage) {
    console.log(
      `  ✅ Found image near agent text: ${closestImage.objectId} (distance: ${Math.round(minDistance)})`,
    )
    return closestImage.objectId
  }

  return null
}

/**
 * Calculate distance between two slide elements
 */
function calculateDistance(element1, element2) {
  const getCenter = (elem) => {
    const t = elem.transform || elem.size || {}
    return {
      x: (t.translateX || 0) + (t.scaleX || 0) / 2,
      y: (t.translateY || 0) + (t.scaleY || 0) / 2,
    }
  }

  const c1 = getCenter(element1)
  const c2 = getCenter(element2)

  return Math.sqrt(Math.pow(c2.x - c1.x, 2) + Math.pow(c2.y - c1.y, 2))
}

/**
 * Load agent images mapping from JSON file
 */
async function loadAgentImagesMapping() {
  try {
    const mappingData = await fs.readFile('scripts/agent-images.json', 'utf8')
    return JSON.parse(mappingData)
  } catch (error) {
    console.log(
      '⚠️  No existing agent-images.json found, will create new uploads',
    )
    return {}
  }
}

/**
 * Get or upload agent image to Google Drive
 */
async function getAgentImageUrl(agentId) {
  // Load existing mapping
  const mapping = await loadAgentImagesMapping()

  // Check if we already have this agent uploaded
  if (mapping[agentId]) {
    console.log(
      `  📎 Using existing image for agent ${agentId}: ${mapping[agentId].driveUrl}`,
    )
    return mapping[agentId].driveUrl
  }

  // Find agent in AGENT_IMAGES configuration
  const agentImageData = AGENT_IMAGES.find((img) => img.agentId === agentId)
  if (!agentImageData) {
    console.log(`  ⚠️  No image configuration found for agent ${agentId}`)
    return null
  }

  // Upload the image
  const result = await uploadToGoogleDrive(agentImageData)
  if (result) {
    // Update mapping
    mapping[agentId] = result
    await fs.writeFile(
      'scripts/agent-images.json',
      JSON.stringify(mapping, null, 2),
    )
    console.log(`  💾 Saved mapping to scripts/agent-images.json`)
    return result.driveUrl
  }

  return null
}

/**
 * Find the small profile images (0.81 x 0.81 inch) on slide 7 for consultant positions 1, 2, 3
 * Returns array of image object IDs for the first 3 positions (position 4 is correct)
 */
function findSlide7SmallProfileImages(slide) {
  if (!slide.pageElements) return []

  console.log(`  🎯 Slide 7: Looking for small profile images (0.81 x 0.81 inch)...`)

  // Find all images on the slide
  const allImages = slide.pageElements.filter((e) => e.image)
  
  // Filter for images that are approximately 0.81 x 0.81 inch (in EMU units)
  // 0.81 inch = ~583200 EMU (1 inch = 914400 EMU)
  const targetSize = 583200
  const tolerance = 50000 // Allow some variance
  
  const smallImages = allImages.filter((img) => {
    const width = img.size?.width?.magnitude || 0
    const height = img.size?.height?.magnitude || 0
    
    const isSquare = Math.abs(width - height) < tolerance
    const isRightSize = Math.abs(width - targetSize) < tolerance && Math.abs(height - targetSize) < tolerance
    
    return isSquare && isRightSize
  })
  
  console.log(`  📏 Found ${smallImages.length} images with size ~0.81 x 0.81 inch`)
  
  if (smallImages.length === 0) {
    console.log(`  ⚠️  No small profile images found, trying alternative approach...`)
    // Fallback: Find smallest square images that are near email addresses
    const squareImages = allImages.filter((img) => {
      const width = img.size?.width?.magnitude || 0
      const height = img.size?.height?.magnitude || 0
      return Math.abs(width - height) < tolerance
    })
    
    // Sort by size (smallest first) and take first 4
    squareImages.sort((a, b) => {
      const sizeA = (a.size?.width?.magnitude || 0)
      const sizeB = (b.size?.width?.magnitude || 0)
      return sizeA - sizeB
    })
    
    console.log(`  📐 Found ${squareImages.length} square images as fallback`)
    return squareImages.slice(0, 3).map(img => img.objectId)
  }
  
  // Sort by position (left to right, top to bottom) to get positions 1, 2, 3, 4
  smallImages.sort((a, b) => {
    const posA = a.transform || {}
    const posB = b.transform || {}
    
    const yA = posA.translateY || 0
    const yB = posB.translateY || 0
    const xA = posA.translateX || 0
    const xB = posB.translateX || 0
    
    // First sort by Y (top to bottom)
    if (Math.abs(yA - yB) > 50000) { // If not on same row
      return yA - yB
    }
    
    // Then by X (left to right) for same row
    return xA - xB
  })
  
  // Return only first 3 (positions 1, 2, 3) - position 4 is already correct
  const imageIds = smallImages.slice(0, 3).map(img => img.objectId)
  console.log(`  ✅ Found ${imageIds.length} small profile images to update: ${imageIds.join(', ')}`)
  
  return imageIds
}

/**
 * Delete a slide from the presentation
 */
async function deleteSlide(presentationId, slideIndex) {
  const presentation = await getPresentation(presentationId)

  if (!presentation.slides || !presentation.slides[slideIndex]) {
    console.log(`  ⚠️  Slide ${slideIndex + 1} not found`)
    return false
  }

  const slide = presentation.slides[slideIndex]
  const slideObjectId = slide.objectId

  if (isDryRun) {
    console.log(
      `  🔍 [DRY RUN] Would delete slide ${slideIndex + 1} (${slideObjectId})`,
    )
    return true
  }

  const batchUpdateUrl = `https://slides.googleapis.com/v1/presentations/${presentationId}:batchUpdate`
  const accessToken = await getAccessToken()

  const requests = [
    {
      deleteObject: {
        objectId: slideObjectId,
      },
    },
  ]

  console.log(`  🗑️  Deleting slide ${slideIndex + 1} (${slideObjectId})...`)

  const response = await httpsRequest(batchUpdateUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: { requests },
  })

  if (response.error) {
    console.log(`  ❌ API Error: ${JSON.stringify(response.error, null, 2)}`)
    throw new Error(`Google Slides API error: ${response.error.message}`)
  }

  console.log(`  ✅ Deleted slide ${slideIndex + 1}`)
  return true
}

/**
 * Update slide text with agent data
 */
async function updateSlideText(presentationId, slideIndex, agent) {
  const presentation = await getPresentation(presentationId)

  if (!presentation.slides || !presentation.slides[slideIndex]) {
    console.log(`  ⚠️  Slide ${slideIndex + 1} not found`)
    return false
  }

  const slide = presentation.slides[slideIndex]

  const requests = [
    {
      replaceAllText: {
        containsText: { text: 'Carmen Hodel', matchCase: false },
        replaceText: `${agent.firstname} ${agent.lastname}`,
      },
    },
    {
      replaceAllText: {
        containsText: { text: 'Immobilienvermarkterin', matchCase: false },
        replaceText: agent.job_title,
      },
    },
    {
      replaceAllText: {
        containsText: { text: 'carmen.hodel@agentselly.ch', matchCase: false },
        replaceText: agent.email,
      },
    },
    {
      replaceAllText: {
        containsText: { text: '+41764736557', matchCase: false },
        replaceText: '+41 41 530 69 40',
      },
    },
    {
      replaceAllText: {
        containsText: { text: '+41 76 473 65 57', matchCase: false },
        replaceText: '+41 41 530 69 40',
      },
    },
  ]

  // Add image replacement using agent images from AGENT_IMAGES configuration
  const agentName = `${agent.firstname} ${agent.lastname}`
  let imageObjectId = null

  // Special handling for slide 7 (index 6) - update multiple small profile images
  if (slideIndex === 6) {
    const smallImageIds = findSlide7SmallProfileImages(slide)
    
    // Check if we found an external advisor on slide 7
    const externalAdvisor = findExternalAdvisorByEmail(slide)
    
    if (externalAdvisor && smallImageIds.length > 0) {
      console.log(
        `🖼️  Found ${smallImageIds.length} small profile images for ${externalAdvisor.type} advisor`,
      )

      // Get or upload external advisor image to Google Drive
      const advisorImageUrl = await getExternalAdvisorImageUrl(
        externalAdvisor.advisor,
      )

      if (advisorImageUrl) {
        // Replace all 3 small images (positions 1, 2, 3) with the same advisor image
        for (const imageId of smallImageIds) {
          requests.push({
            replaceImage: {
              imageObjectId: imageId,
              url: advisorImageUrl,
              imageReplaceMethod: 'CENTER_INSIDE',
            },
          })
        }
        console.log(
          `  ✅ Will replace ${smallImageIds.length} images with ${externalAdvisor.type} advisor Google Drive URL`,
        )
      } else {
        console.log(
          `  ⚠️  Failed to get ${externalAdvisor.type} advisor image URL, skipping image updates`,
        )
      }
    } else if (smallImageIds.length === 0) {
      console.log(`  ⚠️  No small profile images found on slide 7`)
    }
  } else {
    // For other slides, use the regular search
    imageObjectId = findProfileImage(slide, agentName, agent.email)
  }

  // Handle regular agent image replacement (if not already handled for slide 7)
  if (imageObjectId && slideIndex !== 6) {
    console.log(`🖼️  Found profile image placeholder (${imageObjectId})`)

    // Get or upload agent image to Google Drive
    const agentImageUrl = await getAgentImageUrl(agent.reference)

    if (agentImageUrl) {
      requests.push({
        replaceImage: {
          imageObjectId: imageObjectId,
          url: agentImageUrl,
          imageReplaceMethod: 'CENTER_INSIDE',
        },
      })
      console.log(`  ✅ Using Google Drive URL: ${agentImageUrl}`)
    } else {
      console.log(`  ⚠️  Failed to get agent image URL, skipping image update`)
    }
  } else if (!imageObjectId) {
    console.log(`  ⚠️  No profile image found on slide ${slideIndex + 1}`)
  }

  if (isDryRun) {
    console.log(
      `  🔍 [DRY RUN] Would update slide ${slideIndex + 1} with ${requests.length} replacements (text + images)`,
    )
    return true
  }

  const batchUpdateUrl = `https://slides.googleapis.com/v1/presentations/${presentationId}:batchUpdate`

  // Get access token for Google Slides API
  const accessToken = await getAccessToken()

  console.log(
    `  📤 Sending ${requests.length} requests to Google Slides API...`,
  )

  const response = await httpsRequest(batchUpdateUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: { requests },
  })

  if (response.error) {
    console.log(`  ❌ API Error: ${JSON.stringify(response.error, null, 2)}`)
    throw new Error(`Google Slides API error: ${response.error.message}`)
  }

  console.log(
    `  ✅ Updated slide ${slideIndex + 1} - API Response: ${response.presentationId ? 'OK' : 'Unknown'}`,
  )
  return true
}

/**
 * Process a single property
 */
async function processProperty(property, agent) {
  const propertyId = property._id
  const folderUrl = property.expose2022?.destinationFolderUrl

  console.log(`\n📂 Processing property: ${propertyId}`)
  console.log(`   Title: ${property.marketingLine || 'N/A'}`)
  console.log(`   Agent: ${agent.firstname} ${agent.lastname}`)
  console.log(`   Folder: ${folderUrl}`)

  const folderId = extractFolderId(folderUrl)
  if (!folderId) {
    console.log('  ⚠️  Could not extract folder ID from URL')
    return { success: false, error: 'Invalid folder URL' }
  }

  try {
    const files = await listFilesInFolder(folderId)

    if (!files || files.length === 0) {
      console.log('  ⚠️  No presentations found in folder')
      return { success: false, error: 'No presentations found' }
    }

    // Filter out attachments (case-insensitive)
    const mainSlides = files.filter(
      (f) => !f.name.toLowerCase().includes('_attachments'),
    )

    if (mainSlides.length === 0) {
      console.log('  ⚠️  No main presentations found (all have _attachments)')
      return { success: false, error: 'Only attachment slides found' }
    }

    console.log(`  📄 Found ${mainSlides.length} presentation(s):`)
    mainSlides.forEach((s) => console.log(`     - ${s.name}`))

    // DEBUG: Show all text on slide 2 of first presentation
    if (mainSlides.length > 0) {
      console.log(
        `\n  🔍 DEBUG: Analyzing text on slide 2 of ${mainSlides[0].name}...`,
      )
      const debugPresentation = await getPresentation(mainSlides[0].id)
      const debugSlide = debugPresentation.slides?.[1]
      if (debugSlide?.pageElements) {
        console.log(`  📝 Text elements on slide 2:`)
        for (const elem of debugSlide.pageElements) {
          if (elem.shape?.text?.textElements) {
            const text = elem.shape.text.textElements
              .map((t) => t.textRun?.content || '')
              .join('')
              .trim()
            if (text) {
              console.log(`     - "${text}"`)
            }
          }
        }
      }
    }

    for (const slide of mainSlides) {
      console.log(`\n  🔄 Updating: ${slide.name}`)

      try {
        // Update page 2 (index 1)
        await updateSlideText(slide.id, 1, agent)
        
        // Delete page 7 (index 6)
        await deleteSlide(slide.id, 6)

        console.log(`  ✅ Successfully updated ${slide.name}`)
      } catch (error) {
        console.log(`  ❌ Error updating ${slide.name}: ${error.message}`)
      }
    }

    return {
      success: true,
      presentationsUpdated: mainSlides.length,
      link: `https://agency.selly.ch/su/properties/${propertyId}`,
    }
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`)
    return { success: false, error: error.message }
  }
}

/**
 * Upload agent image to Google Drive (from upload-agent-images.mjs)
 */
async function uploadToGoogleDrive(imageData) {
  const tempWebp = `/tmp/agent-${imageData.agentId}.webp`
  const tempPng = `/tmp/agent-${imageData.agentId}.png`

  try {
    console.log(`\n📥 Processing ${imageData.name}...`)

    // Download with User-Agent header
    const response = await fetch(imageData.url, {
      headers: {
        'User-Agent': 'as-external-request-ua-agentselly',
      },
    })

    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`)
    }

    const buffer = await response.arrayBuffer()
    await fs.writeFile(tempWebp, Buffer.from(buffer))
    console.log(`  ✓ Downloaded`)

    // Convert to PNG
    await execAsync(`dwebp "${tempWebp}" -o "${tempPng}"`)
    console.log(`  ✓ Converted to PNG`)

    // Upload to Google Drive
    const auth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)
    auth.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN })
    const drive = google.drive({ version: 'v3', auth })

    const pngStream = (await import('fs')).createReadStream(tempPng)

    const file = await drive.files.create({
      requestBody: {
        name: `agent-${imageData.agentId}-${imageData.name.replace(/ /g, '-')}.png`,
      },
      media: {
        mimeType: 'image/png',
        body: pngStream,
      },
      fields: 'id',
    })

    // Make publicly accessible
    await drive.permissions.create({
      fileId: file.data.id,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    })

    const driveUrl = `https://drive.google.com/uc?export=view&id=${file.data.id}`
    console.log(`  ✓ Uploaded to Drive: ${file.data.id}`)

    // Cleanup
    await fs.unlink(tempWebp).catch(() => {})
    await fs.unlink(tempPng).catch(() => {})

    return {
      agentId: imageData.agentId,
      driveFileId: file.data.id,
      driveUrl: driveUrl,
    }
  } catch (error) {
    console.error(`  ✗ Error: ${error.message}`)
    await fs.unlink(tempWebp).catch(() => {})
    await fs.unlink(tempPng).catch(() => {})
    return null
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Starting Google Slides Update Process\n')
  console.log('='.repeat(60))

  if (isDryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n')
  }

  if (specificAgent) {
    console.log(`🎯 Filtering by agent: ${specificAgent}\n`)
  }

  if (specificProperty) {
    console.log(`🎯 Filtering by property: ${specificProperty}\n`)
  }

  let mongoClient

  try {
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...')
    mongoClient = new MongoClient(MONGODB_URI)
    await mongoClient.connect()
    console.log('✅ Connected to MongoDB\n')

    const db = mongoClient.db('heroku_q5b1c1cd')
    const propertiesCollection = db.collection('Property')

    // Fetch agents
    const agents = await fetchAgents()

    // Agent IDs for Alissa, Florian, and Martin (properties originally created by Carmen)
    const ALLOWED_AGENT_IDS = ['5303752653', '12428052', '25553264100']

    // Build query
    const query = {
      'expose2022.destinationFolderUrl': { $exists: true, $ne: '' },
      hubdbInternalAgentId: { $in: ALLOWED_AGENT_IDS },
    }

    if (specificAgent) {
      // Verify the specific agent is in the allowed list
      if (!ALLOWED_AGENT_IDS.includes(specificAgent)) {
        console.log(
          `⚠️  Agent ${specificAgent} is not in the allowed list (Alissa, Florian, Martin)`,
        )
        return
      }
      query.hubdbInternalAgentId = specificAgent
    }

    if (specificProperty) {
      query._id = specificProperty
    }

    // Fetch properties
    console.log('📋 Querying properties from MongoDB...')
    const properties = await propertiesCollection.find(query).toArray()
    console.log(`✅ Found ${properties.length} properties to process\n`)

    if (properties.length === 0) {
      console.log('⚠️  No properties found matching criteria')
      return
    }

    // Get Google access token
    console.log('🔑 Getting Google OAuth access token...')
    await getAccessToken()
    console.log('✅ Access token obtained\n')

    // Process each property
    const results = []

    for (const property of properties) {
      const agent = findAgentByReference(agents, property.hubdbInternalAgentId)

      if (!agent) {
        console.log(
          `\n⚠️  Property ${property._id}: No agent found for ID ${property.hubdbInternalAgentId}`,
        )
        results.push({
          propertyId: property._id,
          success: false,
          error: 'Agent not found',
        })
        continue
      }

      const result = await processProperty(property, agent)
      results.push({
        propertyId: property._id,
        agentName: `${agent.firstname} ${agent.lastname}`,
        ...result,
      })
    }

    // Summary
    console.log('\n\n' + '='.repeat(60))
    console.log('📊 SUMMARY')
    console.log('='.repeat(60))

    const successful = results.filter((r) => r.success)
    const failed = results.filter((r) => !r.success)

    console.log(
      `\n✅ Successful updates: ${successful.length}/${results.length}`,
    )
    console.log(`❌ Failed updates: ${failed.length}/${results.length}\n`)

    if (successful.length > 0) {
      console.log('🔗 Successfully Updated Properties:\n')
      successful.forEach((r) => {
        console.log(`   ${r.propertyId} (${r.agentName}): ${r.link}`)
      })
    }

    if (failed.length > 0) {
      console.log('\n⚠️  Failed Properties:\n')
      failed.forEach((r) => {
        console.log(`   ${r.propertyId}: ${r.error}`)
      })
    }

    console.log('\n' + '='.repeat(60))
    console.log(isDryRun ? '✅ Dry run completed!' : '✅ Process completed!')
    console.log('='.repeat(60))
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    if (mongoClient) {
      await mongoClient.close()
      console.log('\n🔌 Disconnected from MongoDB')
    }
  }
}

main().catch(console.error)
