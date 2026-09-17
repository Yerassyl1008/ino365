'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth';
import api from '@/lib/api';
import { Banknote, ChefHat, Clock, LayoutGrid, TrendingUp, ClipboardList, ArrowRight, Timer, Trophy, Tags, BarChart3, Wallet, RotateCcw, ReceiptText, Printer, Percent, RefreshCw, Receipt, ConciergeBell, type LucideIcon } from 'lucide-react';
import {
  buildDayClosePrintInput,
  dayClosePeriodEnd,
  dayClosePeriodStart,
  printDayCloseReport,
  type DayClosePrintLabels,
} from '@/lib/printer/day-close-print';
import { useTranslations, useLocale, type AppConfig } from 'use-intl';
import { Ltr } from '@/components/layout/Ltr';
import toast from 'react-hot-toast';
import { useFormatCurrency } from '@/hooks/useFormatCurrency';
import { useFormatDate } from '@/hooks/useFormatDate';
import { PAYMENT_METHODS } from '@/lib/payment-methods';
import { ORDER_STATUS_LABEL_KEYS } from '@/lib/i18n-enums';
import { ROLE_ACCESS, hasRole } from '@shared/role-permissions';
import { getLandingPage } from '@/components/layout/AuthGuard';

interface PaymentMethodBreakdown {
  method: string | null;
  count: number;
  total: number;
}

interface DailyStats {
  sales: number;
  runningOrders: number;
  pendingOrders: number;
  tablesOccupied: number;
  paymentMethods: PaymentMethodBreakdown[];
}

interface DaySummary {
  date: string;
  orders: { count: number; total: number };
  bills: { count: number; total: number; collected: number };
  customers: { new: number };
  paymentMethods: PaymentMethodBreakdown[];
}

interface RefundActivity {
  id: number;
  amount: number;
  method: string;
  reason: string | null;
  created_at: string;
  bill_number: string;
  paid_at: string;
  order_number: string;
  approved_by_name: string;
}

interface FinancialSummary {
  startDate: string;
  endDate: string;
  grossCollected: number;
  refunded: number;
  netCollected: number;
  billCount: number;
  refundCount: number;
  averageOrderValue: number;
  paymentMethods: PaymentMethodBreakdown[];
  refunds: RefundActivity[];
}

interface TopProduct {
  product_id: number;
  product_name: string;
  total_quantity: number;
  total_revenue: number;
  order_count: number;
}

interface RecentOrder {
  id: number;
  order_number: string;
  status: string;
  total: number;
  customer_name: string | null;
  table_name: string | null;
  created_at: string;
}

interface TopStaff {
  user_id: string;
  name: string;
  role: string;
  revenue: number;
  orderCount: number;
}

interface TopCategory {
  category_id: string | null;
  name: string;
  quantity: number;
  revenue: number;
}

interface HourBucket {
  hour: number;
  orderCount: number;
}

interface DayBucket {
  dayIndex: number;
  orderCount: number;
}

interface Insights {
  windowDays: number;
  aov: number;
  avgPrepTimeMinutes: number | null;
  topStaff: TopStaff[];
  topCategories: TopCategory[];
  busiestHour: HourBucket | null;
  idlestHour: HourBucket | null;
  busiestDayOfWeek: DayBucket | null;
  idlestDayOfWeek: DayBucket | null;
}

interface DayClosePayment {
  method: string;
  count: number;
  amount: number;
  sharePercent: number;
}

interface DayCloseStaff {
  userId: string | null;
  name: string | null;
  billCount: number;
  itemCount: number;
  serviceCharge: number;
  amount: number;
  sharePercent: number;
}

interface DayCloseDepartment {
  categoryId: string | null;
  name: string | null;
  quantity: number;
  serviceCharge: number;
  amount: number;
  sharePercent: number;
}

interface DayCloseClient {
  customerId: string | null;
  name: string | null;
  billCount: number;
  itemCount: number;
  amount: number;
  amountBeforeDiscount: number;
  sharePercent: number;
}

interface DayCloseReport {
  date: string;
  startDate: string;
  endDate: string;
  generatedAt: string;
  businessName: string;
  header: {
    billCount: number;
    orderItemCount: number;
    cancelledReceiptCount: number;
    cancelledItemCount: number;
    cancelledAmount: number;
    guestCount: number;
    transfers: number;
    unlocks: number;
    serviceCharge: number;
  };
  payments: DayClosePayment[];
  paymentTotal: number;
  staff: DayCloseStaff[];
  staffTotal: { billCount: number; itemCount: number; serviceCharge: number; amount: number };
  departments: DayCloseDepartment[];
  departmentTotal: { quantity: number; serviceCharge: number; amount: number };
  clients: DayCloseClient[];
  clientTotal: { billCount: number; itemCount: number; amount: number; amountBeforeDiscount: number };
}

/** Today's date as YYYY-MM-DD in a given IANA timezone (not UTC — avoids an
 *  off-by-one-day default near midnight relative to the tenant's locale). */
