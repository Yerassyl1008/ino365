/** Server App auth must be limited to front-line + management staff (server, manager, owner). */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';

const Module = require('module');
const originalLoad = Module._load;
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-server-app-server-role-'));

Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  }
  return originalLoad.apply(this, arguments as any);
};

async function getFreeTcpPort(): Promise<number> {
  const probe = net.createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const address = probe.address();
  assert(address && typeof address !== 'string');
  const port = address.port;
  await new Promise<void>((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function postJson(baseUrl: string, pathName: string, body: unknown, token?: string) {
  const response = await fetch(`${baseUrl}${pathName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function getJson(baseUrl: string, pathName: string, token: string) {
  const response = await fetch(`${baseUrl}${pathName}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: response.status, body: await response.json() };
}

async function main() {
  console.log('Integration Test: Server App front-line + management auth');
  console.log('='.repeat(52));

  process.env.SERVER_APP_PORT = String(await getFreeTcpPort());

  const bcrypt = require('bcryptjs');
  const { initDatabase, getDatabase, closeDatabase, now } = await import('../main/db');
  const { startServerApp, stopServerApp, getServerAppPort } = await import('../main/server-app');

  initDatabase();
  const db = getDatabase();
  const passwordHash = bcrypt.hashSync('ServerPass123!', 10);
  const pins: Record<string, string> = {
    owner: '9753',
    manager: '1357',
    server: '2468',
    cashier: '8642',
  };

  for (const role of ['owner', 'manager', 'cashier', 'chef', 'server']) {
    const pin = pins[role];
    db.prepare(`
      INSERT INTO users (id, name, email, password, role, pin_hash, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      `server-app-${role}`,
      `Server App ${role}`,
      `${role}@server-app.test`,
      passwordHash,
      role,
      pin ? bcrypt.hashSync(pin, 10) : null,
      now(),
      now(),
    );
  }

  await startServerApp();
  const baseUrl = `http://127.0.0.1:${getServerAppPort()}`;

  try {
    for (const role of ['cashier', 'chef']) {
      const response = await postJson(baseUrl, '/api/auth/login', {
        email: `${role}@server-app.test`,
        password: 'ServerPass123!',
      });
      assert.equal(response.status, 403, `${role} cannot log in to Server App`);
      assert.match(String(response.body.error), /Only server, manager, or owner/i);
    }

    for (const role of ['server', 'manager', 'owner']) {
      const login = await postJson(baseUrl, '/api/auth/login', {
        email: `${role}@server-app.test`,
        password: 'ServerPass123!',
      });
      assert.equal(login.status, 200, `${role} can log in to Server App`);
      assert.equal(login.body.user.role, role, `Server App returns ${role} role`);
      assert.ok(login.body.access_token, `Server App returns a token for ${role}`);

      const me = await getJson(baseUrl, '/api/auth/me', login.body.access_token);
      assert.equal(me.status, 200, `${role} token remains valid on /api/auth/me`);
      assert.equal(me.body.user.role, role, `/api/auth/me returns ${role} role`);
    }

    for (const role of ['server', 'manager', 'owner']) {
      const pinLogin = await postJson(baseUrl, '/api/auth/pin-login', { pin: pins[role] });
      assert.equal(pinLogin.status, 200, `${role} can PIN-login to Server App`);
      assert.equal(pinLogin.body.user.role, role, `PIN login returns ${role} role`);
      assert.ok(pinLogin.body.access_token, `PIN login returns a token for ${role}`);
    }

    const cashierPin = await postJson(baseUrl, '/api/auth/pin-login', { pin: pins.cashier });
    assert.equal(cashierPin.status, 403, 'cashier PIN cannot log in to Server App');
    assert.match(String(cashierPin.body.error), /Only server, manager, or owner/i);

    const badPin = await postJson(baseUrl, '/api/auth/pin-login', { pin: '0000' });
    assert.equal(badPin.status, 401, 'unknown PIN is rejected');
  } finally {
    await stopServerApp();
    closeDatabase();
    fs.rmSync(testDir, { recursive: true, force: true });
  }

  console.log('ALL PASSED');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
