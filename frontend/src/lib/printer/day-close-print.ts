/**
 * Browser print for the day-close / period-close (Z-report) receipt.
 * Thermal-width HTML aligned to a Paloma-style итоговый отчёт: period header,
 * left/right stats, then numbered payment / staff / department / client tables.
 * Guest bills use web-print.ts / receipt-encoder — do not restyle those here.
 */

import toast from 'react-hot-toast';
import { escapeHtml } from './web-print';
import { RECEIPT_BRANDING_NAME, RECEIPT_BRANDING_URL } from './branding';

export type DayClosePrintRow = {
  name: string;
  count?: string;
  service?: string;
  amount: string;
  extra?: string;
};

export type DayClosePrintLabels = {
  title: string;
  totalBills: string;
  orderItems: string;
  cancelledReceipts: string;
  cancelledAmount: string;
  guests: string;
  transfers: string;
  unlocks: string;
  paymentsReport: string;
  staffReport: string;
  departmentsReport: string;
  clientsReport: string;
  colNo: string;
  colPaymentType: string;
  colAmount: string;
  colStaff: string;
  colCount: string;
  colService: string;
  colDepartment: string;
  colClient: string;
  colBills: string;
  colOrders: string;
  colAmountNoDiscount: string;
  total: string;
  print: string;
};

export type DayClosePrintInput = {
  periodFrom: string;
  periodTo: string;
  dateLabel?: string;
  dateValue?: string;
  outletLabel?: string;
  outletValue?: string;
  header: {
    billCount: string;
    orderItemCount: string;
    cancelledReceiptCount: string;
    cancelledAmount: string;
    guestCount: string;
    transfers: string;
    unlocks: string;
  };
  payments: DayClosePrintRow[];
  paymentTotal: string;
  staff: DayClosePrintRow[];
  staffTotal: DayClosePrintRow;
  departments: DayClosePrintRow[];
  departmentTotal: DayClosePrintRow;
  clients: Array<DayClosePrintRow & { bills: string; orders: string; amountNoDiscount: string }>;
  clientTotal: { bills: string; orders: string; amount: string; amountNoDiscount: string };
  labels: DayClosePrintLabels;
};

export type DayClosePrintReport = {
  businessName: string;
  startDate: string;
  endDate: string;
  header: {
    billCount: number;
    orderItemCount: number;
    cancelledReceiptCount: number;
    cancelledAmount: number;
    guestCount: number;
    transfers: number;
    unlocks: number;
  };
  payments: Array<{ method: string; amount: number }>;
  paymentTotal: number;
  staff: Array<{ name: string | null; billCount: number; serviceCharge: number; amount: number }>;
  staffTotal: { billCount: number; serviceCharge: number; amount: number };
  departments: Array<{ name: string | null; quantity: number; serviceCharge: number; amount: number }>;
  departmentTotal: { quantity: number; serviceCharge: number; amount: number };
  clients: Array<{
    name: string | null;
    billCount: number;
    itemCount: number;
    amount: number;
    amountBeforeDiscount: number;
  }>;
  clientTotal: { billCount: number; itemCount: number; amount: number; amountBeforeDiscount: number };
};

export type DayClosePrintContext = {
  labels: DayClosePrintLabels;
  formatAmount: (value: number) => string;
  paymentLabel: (method: string) => string;
  unknownName: string;
  uncategorizedName: string;
  walkInName: string;
  periodFrom: string;
  periodTo: string;
  dateLabel: string;
  dateValue: string;
  outletLabel: string;
  outletValue: string;
};

/** Local calendar start of the selected report day (00:00:00). */
export function dayClosePeriodStart(ymd: string): Date {
  const [year, month, day] = ymd.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0);
}

/** Local calendar end of the selected report day (23:59:59). */
export function dayClosePeriodEnd(ymd: string): Date {
  const [year, month, day] = ymd.split('-').map(Number);
  return new Date(year, month - 1, day, 23, 59, 59);
}