function getLocalDateString(date: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD by convention — a convenient built-in shortcut.
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function getMonthRange(month: string): { startDate: string; endDate: string } {
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { startDate: `${month}-01`, endDate: `${month}-${String(lastDay).padStart(2, '0')}` };
}

function getYearRange(year: string): { startDate: string; endDate: string } {
  return { startDate: `${year}-01-01`, endDate: `${year}-12-31` };
}

/** Formats a 0-23 local hour index as a locale-appropriate time label (e.g. "2 PM"). */
function formatHourLabel(hour: number, locale: string): string {
  const reference = new Date(Date.UTC(2000, 0, 1, hour));
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', timeZone: 'UTC' }).format(reference);
}

function previousDateString(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const previous = new Date(Date.UTC(year, month - 1, day));
  previous.setUTCDate(previous.getUTCDate() - 1);
  return previous.toISOString().slice(0, 10);
}

function calendarDateFromYmd(ymd: string): Date {
  const [year, month, day] = ymd.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function discountFromClose(report: DayCloseReport | null): number {
  if (!report) return 0;
  return Math.max(0, Number(report.clientTotal.amountBeforeDiscount || 0) - Number(report.clientTotal.amount || 0));
}

function WorkbenchKpiCard({
  href,
  label,
  value,
  yesterdayLabel,
  yesterdayValue,
  icon: Icon,
  accentClass,
}: {
  href: string;
  label: string;
  value: string;
  yesterdayLabel: string;
  yesterdayValue: string | null;
  icon: LucideIcon;
  accentClass: string;
}) {
  return (
    <Link href={href} className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className={`h-1 ${accentClass}`} />
      <div className="flex flex-1 flex-col p-4">
        <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Icon className="size-4 shrink-0" />
          <span>{label}</span>
        </div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
      </div>
      {yesterdayValue !== null && (
        <div className="border-t border-border bg-muted/50 px-4 py-2">
          <p className="text-xs text-muted-foreground">{yesterdayLabel}</p>
          <p className="text-sm font-medium text-foreground">{yesterdayValue}</p>
        </div>
      )}
    </Link>
  );
}

/** Formats a 0=Sunday..6=Saturday index as a locale-appropriate weekday name. */
function formatWeekdayLabel(dayIndex: number, locale: string): string {
  // Jan 2, 2000 was a Sunday — using local-time Date math (no timeZone
  // needed here, the hour/day bucketing already resolved to the tenant's
  // local calendar server-side).
  const reference = new Date(2000, 0, 2 + dayIndex);
  return new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(reference);
}

const orderStatusColor: Record<string, string> = {
  pending: 'text-yellow-600',
  preparing: 'text-blue-600',
  ready: 'text-green-600',
  served: 'text-purple-600',
  completed: 'text-muted-foreground',
  cancelled: 'text-red-500',
};

type OrdersKey = keyof AppConfig['Messages']['orders'];
type PosKey = keyof AppConfig['Messages']['pos'];

// Built-in payment method label keys mapped to typed `pos` leaf keys.
const BUILT_IN_PAYMENT_KEYS = {
  cash: 'methodCash',
  card: 'methodCard',
} as const satisfies Record<'cash' | 'card', PosKey>;

export default function DashboardPage() {
  const { currentTenant } = useAuthStore();
  const t = useTranslations('dashboard');
  const tCommon = useTranslations('common');
  const tPos = useTranslations('pos');
  const tOrders = useTranslations('orders');
  const tNav = useTranslations('nav');
  const router = useRouter();
  const [stats, setStats] = useState<DailyStats | null>(null);
  const [daySummary, setDaySummary] = useState<DaySummary | null>(null);
  const [financialSummary, setFinancialSummary] = useState<FinancialSummary | null>(null);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [dayClose, setDayClose] = useState<DayCloseReport | null>(null);
  const [yesterdayFinancial, setYesterdayFinancial] = useState<FinancialSummary | null>(null);
  const [yesterdayClose, setYesterdayClose] = useState<DayCloseReport | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [loading, setLoading] = useState(true);

  const isOwner = hasRole(currentTenant?.role, ROLE_ACCESS.owner);
  const isRestaurant = (currentTenant?.business_type ?? 'restaurant') === 'restaurant';
  const fmt = useFormatCurrency();
  const { formatDate, formatDateTime } = useFormatDate();
  const locale = useLocale();
  const timeZone = currentTenant?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const todayLocal = getLocalDateString(new Date(), timeZone);
  const [selectedDate, setSelectedDate] = useState(todayLocal);
  const [selectedMonth, setSelectedMonth] = useState(todayLocal.slice(0, 7));
  const [selectedYear, setSelectedYear] = useState(todayLocal.slice(0, 4));
  const [periodMode, setPeriodMode] = useState<'day' | 'month' | 'year'>('day');
  const isToday = periodMode === 'day' && selectedDate === todayLocal;
  const range = periodMode === 'month'
    ? getMonthRange(selectedMonth)
    : periodMode === 'year'
      ? getYearRange(selectedYear)
      : { startDate: selectedDate, endDate: selectedDate };

  useEffect(() => {
    if (currentTenant && !isOwner) {
      router.replace(getLandingPage(currentTenant?.role, currentTenant?.business_type));
    }
  }, [currentTenant, isOwner, router]);

  // Show the spinner again as soon as isOwner/selectedDate change, read directly during
  // render (React's recommended pattern for "adjusting state when a prop changes") so the
  // effect below only needs to own the async fetch and its own completion state.
  const syncKey = `${isOwner}:${periodMode}:${range.startDate}:${range.endDate}:${refreshNonce}`;
  const [syncedKey, setSyncedKey] = useState(syncKey);
  if (syncKey !== syncedKey) {
    setSyncedKey(syncKey);
    if (isOwner) setLoading(true);
  }

  useEffect(() => {
    if (!isOwner) return;
    const controller = new AbortController();
    const scopedSummary = periodMode !== 'day'
      ? Promise.resolve(null)
      : isToday
        ? api.get('/reports/daily-stats', { signal: controller.signal })
        : api.get('/reports/summary', { params: { date: selectedDate }, signal: controller.signal });
    const yesterday = periodMode === 'day' ? previousDateString(selectedDate) : null;
    Promise.all([
      scopedSummary,
      api.get('/reports/financial-summary', { params: { start_date: range.startDate, end_date: range.endDate }, signal: controller.signal }),
      api.get('/reports/topProducts', { params: { start_date: range.startDate, end_date: range.endDate, limit: 5 }, signal: controller.signal }),
      api.get('/reports/recentOrders', {
        params: periodMode !== 'day'
          ? { start_date: range.startDate, end_date: range.endDate, limit: 6 }
          : { date: selectedDate, limit: 6 },
        signal: controller.signal,
      }),
      api.get('/reports/insights', { params: { days: periodMode === 'year' ? 365 : 30 }, signal: controller.signal }),
      api.get('/reports/day-close', {
        params: periodMode === 'day'
          ? { date: selectedDate }
          : { start_date: range.startDate, end_date: range.endDate },
        signal: controller.signal,
      }),
      yesterday
        ? api.get('/reports/financial-summary', { params: { start_date: yesterday, end_date: yesterday }, signal: controller.signal })
        : Promise.resolve(null),
      yesterday
        ? api.get('/reports/day-close', { params: { date: yesterday }, signal: controller.signal })
        : Promise.resolve(null),
    ])
      .then(([statsRes, financialRes, topRes, recentRes, insightsRes, dayCloseRes, yesterdayFinancialRes, yesterdayCloseRes]) => {
        setStats(isToday && statsRes ? statsRes.data : null);
        setDaySummary(!isToday && statsRes ? statsRes.data.summary : null);
        setFinancialSummary(financialRes.data.financialSummary);
        setTopProducts(topRes.data.topProducts || []);
        setRecentOrders(recentRes.data.recentOrders || []);
        setInsights(insightsRes.data);
        setDayClose(dayCloseRes.data.report ?? null);
        setYesterdayFinancial(yesterdayFinancialRes?.data?.financialSummary ?? null);
        setYesterdayClose(yesterdayCloseRes?.data?.report ?? null);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && (err.name === 'CanceledError' || err.name === 'AbortError')) return;
        toast.error(tCommon('somethingWrong'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner, periodMode, selectedDate, selectedMonth, selectedYear, refreshNonce]);

  if (!isOwner) return null;

  const paymentMethods = financialSummary?.paymentMethods ?? [];
  const paymentMethodsTotal = paymentMethods.reduce((sum, pm) => sum + Number(pm.total), 0);

  // Running/Pending Orders and Tables Occupied are live, "right now" concepts
  // that don't retroactively apply to a past date (an order isn't "pending"
  // in history — it has a final status). When viewing a past date, swap them
  // for the day's actual totals from /reports/summary instead.
  const dateScopedTiles = periodMode !== 'day'
    ? [
        {
          label: t('billsCollected'),
          value: financialSummary?.billCount ?? 0,
          icon: ReceiptText,
          color: 'bg-blue-50 border-blue-200',
          iconColor: 'text-blue-600',
          href: '/orders',
        },
        {
          label: t('refundCount'),
          value: financialSummary?.refundCount ?? 0,
          icon: RotateCcw,
          color: 'bg-red-50 border-red-200',
          iconColor: 'text-red-600',
          href: '/orders',
        },
      ]
    : isToday
    ? [
        {
          label: t('runningOrders'),
          value: stats?.runningOrders ?? 0,
          icon: ChefHat,
          color: 'bg-blue-50 border-blue-200',
          iconColor: 'text-blue-600',
          href: '/orders',
        },
        {
          label: t('pendingOrders'),
          value: stats?.pendingOrders ?? 0,
          icon: Clock,
          color: 'bg-yellow-50 border-yellow-200',
          iconColor: 'text-yellow-600',
          href: '/orders',
        },
        ...(isRestaurant
          ? [{
              label: t('tablesOccupied'),
              value: stats?.tablesOccupied ?? 0,
              icon: LayoutGrid,
              color: 'bg-purple-50 border-purple-200',
              iconColor: 'text-purple-600',
              href: '/tables',
            }]
          : []),
      ]
    : [
        {
          label: t('orders'),
          value: daySummary?.orders.count ?? 0,
          icon: ChefHat,
          color: 'bg-blue-50 border-blue-200',
          iconColor: 'text-blue-600',
          href: '/orders',
        },
        {
          label: t('newCustomers'),
          value: daySummary?.customers.new ?? 0,
          icon: Clock,
          color: 'bg-yellow-50 border-yellow-200',
          iconColor: 'text-yellow-600',
          href: '/customers',
        },
      ];

  const financialTiles = periodMode !== 'day'
    ? [
        {
          label: t('grossCollections'),
          value: fmt(financialSummary?.grossCollected ?? 0),
          icon: Banknote,
          color: 'bg-emerald-50 border-emerald-200',
          iconColor: 'text-emerald-700',
          href: '/orders',
        },
        {
          label: t('refunds'),
          value: fmt(financialSummary?.refunded ?? 0),
          icon: RotateCcw,
          color: 'bg-red-50 border-red-200',
          iconColor: 'text-red-600',
          href: '/orders',
        },
      ]
    : [];

  const showYesterday = periodMode === 'day';
  const palomaKpis = [
    {
      label: t('kpiRevenue'),
      value: fmt(financialSummary?.netCollected ?? 0),
      yesterdayValue: showYesterday ? fmt(yesterdayFinancial?.netCollected ?? 0) : null,
      icon: Banknote,
      accentClass: 'bg-cyan-400',
    },
    {
      label: t('kpiReceipts'),
      value: String(financialSummary?.billCount ?? 0),
      yesterdayValue: showYesterday ? String(yesterdayFinancial?.billCount ?? 0) : null,
      icon: Receipt,
      accentClass: 'bg-orange-400',
    },
    {
      label: t('kpiAvgCheck'),
      value: fmt(financialSummary?.averageOrderValue ?? 0),
      yesterdayValue: showYesterday ? fmt(yesterdayFinancial?.averageOrderValue ?? 0) : null,
      icon: TrendingUp,
      accentClass: 'bg-emerald-400',
    },
    {
      label: t('kpiDiscount'),
      value: fmt(discountFromClose(dayClose)),
      yesterdayValue: showYesterday ? fmt(discountFromClose(yesterdayClose)) : null,
      icon: Percent,
      accentClass: 'bg-violet-400',
    },
    {
      label: t('kpiService'),
      value: fmt(dayClose?.header.serviceCharge ?? 0),
      yesterdayValue: showYesterday ? fmt(yesterdayClose?.header.serviceCharge ?? 0) : null,
      icon: ConciergeBell,
      accentClass: 'bg-teal-400',
    },
  ];

  const extraTiles = [
    ...financialTiles,
    ...dateScopedTiles,
    ...(periodMode === 'day' ? [{
      label: t('avgPrepTime'),
      value: insights?.avgPrepTimeMinutes != null ? t('minutesValue', { minutes: insights.avgPrepTimeMinutes }) : '—',
      icon: Timer,
      color: 'bg-orange-50 border-orange-200 dark:bg-orange-950/40 dark:border-orange-900',
      iconColor: 'text-orange-600',
      href: '/orders',
    }] : []),
  ];

  const periodLabel = periodMode === 'day'
    ? formatDate(calendarDateFromYmd(selectedDate), { day: 'numeric', month: 'long', year: 'numeric' })
    : periodMode === 'month'
      ? formatDate(calendarDateFromYmd(`${selectedMonth}-01`), { month: 'long', year: 'numeric' })
      : selectedYear;

  const paymentLabel = (method: string | null | undefined) => {
    const meta = PAYMENT_METHODS.find((m) => m.key === method);
    if (meta) return tPos(BUILT_IN_PAYMENT_KEYS[meta.key]);
    if (method === 'wallet') return tPos('methodWallet');
    return String(method || tCommon('unknown'));
  };

  const pct = (value: number) => t('sharePercent', { percent: value });

  const closeTitle = periodMode === 'day'
    ? t('dayCloseTitle')
    : t('periodCloseTitle', { period: periodLabel });
  const closePrintLabel = periodMode === 'day'
    ? t('dayClosePrint')
    : periodMode === 'month'
      ? t('monthClosePrint')
      : t('yearClosePrint');
  const closeEmptyLabel = periodMode === 'day'
    ? t('dayCloseEmpty')
    : periodMode === 'month'
      ? t('monthCloseEmpty')
      : t('yearCloseEmpty');

  const handlePrintDayClose = () => {
    if (!dayClose) return;
    const start = dayClose.startDate || range.startDate;
    const end = dayClose.endDate || range.endDate;
    const periodTime = { second: '2-digit' as const };
    const labels: DayClosePrintLabels = {
      title: tNav('dayCloseReport'),
      totalBills: t('totalBills'),
      orderItems: t('orderItems'),
      cancelledReceipts: t('cancelledReceipts'),
      cancelledAmount: t('cancelledAmount'),
      guests: t('guests'),
      transfers: t('transfers'),
      unlocks: t('unlocks'),
      paymentsReport: t('paymentsReport'),
      staffReport: t('staffReport'),
      departmentsReport: t('departmentsReport'),
      clientsReport: t('clientsReport'),
      colNo: t('colNo'),
      colPaymentType: t('colPaymentType'),
      colAmount: t('colAmount'),
      colStaff: t('colStaff'),
      colCount: t('colCount'),
      colService: t('colService'),
      colDepartment: t('colDepartment'),
      colClient: t('colClient'),
      colBills: t('colBills'),
      colOrders: t('colOrders'),
      colAmountNoDiscount: t('colAmountNoDiscount'),
      total: t('dayCloseTotal'),
      print: tCommon('print'),
    };
    printDayCloseReport(
      buildDayClosePrintInput(dayClose, {
        labels,
        formatAmount: fmt,
        paymentLabel,
        unknownName: tCommon('unknown'),
        uncategorizedName: t('uncategorized'),
        walkInName: t('walkIn'),
        periodFrom: t('dayClosePeriodFrom', { start: formatDateTime(dayClosePeriodStart(start), periodTime) }),
        periodTo: t('dayClosePeriodTo', { end: formatDateTime(dayClosePeriodEnd(end), periodTime) }),
        dateLabel: t('dayCloseDate'),
        dateValue: start === end
          ? formatDate(calendarDateFromYmd(start))
          : `${formatDate(calendarDateFromYmd(start))} – ${formatDate(calendarDateFromYmd(end))}`,
        outletLabel: t('dayCloseOutlet'),
        outletValue: dayClose.businessName || currentTenant?.business_name || '',
      }),
      t('dayClosePrintFailed'),
    );
  };

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex h-9 rounded-lg border border-border bg-card p-1" role="group" aria-label={t('periodView')}>
            {(['day', 'month', 'year'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setPeriodMode(mode)}
                className={`min-w-16 rounded-md px-3 text-sm font-medium transition-colors ${periodMode === mode ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'}`}
                aria-pressed={periodMode === mode}
              >
                {t(mode)}
              </button>
            ))}
          </div>
          {periodMode === 'day' ? (
            <input
              type="date"
              value={selectedDate}
              max={todayLocal}
              onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
              className="h-9 px-3 text-sm border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-brand/30"
              aria-label={t('selectDate')}
            />
          ) : periodMode === 'month' ? (
            <input
              type="month"
              value={selectedMonth}
              max={todayLocal.slice(0, 7)}
              onChange={(e) => e.target.value && setSelectedMonth(e.target.value)}
              className="h-9 px-3 text-sm border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-brand/30"
              aria-label={t('selectMonth')}
            />
          ) : (
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="h-9 px-3 text-sm border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-brand/30 bg-background"
              aria-label={t('selectYear')}
            >
              {Array.from({ length: Math.max(1, Number(todayLocal.slice(0, 4)) - 1999) }, (_, index) => {
                const year = String(Number(todayLocal.slice(0, 4)) - index);
                return <option key={year} value={year}>{year}</option>;
              })}
            </select>
          )}
          <button
            type="button"
            onClick={() => setRefreshNonce((n) => n + 1)}
            disabled={loading}
            className="h-9 inline-flex items-center gap-1.5 px-3 text-sm font-medium rounded-lg bg-brand text-white hover:opacity-90 disabled:opacity-50"
          >
            <RefreshCw size={14} />
            {t('refresh')}
          </button>
          <button
            type="button"
            onClick={handlePrintDayClose}
            disabled={!dayClose || loading}
            className="h-9 inline-flex items-center gap-1.5 px-3 text-sm font-medium rounded-lg border border-border bg-card text-foreground hover:bg-muted disabled:opacity-50"
          >
            <Printer size={14} />
            {closePrintLabel}
          </button>
        </div>
      </div>

      <h1 className="mb-4 text-xl font-semibold text-foreground">
        {isToday ? t('todaySales') : t('salesForDate', { date: periodLabel })}
        {isToday && (
          <span className="ms-2 text-sm font-normal text-muted-foreground">{periodLabel}</span>
        )}
      </h1>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-3 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-4">
            {palomaKpis.map((card) => (
              <WorkbenchKpiCard
                key={card.label}
                href="/orders"
                label={card.label}
                value={card.value}
                yesterdayLabel={t('yesterday')}
                yesterdayValue={card.yesterdayValue}
                icon={card.icon}
                accentClass={card.accentClass}
              />
            ))}
          </div>

          {extraTiles.length > 0 && (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              {extraTiles.map((tile) => (
                <Link
                  key={tile.label}
                  href={tile.href}
                  className={`rounded-xl border p-5 ${tile.color} transition-transform hover:-translate-y-0.5 hover:shadow-sm`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-muted-foreground">{tile.label}</span>
                    <tile.icon size={20} className={tile.iconColor} />
                  </div>
                  <p className="text-3xl font-bold text-foreground">
                    {tile.value}
                  </p>
                </Link>
              ))}
            </div>
          )}

          <section className="bg-card rounded-xl border border-border overflow-hidden mb-6">
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
                <h2 className="flex items-center gap-2 font-semibold text-foreground">
                  <ReceiptText size={16} className="text-gray-400" />
                  {closeTitle}
                </h2>
                <button
                  type="button"
                  onClick={handlePrintDayClose}
                  disabled={!dayClose}
                  className="h-8 inline-flex items-center gap-1.5 px-3 text-xs font-medium rounded-lg border border-border hover:bg-muted disabled:opacity-50"
                >
                  <Printer size={12} />
                  {closePrintLabel}
                </button>
              </div>
              {!dayClose || (dayClose.header.billCount === 0 && dayClose.header.cancelledReceiptCount === 0) ? (
                <p className="px-4 py-6 text-sm text-gray-400 text-center">{closeEmptyLabel}</p>
              ) : (
                <div className="p-4 space-y-5 overflow-x-auto">
                  <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div><dt className="text-muted-foreground">{t('totalBills')}</dt><dd className="font-semibold">{dayClose.header.billCount}</dd></div>
                    <div><dt className="text-muted-foreground">{t('orderItems')}</dt><dd className="font-semibold">{dayClose.header.orderItemCount}</dd></div>
                    <div><dt className="text-muted-foreground">{t('cancelledReceipts')}</dt><dd className="font-semibold">{dayClose.header.cancelledReceiptCount}</dd></div>
                    <div><dt className="text-muted-foreground">{t('cancelledItems')}</dt><dd className="font-semibold">{dayClose.header.cancelledItemCount}</dd></div>
                    <div><dt className="text-muted-foreground">{t('cancelledAmount')}</dt><dd className="font-semibold">{fmt(dayClose.header.cancelledAmount)}</dd></div>
                    <div><dt className="text-muted-foreground">{t('guests')}</dt><dd className="font-semibold">{dayClose.header.guestCount}</dd></div>
                    <div><dt className="text-muted-foreground">{t('transfers')}</dt><dd className="font-semibold">{dayClose.header.transfers}</dd></div>
                    <div><dt className="text-muted-foreground">{t('unlocks')}</dt><dd className="font-semibold">{dayClose.header.unlocks}</dd></div>
                  </dl>

                  <div>
                    <h3 className="text-sm font-semibold mb-2">{t('paymentsReport')}</h3>
                    <table className="w-full text-sm">
                      <thead><tr className="text-muted-foreground text-start">
                        <th className="py-1">{t('colPaymentType')}</th>
                        <th className="py-1 text-end">{t('colAmount')}</th>
                        <th className="py-1 text-end">{t('colPercent')}</th>
                      </tr></thead>
                      <tbody>
                        {dayClose.payments.map((row) => (
                          <tr key={row.method} className="border-t border-border">
                            <td className="py-1.5">{paymentLabel(row.method)}</td>
                            <td className="py-1.5 text-end">{fmt(row.amount)}</td>
                            <td className="py-1.5 text-end">{pct(row.sharePercent)}</td>
                          </tr>
                        ))}
                        <tr className="border-t border-foreground/40 font-semibold">
                          <td className="py-1.5">{t('dayCloseTotal')}</td>
                          <td className="py-1.5 text-end">{fmt(dayClose.paymentTotal)}</td>
                          <td />
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold mb-2">{t('staffReport')}</h3>
                    <table className="w-full text-sm">
                      <thead><tr className="text-muted-foreground text-start">
                        <th className="py-1">{t('colStaff')}</th>
                        <th className="py-1 text-end">{t('colCount')}</th>
                        <th className="py-1 text-end">{t('colService')}</th>
                        <th className="py-1 text-end">{t('colAmount')}</th>
                        <th className="py-1 text-end">{t('colPercent')}</th>
                      </tr></thead>
                      <tbody>
                        {dayClose.staff.map((row) => (
                          <tr key={row.userId ?? row.name} className="border-t border-border">
                            <td className="py-1.5">{row.name || tCommon('unknown')}</td>
                            <td className="py-1.5 text-end">{row.billCount}</td>
                            <td className="py-1.5 text-end">{fmt(row.serviceCharge)}</td>
                            <td className="py-1.5 text-end">{fmt(row.amount)}</td>
                            <td className="py-1.5 text-end">{pct(row.sharePercent)}</td>
                          </tr>
                        ))}
                        <tr className="border-t border-foreground/40 font-semibold">
                          <td className="py-1.5">{t('dayCloseTotal')}</td>
                          <td className="py-1.5 text-end">{dayClose.staffTotal.billCount}</td>
                          <td className="py-1.5 text-end">{fmt(dayClose.staffTotal.serviceCharge)}</td>
                          <td className="py-1.5 text-end">{fmt(dayClose.staffTotal.amount)}</td>
                          <td />
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold mb-2">{t('departmentsReport')}</h3>
                    <table className="w-full text-sm">
                      <thead><tr className="text-muted-foreground text-start">
                        <th className="py-1">{t('colDepartment')}</th>
                        <th className="py-1 text-end">{t('colCount')}</th>
                        <th className="py-1 text-end">{t('colService')}</th>
                        <th className="py-1 text-end">{t('colAmount')}</th>
                        <th className="py-1 text-end">{t('colPercent')}</th>
                      </tr></thead>
                      <tbody>
                        {dayClose.departments.map((row) => (
                          <tr key={row.categoryId ?? row.name} className="border-t border-border">
                            <td className="py-1.5">{row.name || t('uncategorized')}</td>
                            <td className="py-1.5 text-end">{row.quantity}</td>
                            <td className="py-1.5 text-end">{fmt(row.serviceCharge)}</td>
                            <td className="py-1.5 text-end">{fmt(row.amount)}</td>
                            <td className="py-1.5 text-end">{pct(row.sharePercent)}</td>
                          </tr>
                        ))}
                        <tr className="border-t border-foreground/40 font-semibold">
                          <td className="py-1.5">{t('dayCloseTotal')}</td>
                          <td className="py-1.5 text-end">{dayClose.departmentTotal.quantity}</td>
                          <td className="py-1.5 text-end">{fmt(dayClose.departmentTotal.serviceCharge)}</td>
                          <td className="py-1.5 text-end">{fmt(dayClose.departmentTotal.amount)}</td>
                          <td />
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold mb-2">{t('clientsReport')}</h3>
                    <table className="w-full text-sm">
                      <thead><tr className="text-muted-foreground text-start">
                        <th className="py-1">{t('colClient')}</th>
                        <th className="py-1 text-end">{t('colBills')}</th>
                        <th className="py-1 text-end">{t('colOrders')}</th>
                        <th className="py-1 text-end">{t('colAmount')}</th>
                        <th className="py-1 text-end">{t('colPercent')}</th>
                      </tr></thead>
                      <tbody>
                        {dayClose.clients.map((row) => (
                          <tr key={row.customerId ?? 'walk-in'} className="border-t border-border">
                            <td className="py-1.5">{row.name || t('walkIn')}</td>
                            <td className="py-1.5 text-end">{row.billCount}</td>
                            <td className="py-1.5 text-end">{row.itemCount}</td>
                            <td className="py-1.5 text-end">{fmt(row.amount)}</td>
                            <td className="py-1.5 text-end">{pct(row.sharePercent)}</td>
                          </tr>
                        ))}
                        <tr className="border-t border-foreground/40 font-semibold">
                          <td className="py-1.5">{t('dayCloseTotal')}</td>
                          <td className="py-1.5 text-end">{dayClose.clientTotal.billCount}</td>
                          <td className="py-1.5 text-end">{dayClose.clientTotal.itemCount}</td>
                          <td className="py-1.5 text-end">{fmt(dayClose.clientTotal.amount)}</td>
                          <td />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Recent Orders */}
            <div className="bg-card rounded-xl border border-border dark:border-border overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border dark:border-border">
                <h2 className="flex items-center gap-2 font-semibold text-foreground">
                  <ClipboardList size={16} className="text-gray-400" />
                  {isToday ? t('recentOrders') : periodMode === 'year' ? t('yearOrders') : periodMode === 'month' ? t('monthOrders') : t('orders')}
                </h2>
                <Link href="/orders" className="flex items-center gap-1 text-xs text-brand hover:text-brand-hover font-medium">
                  {t('viewAll')} <ArrowRight size={12} className="rtl-flip" />
                </Link>
              </div>
              {recentOrders.length === 0 ? (
                <p className="px-4 py-6 text-sm text-gray-400 text-center">{t('noOrdersYet')}</p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {recentOrders.map((order) => (
                    <Link
                      key={order.id}
                      href="/orders"
                      className="flex items-center justify-between px-4 py-2.5 hover:bg-muted transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">#<Ltr>{order.order_number}</Ltr></span>
                          <span className={`text-xs font-medium ${orderStatusColor[order.status] || 'text-muted-foreground'}`}>
                            {(() => { const k = (ORDER_STATUS_LABEL_KEYS as Record<string, OrdersKey | undefined>)[order.status]; return k ? tOrders(k) : order.status; })()}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 truncate">
                          {order.customer_name || order.table_name || t('walkIn')}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-foreground shrink-0">
                        {fmt(Number(order.total))}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Top Products Today */}
            <div className="bg-card rounded-xl border border-border dark:border-border overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border dark:border-border">
                <h2 className="flex items-center gap-2 font-semibold text-foreground">
                  <TrendingUp size={16} className="text-gray-400" />
                  {periodMode === 'year' ? t('topProductsYear') : periodMode === 'month' ? t('topProductsMonth') : isToday ? t('topProductsToday') : t('topProducts')}
                </h2>
                <Link href="/products" className="flex items-center gap-1 text-xs text-brand hover:text-brand-hover font-medium">
                  {t('viewAll')} <ArrowRight size={12} className="rtl-flip" />
                </Link>
              </div>
              {topProducts.length === 0 ? (
                <p className="px-4 py-6 text-sm text-gray-400 text-center">{t('noSalesYet')}</p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {topProducts.map((product) => (
                    <div key={product.product_id} className="flex items-center justify-between px-4 py-2.5">
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-foreground">{product.product_name}</span>
                        <p className="text-xs text-gray-400">{t('productSoldOrders', { quantity: product.total_quantity, orders: product.order_count })}</p>
                      </div>
                      <span className="text-sm font-semibold text-foreground shrink-0">
                        {fmt(Number(product.total_revenue))}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            {/* Top Staff */}
            <div className="bg-card rounded-xl border border-border dark:border-border overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border dark:border-border">
                <h2 className="flex items-center gap-2 font-semibold text-foreground">
                  <Trophy size={16} className="text-gray-400" />
                  {t('topStaff')}
                </h2>
                <Link href="/staff" className="flex items-center gap-1 text-xs text-brand hover:text-brand-hover font-medium">
                  {t('viewAll')} <ArrowRight size={12} className="rtl-flip" />
                </Link>
              </div>
              {(insights?.topStaff.length ?? 0) === 0 ? (
                <p className="px-4 py-6 text-sm text-gray-400 text-center">{t('noSalesYet')}</p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {insights!.topStaff.map((staff) => (
                    <div key={staff.user_id} className="flex items-center justify-between px-4 py-2.5">
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-foreground">{staff.name}</span>
                        <p className="text-xs text-gray-400">{t('staffOrderCount', { orders: staff.orderCount })}</p>
                      </div>
                      <span className="text-sm font-semibold text-foreground shrink-0">
                        {fmt(Number(staff.revenue))}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Top Categories */}
            <div className="bg-card rounded-xl border border-border dark:border-border overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border dark:border-border">
                <h2 className="flex items-center gap-2 font-semibold text-foreground">
                  <Tags size={16} className="text-gray-400" />
                  {t('topCategories')}
                </h2>
              </div>
              {(insights?.topCategories.length ?? 0) === 0 ? (
                <p className="px-4 py-6 text-sm text-gray-400 text-center">{t('noSalesYet')}</p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {insights!.topCategories.map((category) => (
                    <div key={category.category_id ?? category.name} className="flex items-center justify-between px-4 py-2.5">
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-foreground">{category.name}</span>
                        <p className="text-xs text-gray-400">{t('categoryQuantitySold', { quantity: category.quantity })}</p>
                      </div>
                      <span className="text-sm font-semibold text-foreground shrink-0">
                        {fmt(Number(category.revenue))}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {periodMode !== 'day' && (
            <section className="bg-card rounded-lg border border-border mt-4 overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
                <div>
                  <h2 className="flex items-center gap-2 font-semibold text-foreground">
                    <RotateCcw size={16} className="text-red-500" />
                    {t('refundActivity')}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">{t('refundActivityHint')}</p>
                </div>
                <span className="text-sm font-semibold text-red-600">{fmt(financialSummary?.refunded ?? 0)}</span>
              </div>
              {(financialSummary?.refunds.length ?? 0) === 0 ? (
                <p className="px-4 py-8 text-sm text-gray-400 text-center">{t('noRefunds')}</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {financialSummary!.refunds.map((refund) => (
                    <div key={refund.id} className="grid grid-cols-1 gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="text-sm font-semibold text-foreground">
                            {t('refundReference', { bill: refund.bill_number, order: refund.order_number })}
                          </span>
                          <span className="text-xs text-muted-foreground">{refund.method}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t('refundApproved', { name: refund.approved_by_name })}
                          {' · '}
                          {t('refundedAt', { date: formatDateTime(refund.created_at) })}
                          {' · '}
                          {t('collectedAt', { date: formatDateTime(refund.paid_at) })}
                        </p>
                        {refund.reason && <p className="mt-1 text-xs text-muted-foreground truncate">{refund.reason}</p>}
                      </div>
                      <span className="text-base font-bold text-red-600 sm:text-end">{fmt(-Number(refund.amount))}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Payment Methods */}
          <div className="bg-card rounded-xl border border-border dark:border-border p-4 mt-4">
            <div className="flex items-center gap-2 mb-4">
              <Wallet size={16} className="text-gray-400" />
              <h2 className="font-semibold text-foreground">{t('paymentMethods')}</h2>
            </div>
            {paymentMethods.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">{t('noPaymentsYet')}</p>
            ) : (
              <div className="space-y-3">
                {paymentMethods.map((pm) => {
                  const meta = PAYMENT_METHODS.find((m) => m.key === pm.method);
                  const Icon = meta?.icon ?? Wallet;
                  const label = meta ? tPos(BUILT_IN_PAYMENT_KEYS[meta.key]) : pm.method === 'wallet' ? tPos('methodWallet') : String(pm.method || tCommon('unknown'));
                  const percent = paymentMethodsTotal > 0
                    ? Math.max(0, Math.min(100, Math.round((Number(pm.total) / paymentMethodsTotal) * 100)))
                    : 0;
                  return (
                    <div key={pm.method ?? 'unknown'}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <Icon size={14} className="text-gray-400" />
                          <span className="text-sm font-medium text-foreground">{label}</span>
                        </div>
                        <span className="text-sm font-semibold text-foreground">{fmt(Number(pm.total))}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-brand rounded-full" style={{ width: `${percent}%` }} />
                        </div>
                        <span className="text-xs text-gray-400 shrink-0">
                          {t('paymentMethodCount', { count: pm.count, percent })}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Business Patterns */}
          <div className="bg-card rounded-xl border border-border dark:border-border p-4 mt-4">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 size={16} className="text-gray-400" />
              <h2 className="font-semibold text-foreground">{t('businessPatterns')}</h2>
            </div>
            <p className="text-xs text-gray-400 mb-4">
              {t('businessPatternsHint', { days: insights?.windowDays ?? 30 })}
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t('busiestHour')}</p>
                <p className="text-lg font-bold text-foreground">
                  {insights?.busiestHour ? formatHourLabel(insights.busiestHour.hour, locale) : t('notEnoughData')}
                </p>
                {insights?.busiestHour && (
                  <p className="text-xs text-gray-400">{t('ordersCount', { count: insights.busiestHour.orderCount })}</p>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t('idlestHour')}</p>
                <p className="text-lg font-bold text-foreground">
                  {insights?.idlestHour ? formatHourLabel(insights.idlestHour.hour, locale) : t('notEnoughData')}
                </p>
                {insights?.idlestHour && (
                  <p className="text-xs text-gray-400">{t('ordersCount', { count: insights.idlestHour.orderCount })}</p>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t('busiestDay')}</p>
                <p className="text-lg font-bold text-foreground">
                  {insights?.busiestDayOfWeek ? formatWeekdayLabel(insights.busiestDayOfWeek.dayIndex, locale) : t('notEnoughData')}
                </p>
                {insights?.busiestDayOfWeek && (
                  <p className="text-xs text-gray-400">{t('ordersCount', { count: insights.busiestDayOfWeek.orderCount })}</p>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t('idlestDay')}</p>
                <p className="text-lg font-bold text-foreground">
                  {insights?.idlestDayOfWeek ? formatWeekdayLabel(insights.idlestDayOfWeek.dayIndex, locale) : t('notEnoughData')}
                </p>
                {insights?.idlestDayOfWeek && (
                  <p className="text-xs text-gray-400">{t('ordersCount', { count: insights.idlestDayOfWeek.orderCount })}</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
