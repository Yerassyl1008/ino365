/**
 * GET /api/reports/day-close — Z-report for a UTC calendar day.
 *
 * Usage: node tests/run-electron-node-test.cjs tests/day-close-report.test.ts
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const Module = require('module');
const originalLoad = Module._load;
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-day-close-'));

Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  }
  return originalLoad.apply(this, arguments as any);
};

process.env.JWT_SECRET = 'test-secret-day-close';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { initDatabase, getDatabase, closeDatabase, now } = require('../main/db');
const { getJWTSecret } = require('../main/routes/auth');
const { reportRoutes } = require('../main/routes/reports');

let passed = 0;
let failed = 0;
let total = 0;

function assert(condition: boolean, message: string) {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

function assertEqual(actual: any, expected: any, message: string) {
  total++;
  if (actual === expected) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function isNativeAbiMismatch(error: any): boolean {
  return error?.code === 'ERR_DLOPEN_FAILED' && String(error?.message || '').includes('NODE_MODULE_VERSION');
}

async function main() {
  console.log('GET /api/reports/day-close');
  console.log('='.repeat(50));

  try {
    initDatabase();
  } catch (error: any) {
    if (isNativeAbiMismatch(error)) {
      console.log('  ⚠ Skipping: better-sqlite3 ABI mismatch (run via Electron)');
      process.exit(77);
    }
    throw error;
  }

  const db = getDatabase();
  db.prepare(`UPDATE settings SET value = 'Flo Test Cafe' WHERE key = 'business_name'`).run();
  const day = '2026-09-08';
  const ts = `${day} 12:00:00`;
  const otherDay = '2026-09-07 12:00:00';

  const ownerId = 'owner-day-close';
  const waiterA = 'waiter-a-day-close';
  const waiterB = 'waiter-b-day-close';
  const insertUser = db.prepare(`
    INSERT INTO users (id, name, email, password, role, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
  `);
  insertUser.run(ownerId, 'Owner', 'owner-day-close@test.local', bcrypt.hashSync('pw', 10), 'owner', now(), now());
  insertUser.run(waiterA, 'Waiter A', 'waiter-a@test.local', bcrypt.hashSync('pw', 10), 'server', now(), now());
  insertUser.run(waiterB, 'Waiter B', 'waiter-b@test.local', bcrypt.hashSync('pw', 10), 'server', now(), now());

  db.prepare(`INSERT INTO categories (id, name, sort_order) VALUES (?, ?, ?)`).run('cat-grill', 'Grill', 1);
  db.prepare(`INSERT INTO categories (id, name, sort_order) VALUES (?, ?, ?)`).run('cat-drinks-dc', 'Drinks', 2);
  db.prepare(`INSERT INTO products (id, category_id, name, price, is_active, sort_order) VALUES (?, ?, ?, ?, 1, 1)`)
    .run('prod-shashlik', 'cat-grill', 'Shashlik', 400);
  db.prepare(`INSERT INTO products (id, category_id, name, price, is_active, sort_order) VALUES (?, ?, ?, ?, 1, 2)`)
    .run('prod-tea-dc', 'cat-drinks-dc', 'Tea', 100);

  const insertOrder = db.prepare(`
    INSERT INTO orders (order_number, user_id, type, status, guest_count, subtotal, total, created_at, updated_at)
    VALUES (?, ?, 'dine_in', ?, ?, ?, ?, ?, ?)
  `);
  insertOrder.run('ORD-DC-A', waiterA, 'completed', 2, 800, 800, ts, ts);
  insertOrder.run('ORD-DC-B', waiterB, 'completed', 1, 200, 200, ts, ts);
  insertOrder.run('ORD-DC-CANCEL', waiterA, 'cancelled', 1, 999, 999, ts, ts);
  insertOrder.run('ORD-DC-YDAY', waiterA, 'completed', 1, 50, 50, otherDay, otherDay);

  db.prepare(`UPDATE orders SET cancelled_at = ? WHERE order_number = 'ORD-DC-CANCEL'`).run(ts);

  const idA = (db.prepare(`SELECT id FROM orders WHERE order_number = 'ORD-DC-A'`).get() as any).id;
  const idB = (db.prepare(`SELECT id FROM orders WHERE order_number = 'ORD-DC-B'`).get() as any).id;
  const idCancel = (db.prepare(`SELECT id FROM orders WHERE order_number = 'ORD-DC-CANCEL'`).get() as any).id;
  const idYday = (db.prepare(`SELECT id FROM orders WHERE order_number = 'ORD-DC-YDAY'`).get() as any).id;

  const insertItem = db.prepare(`
    INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity, subtotal, tax_amount, total, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
  `);
  insertItem.run(idA, 'prod-shashlik', 'Shashlik', 400, 2, 800, 800, 'served', ts, ts);
  insertItem.run(idB, 'prod-tea-dc', 'Tea', 100, 2, 200, 200, 'served', ts, ts);
  insertItem.run(idB, 'prod-tea-dc', 'Tea voided', 100, 1, 100, 100, 'voided', ts, ts);
  db.prepare(`UPDATE order_items SET voided_at = ? WHERE product_name = 'Tea voided'`).run(ts);
  insertItem.run(idCancel, 'prod-shashlik', 'Cancelled kebab', 999, 1, 999, 999, 'pending', ts, ts);

  const insertBill = db.prepare(`
    INSERT INTO bills (bill_number, order_id, total, paid_amount, balance, payment_status, payment_details, paid_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, 0, 'paid', ?, ?, ?, ?)
  `);
  insertBill.run('BILL-DC-A', idA, 800, 800, JSON.stringify([{ method: 'cash', amount: 800 }]), ts, ts, ts);
  insertBill.run('BILL-DC-B', idB, 200, 200, JSON.stringify([{ method: 'card', amount: 200 }]), ts, ts, ts);
  insertBill.run('BILL-DC-YDAY', idYday, 50, 50, JSON.stringify([{ method: 'cash', amount: 50 }]), otherDay, otherDay, otherDay);

  const app = express();
  app.use(express.json());
  app.use((req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required' });
    try {
      req.user = jwt.verify(authHeader.split(' ')[1], getJWTSecret());
      next();
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' });
    }
  });
  app.use('/api/reports', reportRoutes);

  const ownerToken = jwt.sign({ userId: ownerId, email: 'owner-day-close@test.local', role: 'owner' }, getJWTSecret(), { expiresIn: '1h' });
  const waiterToken = jwt.sign({ userId: waiterA, email: 'waiter-a@test.local', role: 'server' }, getJWTSecret(), { expiresIn: '1h' });

  try {
    console.log('\n1. Role gating and validation');
    {
      const forbidden = await request(app).get(`/api/reports/day-close?date=${day}`).set('Authorization', `Bearer ${waiterToken}`);
      assertEqual(forbidden.status, 403, `server is forbidden (got ${forbidden.status})`);
      const bad = await request(app).get('/api/reports/day-close?date=08-09-2026').set('Authorization', `Bearer ${ownerToken}`);
      assertEqual(bad.status, 400, `invalid date is 400 (got ${bad.status})`);
    }

    console.log('\n2. GET /api/reports/day-close');
    const res = await request(app).get(`/api/reports/day-close?date=${day}`).set('Authorization', `Bearer ${ownerToken}`);
    assertEqual(res.status, 200, `owner gets 200 (got ${res.status}, ${JSON.stringify(res.body)})`);
    const report = res.body.report;

    console.log('\n3. Header excludes cancelled sales and other days');
    assertEqual(report.header.billCount, 2, 'two paid bills');
    assertEqual(report.header.orderItemCount, 4, 'live item qty is 2+2 (voided excluded)');
    assertEqual(report.header.cancelledReceiptCount, 1, 'one cancelled order');
    assertEqual(report.header.cancelledItemCount, 2, 'cancelled order item (1) + voided live item (1)');
    assertEqual(report.header.cancelledAmount, 1099, 'cancelled order 999 + voided item 100');
    assertEqual(report.header.guestCount, 3, 'guest_count 2 + 1');
    assertEqual(report.businessName, 'Flo Test Cafe', 'business name comes from settings');

    console.log('\n4. Payments and staff percents');
    assertEqual(report.paymentTotal, 1000, 'cash 800 + card 200');
    const cash = (report.payments ?? []).find((p: any) => p.method === 'cash');
    const card = (report.payments ?? []).find((p: any) => p.method === 'card');
    assertEqual(cash?.amount, 800, 'cash amount');
    assertEqual(cash?.sharePercent, 80, 'cash is 80% of the day');
    assertEqual(card?.amount, 200, 'card amount');
    assertEqual(card?.sharePercent, 20, 'card is 20% of the day');

    assertEqual(report.staff?.[0]?.name, 'Waiter A', 'highest revenue staff first');
    assertEqual(report.staff?.[0]?.amount, 800, 'Waiter A billed 800');
    assertEqual(report.staff?.[0]?.sharePercent, 80, 'Waiter A is 80% of the day');
    assertEqual(report.staff?.[0]?.billCount, 1, 'Waiter A has 1 paid bill');
    assertEqual(report.staff?.[1]?.name, 'Waiter B', 'Waiter B is second');
    assertEqual(report.staff?.[1]?.sharePercent, 20, 'Waiter B is 20% of the day');
    assert(!((report.staff ?? []).some((s: any) => s.amount >= 999)), 'cancelled order is excluded from staff totals');

    console.log('\n5. Departments and walk-in client');
    const grill = (report.departments ?? []).find((d: any) => d.name === 'Grill');
    const drinks = (report.departments ?? []).find((d: any) => d.name === 'Drinks');
    assertEqual(grill?.quantity, 2, 'Grill sold 2');
    assertEqual(grill?.amount, 800, 'Grill revenue 800');
    assertEqual(drinks?.quantity, 2, 'voided drink is excluded from department qty');
    assertEqual(report.clients?.[0]?.name, null, 'walk-in has no customer name');
    assertEqual(report.clients?.[0]?.billCount, 2, 'both bills are walk-in');
    assertEqual(report.clients?.[0]?.sharePercent, 100, 'walk-in is 100% of the day');
    assertEqual(report.startDate, day, 'single-day startDate matches date');
    assertEqual(report.endDate, day, 'single-day endDate matches date');

    console.log('\n6. GET /api/reports/day-close date range');
    {
      const badRange = await request(app)
        .get('/api/reports/day-close?start_date=2026-09-08&end_date=2026-09-07')
        .set('Authorization', `Bearer ${ownerToken}`);
      assertEqual(badRange.status, 400, `inverted range is 400 (got ${badRange.status})`);
      const badFmt = await request(app)
        .get('/api/reports/day-close?start_date=08-09-2026&end_date=2026-09-08')
        .set('Authorization', `Bearer ${ownerToken}`);
      assertEqual(badFmt.status, 400, `invalid start_date is 400 (got ${badFmt.status})`);

      const range = await request(app)
        .get('/api/reports/day-close?start_date=2026-09-07&end_date=2026-09-08')
        .set('Authorization', `Bearer ${ownerToken}`);
      assertEqual(range.status, 200, `owner range gets 200 (got ${range.status})`);
      const period = range.body.report;
      assertEqual(period.header.billCount, 3, 'range includes yesterday plus two paid bills');
      assertEqual(period.paymentTotal, 1050, 'range cash 850 + card 200');
      assertEqual(period.startDate, '2026-09-07', 'range startDate');
      assertEqual(period.endDate, '2026-09-08', 'range endDate');
      const rangeCash = (period.payments ?? []).find((p: any) => p.method === 'cash');
      assertEqual(rangeCash?.amount, 850, 'range cash includes yesterday 50 + 800');
    }

    console.log('\n7. Department service allocation and Food vs Шашлык grouping');
    {
      const svcDay = '2026-09-09';
      const svcTs = `${svcDay} 15:00:00`;
      db.prepare(`INSERT INTO categories (id, name, sort_order) VALUES (?, ?, ?)`).run('cat-express-food', 'Food', 3);
      db.prepare(`INSERT INTO categories (id, name, sort_order) VALUES (?, ?, ?)`).run('cat-demo-grill', 'Шашлык', 4);
      db.prepare(`INSERT INTO products (id, category_id, name, price, is_active, sort_order) VALUES (?, ?, ?, ?, 1, 1)`)
        .run('prod-food-shashlik', 'cat-express-food', 'Шашлык из баранины', 1000);
      db.prepare(`INSERT INTO products (id, category_id, name, price, is_active, sort_order) VALUES (?, ?, ?, ?, 1, 2)`)
        .run('prod-grill-chicken', 'cat-demo-grill', 'Шашлык куриный', 1800);
      db.prepare(`INSERT INTO products (id, category_id, name, price, is_active, sort_order) VALUES (?, ?, ?, ?, 1, 3)`)
        .run('prod-food-meal', 'cat-express-food', 'Meal', 80);

      insertOrder.run('ORD-DC-SVC', waiterA, 'completed', 2, 1000, 1100, svcTs, svcTs);
      insertOrder.run('ORD-DC-SHASH', waiterA, 'completed', 4, 17600, 17600, svcTs, svcTs);
      insertOrder.run('ORD-DC-MEAL', waiterA, 'completed', 1, 80, 80, svcTs, svcTs);
      const idSvc = (db.prepare(`SELECT id FROM orders WHERE order_number = 'ORD-DC-SVC'`).get() as any).id;
      const idShash = (db.prepare(`SELECT id FROM orders WHERE order_number = 'ORD-DC-SHASH'`).get() as any).id;
      const idMeal = (db.prepare(`SELECT id FROM orders WHERE order_number = 'ORD-DC-MEAL'`).get() as any).id;
      db.prepare(`UPDATE orders SET service_charge = 100, service_charge_owner_amount = 0 WHERE id = ?`).run(idSvc);

      insertItem.run(idSvc, 'prod-shashlik', 'Shashlik', 400, 2, 800, 800, 'served', svcTs, svcTs);
      insertItem.run(idSvc, 'prod-tea-dc', 'Tea', 100, 2, 200, 200, 'served', svcTs, svcTs);
      insertItem.run(idShash, 'prod-food-shashlik', 'Шашлык из баранины', 1000, 14, 14000, 14000, 'served', svcTs, svcTs);
      insertItem.run(idShash, 'prod-grill-chicken', 'Шашлык куриный', 1800, 2, 3600, 3600, 'served', svcTs, svcTs);
      insertItem.run(idMeal, 'prod-food-meal', 'Meal', 80, 1, 80, 80, 'served', svcTs, svcTs);

      insertBill.run('BILL-DC-SVC', idSvc, 1100, 1100, JSON.stringify([{ method: 'cash', amount: 1100 }]), svcTs, svcTs, svcTs);
      insertBill.run('BILL-DC-SHASH', idShash, 17600, 17600, JSON.stringify([{ method: 'cash', amount: 17600 }]), svcTs, svcTs, svcTs);
      insertBill.run('BILL-DC-MEAL', idMeal, 80, 80, JSON.stringify([{ method: 'cash', amount: 80 }]), svcTs, svcTs, svcTs);

      const grouped = await request(app).get(`/api/reports/day-close?date=${svcDay}`).set('Authorization', `Bearer ${ownerToken}`);
      assertEqual(grouped.status, 200, `grouping day gets 200 (got ${grouped.status})`);
      const g = grouped.body.report;
      const grill = (g.departments ?? []).find((d: any) => d.name === 'Grill');
      const drinks = (g.departments ?? []).find((d: any) => d.name === 'Drinks');
      const shashlik = (g.departments ?? []).find((d: any) => d.name === 'Шашлык');
      const food = (g.departments ?? []).find((d: any) => d.name === 'Food');
      assertEqual(grill?.amount, 800, 'Grill item sales stay 800');
      assertEqual(grill?.serviceCharge, 80, 'Grill gets 80% of the 100 staff service');
      assertEqual(drinks?.amount, 200, 'Drinks item sales stay 200');
      assertEqual(drinks?.serviceCharge, 20, 'Drinks gets 20% of the 100 staff service');
      assertEqual(shashlik?.quantity, 16, '14 leftover-Food skewers join the 2 Шашлык items');
      assertEqual(shashlik?.amount, 17600, 'Шашлык amount is 14×1000 + 2×1800');
      assertEqual(food?.quantity, 1, 'generic Food keeps only Meal, not the named shashliks');
      assertEqual(food?.amount, 80, 'Meal stays in Food');
      assertEqual(g.departmentTotal.serviceCharge, 100, 'department Обсл sums to staff service');
      assertEqual(g.staffTotal.serviceCharge, 100, 'staff Обсл is the same 100');
      assertEqual(g.departmentTotal.amount, 18680, 'department Сумма is item sales without service');
      assertEqual(g.paymentTotal, 18780, 'payments include the 100 service on top of item sales');
      assert(g.paymentTotal !== g.departmentTotal.amount, 'Paloma Сумма columns are not forced equal');
    }

    console.log('\n8. Kitchen station beats leftover Food');
    {
      const stnDay = '2026-09-10';
      const stnTs = `${stnDay} 16:00:00`;
      db.prepare(`INSERT INTO kitchen_stations (id, name, category_ids, is_active, created_at, updated_at)
        VALUES (?, ?, ?, 1, ?, ?)`).run('stn-shashlik', 'Шашлык-цех', JSON.stringify(['cat-express-food']), stnTs, stnTs);
      db.prepare(`INSERT INTO products (id, category_id, name, price, is_active, sort_order) VALUES (?, ?, ?, ?, 1, 4)`)
        .run('prod-food-burger', 'cat-express-food', 'Burger', 300);
      insertOrder.run('ORD-DC-STN', waiterA, 'completed', 1, 300, 300, stnTs, stnTs);
      const idStn = (db.prepare(`SELECT id FROM orders WHERE order_number = 'ORD-DC-STN'`).get() as any).id;
      insertItem.run(idStn, 'prod-food-burger', 'Burger', 300, 1, 300, 300, 'served', stnTs, stnTs);
      insertBill.run('BILL-DC-STN', idStn, 300, 300, JSON.stringify([{ method: 'cash', amount: 300 }]), stnTs, stnTs, stnTs);

      const stationed = await request(app).get(`/api/reports/day-close?date=${stnDay}`).set('Authorization', `Bearer ${ownerToken}`);
      assertEqual(stationed.status, 200, `station day gets 200 (got ${stationed.status})`);
      const s = stationed.body.report;
      const stationDept = (s.departments ?? []).find((d: any) => d.name === 'Шашлык-цех');
      const foodDept = (s.departments ?? []).find((d: any) => d.name === 'Food');
      assertEqual(stationDept?.quantity, 1, 'Food-category burger prints under the kitchen station');
      assertEqual(stationDept?.amount, 300, 'station department amount is the burger');
      assertEqual(foodDept, undefined, 'generic Food is not used when a station owns that category');
    }
  } finally {
    closeDatabase();
  }

  console.log('\n' + '='.repeat(50));
  console.log(`${passed}/${total} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test crashed:', err);
  process.exit(1);
});
