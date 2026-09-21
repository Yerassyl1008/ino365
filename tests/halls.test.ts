/**
 * Halls (залы): CRUD, default hall for existing tables, table assignment.
 *
 * Usage: node tests/run-electron-node-test.cjs tests/halls.test.ts
 */

const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-halls-'));
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  return originalLoad.apply(this, arguments as any);
};

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-halls';

const jwt = require('jsonwebtoken');
const {
  initTestDb, createApp, startServer,
  seedOwnerUser, seedTable,
  api, assert, assertEqual, getResults, closeDatabase, getDatabase, now,
} = require('./helpers/test-setup');
const { getJWTSecret } = require('../main/routes/auth');
const { tableRoutes } = require('../main/routes/tables');
const { hallRoutes } = require('../main/routes/halls');
const { DEFAULT_HALL_ID, MIGRATIONS, getCurrentSchemaVersion } = require('../main/db');

async function main() {
  console.log('Halls API and table assignment');
  console.log('='.repeat(50));

  const db = initTestDb();
  const { authHeader } = seedOwnerUser(db);

  const cashierId = 'cashier-halls-1';
  db.prepare(
    `INSERT INTO users (id, name, email, password, role, is_active, created_at, updated_at)
     VALUES (?, 'Cashier', 'cashier-halls@test.local', 'pw', 'cashier', 1, ?, ?)`,
  ).run(cashierId, now(), now());
  const cashierAuth = {
    Authorization: `Bearer ${jwt.sign(
      { userId: cashierId, email: 'cashier-halls@test.local', role: 'cashier' },
      getJWTSecret(),
      { expiresIn: '1h' },
    )}`,
  };

  assertEqual(getCurrentSchemaVersion(), MIGRATIONS[MIGRATIONS.length - 1].version, 'schema includes halls migration');
  assertEqual(MIGRATIONS[MIGRATIONS.length - 1].name, 'table_number_unique_per_hall', 'latest migration is per-hall table numbers');

  db.prepare(`INSERT INTO tables (id, number, capacity, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run('tbl-legacy', 'L1', 4, 'available', now(), now());

  const app = createApp({
    '/api/tables': tableRoutes,
    '/api/halls': hallRoutes,
  });
  const { baseUrl, server } = await startServer(app);

  try {
    const listHalls = await api(baseUrl, '/api/halls', { headers: authHeader });
    assertEqual(listHalls.status, 200, 'GET /halls returns 200');
    assert(Array.isArray(listHalls.data.halls) && listHalls.data.halls.length >= 1, 'default hall exists');
    const defaultHall = listHalls.data.halls.find((h: any) => h.id === DEFAULT_HALL_ID) || listHalls.data.halls[0];
    assertEqual(defaultHall.name, 'Зал', 'default hall is named Зал when language is not English');

    const legacy = db.prepare('SELECT hall_id FROM tables WHERE id = ?').get('tbl-legacy') as { hall_id: string };
    assertEqual(legacy.hall_id, defaultHall.id, 'legacy table is assigned to the default hall');

    seedTable(db, 'tbl-hall-a', 1, 4);
    const seeded = db.prepare('SELECT hall_id FROM tables WHERE id = ?').get('tbl-hall-a') as { hall_id: string };
    assertEqual(seeded.hall_id, defaultHall.id, 'seeded table lands in the default hall');

    const createHall = await api(baseUrl, '/api/halls', {
      method: 'POST',
      headers: authHeader,
      body: { name: 'Летняя веранда' },
    });
    assertEqual(createHall.status, 201, 'owner can create a hall');
    const terraceId = createHall.data.hall.id;
    assertEqual(createHall.data.hall.name, 'Летняя веранда', 'created hall keeps its name');

    const cashierCreate = await api(baseUrl, '/api/halls', {
      method: 'POST',
      headers: cashierAuth,
      body: { name: 'VIP' },
    });
    assertEqual(cashierCreate.status, 403, 'cashier cannot create halls');

    const cashierList = await api(baseUrl, '/api/halls', { headers: cashierAuth });
    assertEqual(cashierList.status, 200, 'cashier can list halls for the POS picker');

    const duplicate = await api(baseUrl, '/api/halls', {
      method: 'POST',
      headers: authHeader,
      body: { name: 'летняя веранда' },
    });
    assertEqual(duplicate.status, 400, 'duplicate hall name is rejected');

    const assignRes = await api(baseUrl, '/api/tables', {
      method: 'POST',
      headers: authHeader,
      body: { number: 'V1', capacity: 2, hall_id: terraceId },
    });
    assertEqual(assignRes.status, 201, 'table can be created in a specific hall');
    assertEqual(assignRes.data.table.hall_id, terraceId, 'new table stores hall_id');
    assertEqual(assignRes.data.table.hall_name, 'Летняя веранда', 'table list includes hall_name');

    const defaulted = await api(baseUrl, '/api/tables', {
      method: 'POST',
      headers: authHeader,
      body: { number: 'H-AUTO', capacity: 4 },
    });
    assertEqual(defaulted.status, 201, 'table without hall_id still creates');
    assertEqual(defaulted.data.table.hall_id, defaultHall.id, 'omitted hall_id uses the default hall');

    const filtered = await api(baseUrl, `/api/tables?hall_id=${encodeURIComponent(terraceId)}`, { headers: authHeader });
    assertEqual(filtered.status, 200, 'GET /tables?hall_id filters');
    assert(filtered.data.tables.every((t: any) => t.hall_id === terraceId), 'filtered tables all belong to the hall');
    assert(filtered.data.tables.some((t: any) => t.number === 'V1'), 'assigned table appears in hall filter');
    assert(!filtered.data.tables.some((t: any) => t.number === 'H-AUTO'), 'default-hall table is excluded from other hall');

    const renamed = await api(baseUrl, `/api/halls/${terraceId}`, {
      method: 'PUT',
      headers: authHeader,
      body: { name: 'VIP' },
    });
    assertEqual(renamed.status, 200, 'owner can rename a hall');
    assertEqual(renamed.data.hall.name, 'VIP', 'renamed hall name is persisted');

    const blockedDelete = await api(baseUrl, `/api/halls/${terraceId}`, {
      method: 'DELETE',
      headers: authHeader,
    });
    assertEqual(blockedDelete.status, 409, 'deleting a hall with tables is blocked');
    assertEqual(blockedDelete.data.reason, 'hall_not_empty', '409 uses hall_not_empty reason');

    const moved = await api(baseUrl, `/api/halls/${terraceId}`, {
      method: 'DELETE',
      headers: authHeader,
      body: { reassign_to_hall_id: defaultHall.id },
    });
    assertEqual(moved.status, 200, 'hall deletes after tables are reassigned');
    const movedTable = db.prepare('SELECT hall_id FROM tables WHERE number = ?').get('V1') as { hall_id: string };
    assertEqual(movedTable.hall_id, defaultHall.id, 'reassigned table belongs to the target hall');

    const emptyHall = await api(baseUrl, '/api/halls', {
      method: 'POST',
      headers: authHeader,
      body: { name: 'Зал 2' },
    });
    assertEqual(emptyHall.status, 201, 'second empty hall can be created');
    const emptyDelete = await api(baseUrl, `/api/halls/${emptyHall.data.hall.id}`, {
      method: 'DELETE',
      headers: authHeader,
    });
    assertEqual(emptyDelete.status, 200, 'empty hall can be deleted without reassignment');

    const hallB = await api(baseUrl, '/api/halls', {
      method: 'POST',
      headers: authHeader,
      body: { name: 'Зал B' },
    });
    assertEqual(hallB.status, 201, 'second dining hall can be created');
    const hallBId = hallB.data.hall.id;

    const sameNumberOtherHall = await api(baseUrl, '/api/tables', {
      method: 'POST',
      headers: authHeader,
      body: { number: '1', capacity: 4, hall_id: hallBId },
    });
    assertEqual(sameNumberOtherHall.status, 201, 'table number 1 can exist in another hall');
    assertEqual(sameNumberOtherHall.data.table.number, '1', 'duplicate-across-halls keeps number 1');
    assertEqual(sameNumberOtherHall.data.table.hall_id, hallBId, 'table 1 is stored on hall B');

    const sameNumberSameHall = await api(baseUrl, '/api/tables', {
      method: 'POST',
      headers: authHeader,
      body: { number: '1', capacity: 2, hall_id: hallBId },
    });
    assertEqual(sameNumberSameHall.status, 400, 'duplicate number in the same hall is rejected');
    assertEqual(sameNumberSameHall.data.reason, 'table_number_exists_in_hall', 'duplicate in hall uses table_number_exists_in_hall');

    const tableSql = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='tables'`).get() as { sql: string };
    assert(/unique\s*\(\s*hall_id\s*,\s*number\s*\)/i.test(tableSql.sql), 'tables unique constraint is (hall_id, number)');

    const results = getResults();
    if (results.failed > 0) {
      throw new Error(`${results.failed} halls assertion(s) failed`);
    }
    console.log('\n✅ All halls tests passed');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

main()
  .then(() => {
    closeDatabase();
    Module._load = originalLoad;
    fs.rmSync(testDir, { recursive: true, force: true });
  })
  .catch((error) => {
    try { closeDatabase(); } catch { /* ignore */ }
    Module._load = originalLoad;
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
    console.error(error);
    process.exit(1);
  });
