/**
 * Regression coverage for issue #145 staff-management authorization and PIN policy.
 * Run: npm run test:staff-authz
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const Module = require('module');
const originalLoad = Module._load;
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-staff-authz-'));
process.env.FLO_AUTH_RATE_LIMIT_MAX = process.env.FLO_AUTH_RATE_LIMIT_MAX || '100';

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
  assert,
  assertEqual,
  getResults,
  closeDatabase,
  now,
} = require('./helpers/test-setup');
const { staffRoutes } = require('../main/routes/staff');
const { authRoutes, getJWTSecret } = require('../main/routes/auth');

function seedUser(db: any, id: string, role: string, pin = '1234') {
  const email = `${id}@test.local`;
  db.prepare(`
    INSERT INTO users (id, name, email, password, role, pin_hash, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(
    id,
    id,
    email,
    bcrypt.hashSync('Testpass1', 10),
    role,
    pin ? bcrypt.hashSync(pin, 10) : null,
    now(),
    now(),
  );

  const token = jwt.sign({ userId: id, email, role }, getJWTSecret(), { expiresIn: '1h' });
  return { Authorization: `Bearer ${token}` };
}

async function main() {
  console.log('Staff Authorization Regression Tests (#145)');
  console.log('='.repeat(60));

  const db = initTestDb();
  const ownerAuth = seedUser(db, 'owner-145', 'owner');
  const managerAuth = seedUser(db, 'manager-145', 'manager');
  seedUser(db, 'manager-target-145', 'manager');
  seedUser(db, 'cashier-target-145', 'cashier', '');
  seedUser(db, 'server-target-145', 'server', '');
  seedUser(db, 'chef-target-145', 'chef', '');

  const app = createApp({ '/api/staff': staffRoutes, '/api/auth': authRoutes });

  console.log('\n── Manager boundaries ─────────────────────────────────────────');
  let result = await request(app).put('/api/staff/owner-145').set(managerAuth).send({
    name: 'Compromised owner', password: 'ChangedPass1',
  });
  assertEqual(result.status, 403, 'manager cannot edit owner details or password');

  result = await request(app).put('/api/staff/manager-target-145').set(managerAuth).send({
    name: 'Compromised manager', password: 'ChangedPass1',
  });
  assertEqual(result.status, 403, 'manager cannot edit another manager details or password');

  for (const target of ['owner-145', 'manager-target-145']) {
    result = await request(app).post(`/api/staff/${target}/deactivate`).set(managerAuth);
    assertEqual(result.status, 403, `manager cannot deactivate ${target}`);

    db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(target);
    result = await request(app).post(`/api/staff/${target}/reactivate`).set(managerAuth);
    assertEqual(result.status, 403, `manager cannot reactivate ${target}`);
    db.prepare('UPDATE users SET is_active = 1 WHERE id = ?').run(target);
  }

  result = await request(app).put('/api/staff/cashier-target-145').set(managerAuth).send({ is_active: false });
  assertEqual(result.status, 400, 'PUT cannot change is_active');

  for (const role of ['owner', 'manager']) {
    result = await request(app).post('/api/staff').set(managerAuth).send({
      name: `Forbidden ${role}`, email: `forbidden-${role}@test.local`, password: 'StrongPass1', role,
    });
    assertEqual(result.status, 403, `manager cannot create ${role}`);
  }

  console.log('\n── Manager operational-staff access ───────────────────────────');
  const managerCreated: Record<string, string> = {};
  for (const role of ['cashier', 'server', 'chef']) {
    result = await request(app).post('/api/staff').set(managerAuth).send({
      name: `Managed ${role}`, email: `managed-${role}@test.local`, password: 'StrongPass1', role,
    });
    assertEqual(result.status, 201, `manager can create ${role}`);
    managerCreated[role] = result.body.staff?.id;
    assert(!('pin_hash' in result.body.staff), `create ${role} response does not expose pin_hash`);
  }

  for (const role of ['cashier', 'server', 'chef']) {
    result = await request(app).put(`/api/staff/${managerCreated[role]}`).set(managerAuth).send({
      name: `Updated ${role}`, role,
    });
    assertEqual(result.status, 200, `manager can edit ${role}`);
  }

  result = await request(app).post('/api/staff').set(managerAuth).send({
    name: 'PIN only server', role: 'server', pin: '8642',
  });
  assertEqual(result.status, 201, 'staff can be created with PIN only');
  assertEqual(result.body.staff.email, null, 'PIN-only create stores a null email');
  assertEqual(result.body.staff.has_pin, 1, 'PIN-only create sets has_pin');

  result = await request(app).post('/api/staff').set(managerAuth).send({
    name: 'Missing email server', password: 'StrongPass1', role: 'server',
  });
  assertEqual(result.status, 201, 'staff creation allows omitting email when a password is set');
  assertEqual(result.body.staff.email, null, 'omitted email is stored as null');

  result = await request(app).post('/api/staff').set(managerAuth).send({
    name: 'Invalid email server', email: 'not-an-email', password: 'StrongPass1', role: 'server',
  });
  assertEqual(result.status, 400, 'staff creation rejects invalid email');
  assertEqual(result.body.error, 'Enter a valid email address', 'invalid email returns a clear validation error');

  result = await request(app).post('/api/staff').set(managerAuth).send({
    name: 'Normalized email server', email: '  Mixed.Server@Test.Local  ', password: 'StrongPass1', role: 'server',
  });
  assertEqual(result.status, 201, 'staff creation trims and normalizes required email');
  assertEqual(result.body.staff.email, 'mixed.server@test.local', 'created staff email is stored normalized');

  result = await request(app).put(`/api/staff/${managerCreated.server}`).set(managerAuth).send({ email: '   ' });
  assertEqual(result.status, 200, 'staff update can clear email');
  assertEqual(result.body.staff.email, null, 'blank email update stores null');

  result = await request(app).post('/api/staff').set(managerAuth).send({
    name: 'Pinned cashier', email: 'pinned-cashier@test.local', password: 'StrongPass1', role: 'cashier', pin: '2468',
  });
  assertEqual(result.status, 201, 'cashier can be created with a floor PIN');
  assertEqual(result.body.staff.has_pin, 1, 'cashier staff response exposes has_pin');

  result = await request(app).post('/api/staff').set(managerAuth).send({
    name: 'Duplicate PIN cashier', email: 'dup-pin-cashier@test.local', password: 'StrongPass1', role: 'cashier', pin: '2468',
  });
  assertEqual(result.status, 400, 'duplicate floor PIN is rejected');

  result = await request(app).post('/api/staff').set(ownerAuth).send({
    name: 'Pinned chef', email: 'pinned-chef@test.local', password: 'StrongPass1', role: 'chef', pin: '1357',
  });
  assertEqual(result.status, 201, 'chef role can be created with a PIN');
  assertEqual(result.body.staff.has_pin, 1, 'chef staff response exposes has_pin');

  console.log('\n── PIN policy ─────────────────────────────────────────────────');
  for (const pin of ['abcd', '123', '1234567']) {
    result = await request(app).post('/api/staff').set(ownerAuth).send({
      name: `Bad PIN ${pin}`, email: `bad-pin-${pin}@test.local`, password: 'StrongPass1', role: 'manager', pin,
    });
    assertEqual(result.status, 400, `PIN ${pin} is rejected unless it is 4-6 numeric digits`);
  }

  result = await request(app).put('/api/staff/manager-target-145').set(ownerAuth).send({ role: 'server' });
  assertEqual(result.status, 200, 'owner can demote a manager to server');
  assertEqual(result.body.staff.has_pin, 1, 'demoting a manager to server keeps has_pin');
  const demoted = db.prepare('SELECT pin_hash FROM users WHERE id = ?').get('manager-target-145') as any;
  assert(!!demoted.pin_hash, 'demoting a manager to server keeps pin_hash');

  result = await request(app).post('/api/staff').set(ownerAuth).send({
    name: 'Chef-bound manager', email: 'chef-bound@test.local', password: 'StrongPass1', role: 'manager', pin: '9753',
  });
  assertEqual(result.status, 201, 'owner can create a manager used for chef demotion');
  result = await request(app).put(`/api/staff/${result.body.staff.id}`).set(ownerAuth).send({ role: 'chef' });
  assertEqual(result.status, 200, 'owner can demote a manager to chef');
  assertEqual(result.body.staff.has_pin, 1, 'demoting to chef keeps has_pin');

  const originalPinHash = (db.prepare('SELECT pin_hash FROM users WHERE id = ?').get('manager-145') as any).pin_hash;
  result = await request(app).put('/api/staff/manager-145').set(ownerAuth).send({ name: 'Manager PIN preserved' });
  assertEqual(result.status, 200, 'owner can update a manager without supplying a PIN');
  assertEqual(result.body.staff.has_pin, 1, 'omitting PIN preserves has_pin');
  const preserved = db.prepare('SELECT pin_hash FROM users WHERE id = ?').get('manager-145') as any;
  assertEqual(preserved.pin_hash, originalPinHash, 'omitting PIN preserves the PIN hash');

  result = await request(app).put('/api/staff/server-target-145').set(ownerAuth).send({ pin: '4321' });
  assertEqual(result.status, 200, 'owner can set a waiter PIN without other staff fields');
  assertEqual(result.body.staff.has_pin, 1, 'setting a waiter PIN exposes has_pin');
  assert(!('pin_hash' in result.body.staff), 'waiter PIN update does not expose pin_hash');

  result = await request(app).post('/api/staff/owner-145/deactivate').set(ownerAuth);
  assertEqual(result.status, 400, 'cannot deactivate the last active owner');

  result = await request(app).put('/api/staff/owner-145').set(ownerAuth).send({ role: 'cashier' });
  assertEqual(result.status, 400, 'cannot demote the last active owner');
  const lastOwner = db.prepare('SELECT role FROM users WHERE id = ?').get('owner-145') as any;
  assertEqual(lastOwner.role, 'owner', 'last active owner keeps the owner role after a rejected demotion');

  seedUser(db, 'owner-145-second', 'owner');
  result = await request(app).put('/api/staff/owner-145').set(ownerAuth).send({ role: 'cashier' });
  assertEqual(result.status, 200, 'owner can demote after another active owner exists');

  console.log('\n── Owner full access ───────────────────────────────────────────');
  result = await request(app).post('/api/staff').set(ownerAuth).send({
    name: 'Owner-created manager', email: 'owner-created-manager@test.local', password: 'StrongPass1', role: 'manager', pin: '9876',
  });
  assertEqual(result.status, 201, 'owner can create a manager with a valid PIN');
  assertEqual(result.body.staff.has_pin, 1, 'staff responses expose has_pin for configured PINs');

  result = await request(app).post('/api/staff/cashier-target-145/deactivate').set(ownerAuth);
  assertEqual(result.status, 200, 'owner can deactivate operational staff');
  result = await request(app).post('/api/staff/cashier-target-145/reactivate').set(ownerAuth);
  assertEqual(result.status, 200, 'owner can reactivate operational staff');

  console.log('\n── POS PIN access ──────────────────────────────────────────────');
  const {
    canAccessPos,
    capabilityAllows,
    PERMISSION_CAPABILITIES,
    PIN_LOGIN_ROLES,
  } = require('../shared/role-permissions');
  const posCapability = PERMISSION_CAPABILITIES.find((capability: { id: string }) => capability.id === 'pos');
  const kotCapability = PERMISSION_CAPABILITIES.find((capability: { id: string }) => capability.id === 'kotPrinting');
  const payCapability = PERMISSION_CAPABILITIES.find((capability: { id: string }) => capability.id === 'billsPayments');
  assert(posCapability, 'POS capability is defined');
  assert(kotCapability, 'KOT printing capability is defined');
  assert(payCapability, 'bills/payments capability is defined');

  for (const role of ['owner', 'manager', 'cashier', 'server']) {
    assert(canAccessPos(role), `${role} can access the cashier POS`);
    assert(capabilityAllows(posCapability, role), `POS matrix allows ${role}`);
    assert(capabilityAllows(kotCapability, role), `${role} can print kitchen tickets from POS`);
  }
  assert(!canAccessPos('chef'), 'chef cannot operate the cashier POS');
  assert(!capabilityAllows(posCapability, 'chef'), 'POS matrix denies chef');
  assert(!capabilityAllows(payCapability, 'server'), 'waiter cannot take POS payments');
  assert(capabilityAllows(payCapability, 'cashier'), 'cashier can take POS payments');
  assertEqual(PIN_LOGIN_ROLES.join(','), 'owner,manager,cashier,server,chef', 'every staff role may PIN-login');

  const uniquePins: Array<[string, string, string]> = [
    ['pin-pos-owner', 'owner', '5555'],
    ['pin-pos-manager', 'manager', '4444'],
    ['pin-pos-cashier', 'cashier', '2222'],
    ['pin-pos-server', 'server', '1111'],
    ['pin-pos-chef', 'chef', '3333'],
  ];
  for (const [id, role, pin] of uniquePins) {
    seedUser(db, id, role, pin);
    result = await request(app).post('/api/auth/pin-login').send({ pin });
    assertEqual(result.status, 200, `${role} PIN logs into the cashier KorgenKassa session`);
    assertEqual(result.body.user.role, role, `${role} PIN login returns the matching role`);
    assert(typeof result.body.access_token === 'string' && result.body.access_token.length > 0, `${role} PIN login returns a token`);
  }

  const results = getResults();
  console.log(`\nResults: ${results.passed}/${results.total} passed`);
  if (results.failed > 0) {
    throw new Error(`${results.failed} staff authorization assertion(s) failed`);
  }
}

main()
  .then(() => {
    closeDatabase();
    Module._load = originalLoad;
    fs.rmSync(testDir, { recursive: true, force: true });
    console.log('\nStaff authorization tests passed');
  })
  .catch((error) => {
    try { closeDatabase(); } catch { }
    Module._load = originalLoad;
    fs.rmSync(testDir, { recursive: true, force: true });
    console.error(error);
    process.exit(1);
  });
