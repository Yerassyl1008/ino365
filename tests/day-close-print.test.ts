/**
 * Paloma-style day-close / period-close print HTML.
 *
 * Usage: ts-node --transpile-only -P tests/tsconfig.json tests/day-close-print.test.ts
 */

const path = require('path') as typeof import('path');
const moduleApi = require('module') as {
  _resolveFilename: (...args: any[]) => string;
};
const originalResolveFilename = moduleApi._resolveFilename;
moduleApi._resolveFilename = function (request: string, parent: any, isMain: boolean, options?: any) {
  let resolvedRequest = request;
  if (request === '@countries') {
    resolvedRequest = path.resolve(__dirname, '../main/countries.ts');
  } else if (request.startsWith('@/')) {
    resolvedRequest = path.resolve(__dirname, '../frontend/src', request.slice(2));
  } else if (request.startsWith('@print/')) {
    resolvedRequest = path.resolve(__dirname, '../shared/print', request.slice('@print/'.length));
  }
  return originalResolveFilename.call(this, resolvedRequest, parent, isMain, options);
};

const {
  buildDayClosePrintInput,
  dayClosePeriodEnd,
  dayClosePeriodStart,
  generateDayCloseHtml,
} = require('../frontend/src/lib/printer/day-close-print') as typeof import('../frontend/src/lib/printer/day-close-print');

moduleApi._resolveFilename = originalResolveFilename;

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    failures.push(message);
    console.error(`  ✗ ${message}`);
  }
}

const labels = {
  title: 'Summary report',
  totalBills: 'Total bills',
  orderItems: 'Order items',
  cancelledReceipts: 'Cancelled receipts',
  cancelledAmount: 'Cancelled amount',
  guests: 'Guests',
  transfers: 'Transfers',
  unlocks: 'Unlocks',
  paymentsReport: 'Report by payment types',
  staffReport: 'Report by employees',
  departmentsReport: 'Report by departments',
  clientsReport: 'Report by clients',
  colNo: 'No.',
  colPaymentType: 'Payment type',
  colAmount: 'Amount',
  colStaff: 'Employee',
  colCount: 'Count',
  colService: 'Service',
  colDepartment: 'Department',
  colClient: 'Client',
  colBills: 'Bills',
  colOrders: 'Items',
  colAmountNoDiscount: 'Amount before discount',
  total: 'Total',
  print: 'Print',
};

const report = {
  businessName: 'Flo Test Cafe',
  startDate: '2026-09-16',
  endDate: '2026-09-16',
  header: {
    billCount: 12,
    orderItemCount: 40,
    cancelledReceiptCount: 1,
    cancelledAmount: 500,
    guestCount: 18,
    transfers: 0,
    unlocks: 0,
  },
  payments: [
    { method: 'cash', amount: 800 },
    { method: 'card', amount: 200 },
  ],
  paymentTotal: 1000,
  staff: [{ name: 'Waiter A', billCount: 8, serviceCharge: 120.5, amount: 800 }],
  staffTotal: { billCount: 8, serviceCharge: 120.5, amount: 800 },
  departments: [{ name: 'Grill', quantity: 10, serviceCharge: 80, amount: 800 }],
  departmentTotal: { quantity: 10, serviceCharge: 80, amount: 800 },
  clients: [{
    name: null,
    billCount: 12,
    itemCount: 40,
    amount: 1000,
    amountBeforeDiscount: 1100,
  }],
  clientTotal: { billCount: 12, itemCount: 40, amount: 1000, amountBeforeDiscount: 1100 },
};

console.log('Day-close Paloma print layout');
console.log('='.repeat(50));

{
  const start = dayClosePeriodStart('2026-09-16');
  const end = dayClosePeriodEnd('2026-09-16');
  assert(start.getHours() === 0 && start.getMinutes() === 0 && start.getSeconds() === 0, 'period start is 00:00:00 local');
  assert(end.getHours() === 23 && end.getMinutes() === 59 && end.getSeconds() === 59, 'period end is 23:59:59 local');
}

const input = buildDayClosePrintInput(report, {
  labels,
  formatAmount: (value) => String(value),
  paymentLabel: (method) => method === 'cash' ? 'Cash' : 'Card',
  unknownName: 'Unknown',
  uncategorizedName: 'None',
  walkInName: 'Walk-in',
  periodFrom: 'FROM 16 Sep 2026, 00:00:00',
  periodTo: 'TO 16 Sep 2026, 23:59:59',
  dateLabel: 'Date',
  dateValue: '16 Sep 2026',
  outletLabel: 'Outlet',
  outletValue: 'Flo Test Cafe',
});

assert(input.header.transfers === '0', 'transfers print as zero');
assert(input.header.unlocks === '0', 'unlocks print as zero');
assert(input.staff[0].service === '120.5', 'staff service is the staff share');
assert(input.departments[0].service === '80', 'department service prints the allocated share');
assert(input.departmentTotal.service === '80', 'department total service matches staff allocation');
assert(input.clients[0].name === 'Walk-in', 'unnamed client is walk-in');
assert(input.clients[0].amountNoDiscount === '1100', 'client amount before discount');

const html = generateDayCloseHtml(input);

assert(html.includes('<h1>Summary report</h1>'), 'title is the report name, not the outlet');
assert(html.includes('FROM 16 Sep 2026, 00:00:00'), 'period FROM line');
assert(html.includes('TO 16 Sep 2026, 23:59:59'), 'period TO line');
assert(html.includes('Date') && html.includes('16 Sep 2026'), 'date row');
assert(html.includes('Outlet') && html.includes('Flo Test Cafe'), 'outlet row');
assert(html.includes('Total bills'), 'bills header stat');
assert(html.includes('Order items'), 'order items header stat');
assert(html.includes('Cancelled receipts'), 'cancelled receipts header stat');
assert(html.includes('Cancelled amount'), 'cancelled amount header stat');
assert(html.includes('Guests'), 'guests header stat');
assert(html.includes('Transfers'), 'transfers header stat');
assert(html.includes('Unlocks'), 'unlocks header stat');
assert(!html.includes('Cancelled items'), 'cancelled item count is not a Paloma header line');
assert(!(html.match(/Report by payment types[\s\S]*?<\/thead>/)?.[0] || '').includes('%'), 'payments table has no percent column');
assert(!(html.match(/Report by employees[\s\S]*?<\/thead>/)?.[0] || '').includes('%'), 'staff table has no percent column');
assert(!(html.match(/Report by departments[\s\S]*?<\/thead>/)?.[0] || '').includes('%'), 'departments table has no percent column');

assert(html.includes('Report by payment types'), 'payments section');
assert(html.includes('Payment type'), 'payments column');
assert(html.includes('Cash') && html.includes('800'), 'cash payment row');
assert(html.includes('Card') && html.includes('200'), 'card payment row');

assert(html.includes('Report by employees'), 'staff section');
assert(html.includes('Waiter A') && html.includes('120.5'), 'staff service share');
assert(html.includes('Report by departments'), 'departments section');
assert(html.includes('Grill'), 'department row');
assert(html.includes('80'), 'department service amount');
assert(html.includes('Report by clients'), 'clients section');
assert(html.includes('Amount before discount'), 'clients amount-before-discount column');
assert(html.includes('Walk-in'), 'walk-in client row');
assert((html.match(/class="total"/g) || []).length === 4, 'each of the four tables has a total row');

assert(!html.includes('Invoice #') && !html.includes('Bill #') && !html.includes('KITCHEN ORDER'), 'guest bill / KOT labels are absent');

console.log('\n' + '='.repeat(50));
console.log(`${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed > 0 ? 1 : 0);
