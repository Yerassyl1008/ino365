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

interface DailySale {
  date: string;
  orders: number;
  sales: number;
}

interface Breakdown {
  method?: string | null;
  type?: string | null;
  count: number;
  total: number;
}

export default function SalesAnalyticsPage() {
  const { currentTenant } = useAuthStore();
  const router = useRouter();
  const t = useTranslations('reports');
  const tNav = useTranslations('nav');
  const tCommon = useTranslations('common');
  const tPos = useTranslations('pos');
  const fmt = useFormatCurrency();
  const allowed = hasRole(currentTenant?.role, ROLE_ACCESS.ownerManager);
  const timeZone = currentTenant?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = getLocalDateString(new Date(), timeZone);
  const [startDate, setStartDate] = useState(addDays(today, -29));
  const [endDate, setEndDate] = useState(today);
  const [loading, setLoading] = useState(true);
  const [daily, setDaily] = useState<DailySale[]>([]);
  const [payments, setPayments] = useState<Breakdown[]>([]);

  useEffect(() => {
    if (currentTenant && !allowed) router.replace(getLandingPage(currentTenant.role, currentTenant.business_type));
  }, [currentTenant, allowed, router]);

  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    setLoading(true);
    api.get('/reports/sales', { params: { start_date: startDate, end_date: endDate }, signal: controller.signal })
      .then((res) => {
        setDaily(res.data.sales?.dailySales || []);
        setPayments(res.data.sales?.byPaymentMethod || []);
      })
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
      title={tNav('salesAnalytics')}
      startDate={startDate}
      endDate={endDate}
      maxDate={today}
      onStartDate={setStartDate}
      onEndDate={setEndDate}
      startLabel={t('startDate')}
      endLabel={t('endDate')}
      loading={loading}
    >
      {daily.length === 0 && payments.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <div className="space-y-6">
          <section className="rounded-xl border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-start border-b border-border">
                  <th className="px-4 py-2 font-medium">{t('date')}</th>
                  <th className="px-4 py-2 font-medium text-end">{t('orderCount')}</th>
                  <th className="px-4 py-2 font-medium text-end">{t('revenue')}</th>
                </tr>
              </thead>
              <tbody>
                {daily.map((row) => (
                  <tr key={row.date} className="border-b border-border last:border-0">
                    <td className="px-4 py-2">{row.date}</td>
                    <td className="px-4 py-2 text-end">{row.orders}</td>
                    <td className="px-4 py-2 text-end">{fmt(Number(row.sales || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="rounded-xl border border-border bg-card overflow-hidden">
            <h2 className="px-4 py-3 font-semibold border-b border-border">{t('paymentMethod')}</h2>
            <table className="w-full text-sm">
              <tbody>
                {payments.map((row) => (
                  <tr key={String(row.method)} className="border-b border-border last:border-0">
                    <td className="px-4 py-2">{paymentLabel(row.method)}</td>
                    <td className="px-4 py-2 text-end">{row.count}</td>
                    <td className="px-4 py-2 text-end">{fmt(Number(row.total || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}
    </ReportShell>
  );
}
