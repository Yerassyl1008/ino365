/**
 * Owner-only remote report access: local POS URL, optional Cloudflare tunnel,
 * and a remembered public HTTPS URL (named tunnel / custom domain).
 */
import { Router, Request, Response } from 'express';
import expressRateLimit from 'express-rate-limit';
import { isAllowedPrivateIp, requireRole } from '../middleware/security';
import { ROLE_ACCESS } from '../../shared/role-permissions';
import { getLocalIP, getServerPort } from '../server';
import { getSettingValue, upsertSettings } from '../db';
import { asyncHandler } from '../middleware/async-handler';
import {
  buildQuickTunnelCommand,
  describeCloudflared,
  getOwnerTunnelStatus,
  startOwnerTunnel,
  stopOwnerTunnel,
} from '../services/remote-tunnel';

const router = Router();
export const REMEMBERED_URL_KEY = 'remote_access_public_url';

const mutateRateLimit = expressRateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(requireRole(...ROLE_ACCESS.owner));

export function normalizeRememberedPublicUrl(raw: unknown): { ok: true; url: string } | { ok: false; error: string } {
  if (raw === null || raw === undefined) return { ok: true, url: '' };
  if (typeof raw !== 'string') return { ok: false, error: 'URL must be a string' };
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, url: '' };
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: 'Invalid URL' };
  }
  if (parsed.protocol !== 'https:') return { ok: false, error: 'URL must use https' };
  if (parsed.username || parsed.password) return { ok: false, error: 'URL must not include credentials' };
  const hostname = parsed.hostname.toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(hostname) || hostname.length > 253) {
    return { ok: false, error: 'Invalid hostname' };
  }
  if (hostname === 'localhost' || hostname.endsWith('.local') || isAllowedPrivateIp(hostname)) {
    return { ok: false, error: 'Use a public https URL, not a LAN address' };
  }
  parsed.hash = '';
  const normalized = parsed.toString().replace(/\/$/, '');
  return { ok: true, url: normalized };
}

function snapshot() {
  const port = getServerPort();
  const remembered = getSettingValue(REMEMBERED_URL_KEY);
  return {
    local_url: `http://127.0.0.1:${port}`,
    lan_url: `http://${getLocalIP()}:${port}`,
    reports_path: '/reports/day-close',
    login_path: '/auth/login',
    quick_command: buildQuickTunnelCommand(port),
    remembered_url: remembered || null,
    tunnel: getOwnerTunnelStatus(),
  };
}

router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  const cloudflared = await describeCloudflared();
  res.json({ ...snapshot(), cloudflared });
}));

router.post('/tunnel/start', mutateRateLimit, asyncHandler(async (_req: Request, res: Response) => {
  try {
    const tunnel = await startOwnerTunnel(getServerPort());
    if (tunnel.public_url) {
      upsertSettings({ [REMEMBERED_URL_KEY]: tunnel.public_url });
    }
    const cloudflared = await describeCloudflared();
    res.json({ ...snapshot(), tunnel, cloudflared });
  } catch (error: any) {
    if (error?.code === 'cloudflared_not_found' || error?.message === 'cloudflared_not_found') {
      const cloudflared = await describeCloudflared();
      res.status(409).json({
        error: 'cloudflared_not_found',
        cloudflared,
        quick_command: buildQuickTunnelCommand(getServerPort()),
      });
      return;
    }
    if (error?.message === 'cloudflared_timeout') {
      res.status(504).json({ error: 'cloudflared_timeout' });
      return;
    }
    console.error('[RemoteAccess] Failed to start tunnel:', error);
    res.status(500).json({ error: 'Failed to start tunnel' });
  }
}));

router.post('/tunnel/stop', mutateRateLimit, asyncHandler(async (_req: Request, res: Response) => {
  await stopOwnerTunnel();
  const cloudflared = await describeCloudflared();
  res.json({ ...snapshot(), cloudflared });
}));

router.put('/remembered-url', mutateRateLimit, (req: Request, res: Response) => {
  const parsed = normalizeRememberedPublicUrl(req.body?.url);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  upsertSettings({ [REMEMBERED_URL_KEY]: parsed.url });
  res.json(snapshot());
});

export const remoteAccessRoutes = router;
