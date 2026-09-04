/**
 * Print label localization tests (#440, epic #438).
 *
 * The backend thermal renderers resolve receipt/KOT/test-page labels through
 * the generated derived view (`main/print/print-labels.generated.ts`) backed
 * by canonical locale messages. This suite asserts:
 *
 *   1. printLabel carries one table per committed language and falls back to
 *      English for unknown languages (never raw keys).
 *   2. formatReceipt / formatKOT / buildTestPage honor the optional
 *      `language` parameter with English as the default.
 *   3. Payment methods localize through pos.method* keys; unknown methods
 *      keep the capitalize fallback.
 *   4. Regeneration is byte-identical (drift check also runs separately via
 *      `node scripts/generate-print-labels.cjs --check`, wired into
 *      `npm run i18n:check` and `test:print-labels`).
 *
 * Expected label text is always resolved through `printLabel` rather than
 * hardcoded per language, so the suite stays valid while translations land.
 * Localized assertions read the renderers' document LINES (pre-ESC/POS):
 * `buildEscPos` drops non-ASCII lines that the printer profile cannot
 * represent (docs/printers.md), which is a printer-capability contract and
 * not label resolution.
 *
 * Run: npm run test:print-labels
 */

import {
  formatReceipt,
  formatKOT,
  buildTestPage,
  escPosToText,
  foldThermalText,
} from '../main/printers/thermal';
import { printLabel } from '../main/print/print-labels.generated';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(label: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`   ✓ ${label}`);
    passed++;
  } else {
    console.log(`   ✗ ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
    failures.push(label + (detail ? ` — ${detail}` : ''));
  }
}

function buildOrder(): any {
  return {
    order_number: 'ORD-LABELS-001',
    type: 'dine_in',
    created_at: '2026-08-21 18:42:00',
    table: { name: '7' },
    items: [{
      product_name: 'Espresso',
      quantity: 1,
      unit_price: 250,
      total: 250,
      addons: [],
      special_instructions: '',
    }],
  };
}

function buildBill(): any {
  return {
    bill_number: 'INV-LABELS-001',
    subtotal: 250,
    discount_amount: 0,
    tax_amount: 0,
    service_charge: 0,
    delivery_charge: 0,
    total: 250,
    payment_details: [{ method: 'cash', amount: 250 }],
  };
}

function buildBusiness(extra: Record<string, unknown> = {}): any {
  return {
    name: 'Flo Label Cafe',
    address: '',
    phone: '',
    taxRegistrationNumber: '',
    currency_symbol: '$',
    country: 'US',
    customer_name: '',
    customer_phone: '',
    points_earned: 0,
    points_redeemed: 0,
    points_balance: null,
    trim_decimals: false,
    show_name: true,
    show_address: true,
    show_phone: true,
    show_tax_id: false,
    show_tax_breakdown: false,
    show_table_number: true,
    show_customer_name: true,
    show_customer_phone: true,
    footer_note: '',
    ...extra,
  };
}

function run(): void {
  console.log('\n✅ Test 1: printLabel language selection and fallback');
  assert('en resolves grand total to TOTAL', printLabel('en', 'print.grandTotal') === 'TOTAL');
  assert('ru resolves grand total to Russian', printLabel('ru', 'print.grandTotal') === 'ИТОГО');
  assert('kk resolves grand total to Kazakh', printLabel('kk', 'print.grandTotal') === 'ЖИЫНТЫҚ');
  assert('unknown language falls back to English', printLabel('xx', 'print.grandTotal') === 'TOTAL');
  assert('empty language falls back to English', printLabel('', 'receipt.billNumber') === 'Bill #');
  assert('borrowed key resolves from its own namespace', printLabel('en', 'pos.subtotal') === 'Subtotal');
  assert('ru resolves borrowed pos.subtotal', printLabel('ru', 'pos.subtotal') === 'Подытог');
  assert('kk resolves borrowed pos.subtotal', printLabel('kk', 'pos.subtotal') === 'Аралық сома');

  console.log('\n✅ Test 2: classic receipt honors language');
  {
    const text = escPosToText(formatReceipt(buildOrder(), buildBill(), buildBusiness(), 'classic', 48));
    assert('default language keeps English labels', text.includes('Invoice #:') && text.includes('TOTAL') && text.includes('Subtotal'));
    const ruText = escPosToText(formatReceipt(buildOrder(), buildBill(), buildBusiness(), 'classic', 48, false, false, undefined, [], false, 'ru'));
    assert('ru classic renders folded grand total', ruText.includes(foldThermalText('ru', printLabel('ru', 'print.grandTotal'))));
    assert('ru classic renders folded subtotal', ruText.includes(foldThermalText('ru', printLabel('ru', 'pos.subtotal'))));
    assert('ru classic localizes cash payment method', ruText.includes(foldThermalText('ru', printLabel('ru', 'pos.methodCash'))));
    const kkText = escPosToText(formatReceipt(buildOrder(), buildBill(), buildBusiness(), 'classic', 48, false, false, undefined, [], false, 'kk'));
    assert('kk classic renders folded grand total', kkText.includes(foldThermalText('kk', printLabel('kk', 'print.grandTotal'))));
    assert('kk classic renders folded subtotal', kkText.includes(foldThermalText('kk', printLabel('kk', 'pos.subtotal'))));
    assert('unknown language keeps English output', escPosToText(formatReceipt(buildOrder(), buildBill(), buildBusiness(), 'classic', 48, false, false, undefined, [], false, 'xx')).includes('Invoice #:'));
  }

  console.log('\n✅ Test 3: compact receipt honors language');
  {
    const text = escPosToText(formatReceipt(buildOrder(), buildBill(), buildBusiness(), 'compact', 48));
    assert('default language keeps Bill # label', text.includes('Bill #:'));
    const ruText = escPosToText(formatReceipt(buildOrder(), buildBill(), buildBusiness(), 'compact', 48, false, false, undefined, [], false, 'ru'));
    assert('ru compact localizes date label', ruText.includes(foldThermalText('ru', printLabel('ru', 'receipt.date'))));
    const kkText = escPosToText(formatReceipt(buildOrder(), buildBill(), buildBusiness(), 'compact', 48, false, false, undefined, [], false, 'kk'));
    assert('kk compact localizes item label', kkText.includes(foldThermalText('kk', printLabel('kk', 'receipt.item'))));
  }

  console.log('\n✅ Test 4: KOT honors language');
  {
    const order = { ...buildOrder(), table: { name: '3' } };
    const text = escPosToText(formatKOT(order, order.items, 'Grill', 48));
    assert('default KOT banner stays English', text.includes('KITCHEN ORDER TICKET'));
    assert('default KOT type label stays English', text.includes('Type: DINE IN'));
    const ruText = escPosToText(formatKOT(order, order.items, 'Grill', 48, false, 'full', 'ru-RU', undefined, [], false, 'ru'));
    assert('ru KOT banner translated', ruText.includes(foldThermalText('ru', printLabel('ru', 'print.kot.banner'))));
    assert('ru KOT station label translated', ruText.includes(foldThermalText('ru', printLabel('ru', 'print.kot.station'))));
    assert('ru KOT type label translated', ruText.includes(foldThermalText('ru', printLabel('ru', 'print.kot.type'))));
  }

  console.log('\n✅ Test 5: test page honors language');
  {
    const buf80 = buildTestPage('80mm');
    const text80 = buf80.toString('utf8');
    assert('en test page title unchanged', text80.includes('Flo Printer Test'));
    assert('en test page reports columns', text80.includes('Columns: 48'));
    const ruText = buildTestPage('80mm', 'full', 'ru').toString('utf8');
    assert('ru test page title folded for thermal output', ruText.includes(foldThermalText('ru', printLabel('ru', 'print.test.title'))));
    assert('ru test page columns label folded', ruText.includes(foldThermalText('ru', printLabel('ru', 'print.test.columns'))));
    assert('technical ruler literal stays verbatim', /[1234567890]/.test(ruText));
  }

  console.log('\n✅ Test 6: payment method resolution');
  {
    const bill = { ...buildBill(), payment_details: [{ method: 'card', amount: 250 }] };
    const ruText = escPosToText(formatReceipt(buildOrder(), bill, buildBusiness(), 'compact', 48, false, false, undefined, [], false, 'ru'));
    assert('card localizes in ru', ruText.includes(foldThermalText('ru', printLabel('ru', 'pos.methodCard'))));
    const voucherBill = { ...buildBill(), payment_details: [{ method: 'voucher', amount: 250 }] };
    const text = escPosToText(formatReceipt(buildOrder(), voucherBill, buildBusiness(), 'compact', 48));
    assert('unknown method keeps capitalize fallback', text.includes('Voucher'));
  }

  console.log('\n✅ Test 7: drift check is line-ending deterministic');
  {
    // Windows runners with git's default core.autocrlf rewrite the committed
    // LF file to CRLF on disk; the drift compare must not read that as drift
    // (regression for the build-windows-x64 matrix failure on ef92eeb).
    const { normalizeEol, regenerate } = require('../scripts/generate-print-labels.cjs');
    assert('CRLF normalizes to LF', normalizeEol('a\r\nb\rc\n') === 'a\nb\nc\n');
    const committed = require('fs').readFileSync(require('path').join(__dirname, '..', 'main/print/print-labels.generated.ts'), 'utf8');
    const crlfCommitted = normalizeEol(committed).replace(/\n/g, '\r\n');
    assert('CRLF-checked-out file matches regenerated content', normalizeEol(crlfCommitted) === regenerate());
  }

  console.log('\n' + '='.repeat(56));
  console.log(`Print label tests: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log('Failures:');
    for (const f of failures) console.log(`  - ${f}`);
  }
  process.exit(failed === 0 ? 0 : 1);
}

if (require.main === module) {
  run();
}
