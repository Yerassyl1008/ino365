/**
 * Waiter floor workflow: PIN login, personal shift, precheck, manager-gated
 * cancel-precheck, and table merge.
 * Run: npm run test:waiter-floor
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const Module = require('module');
const originalLoad = Module._load;
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-waiter-floor-'));
process.env.FLO_AUTH_RATE_LIMIT_MAX = process.env.FLO_AUTH_RATE_LIMIT_MAX || '100';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-waiter-floor';

Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return {
      app: {
        isPackaged: true,
        getPath: () => testDir,
        getVersion: () => 'test',
      },
    };
  }
  return originalLoad.apply(this, arguments as any);
};

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const {
  initTestDb,
  createApp,
  seedOwnerUser,
  seedManagerUser,
  seedCategory,
  seedProduct,
  seedTable,
  assert,
  assertEqual,
  getResults,
  closeDatabase,
  now,
} = require('./helpers/test-setup');
const { registerRoutes } = require('../main/routes/index');
const { getJWTSecret } = require('../main/routes/auth');

function seedServer(db: any, pin: string) {
  const id = 'server-floor-001';
  const email = 'server-floor@test.local';
  db.prepare(`
    INSERT INTO users (id, name, email, password, role, pin_hash, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(
    id,
    'Waiter',
    email,
    bcrypt.hashSync('Testpass1', 10),
    'server',
    bcrypt.hashSync(pin, 10),
    now(),
    now(),
  );
  const token = jwt.sign({ userId: id, email, role: 'server' }, getJWTSecret(), { expiresIn: '1h' });
  return { id, email, pin, auth: { Authorization: `Bearer ${token}` } };
}

async function main() {
  console.log('Waiter floor workflow');
  console.log('='.repeat(60));

  const db = initTestDb();
  const { authHeader: ownerAuth } = seedOwnerUser(db);
  seedManagerUser(db);
  const waiter = seedServer(db, '2468');
  seedCategory(db, 'cat-floor', 'Drinks');
  seedProduct(db, 'prod-floor', 'cat-floor', 'Tea', 100);
  seedTable(db, 'tbl-floor-a', 1);
  seedTable(db, 'tbl-floor-b', 2);
  seedTable(db, 'tbl-floor-c', 3);

  const app = createApp({});
  registerRoutes(app);

  console.log('\n── PIN login and shift ────────────────────────────────────────');
  let result = await request(app).post('/api/auth/pin-login').send({ pin: '0000' });
  assertEqual(result.status, 401, 'wrong PIN is rejected');

  result = await request(app).post('/api/auth/pin-login').send({ pin: '2468' });
  assertEqual(result.status, 200, 'waiter PIN login succeeds');
  assertEqual(result.body.user.role, 'server', 'PIN login returns the waiter');
  const waiterToken = result.body.access_token;
  assert(typeof waiterToken === 'string' && waiterToken.length > 0, 'PIN login returns a token');

  result = await request(app)
    .get('/api/shifts/current')
    .set('Authorization', `Bearer ${waiterToken}`);
  assertEqual(result.status, 200, 'current shift is readable after PIN login');
  assert(result.body.shift?.id, 'PIN login opens a personal shift');
  const openedShiftId = result.body.shift.id;

  result = await request(app)
    .get('/api/shifts/current')
    .set('Authorization', `Bearer ${waiterToken}`);
  assertEqual(result.body.shift.id, openedShiftId, 'a second PIN session reuses the open shift');

  console.log('\n── Precheck and cancel-precheck ────────────────────────────────');
  result = await request(app)
    .post('/api/orders')
    .set(waiter.auth)
    .send({ type: 'dine_in', table_id: 'tbl-floor-a', items: [{ product_id: 'prod-floor', quantity: 1, guest_seat: 1, course: 1 }] });
  assertEqual(result.status, 201, 'waiter can open a table order');
  const orderA = result.body.order;
  assertEqual(orderA.items[0].guest_seat, 1, 'guest seat is stored');
  assertEqual(orderA.items[0].course, 1, 'course is stored');

  const tableA = db.prepare('SELECT status FROM tables WHERE id = ?').get('tbl-floor-a') as any;
  assertEqual(tableA.status, 'occupied', 'open order marks the table occupied');

  result = await request(app)
    .post(`/api/orders/${orderA.id}/precheck`)
    .set(waiter.auth);
  assertEqual(result.status, 200, 'waiter can print a precheck');
  assert(result.body.bill?.precheck_printed_at, 'precheck stamps the bill');
  const precheckTable = db.prepare('SELECT status FROM tables WHERE id = ?').get('tbl-floor-a') as any;
  assertEqual(precheckTable.status, 'precheck', 'printed precheck marks the table awaiting payment');

  result = await request(app)
    .post(`/api/orders/${orderA.id}/cancel-precheck`)
    .set(waiter.auth)
    .send({});
  assertEqual(result.status, 400, 'cancel precheck without manager PIN is rejected');

  result = await request(app)
    .post(`/api/orders/${orderA.id}/cancel-precheck`)
    .set(waiter.auth)
    .send({ override_pin: '2468' });
  assertEqual(result.status, 403, 'waiter PIN cannot cancel a printed precheck');

  result = await request(app)
    .post(`/api/orders/${orderA.id}/cancel-precheck`)
    .set(waiter.auth)
    .send({ override_pin: '1234' });
  assertEqual(result.status, 200, 'manager PIN cancels a printed precheck');
  const restoredTable = db.prepare('SELECT status FROM tables WHERE id = ?').get('tbl-floor-a') as any;
  assertEqual(restoredTable.status, 'occupied', 'cancel precheck returns the table to occupied');

  console.log('\n── Merge tables ────────────────────────────────────────────────');
  result = await request(app)
    .post('/api/orders')
    .set(waiter.auth)
    .send({ type: 'dine_in', table_id: 'tbl-floor-b', items: [{ product_id: 'prod-floor', quantity: 1 }] });
  assertEqual(result.status, 201, 'second table order is created');
  const orderB = result.body.order;

  result = await request(app)
    .post('/api/tables/tbl-floor-a/merge-order')
    .set(waiter.auth)
    .send({ source_table_id: 'tbl-floor-b' });
  assertEqual(result.status, 200, 'waiter can merge two occupied tables');
  const mergedItems = db.prepare('SELECT COUNT(*) AS n FROM order_items WHERE order_id = ?').get(orderA.id) as any;
  assertEqual(mergedItems.n, 2, 'merged destination keeps both item lines');
  const sourceStatus = db.prepare('SELECT status FROM tables WHERE id = ?').get('tbl-floor-b') as any;
  assertEqual(sourceStatus.status, 'available', 'merged source table is freed');
  const destStatus = db.prepare('SELECT status FROM tables WHERE id = ?').get('tbl-floor-a') as any;
  assertEqual(destStatus.status, 'occupied', 'merged destination stays occupied');
  const sourceOrder = db.prepare('SELECT status FROM orders WHERE id = ?').get(orderB.id) as any;
  assertEqual(sourceOrder.status, 'cancelled', 'merged source order is cancelled');

  result = await request(app)
    .post('/api/tables/tbl-floor-a/move-order')
    .set(waiter.auth)
    .send({ target_table_id: 'tbl-floor-c' });
  assertEqual(result.status, 200, 'waiter can transfer a check to a free table');
  const movedSource = db.prepare('SELECT status FROM tables WHERE id = ?').get('tbl-floor-a') as any;
  const movedDest = db.prepare('SELECT status FROM tables WHERE id = ?').get('tbl-floor-c') as any;
  assertEqual(movedSource.status, 'available', 'transfer frees the source table');
  assertEqual(movedDest.status, 'occupied', 'transfer occupies the target table');

  void ownerAuth;
  const results = getResults();
  console.log(`\nResults: ${results.passed}/${results.total} passed`);
  if (results.failed > 0) {
    throw new Error(`${results.failed} waiter-floor assertion(s) failed`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    closeDatabase();
  });
