'use strict';

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const DEST = path.join(__dirname, '../resources/tessdata');
const FILES = [
  'eng.traineddata.gz',
  'rus.traineddata.gz',
];
const BASE = 'https://github.com/naptha/tessdata/raw/gh-pages/4.0.0/';

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const request = (current) => {
      https.get(current, { headers: { 'User-Agent': 'KorgenKassa-tessdata' } }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          request(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed ${res.statusCode} for ${url}`));
          return;
        }
        const out = fs.createWriteStream(dest);
        res.pipe(out);
        out.on('finish', () => out.close(resolve));
        out.on('error', reject);
      }).on('error', reject);
    };
    request(url);
  });
}

async function ensureTessdata() {
  fs.mkdirSync(DEST, { recursive: true });
  for (const file of FILES) {
    const dest = path.join(DEST, file);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) continue;
    await download(BASE + file, dest);
  }
  return DEST;
}

module.exports = { ensureTessdata, DEST };

if (require.main === module) {
  ensureTessdata()
    .then((dir) => {
      console.log('tessdata ready:', dir);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
