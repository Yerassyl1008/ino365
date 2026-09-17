'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useFormatCurrency } from '@/hooks/useFormatCurrency';
import { ROLE_ACCESS, hasRole } from '@shared/role-permissions';
import { getLandingPage } from '@/components/layout/AuthGuard';
import { useTranslations } from 'use-intl';
import ReportShell from '@/components/reports/ReportShell';
import { addDays, getLocalDateString } from '@/lib/report-dates';

interface StaffRow {
  userId: string | null;
  name: string | null;
  orderCount: number;
  collected: number;
  ownerShare: number;
  staffShare: number;
}

interface ServiceChargeSummary {
  collected: number;
  ownerShare: number;
  staffShare: number;
  orderCount: number;
  staff: StaffRow[];
}

export default function ServiceChargeReportPage() {
  const { currentTenant } = useAuthStore();
  const router = useRouter();
  const t = useTranslations('reports');
  const tNav = useTranslations('nav');
  const tCommon = useTranslations('common');
  const fmt = useFormatCurrency();
  const allowed = hasRole(currentTenant?.role, ROLE_ACCESS.owner);
  const timeZone = currentTenant?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = getLocalDateString(new Date(), timeZone);
  const [startDate, setStartDate] = useState(addDays(today, -29));
  const [endDate, setEndDate] = useState(today);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<ServiceChargeSummary | null>(null);

  useEffect(() => {
    if (currentTenant && !allowed) router.replace(getLandingPage(currentTenant.role, currentTenant.business_type));
  }, [currentTenant, allowed, router]);

  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    setLoading(true);
    api.get('/reports/service-charge', {
      params: { start_date: startDate, end_date: endDate },
      signal: controller.signal,
    })
      .then((res) => setSummary(res.data))
      .catch((err: unknown) => {
        if (err instanceof Error && (err.name === 'CanceledError' || err.name === 'AbortError')) return;
        toast.error(tCommon('somethingWrong'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [allowed, startDate, endDate, tCommon]);

  if (!allowed) return null;

  return (
    <ReportShell
      title={tNav('serviceChargeReport')}
      startDate={startDate}
      endDate={endDate}
      maxDate={today}
      onStartDate={setStartDate}
      onEndDate={setEndDate}
      startLabel={t('startDate')}
      endLabel={t('endDate')}
      loading={loading}
    >
      {!summary ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">{t('serviceChargeHint')}</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-sm text-muted-foreground">{t('serviceChargeCollected')}</p>
              <p className="mt-1 text-2xl font-bold">{fmt(summary.collected)}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-sm text-muted-foreground">{t('serviceChargeOwnerShare')}</p>
              <p className="mt-1 text-2xl font-bold">{fmt(summary.ownerShare)}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-sm text-muted-foreground">{t('serviceChargeStaffShare')}</p>
              <p className="mt-1 text-2xl font-bold">{fmt(summary.staffShare)}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-sm text-muted-foreground">{t('serviceChargeOrders')}</p>
              <p className="mt-1 text-2xl font-bold">{summary.orderCount}</p>
            </div>
          </div>
          <section className="rounded-xl border border-border bg-card overflow-hidden">
            <h2 className="px-4 py-3 font-semibold border-b border-border">{t('staff')}</h2>
            {(summary.staff || []).length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">{t('empty')}</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="text-start font-medium px-4 py-2">{t('staff')}</th>
                    <th className="text-end font-medium px-4 py-2">{t('serviceChargeOrders')}</th>
                    <th className="text-end font-medium px-4 py-2">{t('serviceChargeCollected')}</th>
                    <th className="text-end font-medium px-4 py-2">{t('serviceChargeOwnerShare')}</th>
                    <th className="text-end font-medium px-4 py-2">{t('serviceChargeStaffShare')}</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.staff.map((row) => (
                    <tr key={row.userId || 'unknown'} className="border-t border-border">
                      <td className="px-4 py-2">{row.name || tCommon('unknown')}</td>
                      <td className="px-4 py-2 text-end">{row.orderCount}</td>
                      <td className="px-4 py-2 text-end">{fmt(row.collected)}</td>
                      <td className="px-4 py-2 text-end">{fmt(row.ownerShare)}</td>
                      <td className="px-4 py-2 text-end">{fmt(row.staffShare)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}
    </ReportShell>
  );
}
