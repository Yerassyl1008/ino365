'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Lightbulb, Trophy, Tags, Clock, BarChart3 } from 'lucide-react';
import { useTranslations, useLocale } from 'use-intl';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useFormatCurrency } from '@/hooks/useFormatCurrency';
import { ROLE_ACCESS, hasRole } from '@shared/role-permissions';
import { getLandingPage } from '@/components/layout/AuthGuard';

interface TopStaff {
  user_id: string;
  name: string;
  revenue: number;
  orderCount: number;
}

interface TopCategory {
  category_id: string | null;
  name: string;
  quantity: number;
  revenue: number;
}

interface Insights {
  windowDays: number;
  aov: number;
  avgPrepTimeMinutes: number | null;
  topStaff: TopStaff[];
  topCategories: TopCategory[];
  busiestHour: { hour: number; orderCount: number } | null;
  busiestDayOfWeek: { dayIndex: number; orderCount: number } | null;
}

function formatHourLabel(hour: number, locale: string): string {
  const reference = new Date(Date.UTC(2000, 0, 1, hour));
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', timeZone: 'UTC' }).format(reference);
}

function formatWeekdayLabel(dayIndex: number, locale: string): string {
  const reference = new Date(2000, 0, 2 + dayIndex);
  return new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(reference);
}

export default function AdvisorPage() {
  const { currentTenant } = useAuthStore();
  const t = useTranslations('dashboard');
  const tNav = useTranslations('nav');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const fmt = useFormatCurrency();
  const locale = useLocale();
  const isOwner = hasRole(currentTenant?.role, ROLE_ACCESS.owner);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentTenant && !isOwner) {
      router.replace(getLandingPage(currentTenant?.role, currentTenant?.business_type));
    }
  }, [currentTenant, isOwner, router]);

  useEffect(() => {
    if (!isOwner) return;
    const controller = new AbortController();
    api.get('/reports/insights', { params: { days: 30 }, signal: controller.signal })
      .then((res) => setInsights(res.data))
      .catch((err: unknown) => {
        if (err instanceof Error && (err.name === 'CanceledError' || err.name === 'AbortError')) return;
        toast.error(tCommon('somethingWrong'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [isOwner, tCommon]);

  if (!isOwner) return null;

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6 flex items-center gap-2">
        <Lightbulb className="size-5 text-brand" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">{tNav('advisor')}</h1>
          <p className="text-sm text-muted-foreground">{t('advisorHint', { days: insights?.windowDays ?? 30 })}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-3 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="flex items-center gap-2 font-semibold mb-3">
              <Clock size={16} className="text-muted-foreground" />
              {t('busiestHour')}
            </h2>
            <p className="text-2xl font-bold">
              {insights?.busiestHour ? formatHourLabel(insights.busiestHour.hour, locale) : t('notEnoughData')}
            </p>
            {insights?.busiestHour && (
              <p className="text-sm text-muted-foreground">{t('ordersCount', { count: insights.busiestHour.orderCount })}</p>
            )}
          </section>
          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="flex items-center gap-2 font-semibold mb-3">
              <BarChart3 size={16} className="text-muted-foreground" />
              {t('busiestDay')}
            </h2>
            <p className="text-2xl font-bold">
              {insights?.busiestDayOfWeek ? formatWeekdayLabel(insights.busiestDayOfWeek.dayIndex, locale) : t('notEnoughData')}
            </p>
            {insights?.busiestDayOfWeek && (
              <p className="text-sm text-muted-foreground">{t('ordersCount', { count: insights.busiestDayOfWeek.orderCount })}</p>
            )}
          </section>
          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="flex items-center gap-2 font-semibold mb-3">
              <Trophy size={16} className="text-muted-foreground" />
              {t('topStaff')}
            </h2>
            {(insights?.topStaff.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">{t('noSalesYet')}</p>
            ) : (
              <ul className="space-y-2">
                {insights!.topStaff.slice(0, 5).map((staff) => (
                  <li key={staff.user_id} className="flex items-center justify-between text-sm">
                    <span>{staff.name}</span>
                    <span className="font-semibold">{fmt(Number(staff.revenue))}</span>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/staff" className="mt-3 inline-block text-xs text-brand">{t('viewAll')}</Link>
          </section>
          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="flex items-center gap-2 font-semibold mb-3">
              <Tags size={16} className="text-muted-foreground" />
              {t('topCategories')}
            </h2>
            {(insights?.topCategories.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">{t('noSalesYet')}</p>
            ) : (
              <ul className="space-y-2">
                {insights!.topCategories.slice(0, 5).map((category) => (
                  <li key={category.category_id ?? category.name} className="flex items-center justify-between text-sm">
                    <span>{category.name}</span>
                    <span className="font-semibold">{fmt(Number(category.revenue))}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
