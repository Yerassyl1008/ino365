/**
 * GET /api/server-app-info
 * Returns Server App access URLs so POS (cashier) and Settings can render QR
 * codes for tablets and phones — LAN, and a public HTTPS waiter URL when
 * the owner saved a VPS domain (or set FLO_WAITER_PUBLIC_URL).
 */
import { Router, Request, Response } from 'express';
import QRCode from 'qrcode';
import { getLocalIP, getAllLocalIPs } from '../server';
import { getServerAppPort } from '../server-app-state';
import { getSettingValue, isServerAppEnabled } from '../db';
import { REMEMBERED_URL_KEY } from './remote-access';
import { asyncHandler } from '../middleware/async-handler';
import { requireRole } from '../middleware/security';
import { ROLE_ACCESS } from '../../shared/role-permissions';

const router = Router();

router.get('/', requireRole(...ROLE_ACCESS.ownerManagerCashier), asyncHandler(async (_req: Request, res: Response) => {
  if (!isServerAppEnabled()) {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    const port = getServerAppPort();
    const ip = getLocalIP();
    const allIps = getAllLocalIPs();

    const mdnsUrl = `http://flo.local:${port}`;
    const ipUrl = `http://${ip}:${port}`;
    const ipsData = await Promise.all(allIps.map(async (localIp) => {
      const url = `http://${localIp}:${port}`;
      try {
        const qr_data = await QRCode.toDataURL(url, { errorCorrectionLevel: 'M', width: 256 });
        return { ip: localIp, url, qr_data };
      } catch {
        return { ip: localIp, url, qr_data: null };
      }
    }));

    const primaryIpData = ipsData.find((entry) => entry.ip === ip);
    const remembered = (getSettingValue(REMEMBERED_URL_KEY) || '').trim();
    const publicPosUrl = remembered ? remembered.replace(/\/$/, '') : null;
    const waiterFromEnv = (process.env.FLO_WAITER_PUBLIC_URL || '').trim().replace(/\/$/, '');
    const waiterPublicUrl = waiterFromEnv
      || (publicPosUrl ? `${publicPosUrl}/server-standalone` : null);
    let waiter_qr_data_url: string | null = null;
    if (waiterPublicUrl) {
      try {
        waiter_qr_data_url = await QRCode.toDataURL(waiterPublicUrl, { errorCorrectionLevel: 'M', width: 256 });
      } catch {
        waiter_qr_data_url = null;
      }
    }

    res.json({
      mdns_url: mdnsUrl,
      ip_url: ipUrl,
      qr_url: waiterPublicUrl || ipUrl,
      qr_data_url: waiter_qr_data_url ?? primaryIpData?.qr_data ?? null,
      ips_data: ipsData,
      public_pos_url: publicPosUrl,
      waiter_public_url: waiterPublicUrl,
      waiter_qr_data_url,
    });
  } catch (error: any) {
    console.error('[API] Internal error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}));

export const serverAppInfoRoutes = router;