export function buildDayClosePrintInput(
  report: DayClosePrintReport,
  ctx: DayClosePrintContext,
): DayClosePrintInput {
  const { labels: L } = ctx;
  return {
    periodFrom: ctx.periodFrom,
    periodTo: ctx.periodTo,
    dateLabel: ctx.dateLabel,
    dateValue: ctx.dateValue,
    outletLabel: ctx.outletLabel,
    outletValue: ctx.outletValue || report.businessName,
    header: {
      billCount: String(report.header.billCount),
      orderItemCount: String(report.header.orderItemCount),
      cancelledReceiptCount: String(report.header.cancelledReceiptCount),
      cancelledAmount: ctx.formatAmount(report.header.cancelledAmount),
      guestCount: String(report.header.guestCount),
      transfers: String(report.header.transfers),
      unlocks: String(report.header.unlocks),
    },
    payments: report.payments.map((row) => ({
      name: ctx.paymentLabel(row.method),
      amount: ctx.formatAmount(row.amount),
    })),
    paymentTotal: ctx.formatAmount(report.paymentTotal),
    staff: report.staff.map((row) => ({
      name: row.name || ctx.unknownName,
      count: String(row.billCount),
      service: ctx.formatAmount(row.serviceCharge),
      amount: ctx.formatAmount(row.amount),
    })),
    staffTotal: {
      name: L.total,
      count: String(report.staffTotal.billCount),
      service: ctx.formatAmount(report.staffTotal.serviceCharge),
      amount: ctx.formatAmount(report.staffTotal.amount),
    },
    departments: report.departments.map((row) => ({
      name: row.name || ctx.uncategorizedName,
      count: String(row.quantity),
      service: ctx.formatAmount(row.serviceCharge),
      amount: ctx.formatAmount(row.amount),
    })),
    departmentTotal: {
      name: L.total,
      count: String(report.departmentTotal.quantity),
      service: ctx.formatAmount(report.departmentTotal.serviceCharge),
      amount: ctx.formatAmount(report.departmentTotal.amount),
    },
    clients: report.clients.map((row) => ({
      name: row.name || ctx.walkInName,
      amount: ctx.formatAmount(row.amount),
      bills: String(row.billCount),
      orders: String(row.itemCount),
      amountNoDiscount: ctx.formatAmount(row.amountBeforeDiscount),
    })),
    clientTotal: {
      bills: String(report.clientTotal.billCount),
      orders: String(report.clientTotal.itemCount),
      amount: ctx.formatAmount(report.clientTotal.amount),
      amountNoDiscount: ctx.formatAmount(report.clientTotal.amountBeforeDiscount),
    },
    labels: L,
  };
}

