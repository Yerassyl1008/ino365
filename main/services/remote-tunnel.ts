/**
 * Optional Cloudflare quick tunnel so the owner can open this POS from the
 * internet while the cafe monoblock stays the source of truth (SQLite, printers).
 *
 * Does not vendor cloudflared — if the binary is on PATH (or a well-known
 * install location), Settings can start/stop `cloudflared tunnel --url`.
 */
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const QUICK_TUNNEL_URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/i;
const ANSI_RE = /\x1b\[[0-9;]*m/g;
const START_TIMEOUT_MS = 25_000;
const STOP_TIMEOUT_MS = 5_000;

export const CLOUDFLARED_DOCS_URL =
  'https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/';

export function cloudflaredDownloadUrl(platform = process.platform, arch = process.arch): string {
  if (platform === 'win32') {
    const slug = arch === 'arm64' ? 'windows-arm64' : 'windows-amd64';
    return `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-${slug}.exe`;
  }
  if (platform === 'darwin') {
    const slug = arch === 'arm64' ? 'darwin-arm64' : 'darwin-amd64';
    return `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-${slug}`;
  }
  const slug = arch === 'arm64' ? 'linux-arm64' : 'linux-amd64';
  return `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-${slug}`;
}

export function parseQuickTunnelUrl(output: string): string | null {
  const match = output.replace(ANSI_RE, '').match(QUICK_TUNNEL_URL_RE);
  return match ? match[0].toLowerCase() : null;
}

export function buildQuickTunnelCommand(port: number): string {
  return `cloudflared tunnel --url http://127.0.0.1:${port}`;
}

export function cloudflaredCandidatePaths(
  platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  homedir = os.homedir(),
): string[] {
  const exe = platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
  const home = homedir;
  const paths = [
    path.join(home, 'Downloads', exe),
    path.join(home, 'cloudflared', exe),
  ];
  if (platform === 'win32') {
    paths.push(
      path.join(env['ProgramFiles'] || 'C:\\Program Files', 'cloudflared', exe),
      path.join(env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'cloudflared', exe),
    );
  } else {
    paths.push(`/usr/local/bin/${exe}`, `/opt/homebrew/bin/${exe}`, `/usr/bin/${exe}`);
  }
  return paths;
}

function lookOnPath(): Promise<string | null> {
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  const bin = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
  return new Promise((resolve) => {
    execFile(cmd, [bin], { timeout: 4000, windowsHide: true }, (error, stdout) => {
      if (error) {
        // Windows `where` also finds `cloudflared` without .exe
        if (process.platform === 'win32' && bin === 'cloudflared.exe') {
          execFile(cmd, ['cloudflared'], { timeout: 4000, windowsHide: true }, (err2, out2) => {
            if (err2 || !out2) return resolve(null);
            const first = String(out2).split(/\r?\n/).map((line) => line.trim()).find(Boolean);
            resolve(first && fs.existsSync(first) ? first : null);
          });
          return;
        }
        resolve(null);
        return;
      }
      const first = String(stdout).split(/\r?\n/).map((line) => line.trim()).find(Boolean);
      resolve(first && fs.existsSync(first) ? first : null);
    });
  });
}

export async function findCloudflaredBinary(): Promise<string | null> {
  const fromPath = await lookOnPath();
  if (fromPath) return fromPath;
  for (const candidate of cloudflaredCandidatePaths()) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function readCloudflaredVersion(binary: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(binary, ['--version'], { timeout: 5000, windowsHide: true }, (error, stdout, stderr) => {
      if (error) return resolve(null);
      const text = `${stdout || ''} ${stderr || ''}`.replace(ANSI_RE, '').trim();
      const match = text.match(/cloudflared\s+version\s+(\S+)/i) || text.match(/(\d+\.\d+\.\d+\S*)/);
      resolve(match ? match[1] : (text.split(/\s+/)[0] || null));
    });
  });
}

type TunnelState = {
  process: ChildProcess | null;
  publicUrl: string | null;
  binary: string | null;
  startedAt: string | null;
};

const state: TunnelState = {
  process: null,
  publicUrl: null,
  binary: null,
  startedAt: null,
};

let startInFlight: Promise<TunnelStatus> | null = null;

export type TunnelStatus = {
  running: boolean;
  public_url: string | null;
  pid: number | null;
  binary: string | null;
  started_at: string | null;
};

export function getOwnerTunnelStatus(): TunnelStatus {
  const child = state.process;
  const running = Boolean(child && child.exitCode === null && !child.killed);
  return {
    running,
    public_url: running ? state.publicUrl : null,
    pid: running && typeof child?.pid === 'number' ? child.pid : null,
    binary: state.binary,
    started_at: running ? state.startedAt : null,
  };
}

function attachTunnelListeners(child: ChildProcess, onUrl: (url: string) => void, onExit: () => void): void {
  const consume = (chunk: Buffer | string) => {
    const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    const url = parseQuickTunnelUrl(text);
    if (url && !state.publicUrl) {
      state.publicUrl = url;
      onUrl(url);
    }
  };
  child.stdout?.on('data', consume);
  child.stderr?.on('data', consume);
  child.once('exit', () => {
    state.process = null;
    state.publicUrl = null;
    state.startedAt = null;
    onExit();
  });
}

export async function startOwnerTunnel(port: number): Promise<TunnelStatus> {
  const current = getOwnerTunnelStatus();
  if (current.running) return current;
  if (startInFlight) return startInFlight;

  startInFlight = (async () => {
    const binary = await findCloudflaredBinary();
    if (!binary) {
      const error = new Error('cloudflared_not_found') as Error & { code: string };
      error.code = 'cloudflared_not_found';
      throw error;
    }

    const child = spawn(binary, ['tunnel', '--url', `http://127.0.0.1:${port}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env, NO_COLOR: '1' },
    });

    state.process = child;
    state.binary = binary;
    state.publicUrl = null;
    state.startedAt = new Date().toISOString();

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        void stopOwnerTunnel();
        reject(new Error('cloudflared_timeout'));
      }, START_TIMEOUT_MS);

      const succeed = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };

      attachTunnelListeners(child, succeed, () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error('cloudflared_exited'));
      });

      child.once('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        state.process = null;
        reject(err);
      });
    });

    return getOwnerTunnelStatus();
  })().finally(() => {
    startInFlight = null;
  });

  return startInFlight;
}

export async function stopOwnerTunnel(): Promise<void> {
  const child = state.process;
  state.process = null;
  state.publicUrl = null;
  state.startedAt = null;
  if (!child || child.exitCode !== null) return;

  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
      resolve();
    }, STOP_TIMEOUT_MS);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    try {
      child.kill('SIGTERM');
    } catch {
      clearTimeout(timer);
      resolve();
    }
  });
}

export async function describeCloudflared(): Promise<{
  installed: boolean;
  path: string | null;
  version: string | null;
  download_url: string;
  docs_url: string;
}> {
  const binary = await findCloudflaredBinary();
  const version = binary ? await readCloudflaredVersion(binary) : null;
  return {
    installed: Boolean(binary),
    path: binary,
    version,
    download_url: cloudflaredDownloadUrl(),
    docs_url: CLOUDFLARED_DOCS_URL,
  };
}

/** Test helper — drop a live child without waiting for Cloudflare. */
export function _resetOwnerTunnelForTests(): void {
  const child = state.process;
  state.process = null;
  state.publicUrl = null;
  state.binary = null;
  state.startedAt = null;
  startInFlight = null;
  try { child?.kill('SIGKILL'); } catch { /* ignore */ }
}
