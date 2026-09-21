/**
 * web-print.ts
 *
 * Thermal-width bill printing using the browser's native print dialog —
 * the fallback path for merchants without an ESC/POS hardware printer.
 * Generates HTML that can be printed silently or shown to user.
 *
 * Since #444 (epic #438) the HTML is rendered from the shared,
 * renderer-independent PrintDocument: raw bill fields are normalized once in
 * `print-document.ts`, and this renderer only walks document blocks.
 * Labels arrive resolved inside the document / via the injected catalog
 * resolver; bidi isolation (`dir`, LTR islands) is driven by the kernel
 * DirectionSpec annotations instead of ad-hoc language checks.
 *
 * Browser receipts are full HTML, not raw ESC/POS bytes, so they never apply
 * the ASCII currency fallback or `ریال → IRR` downgrade used by the thermal
 * encoders. They follow the tenant's locale preferences (currency display,
 * digit mode, calendar) and the resolved receipt language policy, and render RTL with
 * isolated LTR islands for Persian (fa).
 */

import type { Bill, Tenant } from '@/lib/types';
import toast from 'react-hot-toast';
import {
  getCountryByCode,
  formatCurrencyForTenant,
  formatNumberForTenant,
  formatDateForTenant,
  resolveDisplayCurrency,
} from '@/lib/countries';
import { parseDbTimestamp } from '@/lib/utils';
import { loadLocaleMessages } from '@/lib/i18n/loader';
import {
  buildFrontendBillDocument,
  ensurePrintLanguagesLoaded,
  printLabelResolver,
  resolveBillPrintLanguages,
} from './print-document';
import { RECEIPT_BRANDING_NAME, RECEIPT_BRANDING_URL } from './branding';
import { LANGUAGES, type Language } from '@/lib/i18n/languages';
import {
  getBlock,
  type BusinessHeaderBlock,
  type CustomerBlock,
  type DirectionalText,
  type DocumentMetaBlock,
  type ItemTableBlock,
  type MessageBlock,
  type PaymentsBlock,
  type TaxBreakdownBlock,
  type TotalsBlock,
} from '@print/document';
import type { ResolvedPrintLanguages, TextDirection } from '@print/types';

export type PaperSize = 'thermal58' | 'thermal80';

/** The slice of a tenant a browser receipt needs to render locale-correctly. */
export type ReceiptTenant = Pick<
  Tenant,
  'business_name' | 'currency' | 'country' | 'timezone' | 'currency_display' | 'number_digits' | 'calendar'
>;

/** Encodes HTML entity characters so database-sourced values can't inject markup/scripts into the bill print window. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render one kernel-annotated value. Confident LTR tokens (phones, invoice
 * numbers, tax IDs) are wrapped in a bidi-isolated nowrap span so they never
 * wrap mid-token on a 58mm ticket — including LTR receipts such as Russian.
 */
function directionalValue(value: DirectionalText | null, _base: TextDirection): string {
  if (!value) return '';
  if (value.direction === 'ltr') {
    return `<span class="ltr" dir="ltr">${escapeHtml(value.text)}</span>`;
  }
  return escapeHtml(value.text);
}

export interface WebPrintOptions {
  paperSize?: PaperSize;
  includeTaxId?: boolean;
  taxRegistrationNumber?: string;
  address?: string;
  phone?: string;
  footerNote?: string;
  businessName?: string;
  showBusinessName?: boolean;
  showTaxBreakdown?: boolean;
  showCustomerName?: boolean;
  showCustomerPhone?: boolean;
  showTableNumber?: boolean;
  /** Ignored for browser receipts: HTML always renders Unicode currency symbols. */
  useUnicode?: boolean;
  /** Show a large "REPRINT" banner so a reprinted bill can't be mistaken for the original. */
  isReprint?: boolean;
  /** Hide trailing .00 on printed amounts while keeping non-zero decimals. */
  trimDecimals?: boolean;
  /** UI language used when resolving an inherited receipt language policy. */
  language?: Language;
  /** Resolved receipt languages supplied by the caller's print policy. */
  languages?: ResolvedPrintLanguages;
}