export function generateDayCloseHtml(input: DayClosePrintInput): string {
  const { labels: L } = input;
  const kv = (label: string, value: string) => `
    <tr>
      <td>${escapeHtml(label)}</td>
      <td class="num">${escapeHtml(value)}</td>
    </tr>`;

  const numbered = (rows: DayClosePrintRow[], cells: (row: DayClosePrintRow, i: number) => string) =>
    rows.map((row, i) => `<tr><td class="num">${i + 1}</td>${cells(row, i)}</tr>`).join('');

  const dateRow = input.dateValue ? kv(input.dateLabel || '', input.dateValue) : '';
  const outletRow = input.outletValue ? kv(input.outletLabel || '', input.outletValue) : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(L.title)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: ui-monospace, 'Cascadia Mono', 'Segoe UI', Tahoma, sans-serif; font-size: 12px; color: #111; }
    .sheet { max-width: 80mm; margin: 0 auto; padding: 8px; }
    h1 { font-size: 15px; text-align: center; margin-bottom: 6px; }
    .meta { text-align: center; margin-bottom: 2px; font-size: 11px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
    th, td { padding: 2px 0; vertical-align: top; }
    th { font-size: 10px; text-align: start; border-bottom: 1px solid #111; }
    .section { font-weight: bold; text-align: center; margin: 10px 0 4px; border-top: 1px dashed #111; padding-top: 8px; }
    .num { text-align: end; unicode-bidi: isolate; white-space: nowrap; }
    .total td { border-top: 1px solid #111; font-weight: bold; }
    .kv td:last-child { text-align: end; }
    .footer { text-align: center; margin-top: 12px; font-size: 10px; color: #555; }
    @media print {
      .no-print { display: none !important; }
      body { margin: 0; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <h1>${escapeHtml(L.title)}</h1>
    <p class="meta">${escapeHtml(input.periodFrom)}</p>
    <p class="meta">${escapeHtml(input.periodTo)}</p>
    <table class="kv">
      ${dateRow}
      ${outletRow}
      ${kv(L.totalBills, input.header.billCount)}
      ${kv(L.orderItems, input.header.orderItemCount)}
      ${kv(L.cancelledReceipts, input.header.cancelledReceiptCount)}
      ${kv(L.cancelledAmount, input.header.cancelledAmount)}
      ${kv(L.guests, input.header.guestCount)}
      ${kv(L.transfers, input.header.transfers)}
      ${kv(L.unlocks, input.header.unlocks)}
    </table>

    <p class="section">${escapeHtml(L.paymentsReport)}</p>
    <table>
      <thead><tr><th>${escapeHtml(L.colNo)}</th><th>${escapeHtml(L.colPaymentType)}</th><th class="num">${escapeHtml(L.colAmount)}</th></tr></thead>
      <tbody>
        ${numbered(input.payments, (row) => `<td>${escapeHtml(row.name)}</td><td class="num">${escapeHtml(row.amount)}</td>`)}
        <tr class="total"><td></td><td>${escapeHtml(L.total)}</td><td class="num">${escapeHtml(input.paymentTotal)}</td></tr>
      </tbody>
    </table>

    <p class="section">${escapeHtml(L.staffReport)}</p>
    <table>
      <thead><tr><th>${escapeHtml(L.colNo)}</th><th>${escapeHtml(L.colStaff)}</th><th class="num">${escapeHtml(L.colCount)}</th><th class="num">${escapeHtml(L.colService)}</th><th class="num">${escapeHtml(L.colAmount)}</th></tr></thead>
      <tbody>
        ${numbered(input.staff, (row) => `<td>${escapeHtml(row.name)}</td><td class="num">${escapeHtml(row.count ?? '')}</td><td class="num">${escapeHtml(row.service ?? '')}</td><td class="num">${escapeHtml(row.amount)}</td>`)}
        <tr class="total"><td></td><td>${escapeHtml(L.total)}</td><td class="num">${escapeHtml(input.staffTotal.count ?? '')}</td><td class="num">${escapeHtml(input.staffTotal.service ?? '')}</td><td class="num">${escapeHtml(input.staffTotal.amount)}</td></tr>
      </tbody>
    </table>

    <p class="section">${escapeHtml(L.departmentsReport)}</p>
    <table>
      <thead><tr><th>${escapeHtml(L.colNo)}</th><th>${escapeHtml(L.colDepartment)}</th><th class="num">${escapeHtml(L.colCount)}</th><th class="num">${escapeHtml(L.colService)}</th><th class="num">${escapeHtml(L.colAmount)}</th></tr></thead>
      <tbody>
        ${numbered(input.departments, (row) => `<td>${escapeHtml(row.name)}</td><td class="num">${escapeHtml(row.count ?? '')}</td><td class="num">${escapeHtml(row.service ?? '')}</td><td class="num">${escapeHtml(row.amount)}</td>`)}
        <tr class="total"><td></td><td>${escapeHtml(L.total)}</td><td class="num">${escapeHtml(input.departmentTotal.count ?? '')}</td><td class="num">${escapeHtml(input.departmentTotal.service ?? '')}</td><td class="num">${escapeHtml(input.departmentTotal.amount)}</td></tr>
      </tbody>
    </table>

    <p class="section">${escapeHtml(L.clientsReport)}</p>
    <table>
      <thead><tr><th>${escapeHtml(L.colNo)}</th><th>${escapeHtml(L.colClient)}</th><th class="num">${escapeHtml(L.colBills)}</th><th class="num">${escapeHtml(L.colOrders)}</th><th class="num">${escapeHtml(L.colAmount)}</th><th class="num">${escapeHtml(L.colAmountNoDiscount)}</th></tr></thead>
      <tbody>
        ${input.clients.map((row, i) => `<tr><td class="num">${i + 1}</td><td>${escapeHtml(row.name)}</td><td class="num">${escapeHtml(row.bills)}</td><td class="num">${escapeHtml(row.orders)}</td><td class="num">${escapeHtml(row.amount)}</td><td class="num">${escapeHtml(row.amountNoDiscount)}</td></tr>`).join('')}
        <tr class="total"><td></td><td>${escapeHtml(L.total)}</td><td class="num">${escapeHtml(input.clientTotal.bills)}</td><td class="num">${escapeHtml(input.clientTotal.orders)}</td><td class="num">${escapeHtml(input.clientTotal.amount)}</td><td class="num">${escapeHtml(input.clientTotal.amountNoDiscount)}</td></tr>
      </tbody>
    </table>

    <p class="footer">${escapeHtml(RECEIPT_BRANDING_NAME)}${RECEIPT_BRANDING_URL ? `<br>${escapeHtml(RECEIPT_BRANDING_URL)}` : ''}</p>
  </div>
  <div class="no-print" style="text-align:center;margin-top:16px;">
    <button onclick="window.print()" style="padding:10px 20px;font-size:16px;cursor:pointer;">${escapeHtml(L.print)}</button>
  </div>
</body>
</html>`;
}

export function printDayCloseReport(input: DayClosePrintInput, failedMessage: string): void {
  const printWindow = typeof window !== 'undefined' ? window.open('', '_blank', 'width=480,height=720') : null;
  if (!printWindow) {
    toast.error(failedMessage);
    return;
  }
  const html = generateDayCloseHtml(input);
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  const trigger = () => {
    try {
      printWindow.focus();
      printWindow.print();
    } catch {
      toast.error(failedMessage);
    }
  };
  if (printWindow.document.readyState === 'complete') {
    trigger();
  } else {
    printWindow.onload = trigger;
  }
}
