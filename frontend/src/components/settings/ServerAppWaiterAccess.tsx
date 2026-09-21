'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { KeyRound } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslations, type AppConfig } from 'use-intl';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Ltr } from '@/components/layout/Ltr';
import type { Staff } from '@/lib/types';
import { useAuthStore } from '@/store/auth';
import { ROLE_ACCESS, hasRole } from '@shared/role-permissions';
import { ROLE_LABEL_KEYS } from '@/lib/i18n-enums';

type SettingsKey = keyof AppConfig['Messages']['settings'];
type StaffKey = keyof AppConfig['Messages']['staff'];

const PIN_ROLE_ORDER: Record<string, number> = { server: 0, manager: 1, owner: 2 };

function roleLabel(role: string, tStaff: (key: StaffKey) => string): string {
  const key = ROLE_LABEL_KEYS[role];
  return key ? tStaff(key) : role;
}

function canSetTargetPin(requesterRole: string | undefined, targetRole: string): boolean {
  if (requesterRole === 'owner') return true;
  if (requesterRole === 'manager') return !hasRole(targetRole, ROLE_ACCESS.ownerManager);
  return false;
}

export function ServerAppWaiterAccess({ variant = 'card' }: { variant?: 'card' | 'embedded' }) {
  const t = useTranslations('settings');
  const tStaff = useTranslations('staff');
  const tCommon = useTranslations('common');
  const { currentTenant } = useAuthStore();
  const requesterRole = currentTenant?.role;
  const canManagePins = hasRole(requesterRole, ROLE_ACCESS.ownerManager);

  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(canManagePins);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [revealedPins, setRevealedPins] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!canManagePins) return;
    let cancelled = false;
    api.get('/staff')
      .then(({ data }) => {
        if (!cancelled) setStaff(data.staff || []);
      })
      .catch(() => {
        if (!cancelled) toast.error(t('serverAppWaiterStaffLoadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  // Language changes re-run through a remount; avoid refetching on translator identity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManagePins]);

  const waiterStaff = useMemo(() => {
    return staff
      .filter((member) => hasRole(member.role, ROLE_ACCESS.serverApp))
      .sort((a, b) => {
        const activeDelta = Number(Boolean(b.is_active)) - Number(Boolean(a.is_active));
        if (activeDelta !== 0) return activeDelta;
        const roleDelta = (PIN_ROLE_ORDER[a.role] ?? 9) - (PIN_ROLE_ORDER[b.role] ?? 9);
        if (roleDelta !== 0) return roleDelta;
        return a.name.localeCompare(b.name);
      });
  }, [staff]);

  const savePin = async (member: Staff) => {
    const pin = (drafts[member.id] || '').trim();
    if (!/^\d{4,6}$/.test(pin)) {
      toast.error(t('serverAppWaiterPinInvalid'));
      return;
    }
    setSavingId(member.id);
    try {
      const { data } = await api.put(`/staff/${member.id}`, { pin });
      const updated = data?.staff as Staff | undefined;
      setStaff((current) => current.map((row) => (
        row.id === member.id
          ? { ...row, ...(updated || {}), has_pin: updated?.has_pin ?? 1 }
          : row
      )));
      setDrafts((current) => ({ ...current, [member.id]: '' }));
      setRevealedPins((current) => ({ ...current, [member.id]: pin }));
      toast.success(t('serverAppWaiterPinSaved'));
    } catch (error: unknown) {
      const apiError = axios.isAxiosError(error) ? error.response?.data?.error : null;
      const key: SettingsKey = apiError === 'PIN is already assigned to another staff member'
        ? 'serverAppWaiterPinTaken'
        : 'serverAppWaiterPinSaveFailed';
      toast.error(t(key));
    } finally {
      setSavingId(null);
    }
  };

  const shellClass = variant === 'embedded'
    ? 'space-y-5'
    : 'bg-card rounded-xl border border-border p-6 space-y-5';

  return (
    <div className={shellClass}>
      {variant !== 'embedded' && (
        <div className="flex items-center gap-2">
          <KeyRound size={20} className="text-muted-foreground" />
          <h2 className="font-semibold text-foreground">{t('serverAppWaiterAccessTitle')}</h2>
        </div>
      )}

      <ol className="list-decimal ps-5 space-y-1.5 text-sm text-muted-foreground">
        <li>{t('serverAppWaiterStep1')}</li>
        <li>{t('serverAppWaiterStep2')}</li>
        <li>{t('serverAppWaiterStep3')}</li>
      </ol>

      {!canManagePins && (
        <p className="text-sm text-muted-foreground">{t('serverAppWaiterCashierPinHint')}</p>
      )}

      {canManagePins && (
        <div className="space-y-3">
          <div>
            <p className="font-medium text-foreground">{t('serverAppWaiterPinListTitle')}</p>
            <p className="text-sm text-muted-foreground mt-1">{t('serverAppWaiterPinCannotRecover')}</p>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-6">
              <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loading && waiterStaff.length === 0 && (
            <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm space-y-2">
              <p className="text-muted-foreground">{t('serverAppWaiterNoStaff')}</p>
              <Link href="/staff" className="text-brand hover:underline font-medium">
                {t('serverAppWaiterOpenStaff')}
              </Link>
            </div>
          )}

          {!loading && waiterStaff.map((member) => {
            const pinSet = Boolean(member.has_pin);
            const canEdit = canSetTargetPin(requesterRole, member.role);
            const revealed = revealedPins[member.id];
            return (
              <div
                key={member.id}
                className={`rounded-lg border border-border p-4 space-y-3 ${member.is_active ? '' : 'opacity-60'}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-foreground">{member.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {roleLabel(member.role, tStaff)}
                      {!member.is_active ? ` · ${tCommon('inactive')}` : ''}
                    </p>
                  </div>
                  <p className={`text-xs font-medium ${pinSet ? 'text-green-600' : 'text-amber-700'}`}>
                    {pinSet ? t('serverAppWaiterPinSet') : t('serverAppWaiterPinNotSet')}
                  </p>
                </div>

                {revealed && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 space-y-1">
                    <p>{t('serverAppWaiterPinSavedOnce', { name: member.name })}</p>
                    <Ltr className="block font-mono text-lg font-semibold tracking-[0.3em]">{revealed}</Ltr>
                    <button
                      type="button"
                      className="text-xs font-medium text-emerald-800 hover:underline"
                      onClick={() => setRevealedPins((current) => {
                        const next = { ...current };
                        delete next[member.id];
                        return next;
                      })}
                    >
                      {t('serverAppWaiterHidePin')}
                    </button>
                  </div>
                )}

                {canEdit && (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={6}
                      dir="ltr"
                      placeholder={t('serverAppWaiterPinPlaceholder')}
                      value={drafts[member.id] || ''}
                      onChange={(event) => {
                        const value = event.target.value.replace(/\D/g, '').slice(0, 6);
                        setDrafts((current) => ({ ...current, [member.id]: value }));
                      }}
                      className="ltr-island w-full sm:max-w-[10rem] px-3 py-2 border border-border rounded-lg font-mono tracking-widest outline-none focus:ring-2 focus:ring-brand"
                    />
                    <Button
                      type="button"
                      size="sm"
                      disabled={savingId === member.id || !(drafts[member.id] || '').trim()}
                      onClick={() => void savePin(member)}
                    >
                      {savingId === member.id
                        ? tCommon('saving')
                        : pinSet
                          ? t('serverAppWaiterResetPin')
                          : t('serverAppWaiterSetPin')}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}

          {waiterStaff.length > 0 && (
            <Link href="/staff" className="inline-block text-sm text-brand hover:underline">
              {t('serverAppWaiterOpenStaff')}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
