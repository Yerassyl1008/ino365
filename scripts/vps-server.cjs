/**
 * Production standalone servers — Express + SQLite without Electron.
 * Source of truth on a 24/7 VPS so waiters/owner can use 4G while the cafe PC is off.
 *
 * Usage (after build):
 *   FLO_DATA_DIR=/var/lib/flocafe node scripts/vps-server.cjs
 *
 * See docs/vps-deploy.md
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const repoRoot = path.resolve(__dirname, '..');
const envPath = path.join(repoRoot, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)$/);
    if (!match) continue;
    if (process.env[match[1]] !== undefined) continue;
    let value = match[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      try { value = JSON.parse(value); } catch { value = value.slice(1, -1); }
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }
    process.env[match[1]] = value;
  }
}

process.env.NODE_ENV = process.env.NODE_ENV || 'production';

const dataDir = process.env.FLO_DATA_DIR
  ? path.resolve(process.env.FLO_DATA_DIR)
  : path.join(repoRoot, 'data');
process.env.FLO_DATA_DIR = dataDir;
fs.mkdirSync(dataDir, { recursive: true });

const mockApp = {
  isPackaged: true,
  getPath: (name) => {
    if (name === 'userData') return dataDir;
    if (name === 'documents') return os.homedir();
    return os.tmpdir();
  },
  getVersion: () => require('../package.json').version,
  getName: () => 'Flo (vps)',
};

require('module').Module._resolveFilename = (function (original) {
  return function (request, ...args) {
    if (request === 'electron') return __filename;
    return original.call(this, request, ...args);
  };
})(require('module').Module._resolveFilename);

const Module = require('module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'electron') {
    return {
      app: mockApp,
      BrowserWindow: class {},
      ipcMain: { handle: () => {}, on: () => {} },
      dialog: {},
      shell: {},
      Menu: { buildFromTemplate: () => ({}), setApplicationMenu: () => {} },
      Tray: class {},
      nativeImage: { createFromPath: () => ({ resize: () => ({}) }) },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { initDatabase, closeDatabase, beginDatabaseShutdown, waitForDatabaseRequests } = require('../dist/main/db');
const { createExitCodeAwareShutdown, waitForHttpShutdownWork, isShutdownTimeout } = require('../dist/main/shutdown');
const { startServer, stopServer, getServerPort } = require('../dist/main/server');
const { startKdsServer, stopKdsServer, getKdsPort } = require('../dist/main/kds-server');
const { startServerApp, stopServerApp, getServerAppPort } = require('../dist/main/server-app');
const { shutdown: shutdownWhatsApp, requestShutdown: requestWhatsAppShutdown } = require('../dist/main/services/whatsapp');
const { startStandaloneServers } = require('../dist/main/standalone-startup');

let exitRequested = false;
let shutdownRequested = false;
const requestShutdown = createExitCodeAwareShutdown(async () => {
  let cleanupFailed = false;
  let databaseBlocked = false;
  try { await stopServerApp(); } catch (err) { console.error('[VPS] Server App shutdown failed:', err); cleanupFailed = true; databaseBlocked = true; if (isShutdownTimeout(err)) throw err; }
  try { await stopServer(); } catch (err) { console.error('[VPS] Main server shutdown failed:', err); cleanupFailed = true; databaseBlocked = true; if (isShutdownTimeout(err)) throw err; }
  try { await stopKdsServer(); } catch (err) { console.error('[VPS] KDS server shutdown failed:', err); cleanupFailed = true; databaseBlocked = true; if (isShutdownTimeout(err)) throw err; }
  try { await shutdownWhatsApp(); } catch (err) { console.error('[VPS] WhatsApp shutdown failed:', err); cleanupFailed = true; databaseBlocked = true; if (isShutdownTimeout(err)) throw err; }
  try { await waitForHttpShutdownWork(); } catch (err) { console.error('[VPS] HTTP handler cleanup failed:', err); cleanupFailed = true; databaseBlocked = true; if (isShutdownTimeout(err)) throw err; }
  try { beginDatabaseShutdown(); await waitForDatabaseRequests(); } catch (err) { console.error('[VPS] Database request drain failed:', err); cleanupFailed = true; databaseBlocked = true; if (isShutdownTimeout(err)) throw err; }
  if (!databaseBlocked) {
    try { closeDatabase(); } catch (err) { console.error('[VPS] Database shutdown failed:', err); cleanupFailed = true; }
  }
  Module._load = originalLoad;
  return cleanupFailed ? 1 : 0;
}, {
  onShutdownRequested: requestWhatsAppShutdown,
  onFatalTimeout: () => process.exit(1),
});

async function shutdown(exitCode = 0) {
  shutdownRequested = true;
  const finalExitCode = await requestShutdown(exitCode);
  if (!exitRequested) {
    exitRequested = true;
    process.exit(finalExitCode);
  }
}

process.once('SIGINT', () => void shutdown(0));
process.once('SIGTERM', () => void shutdown(0));
process.on('uncaughtException', (err) => {
  console.error('[VPS] Uncaught exception:', err);
  void shutdown(1);
});
process.on('unhandledRejection', (err) => {
  console.error('[VPS] Unhandled rejection:', err);
  void shutdown(1);
});

(async () => {
  try {
    console.log(`[VPS] Data directory: ${dataDir}`);
    console.log('[VPS] Starting POS (3001), KDS (3002), and waiter Server App (3003) on 0.0.0.0…');
    await startStandaloneServers({
      initializeDatabase: initDatabase,
      startServer,
      startKdsServer,
      startServerApp,
      isShutdownRequested: () => shutdownRequested,
    });

    console.log(`[VPS] POS / reports:     http://0.0.0.0:${getServerPort()}  (put HTTPS domain in front)`);
    console.log(`[VPS] KDS:               http://0.0.0.0:${getKdsPort()}`);
    console.log(`[VPS] Waiter Server App: http://0.0.0.0:${getServerAppPort()}  → /server-standalone`);
    console.log(`[VPS] Health:            http://127.0.0.1:${getServerPort()}/api/health`);
    console.log('[VPS] Cafe PC is optional. Thermal printers in the hall still need a device on site.');
  } catch (err) {
    console.error('[VPS] Failed to start:', err);
    const code = err && (err.code === 'ERR_SHUTDOWN_ABORTED' || err.code === 'ABORT_ERR' || err.name === 'AbortError') ? 0 : 1;
    await shutdown(code);
  }
})();
