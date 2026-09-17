'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useFormatCurrency } from '@/hooks/useFormatCurrency';
import { useFormatDate } from '@/hooks/useFormatDate';
import { ROLE_ACCESS, hasRole } from '@shared/role-permissions';
import { getLandingPage } from '@/components/layout/AuthGuard';
import { useTranslations } from 'use-intl';
import ReportShell from '@/components/reports/ReportShell';
import { getLocalDateString } from '@/lib/report-dates';
import {
  buildDayClosePrintInput,
  dayClosePeriodEnd,
  dayClosePeriodStart,
  printDayCloseReport,
  type DayClosePrintLabels,
} from '@/lib/printer/day-close-print';

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
  };
  payments: Array<{ method: string; count: number; amount: number; sharePercent: number }>;
  paymentTotal: number;
  staff: Array<{ userId: string | null; name: string | null; billCount: number; itemCount: number; serviceCharge: number; amount: number; sharePercent: number }>;
  staffTotal: { billCount: number; itemCount: number; serviceCharge: number; amount: number };
  departments: Array<{ categoryId: string | null; name: string | null; quantity: number; serviceCharge: number; amount: number; sharePercent: number }>;
  departmentTotal: { quantity: number; serviceCharge: number; amount: number };
  clients: Array<{ customerId: string | null; name: string | null; billCount: number; itemCount: number; amount: number; amountBeforeDiscount: number; sharePercent: number }>;
  clientTotal: { billCount: number; itemCount: number; amount: number; amountBeforeDiscount: number };
}

