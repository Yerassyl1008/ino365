'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Globe, RefreshCw, Server, ShieldAlert, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslations, type AppConfig } from 'use-intl';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Ltr } from '@/components/layout/Ltr';
import { useAuthStore } from '@/store/auth';
import { ROLE_ACCESS, hasRole } from '@shared/role-permissions';

type SettingsKey = keyof AppConfig['Messages']['settings'];

type RemoteAccessStatus = {
  local_url: string;
  lan_url: string;
  reports_path: string;
  login_path: string;
  quick_command: string;
  remembered_url: string | null;
  tunnel: {
    running: boolean;
    public_url: string | null;
    pid: number | null;
    binary: string | null;
    started_at: string | null;
  };
  cloudflared: {
    installed: boolean;
    path: string | null;
    version: string | null;
    download_url: string;
    docs_url: string;
  };
};

function CopyRow({
  label,
  value,
  copiedKey,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copiedKey: string;
  copied: string | null;
  onCopy: (key: string, text: string) => void;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">{label}</p>
        <Ltr as="p" className="font-mono text-sm text-foreground break-all">{value}</Ltr>
      </div>
      <button
        type="button"
        onClick={() => onCopy(copiedKey, value)}
        className="p-2.5 border border-border rounded-lg hover:bg-muted text-muted-foreground shrink-0"
      >
        {copied === copiedKey ? <Check size={18} className="text-green-600" /> : <Copy size={18} />}
      </button>
    </div>
  );
}

