/** Offline PDF menu parse + catalog import. */
const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-menu-pdf-'));

Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  }
  return originalLoad.apply(this, arguments as any);
};

const {
  initTestDb,
  createApp,
  startServer,
  seedOwnerUser,
  seedCategory,
  seedProduct,
  api,
  assert,
  assertEqual,
  getResults,
  closeDatabase,
  now,
} = require('./helpers/test-setup');
const { parseMenuText, decodeMenuFileBase64 } = require('../main/services/menu-pdf-parse');
const { sniffImageKind, extractEmbeddedJpegs } = require('../main/services/menu-ocr');
const { menuPdfRoutes } = require('../main/routes/menu-pdf');

function makeSimplePdf(lines: string[]): Buffer {
  const ops = ['BT', '/F1 12 Tf', '72 720 Td'];
  for (let i = 0; i < lines.length; i++) {
    const escaped = lines[i].replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    if (i > 0) ops.push('0 -16 Td');
    ops.push(`(${escaped}) Tj`);
  }
  ops.push('ET');
  const stream = ops.join('\n');
  const chunks = [
    '%PDF-1.4\n',
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ];
  const offsets = [0];
  let pos = 0;
  const parts: Buffer[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const buf = Buffer.from(chunks[i], 'latin1');
    if (i > 0) offsets.push(pos);
    parts.push(buf);
    pos += buf.length;
  }
  const body = Buffer.concat(parts);
  let xref = `xref\n0 6\n0 65535 f\n`;
  for (let i = 1; i <= 5; i++) xref += `${offsets[i]} 0 n\n`;
  xref += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${body.length}\n%%EOF\n`;
  return Buffer.concat([body, Buffer.from(xref, 'latin1')]);
}

async function main() {
  console.log('Integration Test: PDF menu import');
  console.log('='.repeat(58));

  console.log('\n─── parseMenuText heuristics ───');
  const dotted = parseMenuText([
    'COFFEE',
    'Cappuccino ................ 1 500 ₸',
    'Rich espresso with milk',
    'Latte 1800',
    'Americano 1200 / 1500',
  ].join('\n'));
  assertEqual(dotted.items.length, 3, 'parses three coffee items');
  assertEqual(dotted.items[0].name, 'Cappuccino', 'strips dotted leaders from the name');
  assertEqual(dotted.items[0].price, 1500, 'parses spaced KZT thousands');
  assertEqual(dotted.items[0].description, 'Rich espresso with milk', 'attaches the following description line');
  assertEqual(dotted.items[0].category, 'COFFEE', 'uses the uppercase header as category');
  assertEqual(dotted.items[1].price, 1800, 'parses a trailing integer price');
  assertEqual(dotted.items[2].price, 1200, 'uses the first price of a size pair');
  assert(dotted.items[2].description.includes('1200'), 'keeps the size pair in the description');

  const russian = parseMenuText([
    'НАПИТКИ',
    'Капучино  1500 тг',
    'Пицца 4 сыра 2500',
    'wifi: cafe-guest',
    'Борщ',
    '1200',
  ].join('\n'));
  assertEqual(russian.items.length, 3, 'parses Russian menu lines and a split name/price');
  assertEqual(russian.items[0].name, 'Капучино', 'keeps Cyrillic dish names');
  assertEqual(russian.items[0].price, 1500, 'parses тг currency');
  assertEqual(russian.items[1].name, 'Пицца 4 сыра', 'does not treat a size number in the name as the price');
  assertEqual(russian.items[2].name, 'Борщ', 'joins a price-only following line');
  assertEqual(russian.items[2].price, 1200, 'reads the price from the next line');
  assert(russian.skipped.some((row: { reason: string }) => row.reason === 'header_or_contact'), 'skips wifi/contact junk');

  const twoCol = parseMenuText('Latte 1500  Mocha 1600');
  assertEqual(twoCol.items.length, 2, 'splits two priced items on one line');
  assertEqual(twoCol.items[0].name, 'Latte', 'left column name');
  assertEqual(twoCol.items[1].name, 'Mocha', 'right column name');

  const empty = parseMenuText('MENU\nWelcome to our cafe');
  assertEqual(empty.items.length, 0, 'returns no items when nothing priced is found');
  assert(empty.warnings.includes('no_items'), 'warns when the menu text has no priced rows');

  const db = initTestDb();
  const { authHeader } = seedOwnerUser(db);
  seedCategory(db, 'cat-keep', 'Keep Category');
  seedProduct(db, 'prod-keep', 'cat-keep', 'Keep Latte', 900);

  const app = createApp({ '/api/menu-pdf': menuPdfRoutes });
  const { baseUrl, server } = await startServer(app);

  try {
    console.log('\n─── PDF parse endpoint ───');
    const pdf = makeSimplePdf([
      'DRINKS',
      'Cappuccino ........ 1500',
      'Espresso 1000',
    ]);
    const parsed = await api(baseUrl, '/api/menu-pdf/parse', {
      method: 'POST',
      body: { pdf_base64: pdf.toString('base64') },
      headers: authHeader,
    });
    assertEqual(parsed.status, 200, 'digital PDF parse succeeds');
    assertEqual(parsed.data.items.length, 2, 'extracts both priced rows from the PDF');
    assertEqual(parsed.data.items[0].name, 'Cappuccino', 'PDF text layer name is parsed');
    assertEqual(parsed.data.items[0].price, 1500, 'PDF text layer price is parsed');
    assertEqual(parsed.data.items[0].category, 'DRINKS', 'PDF category header is parsed');

    const notPdf = await api(baseUrl, '/api/menu-pdf/parse', {
      method: 'POST',
      body: { pdf_base64: Buffer.from('hello').toString('base64') },
      headers: authHeader,
    });
    assertEqual(notPdf.status, 400, 'non-PDF bytes are rejected');

    console.log('\n─── photo / scan sniff ───');
    const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
    assertEqual(sniffImageKind(jpeg), 'jpeg', 'detects JPEG magic bytes');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    assertEqual(sniffImageKind(png), 'png', 'detects PNG magic bytes');
    assertEqual(sniffImageKind(Buffer.from('hello')), null, 'rejects random bytes as an image');
    const jpegInPdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), jpeg, Buffer.from('\n%%EOF\n')]);
    assertEqual(extractEmbeddedJpegs(jpegInPdf).length, 0, 'ignores tiny embedded JPEGs');
    const photoB64 = decodeMenuFileBase64(`data:image/jpeg;base64,${jpeg.toString('base64')}`);
    assertEqual(sniffImageKind(photoB64), 'jpeg', 'strips a photo data URL');

    console.log('\n─── Import merge (default) ───');
    const merged = await api(baseUrl, '/api/menu-pdf/import', {
      method: 'POST',
      body: {
        replace: false,
        items: [
          { name: 'Keep Latte', price: 900, category: 'Keep Category', description: '' },
          { name: 'Cappuccino', price: 1500, category: 'Coffee', description: 'Espresso with milk' },
          { name: 'Борщ', price: 1200, category: 'Кухня', description: 'Свекла' },
        ],
      },
      headers: authHeader,
    });
    assertEqual(merged.status, 200, 'merge import succeeds');
    assertEqual(merged.data.created, 2, 'creates only new dishes');
    assertEqual(merged.data.skipped, 1, 'skips the existing Keep Latte');
    assertEqual(merged.data.categories_created, 2, 'auto-creates missing categories');
    const keepStill = db.prepare('SELECT price, deleted_at FROM products WHERE id = ?').get('prod-keep') as any;
    assertEqual(keepStill.deleted_at, null, 'merge does not delete the existing catalog');
    assertEqual(keepStill.price, 900, 'merge leaves the existing price unchanged');
    const cappuccino = db.prepare('SELECT price, description FROM products WHERE name = ? AND deleted_at IS NULL').get('Cappuccino') as any;
    assertEqual(cappuccino.price, 1500, 'imported KZT price is stored as a number');
    assertEqual(cappuccino.description, 'Espresso with milk', 'imported description is stored');
    const borschtCat = db.prepare(`
      SELECT c.name FROM products p JOIN categories c ON c.id = p.category_id
      WHERE p.name = ? AND p.deleted_at IS NULL
    `).get('Борщ') as any;
    assertEqual(borschtCat.name, 'Кухня', 'Cyrillic category is created and linked');

    console.log('\n─── Import replace ───');
    const replaced = await api(baseUrl, '/api/menu-pdf/import', {
      method: 'POST',
      body: {
        replace: true,
        items: [
          { name: 'New Tea', price: 800, category: 'Tea', description: '' },
        ],
      },
      headers: authHeader,
    });
    assertEqual(replaced.status, 200, 'replace import succeeds');
    assertEqual(replaced.data.created, 1, 'replace creates the new dish');
    const keepGone = db.prepare('SELECT deleted_at FROM products WHERE id = ?').get('prod-keep') as any;
    assert(keepGone.deleted_at, 'replace soft-deletes the previous product');
    const cappuccinoGone = db.prepare('SELECT deleted_at FROM products WHERE name = ?').get('Cappuccino') as any;
    assert(cappuccinoGone.deleted_at, 'replace soft-deletes previously imported products');
    const newTea = db.prepare('SELECT deleted_at FROM products WHERE name = ?').get('New Tea') as any;
    assertEqual(newTea.deleted_at, null, 'replace keeps the newly imported product');

    console.log('\n─── Authz ───');
    const { getJWTSecret } = require('../main/routes/auth');
    const cashierId = 'cashier-pdf-001';
    db.prepare(
      `INSERT OR IGNORE INTO users (id, name, email, password, role, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(cashierId, 'Cashier', 'cashier@test.local', bcrypt.hashSync('testpass123', 10), 'cashier', 1, now(), now());
    const cashierToken = jwt.sign(
      { userId: cashierId, email: 'cashier@test.local', role: 'cashier' },
      getJWTSecret(),
      { expiresIn: '1h' },
    );
    const forbidden = await api(baseUrl, '/api/menu-pdf/parse', {
      method: 'POST',
      body: { pdf_base64: pdf.toString('base64') },
      headers: { Authorization: `Bearer ${cashierToken}` },
    });
    assertEqual(forbidden.status, 403, 'cashier cannot parse a menu PDF');

    const emptyImport = await api(baseUrl, '/api/menu-pdf/import', {
      method: 'POST',
      body: { items: [] },
      headers: authHeader,
    });
    assertEqual(emptyImport.status, 400, 'empty import is rejected');
  } finally {
    server.close();
    closeDatabase();
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
  }

  const { passed, failed, total } = getResults();
  console.log('\n' + '='.repeat(58));
  console.log(`${passed}/${total} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
