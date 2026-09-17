/**
 * Service charge percent, owner split, and owner-only report.
 *
 * Usage: node tests/run-electron-node-test.cjs tests/service-charge.test.ts
 */

const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-service-charge-'));
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  return originalLoad.apply(this, arguments as any);
};

process.env.JWT_SECRET = 'test-secret-service-charge';

const jwt = require('jsonwebtoken');
const {
  initTestDb, createApp, startServer,
  seedOwnerUser, seedManagerUser, seedCategory, seedProduct, seedTable,
  api, assert, assertEqual, getResults, closeDatabase, getDatabase, now,
} = require('./helpers/test-setup');
const { getJWTSecret } = require('../main/routes/auth');
const { orderRoutes } = require('../main/routes/orders');
const { billRoutes } = require('../main/routes/bills');
const { settingsRoutes } = require('../main/routes/settings');
const { reportRoutes } = require('../main/routes/reports');
const { computeServiceChargeAmount, splitServiceCharge } = require('../main/services/service-charge');

async function main() {
  console.log('Service charge percent and owner report');
  console.log('='.repeat(50));

  const db = initTestDb();
  const { authHeader } = seedOwnerUser(db);
  const manager = seedManagerUser(db);
  seedCategory(db, 'cat-svc', 'Service Charge Menu');
  seedProduct(db, 'prod-svc-1', 'cat-svc', 'Latte', 1000);
  seedTable(db, 'tbl-svc-1', 9, 4);

  const waiterId = 'waiter-svc-1';
  db.prepare(
    `INSERT INTO users (id, name, email, password, role, is_active, created_at, updated_at)
     VALUES (?, 'Waiter', 'waiter-svc@test.local', 'pw', 'server', 1, ?, ?)`,
  ).run(waiterId, now(), now());
  const waiterAuth = {
    Authorization: `Bearer ${jwt.sign(
      { userId: waiterId, email: 'waiter-svc@test.local', role: 'server' },
      getJWTSecret(),
      { expiresIn: '1h' },
    )}`,
  };

  const app = createApp({
    '/api/orders': orderRoutes,
    '/api/bills': billRoutes,
    '/api/settings': settingsRoutes,
    '/api/reports': reportRoutes,
  });
  const { baseUrl, server } = await startServer(app);

  try {
    const defaults = await api(baseUrl, '/api/settings/service-charge', { headers: authHeader });
    assertEqual(defaults.status, 200, 'owner can read service charge settings');
    assertEqual(defaults.data.percent, 0, 'default percent is 0');
    assertEqual(defaults.data.owner_percent, 50, 'default owner share is 50');
    assertEqual(defaults.data.dine_in_only, true, 'default is dine-in only');

    const waiterSettings = await api(baseUrl, '/api/settings/service-charge', { headers: waiterAuth });
    assertEqual(waiterSettings.status, 403, 'waiter cannot read service charge settings');

    const waiterReport = await api(baseUrl, '/api/reports/service-charge', { headers: waiterAuth });
    assertEqual(waiterReport.status, 403, 'waiter cannot open the owner service report');

    const helperAmount = computeServiceChargeAmount('dine_in', 1000, 0, {
      percent: 10, ownerPercent: 50, dineInOnly: true,
    });
    assertEqual(helperAmount, 100, '10% of 1000 is 100');
    const split = splitServiceCharge(100, 50);
    assertEqual(split.ownerShare, 50, 'half of 100 is 50 for the owner');
    assertEqual(split.staffShare, 50, 'remaining 50 is staff share');
    assertEqual(computeServiceChargeAmount('takeaway', 1000, 0, {
      percent: 10, ownerPercent: 50, dineInOnly: true,
    }), 0, 'takeaway stays 0 when dine-in only');

    const saved = await api(baseUrl, '/api/settings/service-charge', {
      method: 'PUT',
      headers: authHeader,
      body: { percent: 10, owner_percent: 50, dine_in_only: true },
    });
    assertEqual(saved.status, 200, 'owner can save service charge percent');
    assertEqual(saved.data.percent, 10, 'saved percent is 10');

    const managerOwnerShare = await api(baseUrl, '/api/settings/service-charge', {
      method: 'PUT',
      headers: manager.authHeader,
      body: { owner_percent: 80 },
    });
    assertEqual(managerOwnerShare.status, 403, 'manager cannot change owner share');

    const dineIn = await api(baseUrl, '/api/orders', {
      method: 'POST',
      headers: authHeader,
      body: {
        type: 'dine_in',
        table_id: 'tbl-svc-1',
        items: [{ product_id: 'prod-svc-1', quantity: 1 }],
      },
    });
    assertEqual(dineIn.status, 201, 'dine-in order created');
    assertEqual(dineIn.data.order.service_charge, 100, '10% service is stored on the dine-in order');
    assertEqual(dineIn.data.order.service_charge_owner_amount, 50, 'half of service is the owner share');
    assertEqual(dineIn.data.order.total, 1100, 'order total includes service charge');

    const takeaway = await api(baseUrl, '/api/orders', {
      method: 'POST',
      headers: authHeader,
      body: {
        type: 'takeaway',
        items: [{ product_id: 'prod-svc-1', quantity: 1 }],
      },
    });
    assertEqual(takeaway.status, 201, 'takeaway order created');
    assertEqual(takeaway.data.order.service_charge, 0, 'takeaway has no service when dine-in only');
    assertEqual(takeaway.data.order.total, 1000, 'takeaway total is unchanged');

    const bill = await api(baseUrl, '/api/bills/generate', {
      method: 'POST',
      headers: authHeader,
      body: { order_id: dineIn.data.order.id },
    });
    assertEqual(bill.status, 201, 'bill generated');
    assertEqual(bill.data.bill.service_charge, 100, 'guest bill shows the service line');

    const paid = await api(baseUrl, `/api/bills/${bill.data.bill.id}/payment`, {
      method: 'POST',
      headers: authHeader,
      body: { method: 'cash', amount: null },
    });
    assertEqual(paid.status, 200, 'dine-in bill paid');

    const report = await api(baseUrl, '/api/reports/service-charge?start_date=2020-01-01&end_date=2099-12-31', {
      headers: authHeader,
    });
    assertEqual(report.status, 200, 'owner can open the service report');
    assertEqual(report.data.collected, 100, 'report collected matches guest service');
    assertEqual(report.data.ownerShare, 50, 'report owner share is half');
    assertEqual(report.data.staffShare, 50, 'report staff share is the remainder');
    assert(report.data.orderCount >= 1, 'report includes the paid dine-in order');
  } finally {
    server.close();
    closeDatabase();
  }

  const { passed, failed } = getResults();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