export function RemoteOwnerAccess() {
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');
  const isOwner = hasRole(useAuthStore((s) => s.currentTenant?.role), ROLE_ACCESS.owner);

  const [status, setStatus] = useState<RemoteAccessStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'start' | 'stop' | 'save' | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [draftUrl, setDraftUrl] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/remote-access');
      setStatus(data);
      setDraftUrl(data.remembered_url || data.tunnel?.public_url || '');
    } catch {
      toast.error(t('remoteAccessLoadFailed'));
    } finally {
      setLoading(false);
    }
  // Language remounts the tree; skip translator identity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isOwner) return;
    void load();
  }, [isOwner, load]);

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      toast.success(t('remoteAccessCopied'));
      setTimeout(() => setCopied((current) => (current === key ? null : current)), 2000);
    } catch {
      toast.error(t('remoteAccessCopyFailed'));
    }
  };

  const startTunnel = async () => {
    setBusy('start');
    try {
      const { data } = await api.post('/remote-access/tunnel/start');
      setStatus(data);
      if (data.tunnel?.public_url) setDraftUrl(data.tunnel.public_url);
      toast.success(t('remoteAccessTunnelStarted'));
    } catch (error: any) {
      const code = error?.response?.data?.error;
      if (code === 'cloudflared_not_found') {
        const next = error.response.data;
        setStatus((prev) => prev ? { ...prev, cloudflared: next.cloudflared, quick_command: next.quick_command || prev.quick_command } : prev);
        toast.error(t('remoteAccessCloudflaredMissing'));
      } else if (code === 'cloudflared_timeout') {
        toast.error(t('remoteAccessStartTimeout'));
      } else {
        toast.error(t('remoteAccessStartFailed'));
      }
    } finally {
      setBusy(null);
    }
  };

  const stopTunnel = async () => {
    setBusy('stop');
    try {
      const { data } = await api.post('/remote-access/tunnel/stop');
      setStatus(data);
      toast.success(t('remoteAccessTunnelStopped'));
    } catch {
      toast.error(t('remoteAccessStopFailed'));
    } finally {
      setBusy(null);
    }
  };

  const saveRememberedUrl = async () => {
    setBusy('save');
    try {
      const { data } = await api.put('/remote-access/remembered-url', { url: draftUrl.trim() });
      setStatus((prev) => prev ? { ...prev, remembered_url: data.remembered_url } : prev);
      setDraftUrl(data.remembered_url || '');
      toast.success(t('remoteAccessUrlSaved'));
    } catch (error: any) {
      toast.error(error?.response?.data?.error || t('remoteAccessUrlSaveFailed'));
    } finally {
      setBusy(null);
    }
  };

  if (!isOwner) return null;

  const liveUrl = status?.tunnel.public_url || status?.remembered_url || draftUrl.trim() || '';
  const waiterUrl = liveUrl ? `${liveUrl.replace(/\/$/, '')}/server-standalone` : '';
  const step = (key: SettingsKey, values?: Record<string, string>) => (
    <li className="text-sm text-muted-foreground">{values ? t(key, values) : t(key)}</li>
  );

  return (
    <div className="space-y-6">
      <div className="bg-card rounded-xl border border-border p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Globe size={20} className="text-brand" />
          <div>
            <h2 className="font-semibold text-foreground">{t('remoteAccessTitle')}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{t('remoteAccessHint')}</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{t('remoteAccessVpsNote')}</p>
        <p className="text-sm text-muted-foreground">{t('remoteAccessFloAdminNote')}</p>
      </div>

      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Server size={20} className="text-emerald-800" />
          <h3 className="font-semibold text-emerald-950">{t('remoteAccessVpsTitle')}</h3>
        </div>
        <p className="text-sm text-emerald-900">{t('remoteAccessVpsIndependent')}</p>
        <ol className="list-decimal ps-5 space-y-2 text-sm text-emerald-900">
          {step('remoteAccessVpsStepBuy')}
          {step('remoteAccessVpsStepDns')}
          {step('remoteAccessVpsStepNode')}
          {step('remoteAccessVpsStepCopy')}
          {step('remoteAccessVpsStepBuild')}
          {step('remoteAccessVpsStepSystemd')}
          {step('remoteAccessVpsStepHttps')}
        </ol>
        <p className="text-xs text-emerald-800">{t('remoteAccessDocsPath')}</p>
        {waiterUrl && (
          <p className="text-sm text-emerald-900">
            {t('remoteAccessWaiterOpens')}{' '}
            <Ltr as="a" href={waiterUrl} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline break-all">
              {waiterUrl}
            </Ltr>
          </p>
        )}
        <p className="text-sm text-emerald-900">{t('remoteAccessWaiterOpensHint')}</p>
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <Printer size={16} className="text-amber-800 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-950">{t('remoteAccessPrintCaveat')}</p>
        </div>
        <div className="flex items-start gap-2 rounded-lg border border-border bg-card px-3 py-2">
          <ShieldAlert size={16} className="text-muted-foreground mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="text-sm text-foreground">{t('remoteAccessSecurityNote')}</p>
            <p className="text-sm text-muted-foreground">{t('remoteAccessOwnerLogin')}</p>
            <p className="text-sm text-muted-foreground">{t('remoteAccessDoNotShareWaiter')}</p>
          </div>
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border p-6 space-y-4">
        <h3 className="font-semibold text-foreground">{t('remoteAccessCustomDomain')}</h3>
        <p className="text-sm text-muted-foreground">{t('remoteAccessCustomDomainHint')}</p>
        <label className="block text-sm text-muted-foreground" htmlFor="remote-access-url">
          {t('remoteAccessRememberUrl')}
        </label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            id="remote-access-url"
            type="url"
            value={draftUrl}
            onChange={(e) => setDraftUrl(e.target.value)}
            placeholder={t('remoteAccessCustomDomainPlaceholder')}
            className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:ring-2 focus:ring-brand font-mono"
            dir="ltr"
          />
          <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void saveRememberedUrl()}>
            {busy === 'save' ? tCommon('saving') : t('remoteAccessSaveUrl')}
          </Button>
        </div>
        {liveUrl && (
          <p className="text-sm text-muted-foreground">
            {t('remoteAccessBossOpens')}{' '}
            <Ltr as="a" href={liveUrl} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline break-all">
              {liveUrl}
            </Ltr>
          </p>
        )}
      </div>

      <div className="bg-card rounded-xl border border-border p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold text-foreground">{t('remoteAccessLocalTitle')}</h3>
          <button type="button" onClick={() => void load()} disabled={loading}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {t('refreshUrls')}
          </button>
        </div>
        {loading && !status ? (
          <p className="text-sm text-gray-400">{t('loading')}</p>
        ) : status ? (
          <div className="space-y-4">
            <CopyRow label={t('remoteAccessLocalUrl')} value={status.local_url} copiedKey="local" copied={copied} onCopy={copy} />
            <CopyRow label={t('remoteAccessLanUrl')} value={status.lan_url} copiedKey="lan" copied={copied} onCopy={copy} />
            <p className="text-xs text-muted-foreground">{t('remoteAccessLanUrlHint')}</p>
          </div>
        ) : null}
      </div>

      <div className="bg-card rounded-xl border border-amber-200 p-6 space-y-4">
        <h3 className="font-semibold text-foreground">{t('remoteAccessTunnelTitle')}</h3>
        <p className="text-sm text-muted-foreground">{t('remoteAccessTunnelHint')}</p>
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 space-y-2">
          <p>{t('remoteAccessMustStayOn')}</p>
        </div>

        <ol className="list-decimal ps-5 space-y-2">
          {step('remoteAccessStepKeepOn')}
          {step('remoteAccessStepInstall')}
          {step('remoteAccessStepCommand')}
          {step('remoteAccessStepLogin')}
          {step('remoteAccessStepReports')}
        </ol>

        {status && (
          <div className="rounded-lg border border-border px-4 py-3 space-y-2">
            <p className="text-sm font-medium text-foreground">
              {status.cloudflared.installed
                ? t('remoteAccessCloudflaredFound', { version: status.cloudflared.version || '—' })
                : t('remoteAccessCloudflaredMissing')}
            </p>
            <p className="text-xs text-muted-foreground">
              {status.tunnel.running
                ? t('remoteAccessTunnelRunning')
                : t('remoteAccessTunnelStoppedHint')}
            </p>
            {status.tunnel.public_url && (
              <CopyRow
                label={t('remoteAccessPublicUrl')}
                value={status.tunnel.public_url}
                copiedKey="public"
                copied={copied}
                onCopy={copy}
              />
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              {status.cloudflared.installed ? (
                status.tunnel.running ? (
                  <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => void stopTunnel()}>
                    {busy === 'stop' ? t('remoteAccessStopping') : t('remoteAccessStopTunnel')}
                  </Button>
                ) : (
                  <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => void startTunnel()}>
                    {busy === 'start' ? t('remoteAccessStarting') : t('remoteAccessStartTunnel')}
                  </Button>
                )
              ) : (
                <>
                  <Button asChild size="sm" variant="outline">
                    <a href={status.cloudflared.download_url} target="_blank" rel="noopener noreferrer">
                      {t('remoteAccessDownload')}
                    </a>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <a href={status.cloudflared.docs_url} target="_blank" rel="noopener noreferrer">
                      {t('remoteAccessDownloadPage')}
                    </a>
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

        {status && (
          <CopyRow
            label={t('remoteAccessQuickCommand')}
            value={status.quick_command}
            copiedKey="cmd"
            copied={copied}
            onCopy={copy}
          />
        )}
        <p className="text-xs text-muted-foreground">{t('remoteAccessCommandHint')}</p>
        <p className="text-xs text-muted-foreground">{t('remoteAccessFirewallNote')}</p>
      </div>
    </div>
  );
}
