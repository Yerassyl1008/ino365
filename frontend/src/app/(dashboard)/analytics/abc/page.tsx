'use client';

import { useEffect, useMemo, useState } from 'react';
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

interface ProductRow {
  product_id: number;
  product_name: string;
  total_quantity: number;
  total_revenue: number;
  order_count: number;
}

function classifyAbc(products: ProductRow[]): Array<ProductRow & { cls: 'A' | 'B' | 'C'; share: number; cumulative: number }> {
  const sorted = [...products].sort((a, b) => Number(b.total_revenue) - Number(a.total_revenue));
  const total = sorted.reduce((sum, row) => sum + Number(row.total_revenue || 0), 0);
  let running = 0;
  return sorted.map((row) => {
    const revenue = Number(row.total_revenue || 0);
    running += revenue;
    const cumulative = total > 0 ? (running / total) * 100 : 0;
    const share = total > 0 ? (revenue / total) * 100 : 0;
    const prev = total > 0 ? ((running - revenue) / total) * 100 : 0;
    const cls: 'A' | 'B' | 'C' = prev < 80 ? 'A' : prev < 95 ? 'B' : 'C';
    return { ...row, cls, share, cumulative };
  });
}

export default function AbcAnalysisPage() {
  const { currentTenant } = useAuthStore();
  const router = useRouter();
  const t = useTranslations('reports');
  const tNav = useTranslations('nav');
  const tCommon = useTranslations('common');
  const fmt = useFormatCurrency();
  const allowed = hasRole(currentTenant?.role, ROLE_ACCESS.ownerManager);
  const timeZone = currentTenant?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = getLocalDateString(new Date(), timeZone);
  const [startDate, setStartDate] = useState(addDays(today, -29));
  const [endDate, setEndDate] = useState(today);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<ProductRow[]>([]);

  useEffect(() => {
    if (currentTenant && !allowed) router.replace(getLandingPage(currentTenant.role, currentTenant.business_type));
  }, [currentTenant, allowed, router]);

  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    setLoading(true);
    api.get('/reports/topProducts', {
      params: { start_date: startDate, end_date: endDate, limit: 100 },
      signal: controller.signal,
    })
      .then((res) => setProducts(res.data.topProducts || []))
      .catch((err: unknown) => {
        if (err instanceof Error && (err.name === 'CanceledError' || err.name === 'AbortError')) return;
        toast.error(tCommon('somethingWrong'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [allowed, startDate, endDate, tCommon]);

  const rows = useMemo(() => classifyAbc(products), [products]);
  if (!allowed) return null;

  return (
    <ReportShell
      title={tNav('abcAnalysis')}
      hint={t('abcHint')}
      startDate={startDate}
      endDate={endDate}
      maxDate={today}
      onStartDate={setStartDate}
      onEndDate={setEndDate}
      startLabel={t('startDate')}
      endLabel={t('endDate')}
      loading={loading}
    >
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground text-start border-b border-border">
                <th className="px-4 py-2 font-medium">{t('class')}</th>
                <th className="px-4 py-2 font-medium">{t('product')}</th>
                <th className="px-4 py-2 font-medium text-end">{t('quantity')}</th>
                <th className="px-4 py-2 font-medium text-end">{t('revenue')}</th>
                <th className="px-4 py-2 font-medium text-end">{t('share')}</th>
                <th className="px-4 py-2 font-medium text-end">{t('cumulative')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.product_id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-semibold">{row.cls}</td>
                  <td className="px-4 py-2">{row.product_name}</td>
                  <td className="px-4 py-2 text-end">{row.total_quantity}</td>
                  <td className="px-4 py-2 text-end">{fmt(Number(row.total_revenue || 0))}</td>
                  <td className="px-4 py-2 text-end">{row.share.toFixed(1)}%</td>
                  <td className="px-4 py-2 text-end">{row.cumulative.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ReportShell>
  );
}
