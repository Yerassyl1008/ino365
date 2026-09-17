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

interface PaymentRow {
  method: string | null;
  count: number;
  total: number;
}

interface FinancialSummary {
  netCollected: number;
  grossCollected: number;
  refunded: number;
  billCount: number;
  refundCount: number;
  averageOrderValue: number;
  paymentMethods: PaymentRow[];
}

export default function FinancialReportPage() {
  const { currentTenant } = useAuthStore();
  const router = useRouter();
  const t = useTranslations('reports');
  const tDash = useTranslations('dashboard');
  const tNav = useTranslations('nav');
  const tCommon = useTranslations('common');
  const tPos = useTranslations('pos');
  const fmt = useFormatCurrency();
  const allowed = hasRole(currentTenant?.role, ROLE_ACCESS.owner);
  const timeZone = currentTenant?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = getLocalDateString(new Date(), timeZone);
  const [startDate, setStartDate] = useState(addDays(today, -29));
  const [endDate, setEndDate] = useState(today);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<FinancialSummary | null>(null);

  useEffect(() => {
    if (currentTenant && !allowed) router.replace(getLandingPage(currentTenant.role, currentTenant.business_type));
  }, [currentTenant, allowed, router]);

  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    setLoading(true);
    api.get('/reports/financial-summary', {
      params: { start_date: startDate, end_date: endDate },
      signal: controller.signal,
    })
      .then((res) => setSummary(res.data.financialSummary))
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

  const paymentLabel = (method: string | null | undefined) => {
    if (method === 'cash') return tPos('methodCash');
    if (method === 'card') return tPos('methodCard');
    if (method === 'wallet') return tPos('methodWallet');
    return method || tCommon('unknown');
  };

  return (
    <ReportShell
      title={tNav('financialReport')}
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
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-sm text-muted-foreground">{tDash('grossCollections')}</p>
              <p className="mt-1 text-2xl font-bold">{fmt(summary.grossCollected)}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-sm text-muted-foreground">{tDash('refunds')}</p>
              <p className="mt-1 text-2xl font-bold">{fmt(summary.refunded)}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-sm text-muted-foreground">{tDash('netCollections')}</p>
              <p className="mt-1 text-2xl font-bold">{fmt(summary.netCollected)}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-sm text-muted-foreground">{tDash('billsCollected')}</p>
              <p className="mt-1 text-2xl font-bold">{summary.billCount}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-sm text-muted-foreground">{tDash('aov')}</p>
              <p className="mt-1 text-2xl font-bold">{fmt(summary.averageOrderValue)}</p>
            </div>
          </div>
          <section className="rounded-xl border border-border bg-card overflow-hidden">
            <h2 className="px-4 py-3 font-semibold border-b border-border">{tDash('paymentMethods')}</h2>
            {(summary.paymentMethods || []).length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">{tDash('noPaymentsYet')}</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {summary.paymentMethods.map((row) => (
                    <tr key={String(row.method)} className="border-b border-border last:border-0">
                      <td className="px-4 py-2">{paymentLabel(row.method)}</td>
                      <td className="px-4 py-2 text-end">{row.count}</td>
                      <td className="px-4 py-2 text-end">{fmt(Number(row.total || 0))}</td>
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
