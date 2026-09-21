'use client';

import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { QrCode, RefreshCw } from 'lucide-react';
import { useTranslations } from 'use-intl';
import api from '@/lib/api';
import { Ltr } from '@/components/layout/Ltr';
import { ServerAppWaiterAccess } from '@/components/settings/ServerAppWaiterAccess';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type IpQr = { ip: string; url: string; qr_data: string | null };

type ServerAppInfo = {
  mdns_url: string;
  ip_url: string;
  qr_data_url: string | null;
  ips_data?: IpQr[];
  public_pos_url?: string | null;
  waiter_public_url?: string | null;
  waiter_qr_data_url?: string | null;
};

function isLanIp(ip: string): boolean {
  return !ip.startsWith('100.');
}

export default function WaiterQrModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const tPos = useTranslations('pos');
  const t = useTranslations('settings');
  const [loading, setLoading] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [info, setInfo] = useState<ServerAppInfo | null>(null);

  const fetchInfo = () => {
    setLoading(true);
    setDisabled(false);
    api.get('/server-app-info')
      .then(({ data }) => {
        setInfo(data);
      })
      .catch((error: unknown) => {
        setInfo(null);
        const status = axios.isAxiosError(error) ? error.response?.status : null;
        setDisabled(status === 404);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!open) return;
    fetchInfo();
  }, [open]);

  const lanEntries = useMemo(() => {
    const ips = info?.ips_data?.filter((entry) => isLanIp(entry.ip)) ?? [];
    if (ips.length > 0) return ips;
    return info?.ips_data ?? [];
  }, [info]);

  const primary = useMemo(() => {
    const withQr = lanEntries.find((entry) => entry.qr_data);
    if (withQr) return withQr;
    if (info?.qr_data_url && info.ip_url) {
      return { ip: info.ip_url, url: info.ip_url, qr_data: info.qr_data_url };
    }
    return null;
  }, [info, lanEntries]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{tPos('waiterQr')}</DialogTitle>
          <DialogDescription>{tPos('waiterQrHint')}</DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-10">
            <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && disabled && (
          <p className="text-sm text-muted-foreground">{t('serverAppWaiterDisabledHint')}</p>
        )}

        {!loading && !disabled && (
          <div className="space-y-5">
            {info?.waiter_public_url && (
              <div className="flex flex-col items-center rounded-xl border border-emerald-200 bg-emerald-50 p-5">
                {info.waiter_qr_data_url ? (
                  <img
                    src={info.waiter_qr_data_url}
                    alt={t('serverAppQrAlt')}
                    className="h-56 w-56 rounded-xl border border-border bg-card p-2"
                  />
                ) : (
                  <div className="flex h-56 w-56 items-center justify-center rounded-xl border border-border bg-card">
                    <QrCode size={48} className="text-muted-foreground" />
                  </div>
                )}
                <Ltr as="a" href={info.waiter_public_url} target="_blank" rel="noopener noreferrer" className="mt-3 break-all text-center font-mono text-sm text-brand hover:underline">
                  {info.waiter_public_url}
                </Ltr>
                <p className="mt-2 text-xs text-emerald-900">{t('serverAppCellularHint')}</p>
              </div>
            )}

            <div className="flex flex-col items-center rounded-xl border border-border bg-muted/40 p-5">
              {primary?.qr_data ? (
                <img
                  src={primary.qr_data}
                  alt={t('serverAppQrAlt')}
                  className="h-56 w-56 rounded-xl border border-border bg-card p-2"
                />
              ) : (
                <div className="flex h-56 w-56 items-center justify-center rounded-xl border border-border bg-card">
                  <QrCode size={48} className="text-muted-foreground" />
                </div>
              )}
              {primary?.url && (
                <Ltr as="a" href={primary.url} target="_blank" rel="noopener noreferrer" className="mt-3 break-all text-center font-mono text-sm text-brand hover:underline">
                  {primary.url}
                </Ltr>
              )}
              <p className="mt-2 text-xs text-muted-foreground">{t('localNetwork')}</p>
            </div>

            {lanEntries.length > 1 && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {lanEntries.filter((entry) => entry.url !== primary?.url).map((entry) => (
                  <div key={entry.ip} className="flex flex-col items-center rounded-lg border border-border bg-muted/30 p-3">
                    {entry.qr_data ? (
                      <img src={entry.qr_data} alt={t('serverAppQrAlt')} className="h-28 w-28 rounded-lg bg-card p-1" />
                    ) : (
                      <QrCode size={28} className="text-muted-foreground" />
                    )}
                    <Ltr as="a" href={entry.url} target="_blank" rel="noopener noreferrer" className="mt-2 break-all text-center font-mono text-xs text-brand hover:underline">
                      {entry.url}
                    </Ltr>
                  </div>
                ))}
              </div>
            )}

            {info?.mdns_url && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-blue-700">{t('appleDevices')}</p>
                <Ltr as="a" href={info.mdns_url} target="_blank" rel="noopener noreferrer" className="block break-all font-mono text-sm text-blue-600 hover:underline">
                  {info.mdns_url}
                </Ltr>
                <p className="mt-1 text-xs text-blue-600">{t('appleDevicesHint')}</p>
              </div>
            )}

            <button
              type="button"
              onClick={fetchInfo}
              disabled={loading}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              {t('refreshUrls')}
            </button>

            <ServerAppWaiterAccess variant="embedded" />
          </div>
        )}

        {!loading && disabled && (
          <ServerAppWaiterAccess variant="embedded" />
        )}
      </DialogContent>
    </Dialog>
  );
}
