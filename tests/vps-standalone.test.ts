/**
 * VPS / headless standalone: FLO_DATA_DIR, 0.0.0.0 bind, waiter+POS routes.
 * Run: npm run test:vps-standalone
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as http from 'node:http';

const Module = require('module');
const originalLoad = Module._load;
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-vps-standalone-'));
process.env.FLO_DATA_DIR = testDir;
process.env.FLO_AUTH_RATE_LIMIT_MAX = process.env.FLO_AUTH_RATE_LIMIT_MAX || '100';

Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') {
    return {
      app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' },
      safeStorage: {
        isEncryptionAvailable: () => false,
        encryptString: (value: string) => Buffer.from(value),
        decryptString: (value: Buffer) => value.toString(),
      },
      shell: { openExternal: () => Promise.resolve() },
    };
  }
  return originalLoad.apply(this, arguments as any);
};

async function run(): Promise<void> {
  const { getDbPath, getDataDir, initDatabase, closeDatabase } = await import('../main/db');
  const { startServer, stopServer, getServerPort } = await import('../main/server');
  const { startKdsServer, stopKdsServer, getKdsPort } = await import('../main/kds-server');
  const { startServerApp, stopServerApp, getServerAppPort } = await import('../main/server-app');
  const { isAllowedCorsOrigin } = await import('../main/middleware/security');
  const { buildCspHeader } = await import('../main/csp');

  const dataDir = getDataDir();
  assert.equal(path.resolve(dataDir), path.resolve(testDir), 'FLO_DATA_DIR is the data directory');
  assert.equal(getDbPath(), path.join(testDir, 'flo.db'), 'flo.db lives under FLO_DATA_DIR, not AppData');

  const listenHosts: string[] = [];
  const origListen = http.Server.prototype.listen;
  http.Server.prototype.listen = function (this: http.Server, ...args: any[]) {
    if (typeof args[1] === 'string') listenHosts.push(args[1]);
    return origListen.apply(this, args);
  };

  initDatabase();
  try {
    process.env.PORT = '0';
    process.env.KDS_PORT = '0';
    process.env.SERVER_APP_PORT = '0';
    await startServer();
    await startKdsServer();
    await startServerApp();

    assert.ok(listenHosts.includes('0.0.0.0'), `standalone servers bind 0.0.0.0 (got ${listenHosts.join(',')})`);
    assert.ok(listenHosts.filter((host) => host === '0.0.0.0').length >= 3, 'POS, KDS, and waiter each bind 0.0.0.0');

    const posPort = getServerPort();
    const kdsPort = getKdsPort();
    const waiterPort = getServerAppPort();

    const getJson = (port: number, pathname: string, method = 'GET', body?: object) => new Promise<{ status: number; body: any }>((resolve, reject) => {
      const payload = body ? JSON.stringify(body) : undefined;
      const req = http.request({
        host: '127.0.0.1',
        port,
        path: pathname,
        method,
        headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : undefined,
      }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let parsed: any = text;
          try { parsed = JSON.parse(text); } catch { /* html or empty */ }
          resolve({ status: res.statusCode ?? 0, body: parsed });
        });
      });
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });

    const posHealth = await getJson(posPort, '/api/health');
    assert.equal(posHealth.status, 200, 'POS /api/health');
    assert.equal(posHealth.body.status, 'ok', 'POS health ok');

    const kdsHealth = await getJson(kdsPort, '/api/health');
    assert.equal(kdsHealth.status, 200, 'KDS /api/health');

    const waiterHealth = await getJson(waiterPort, '/api/health');
    assert.equal(waiterHealth.status, 200, 'Waiter Server App /api/health');

    const pin = await getJson(waiterPort, '/api/auth/pin-login', 'POST', {});
    assert.equal(pin.status, 400, 'waiter PIN login route exists (rejects empty PIN)');

    const posPin = await getJson(posPort, '/api/auth/pin-login', 'POST', {});
    assert.equal(posPin.status, 400, 'POS PIN login route exists (rejects empty PIN)');

    process.env.FLO_PUBLIC_ORIGINS = 'https://kassa.example.kz,https://waiter.example.kz';
    assert.equal(isAllowedCorsOrigin('https://kassa.example.kz'), true, 'FLO_PUBLIC_ORIGINS allows kassa host');
    assert.equal(isAllowedCorsOrigin('https://waiter.example.kz'), true, 'FLO_PUBLIC_ORIGINS allows waiter host');
    assert.equal(isAllowedCorsOrigin('https://attacker.example'), false, 'unknown public origin still denied');
    assert.equal(isAllowedCorsOrigin('https://kassa.example.kz', 'kassa.example.kz'), true, 'same-host HTTPS origin allowed');

    const csp = buildCspHeader({ get: (name: string) => (name.toLowerCase() === 'host' ? 'kassa.example.kz' : undefined) } as any);
    assert.ok(csp.includes('https://kassa.example.kz'), 'CSP connect-src includes public HTTPS host');
    assert.ok(csp.includes('wss://kassa.example.kz'), 'CSP connect-src includes wss for KDS over HTTPS');

    const repoRoot = path.resolve(__dirname, '..');
    assert.ok(fs.existsSync(path.join(repoRoot, 'docs/vps-deploy.md')), 'docs/vps-deploy.md exists');
    assert.ok(fs.existsSync(path.join(repoRoot, 'scripts/vps-server.cjs')), 'scripts/vps-server.cjs exists');
    assert.ok(fs.existsSync(path.join(repoRoot, 'deploy/flocafe.service')), 'systemd unit exists');
    const vpsServer = fs.readFileSync(path.join(repoRoot, 'scripts/vps-server.cjs'), 'utf8');
    assert.ok(vpsServer.includes('FLO_DATA_DIR'), 'vps-server uses FLO_DATA_DIR');
    assert.ok(!vpsServer.includes('electron .'), 'vps-server does not launch Electron');

    console.log('✅ VPS standalone checks passed');
  } finally {
    http.Server.prototype.listen = origListen;
    await stopServerApp().catch(() => {});
    await stopServer().catch(() => {});
    await stopKdsServer().catch(() => {});
    closeDatabase();
    delete process.env.FLO_DATA_DIR;
    delete process.env.FLO_PUBLIC_ORIGINS;
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
