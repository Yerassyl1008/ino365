import fs from 'fs';

const src = fs.readFileSync('node_modules/@point-of-sale/receipt-printer-encoder/dist/receipt-printer-encoder.cjs', 'utf8');
const start = src.indexOf('const codepageMappings = {');
const end = src.indexOf('\n};', start);
const body = src.slice(src.indexOf('{', start), end + 2);

// eslint-disable-next-line no-eval
const mappings = eval('(' + body + ')');

for (const [lang, vendors] of Object.entries(mappings)) {
  for (const [vendor, table] of Object.entries(vendors)) {
    const hits = [];
    table.forEach((name, index) => {
      if (name && /866|1251|1048|437/.test(name)) hits.push(`${name}=${index}`);
    });
    if (hits.length) console.log(`${lang}/${vendor}`.padEnd(28), hits.join(' '));
  }
}