/**
 * Tax-id label printed on the receipt. Country-profile labels are acronyms or
 * proper nouns (GSTIN, CUIT, …) and stay as-is; Iran's "Economic Code" is
 * localized so a Persian receipt doesn't show an English phrase.
 */
function resolveTaxIdLabel(country: string | undefined, lang: Language): string {
  if (country?.toUpperCase() === 'IR') return printLabelResolver('receipt.economicCode', lang);
  return getCountryByCode(country ?? 'IN')?.taxIdLabel || 'Tax ID';
}

/**
 * Ensure the requested receipt language messages are loaded in memory (#377).
 */
export async function ensureReceiptMessagesLoaded(lang: Language): Promise<void> {
  await loadLocaleMessages(lang).catch(() => {});
}

/**
 * Generate HTML for A4/A5 printing and open print dialog.
 *
 * NOTE: The popup window is opened synchronously within the initiating user gesture
 * to preserve browser user activation (preventing popup blocker suppression), and
 * HTML is written into the window once requested language messages are ready.
 */
export async function printWebBill(
  bill: Bill,
  tenant: ReceiptTenant,
  opts: WebPrintOptions = {}
): Promise<void> {
  const languages = resolvePrintLanguages(opts);

  // 1. Open popup window synchronously to maintain transient user activation.
  // Size it like a 58/80mm ticket so the on-screen preview is not an A4 sheet
  // with a four-column table stretched across 800px.
  const previewWidth = (opts.paperSize ?? 'thermal58') === 'thermal80' ? 360 : 280;
  const printWindow = typeof window !== 'undefined'
    ? window.open('', '_blank', `width=${previewWidth},height=740`)
    : null;
  if (!printWindow) {
    toast.error('Please allow popups to print bills');
    throw new Error('Popup window was blocked by browser');
  }

  // 2. Ensure every language selected by the canonical print policy is
  //    available before the synchronous document build. The document uses
  //    the primary language for this single-language HTML surface.
  await ensurePrintLanguagesLoaded(languages);
  const html = generateBillHtml(bill, tenant, { ...opts, languages });

  // 3. Write HTML and trigger print
  if (printWindow.closed) {
    throw new Error('Print window was closed before receipt could be printed');
  }

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const cleanup = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    const settle = (err?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    };

    const triggerPrint = () => {
      try {
        if (printWindow.closed) {
          settle(new Error('Print window was closed before receipt could be printed'));
          return;
        }
        printWindow.print();
        settle();
      } catch (err) {
        console.error('Failed to trigger print on window:', err);
        toast.error('Failed to open print dialog');
        settle(err instanceof Error ? err : new Error(String(err)));
      }
    };

    try {
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();

      if (printWindow.document.readyState === 'complete') {
        triggerPrint();
      } else {
        printWindow.onload = () => {
          triggerPrint();
        };

        // Poll window state to prevent hanging promise if user closes popup while loading
        let elapsed = 0;
        pollTimer = setInterval(() => {
          elapsed += 50;
          if (printWindow.closed) {
            settle(new Error('Print window was closed before receipt could be printed'));
          } else if (printWindow.document.readyState === 'complete' || elapsed >= 3000) {
            triggerPrint();
          }
        }, 50);
      }
    } catch (err) {
      console.error('Failed to write receipt to print window:', err);
      toast.error('Failed to open print dialog');
      settle(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

// ---------------------------------------------------------------------------
// Document → HTML rendering
// ---------------------------------------------------------------------------

/**
 * Generate HTML string for the bill (without opening print dialog).
 * Useful for preview or PDF generation.
 *
 * Renders exclusively from the shared PrintDocument (+ context): raw bill
 * fields are normalized once in `print-document.ts`, and every label comes
 * resolved out of the document blocks or the injected catalog resolver.
 */
export function generateBillHtml(
  bill: Bill,
  tenant: ReceiptTenant,
  opts: WebPrintOptions = {}
): string {
  const {
    paperSize = 'thermal58',
    includeTaxId = false,
    taxRegistrationNumber,
    address,
    phone,
    footerNote,
    businessName,
    showBusinessName = true,
    showTaxBreakdown = true,
    showCustomerName = true,
    showCustomerPhone = true,
    showTableNumber = true,
    isReprint = false,
    trimDecimals = false,
  } = opts;

  const languages = resolvePrintLanguages(opts);
  const lang = languages[0] as Language;

  const document = buildFrontendBillDocument(bill, tenant, {
    columns: paperSize === 'thermal80' ? 48 : 42,
    businessName: showBusinessName ? (businessName ?? tenant.business_name) : undefined,
    address,
    phone,
    footerNote,
    taxRegistrationNumber,
    includeTaxId: includeTaxId && !!taxRegistrationNumber,
    taxIdLabel: resolveTaxIdLabel(tenant.country, lang),
    showBusinessName,
    showTaxBreakdown,
    showCustomerName,
    showCustomerPhone,
    showTableNumber,
    isReprint,
    trimDecimals,
    languages,
  });
  const base = document.direction.base;
  const dir = base;
  const localeTag = LANGUAGES[lang]?.locale ?? lang;

  const header = getBlock(document, 'business-header') as BusinessHeaderBlock | undefined;
  const meta = getBlock(document, 'document-meta') as DocumentMetaBlock | undefined;
  const customer = getBlock(document, 'customer') as CustomerBlock | undefined;
  const itemsBlock = getBlock(document, 'item-table') as ItemTableBlock | undefined;
  const breakdown = getBlock(document, 'tax-breakdown') as TaxBreakdownBlock | undefined;
  const totals = getBlock(document, 'totals') as TotalsBlock | undefined;
  const payments = getBlock(document, 'payments') as PaymentsBlock | undefined;
  const messages = getBlock(document, 'message') as MessageBlock | undefined;

  // Presentation labels come from the semantic document whenever the
  // document owns that slot. Surface-only labels use the same injected
  // catalog resolver as the document builder and thermal renderers.
  const metaTableLabel = documentLabel(meta?.table?.label, 'pos.tableLabel', lang);
  const L = {
    billNumber: documentLabel(meta?.billNumberLabel, 'receipt.billNumber', lang),
    date: documentLabel(meta?.dateLabel, 'receipt.date', lang),
    table: stripLabelPlaceholder(metaTableLabel),
    customer: documentLabel(customer?.nameLabel, 'pos.customer', lang),
    customerNo: documentLabel(customer?.phoneLabel, 'print.numberShort', lang),
    rate: printLabelResolver('receipt.rate', lang),
    totalTax: surfaceLabel(totals?.tax?.label, 'pos.tax', 'receipt.totalTax', lang),
    deliveryCharge: surfaceLabel(totals?.deliveryCharge?.label, 'pos.delivery', 'receipt.deliveryCharge', lang),
    grandTotal: surfaceLabel(totals?.grandTotal?.label, 'print.grandTotal', 'receipt.grandTotal', lang),
    taxDetails: printLabelResolver('receipt.taxDetails', lang),
    paymentsHeader: printLabelResolver('receipt.payments', lang),
    thankYou: surfaceLabel(messages?.thankYou, 'print.thankYouShort', 'receipt.thankYou', lang),
    taxIncluded: printLabelResolver('receipt.taxIncluded', lang),
    printBill: printLabelResolver('receipt.printBill', lang),
  };

  const invoiceNumberLabel = L.billNumber;
  const styles = getPaperStyles(paperSize);

  const items = itemsBlock?.rows ?? [];
  const fmtAmount = (value: number) => formatAmount(value, tenant, trimDecimals);
  const fmtQuantity = (value: number) => formatNumberForTenant(
    Number(value) || 0,
    tenant.country,
    { digits: tenant.number_digits },
  );

  const hasTax = (totals?.tax != null)
    || (breakdown != null && breakdown.lines.length > 0);

  return `<!DOCTYPE html>
<html lang="${localeTag}" dir="${dir}">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(invoiceNumberLabel)} ${escapeHtml(meta?.invoiceNumber.text ?? '')}</title>
  <style>
    ${styles}
    @media print {
      .no-print { display: none !important; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="bill-container">
    ${messages?.reprintBanner ? `<div class="reprint-banner">${escapeHtml(messages.reprintBanner.primary)}</div>` : ''}
    ${messages?.onlineOrderBanner ? `<div class="online-order-banner">${escapeHtml(messages.onlineOrderBanner.label.primary)}${messages.onlineOrderBanner.platform.text ? `<div class="online-order-detail">${escapeHtml(messages.onlineOrderBanner.platform.text)}</div>` : ''}${messages.onlineOrderBanner.externalOrderId.text ? `<div class="online-order-detail">#${escapeHtml(messages.onlineOrderBanner.externalOrderId.text)}</div>` : ''}</div>` : ''}
    <!-- Header -->
    <div class="header">
      ${header?.name ? `<h1>${escapeHtml(header.name.text)}</h1>` : ''}
      ${header?.address ? `<p>${escapeHtml(header.address.text).replace(/\n/g, '<br>')}</p>` : ''}
      ${header?.phone && header.phoneLabel ? `<p>${escapeHtml(header.phoneLabel.primary)}: ${directionalValue(header.phone, base)}</p>` : ''}
      ${header?.taxId ? `<p>${escapeHtml(header.taxId.label.primary)}: ${directionalValue(header.taxId.value, base)}</p>` : ''}
    </div>

    <!-- Bill Details: stacked full-width rows so invoice/date never wrap mid-token -->
    <div class="bill-details">
      <div class="meta-line">
        <strong>${escapeHtml(invoiceNumberLabel)}</strong>
        <span class="meta-value">${meta ? directionalValue(meta.invoiceNumber, base) : ''}</span>
      </div>
      <div class="meta-line">
        <strong>${escapeHtml(L.date)}</strong>
        <span class="meta-value">${meta ? escapeHtml(formatReceiptDate(meta.timestamp.text, tenant, LANGUAGES[lang]?.locale ?? lang)) : ''}</span>
      </div>
      ${meta?.table ? `<div class="meta-line"><strong>${escapeHtml(L.table)}</strong><span class="meta-value">${escapeHtml(meta.table.name.text)}</span></div>` : ''}
      ${customer?.name ? `<div class="meta-line"><strong>${escapeHtml(L.customer)}</strong><span class="meta-value">${escapeHtml(customer.name.text)}</span></div>` : ''}
      ${customer?.phone ? `<div class="meta-line"><strong>${escapeHtml(L.customerNo)}</strong><span class="meta-value">${directionalValue(customer.phone, base)}</span></div>` : ''}
    </div>

    <!-- Items Table -->
    <table class="items-table">
      <colgroup>
        <col class="col-item">
        <col class="col-qty">
        <col class="col-rate">
        <col class="col-amt">
      </colgroup>
      <thead>
        <tr>
          <th class="item-name">${escapeHtml(itemsBlock?.header.item.primary ?? '')}</th>
          <th class="text-end num">${escapeHtml(itemsBlock?.header.quantity.primary ?? '')}</th>
          <th class="text-end num">${escapeHtml(L.rate)}</th>
          <th class="text-end num">${escapeHtml(itemsBlock?.header.amount.primary ?? '')}</th>
        </tr>
      </thead>
      <tbody>
        ${items.map(row => `
          <tr>
            <td class="item-name">
              ${escapeHtml(row.name.text)}
              ${row.addons.length > 0 ? `<br><small class="text-muted">${row.addons.map(a => `+ ${escapeHtml(a.name.text)}${(a.quantity ?? 1) > 1 ? ` ×${escapeHtml(a.quantity)}` : ''}`).join(', ')}</small>` : ''}
              ${row.specialInstructions ? `<br><small class="text-italic">${escapeHtml(row.specialInstructions.text)}</small>` : ''}
            </td>
            <td class="text-end num">${fmtQuantity(row.quantity)}</td>
            <td class="text-end num">${fmtAmount(row.unitPrice ?? 0)}</td>
            <td class="text-end num">${fmtAmount(row.amount)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <!-- Tax Breakdown -->
    ${breakdown && breakdown.lines.length > 0 ? `
    <table class="tax-table">
      <thead>
        <tr><th colspan="2">${escapeHtml(L.taxDetails)}</th></tr>
      </thead>
      <tbody>
        ${breakdown.lines.map((line) => `
          <tr><td>${escapeHtml(line.rate === null ? line.label.primary : `${line.label.primary} @${line.rate}%`)}</td><td class="text-end num">${fmtAmount(line.amount)}</td></tr>
        `).join('')}
      </tbody>
    </table>
    ` : ''}

    <!-- Totals -->
    <table class="totals-table">
      ${totals ? `
      <tr><td>${escapeHtml(totals.subtotal.label.primary)}</td><td class="text-end num">${fmtAmount(totals.subtotal.amount)}</td></tr>
      ${totals.discount ? `<tr><td>${escapeHtml(totals.discount.label.primary)}</td><td class="text-end num">-${fmtAmount(totals.discount.amount)}</td></tr>` : ''}
      ${totals.tax ? `<tr><td>${escapeHtml(L.totalTax)}</td><td class="text-end num">${fmtAmount(totals.tax.amount)}</td></tr>` : ''}
      ${totals.serviceCharge ? `<tr><td>${escapeHtml(totals.serviceCharge.label.primary)}</td><td class="text-end num">${fmtAmount(totals.serviceCharge.amount)}</td></tr>` : ''}
      ${totals.deliveryCharge ? `<tr><td>${escapeHtml(L.deliveryCharge)}</td><td class="text-end num">${fmtAmount(totals.deliveryCharge.amount)}</td></tr>` : ''}
      <tr class="total-row"><td><strong>${escapeHtml(L.grandTotal)}</strong></td><td class="text-end num"><strong>${fmtAmount(totals.grandTotal.amount)}</strong></td></tr>
      ` : ''}
    </table>

    <!-- Payments -->
    ${payments && payments.lines.length > 0 ? `
    <table class="payments-table">
      <thead>
        <tr><th colspan="2">${escapeHtml(L.paymentsHeader)}</th></tr>
      </thead>
      <tbody>
        ${payments.lines.map((line) => `
          <tr><td>${escapeHtml(paymentLineLabel(line.label))}</td><td class="text-end num">${fmtAmount(line.amount)}</td></tr>
        `).join('')}
      </tbody>
    </table>
    ` : ''}

    <!-- Footer -->
    <div class="footer">
      ${messages?.footerNote ? `<p>${escapeHtml(messages.footerNote.text)}</p>` : `<p>${escapeHtml(L.thankYou)}</p>`}
      ${hasTax ? `<p>${escapeHtml(L.taxIncluded)}</p>` : ''}
      <p class="powered-by">${escapeHtml(RECEIPT_BRANDING_NAME)}${RECEIPT_BRANDING_URL ? `<br>${escapeHtml(RECEIPT_BRANDING_URL)}` : ''}</p>
    </div>
  </div>

  <div class="no-print" style="text-align:center;margin-top:20px;">
    <button onclick="window.print()" style="padding:10px 20px;font-size:16px;cursor:pointer;">${escapeHtml(L.printBill)}</button>
  </div>
</body>
</html>
  `;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve the receipt language list through the shared policy bridge. */
function resolvePrintLanguages(opts: Pick<WebPrintOptions, 'language' | 'languages'>): ResolvedPrintLanguages {
  return opts.languages ?? resolveBillPrintLanguages(opts.language);
}

/** Read a semantic document label, retaining the canonical resolver fallback. */
function documentLabel(
  label: { primary: string } | null | undefined,
  conceptId: string,
  lang: Language,
): string {
  return label?.primary ?? printLabelResolver(conceptId, lang);
}

/**
 * Keep the browser's established wording while honoring a semantic label
 * override from an applied merchant document. The default browser concept is
 * still resolved by the shared catalog - it is not a second translation table.
 */
function surfaceLabel(
  semanticLabel: { primary: string } | null | undefined,
  semanticConceptId: string,
  browserConceptId: string,
  lang: Language,
): string {
  const semanticDefault = printLabelResolver(semanticConceptId, lang);
  return semanticLabel && semanticLabel.primary !== semanticDefault
    ? semanticLabel.primary
    : printLabelResolver(browserConceptId, lang);
}

/** Remove the semantic table label's interpolation token for a separate value cell. */
function stripLabelPlaceholder(label: string): string {
  return label.replace('{name}', '').replace(/[:：]\s*$/, '').trim();
}

/** Unknown payment methods keep their legacy capitalized literal rendering. */
function paymentLineLabel(label: { conceptId?: string; primary: string }): string {
  return label.conceptId !== undefined
    ? label.primary
    : label.primary.charAt(0).toUpperCase() + label.primary.slice(1);
}

function getPaperStyles(size: PaperSize): string {
  const mm = size === 'thermal80' ? 80 : 58;
  const bodySize = size === 'thermal80' ? '12px' : '11px';
  const h1Size = size === 'thermal80' ? '18px' : '16px';
  const totalSize = size === 'thermal80' ? '16px' : '14px';
  const qtyCol = size === 'thermal80' ? '10mm' : '8mm';
  // Name column keeps the leftover width so «Позиция» / product titles stay
  // readable. Money columns are only as wide as a nowrap `₸ 11,000.00`.
  const moneyCol = size === 'thermal80' ? '17mm' : '15mm';
  const moneySize = size === 'thermal80' ? '11px' : '9px';
  return `
    @page { size: ${mm}mm auto; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%;
      max-width: 100%;
      margin: 0;
      padding: 0;
      overflow-x: hidden;
      color: #000;
      background: #fff;
      font-family: Arial, Helvetica, 'Nimbus Sans', sans-serif;
      font-size: ${bodySize};
      line-height: 1.25;
      font-weight: 700;
      -webkit-font-smoothing: none;
      -moz-osx-font-smoothing: unset;
      font-smooth: never;
      font-kerning: none;
      hyphens: none;
      -webkit-hyphens: none;
    }
    .bill-container {
      width: ${mm}mm;
      max-width: min(${mm}mm, 100%);
      margin: 0 auto;
      padding: 2mm;
      color: #000;
      overflow-x: hidden;
    }
    .reprint-banner { text-align: center; font-size: ${size === 'thermal80' ? '16px' : '13px'}; font-weight: 800; letter-spacing: 0; color: #000; border: 2px solid #000; padding: 3px; margin-bottom: 6px; }
    .online-order-banner { text-align: center; font-size: 16px; font-weight: 800; letter-spacing: 0; border: 2px solid #000; padding: 4px; margin-bottom: 8px; }
    .online-order-banner .online-order-detail { font-size: ${bodySize}; font-weight: 700; letter-spacing: normal; margin-top: 2px; }
    .header { text-align: center; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid #000; }
    .header h1 { font-size: ${h1Size}; margin-bottom: 4px; font-weight: 800; color: #000; }
    .bill-details { margin-bottom: 8px; }
    .meta-line { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 4px 8px; margin-bottom: 2px; }
    .meta-line strong { flex: 0 0 auto; }
    .meta-value { margin-inline-start: auto; white-space: nowrap; }
    .items-table { width: 100%; max-width: 100%; table-layout: fixed; border-collapse: collapse; margin-bottom: 8px; }
    .items-table .col-item { width: auto; }
    .items-table .col-qty { width: ${qtyCol}; }
    .items-table .col-rate, .items-table .col-amt { width: ${moneyCol}; }
    .items-table th, .items-table td { padding: 3px 1px; border-bottom: 1px solid #000; text-align: start; color: #000; vertical-align: top; }
    .items-table th { font-weight: 800; }
    .items-table th.num, .items-table td.num { font-size: ${moneySize}; padding-inline-start: 2px; padding-inline-end: 1px; white-space: nowrap; }
    .items-table .item-name {
      hyphens: none;
      -webkit-hyphens: none;
      -ms-hyphens: none;
      word-break: keep-all;
      overflow-wrap: normal;
      white-space: normal;
    }
    .tax-table, .payments-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    .tax-table th, .tax-table td, .payments-table th, .payments-table td { padding: 3px 2px; color: #000; }
    .tax-table th, .payments-table th { text-align: start; font-weight: 800; }
    .totals-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    .totals-table td { padding: 3px 2px; color: #000; }
    .totals-table td.num { white-space: nowrap; }
    .total-row { border-top: 2px solid #000; font-size: ${totalSize}; }
    .footer { text-align: center; margin-top: 10px; padding-top: 8px; border-top: 1px solid #000; }
    .powered-by { font-size: 11px; margin-top: 6px; color: #000; font-weight: 700; }
    .text-end { text-align: end !important; }
    .num { unicode-bidi: isolate; white-space: nowrap; }
    .ltr { direction: ltr; unicode-bidi: isolate; white-space: nowrap; }
    .text-muted, .text-italic { color: #000; font-weight: 700; }
    .text-italic { font-style: italic; }
    @media print {
      .no-print { display: none !important; }
      html, body { width: ${mm}mm !important; max-width: ${mm}mm !important; overflow-x: hidden; }
      .bill-container { width: ${mm}mm !important; max-width: ${mm}mm !important; margin: 0; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; color: #000; background: #fff; }
    }
  `;
}

/**
 * Format an amount following the tenant's currency display (Iran rial/toman),
 * digit mode, and `trimDecimals` preference. Browser output is always Unicode.
 */
function formatAmount(value: number, tenant: ReceiptTenant, trimDecimals = false): string {
  const numeric = Number.isFinite(Number(value)) ? Number(value) : 0;
  const currency = resolveHtmlReceiptCurrency(tenant);
  const prefs = { currencyDisplay: tenant.currency_display, digits: tenant.number_digits };
  const hasDecimals = Math.round(numeric * 100) % 100 !== 0;
  const isToman =
    (currency === 'IRR' || (!tenant.currency && tenant.country === 'IR')) &&
    (tenant.currency_display === 'toman' || tenant.currency_display === 'toman_short');

  // trimDecimals hides trailing .00 only when there is no fractional part.
  let formatted: string;
  if (trimDecimals && !hasDecimals && !isToman) {
    const locale = getCountryByCode(tenant.country ?? '')?.locale
      ?? (currency === 'KZT' ? 'ru-KZ' : 'en-US');
    const numberingSystem = tenant.number_digits === 'latin' ? 'latn' : undefined;
    try {
      formatted = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        currencyDisplay: 'narrowSymbol',
        ...(numberingSystem ? { numberingSystem } : {}),
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(numeric);
    } catch {
      formatted = formatCurrencyForTenant(numeric, tenant.country, currency, prefs);
    }
  } else {
    formatted = formatCurrencyForTenant(numeric, tenant.country, currency, prefs);
  }

  return separateTengeFromAmount(formatted);
}

/**
 * Guest-check HTML must follow the tenant currency, but FloCafe install
 * defaults are still IN/INR. KorgenKassa bills (Aisultan, Absolut, …) would
 * then print ₹. Treat INR-or-empty as unset and fall back to the country
 * profile, then to KZT — never to the Indian rupee.
 */
function resolveHtmlReceiptCurrency(tenant: ReceiptTenant): string {
  return resolveDisplayCurrency(tenant.country, tenant.currency);
}

/**
 * `en-*` locales render KZT as `₸1,800.00` with the sign glued to the digits.
 * Guest-check columns then look like `3 ₸1,800.00`. Keep a full NBSP on both
 * prefix and suffix forms so quantity, ₸, and the amount stay distinct.
 */
function separateTengeFromAmount(formatted: string): string {
  return formatted
    .replace(/₸[\u00A0\u202F\u2009\u2007 ]*(?=\d)/g, '₸\u00A0')
    .replace(/(?<=\d)[\u00A0\u202F\u2009\u2007 ]*₸/g, '\u00A0₸');
}

function formatReceiptDate(iso: string, tenant: ReceiptTenant, locale?: string): string {
  if (!iso) return '';
  try {
    const d = parseDbTimestamp(iso);
    if (isNaN(d.getTime())) return iso;
    return formatDateForTenant(
      d,
      tenant.country,
      tenant.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      { digits: tenant.number_digits, calendar: tenant.calendar },
      { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' },
      locale,
    );
  } catch {
    return iso;
  }
}
