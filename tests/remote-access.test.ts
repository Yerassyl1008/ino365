/**
 * Owner remote-access (Cloudflare tunnel / remembered HTTPS URL).
 * Run: npm run test:remote-access
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const Module = require('module');
const originalLoad = Module._load;
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-remote-access-'));
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
const { getJWTSecret } = require('../main/routes/auth');
const { remoteAccessRoutes, normalizeRememberedPublicUrl } = require('../main/routes/remote-access');
const {
  parseQuickTunnelUrl,
  buildQuickTunnelCommand,
  cloudflaredDownloadUrl,
} = require('../main/services/remote-tunnel');

function seedUser(db: any, id: string, role: string) {
  const email = `${id}@test.local`;
  db.prepare(`
    INSERT INTO users (id, name, email, password, role, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
  `).run(id, id, email, 'hash', role, now(), now());
  const token = jwt.sign({ userId: id, email, role }, getJWTSecret(), { expiresIn: '1h' });
  return { Authorization: `Bearer ${token}` };
}

async function main() {
  console.log('Remote access (owner internet reports)');
  console.log('='.repeat(60));

  console.log('\n── URL helpers ────────────────────────────────────────────────');
  assertEqual(
    parseQuickTunnelUrl('Visit https://lucky-cat-names.trycloudflare.com'),
    'https://lucky-cat-names.trycloudflare.com',
    'parses a quick tunnel URL from cloudflared output',
  );
  assertEqual(
    parseQuickTunnelUrl('\x1b[32mhttps://ansi-color.trycloudflare.com\x1b[0m'),
    'https://ansi-color.trycloudflare.com',
    'strips ANSI before matching the tunnel URL',
  );
  assertEqual(parseQuickTunnelUrl('no url here'), null, 'returns null when no tunnel URL is present');
  assertEqual(
    parseQuickTunnelUrl('https://eviltrycloudflare.com'),
    null,
    'does not treat a lookalike host as a tunnel URL',
  );
  assertEqual(buildQuickTunnelCommand(3001), 'cloudflared tunnel --url http://127.0.0.1:3001', 'quick-tunnel command targets loopback POS');
  assert(cloudflaredDownloadUrl('win32', 'x64').includes('windows-amd64.exe'), 'Windows download URL is the official amd64 exe');

  const okUrl = normalizeRememberedPublicUrl('https://reports.cafe.kz/');
  assert(okUrl.ok && okUrl.url === 'https://reports.cafe.kz', 'https custom domain is accepted');
  const lanUrl = normalizeRememberedPublicUrl('https://192.168.1.10');
  assert(!lanUrl.ok, 'LAN https address is rejected as a public URL');
  const httpUrl = normalizeRememberedPublicUrl('http://reports.cafe.kz');
  assert(!httpUrl.ok, 'http public URL is rejected');
  const emptyUrl = normalizeRememberedPublicUrl('  ');
  assert(emptyUrl.ok && emptyUrl.url === '', 'blank remembered URL clears the setting');

  const db = initTestDb();
  const ownerAuth = seedUser(db, 'owner-remote', 'owner');
  const managerAuth = seedUser(db, 'manager-remote', 'manager');
  const app = createApp({ '/api/remote-access': remoteAccessRoutes });

  console.log('\n── Authorization ──────────────────────────────────────────────');
  let result = await request(app).get('/api/remote-access');
  assertEqual(result.status, 401, 'unauthenticated GET is 401');

  result = await request(app).get('/api/remote-access').set(managerAuth);
  assertEqual(result.status, 403, 'manager cannot read remote-access');

  result = await request(app).get('/api/remote-access').set(ownerAuth);
  assertEqual(result.status, 200, 'owner can read remote-access');
  assert(typeof result.body.local_url === 'string' && result.body.local_url.includes('127.0.0.1'), 'returns local POS URL');
  assert(typeof result.body.quick_command === 'string' && result.body.quick_command.includes('127.0.0.1'), 'command stays on loopback, not waiter/KDS ports');
  assert(result.body.kds_port === undefined && result.body.server_app_port === undefined, 'does not advertise waiter/KDS ports');
  assertEqual(result.body.reports_path, '/reports/day-close', 'points the owner at reports');

  result = await request(app).put('/api/remote-access/remembered-url').set(managerAuth).send({ url: 'https://reports.cafe.kz' });
  assertEqual(result.status, 403, 'manager cannot save a public URL');

  result = await request(app).put('/api/remote-access/remembered-url').set(ownerAuth).send({ url: 'http://insecure.example' });
  assertEqual(result.status, 400, 'http remembered URL is rejected');

  result = await request(app).put('/api/remote-access/remembered-url').set(ownerAuth).send({ url: 'https://reports.cafe.kz' });
  assertEqual(result.status, 200, 'owner can save an https public URL');
  assertEqual(result.body.remembered_url, 'https://reports.cafe.kz', 'saved URL is returned');

  closeDatabase();
  try { fs.rmSync(testDir, { recursive: true, force: true }); } catch { /* ignore */ }

  const { failed } = getResults();
  if (failed > 0) {
    console.error(`\n${failed} remote-access checks failed`);
    process.exit(1);
  }
  console.log('\n✅ Remote access checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