export default function DayCloseReportPage() {
  const { currentTenant } = useAuthStore();
  const router = useRouter();
  const tDash = useTranslations('dashboard');
  const tNav = useTranslations('nav');
  const tCommon = useTranslations('common');
  const tPos = useTranslations('pos');
  const fmt = useFormatCurrency();
  const { formatDate, formatDateTime } = useFormatDate();
  const allowed = hasRole(currentTenant?.role, ROLE_ACCESS.ownerManager);
  const timeZone = currentTenant?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = getLocalDateString(new Date(), timeZone);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<DayCloseReport | null>(null);

  useEffect(() => {
    if (currentTenant && !allowed) router.replace(getLandingPage(currentTenant.role, currentTenant.business_type));
  }, [currentTenant, allowed, router]);

  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    setLoading(true);
    api.get('/reports/day-close', {
      params: startDate === endDate
        ? { date: endDate }
        : { start_date: startDate, end_date: endDate },
      signal: controller.signal,
    })
      .then((res) => setReport(res.data.report ?? null))
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
  const pct = (value: number) => tDash('sharePercent', { percent: value });

  const closePrintLabel = startDate === endDate ? tDash('dayClosePrint') : tDash('periodClosePrint');
  const closeEmptyLabel = startDate === endDate ? tDash('dayCloseEmpty') : tDash('periodCloseEmpty');

  const handlePrint = () => {
    if (!report) return;
    const periodTime = { second: '2-digit' as const };
    const labels: DayClosePrintLabels = {
      title: tNav('dayCloseReport'),
      totalBills: tDash('totalBills'),
      orderItems: tDash('orderItems'),
      cancelledReceipts: tDash('cancelledReceipts'),
      cancelledAmount: tDash('cancelledAmount'),
      guests: tDash('guests'),
      transfers: tDash('transfers'),
      unlocks: tDash('unlocks'),
      paymentsReport: tDash('paymentsReport'),
      staffReport: tDash('staffReport'),
      departmentsReport: tDash('departmentsReport'),
      clientsReport: tDash('clientsReport'),
      colNo: tDash('colNo'),
      colPaymentType: tDash('colPaymentType'),
      colAmount: tDash('colAmount'),
      colStaff: tDash('colStaff'),
      colCount: tDash('colCount'),
      colService: tDash('colService'),
      colDepartment: tDash('colDepartment'),
      colClient: tDash('colClient'),
      colBills: tDash('colBills'),
      colOrders: tDash('colOrders'),
      colAmountNoDiscount: tDash('colAmountNoDiscount'),
      total: tDash('dayCloseTotal'),
      print: tCommon('print'),
    };
    printDayCloseReport(
      buildDayClosePrintInput(report, {
        labels,
        formatAmount: fmt,
        paymentLabel,
        unknownName: tCommon('unknown'),
        uncategorizedName: tDash('uncategorized'),
        walkInName: tDash('walkIn'),
        periodFrom: tDash('dayClosePeriodFrom', { start: formatDateTime(dayClosePeriodStart(startDate), periodTime) }),
        periodTo: tDash('dayClosePeriodTo', { end: formatDateTime(dayClosePeriodEnd(endDate), periodTime) }),
        dateLabel: tDash('dayCloseDate'),
        dateValue: startDate === endDate
          ? formatDate(dayClosePeriodStart(startDate))
          : `${formatDate(dayClosePeriodStart(startDate))} – ${formatDate(dayClosePeriodStart(endDate))}`,
        outletLabel: tDash('dayCloseOutlet'),
        outletValue: report.businessName || currentTenant?.business_name || '',
      }),
      tDash('dayClosePrintFailed'),
    );
  };

  const empty = !report || (report.header.billCount === 0 && report.header.cancelledReceiptCount === 0);

  return (
    <ReportShell
      title={tNav('dayCloseReport')}
      startDate={startDate}
      endDate={endDate}
      maxDate={today}
      onStartDate={setStartDate}
      onEndDate={setEndDate}
      startLabel={tDash('selectDate')}
      endLabel={tDash('selectDate')}
      extra={(
        <button
          type="button"
          onClick={handlePrint}
          disabled={!report || loading || empty}
          className="h-9 inline-flex items-center gap-1.5 px-3 text-sm font-medium rounded-lg border border-border bg-card text-foreground hover:bg-muted disabled:opacity-50"
        >
          <Printer size={14} />
          {closePrintLabel}
        </button>
      )}
      loading={loading}
    >
      {empty ? (
        <p className="text-sm text-muted-foreground">{closeEmptyLabel}</p>
      ) : (
        <div className="space-y-6">
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div><dt className="text-muted-foreground">{tDash('totalBills')}</dt><dd className="font-semibold">{report!.header.billCount}</dd></div>
            <div><dt className="text-muted-foreground">{tDash('orderItems')}</dt><dd className="font-semibold">{report!.header.orderItemCount}</dd></div>
            <div><dt className="text-muted-foreground">{tDash('cancelledReceipts')}</dt><dd className="font-semibold">{report!.header.cancelledReceiptCount}</dd></div>
            <div><dt className="text-muted-foreground">{tDash('guests')}</dt><dd className="font-semibold">{report!.header.guestCount}</dd></div>
          </dl>
          <section className="rounded-xl border border-border bg-card overflow-hidden">
            <h2 className="px-4 py-3 font-semibold border-b border-border">{tDash('paymentsReport')}</h2>
            <table className="w-full text-sm">
              <tbody>
                {report!.payments.map((row) => (
                  <tr key={row.method} className="border-b border-border last:border-0">
                    <td className="px-4 py-2">{paymentLabel(row.method)}</td>
                    <td className="px-4 py-2 text-end">{fmt(row.amount)}</td>
                    <td className="px-4 py-2 text-end">{pct(row.sharePercent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="rounded-xl border border-border bg-card overflow-hidden">
            <h2 className="px-4 py-3 font-semibold border-b border-border">{tDash('staffReport')}</h2>
            <table className="w-full text-sm">
              <tbody>
                {report!.staff.map((row) => (
                  <tr key={row.userId ?? row.name} className="border-b border-border last:border-0">
                    <td className="px-4 py-2">{row.name || tCommon('unknown')}</td>
                    <td className="px-4 py-2 text-end">{fmt(row.amount)}</td>
                    <td className="px-4 py-2 text-end">{pct(row.sharePercent)}</td>
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
