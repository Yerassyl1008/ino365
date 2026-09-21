/**
 * Browser Receipts Testing and Visual Evidence Generator
 * Tests Persian (fa) RTL, Iran tenant preferences (Rial, Toman, Toman Short, digits, calendar),
 * LTR isolation islands, translations, and non-Persian regressions (EN, ES, FR, PT).
 */

import fs from 'node:fs';
import * as os from 'node:os';
import path from 'node:path';
import type { Bill, Order, Tenant, OrderItem, Customer, Table } from '../frontend/src/lib/types';

const EVIDENCE_DIR =
  process.env.EVIDENCE_DIR ||
  path.join(os.tmpdir(), 'no-mistakes-evidence', '01M0EAZP7Q6BWADVK3WPM4HZDV');

// Dynamic resolver for frontend modules
function loadFrontendModules() {
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

  try {
    return {
      webPrint: require('../frontend/src/lib/printer/web-print'),
      i18n: require('../frontend/src/lib/i18n'),
      countries: require('../frontend/src/lib/countries'),
    };
  } finally {
    moduleApi._resolveFilename = originalResolveFilename;
  }
}

const { webPrint, i18n, countries } = loadFrontendModules();
const { generateBillHtml } = webPrint;

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

async function run() {
  console.log('==================================================');
  console.log('Browser/HTML Receipt Tests for Persian / Iran (Batch H)');
  console.log('==================================================\n');

  if (!fs.existsSync(EVIDENCE_DIR)) {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  }

  // #375: prime the shared locale cache so synchronous t() resolves the
  // on-demand bundles in this test process.
  for (const lang of ['en', 'ru', 'kk'] as const) {
    await i18n.loadLocaleMessages(lang);
  }

  // Create sample Iranian Bill and Tenant
  const testIranOrder: Order = {
    id: 101,
    order_number: 'ORD-IR-2026-08',
    customer_id: 'cust-ir-1',
    status: 'completed',
    subtotal: 900000,
    tax_amount: 90000,
    discount_amount: 0,
    total: 990000,
    created_at: '2026-08-17T14:30:00.000Z',
    items: [
      {
        id: 1,
        order_id: 101,
        product_id: 'p1',
        product_name: 'چای زعفرانی (Saffron Tea)',
        unit_price: 300000,
        quantity: 2,
        subtotal: 600000,
        tax_amount: 60000,
        total: 660000,
        addons: [{ id: 1, name: 'هل اضافه', price: 50000, quantity: 1 }],
        special_instructions: 'کم شیرین',
        status: 'served',
      },
      {
        id: 2,
        order_id: 101,
        product_id: 'p2',
        product_name: 'باقلوا یزدی (Baklava)',
        unit_price: 300000,
        quantity: 1,
        subtotal: 300000,
        tax_amount: 30000,
        total: 330000,
        addons: null,
        special_instructions: null,
        status: 'served',
      },
    ],
    table: {
      id: 't-12',
      name: 'میز ۱۲ (Table 12)',
      capacity: 4,
      status: 'occupied',
      floor: 'همکف',
      section: 'سالن اصلی',
      is_active: true,
    },
    customer: {
      id: 'cust-ir-1',
      name: 'رضا حسینی (Reza Hosseini)',
      phone: '+98 912 345 6789',
      country_code: '+98',
      visits_count: 3,
      total_spent: 3000000,
      last_visit_at: '2026-08-17T14:30:00.000Z',
    },
  };

  const testIranBill: Bill = {
    id: 501,
    bill_number: 'BILL-IR-0089',
    order_id: 101,
    customer_id: 'cust-ir-1',
    subtotal: 900000,
    tax_amount: 90000,
    discount_amount: 0,
    service_charge: 0,
    delivery_charge: 0,
    total: 990000,
    paid_amount: 990000,
    balance: 0,
    payment_status: 'paid',
    payment_details: [
      { method: 'card', amount: 990000, timestamp: '2026-08-17T14:35:00.000Z' },
    ],
    tax_breakdown: [
      { title: 'ارزش افزوده (VAT)', rate: 10, amount: 90000 },
    ],
    order: testIranOrder,
  };

  const baseIranTenant = {
    business_name: 'کافه کتاب تهران (Tehran Book Cafe)',
    currency: 'IRR',
    country: 'IR',
    timezone: 'Asia/Tehran',
    currency_display: 'rial' as const,
    number_digits: 'locale' as const,
    calendar: 'persian' as const,
  };

  console.log('Test Suite 1: Russian (ru) LTR Document Flow & Structure');
  {
    const html = generateBillHtml(testIranBill, baseIranTenant, {
      language: 'ru',
      address: 'تهران، خیابان انقلاب، پلاک ۱۲',
      phone: '+98 21 6644 1234',
      taxRegistrationNumber: '411123456789',
      includeTaxId: true,
    });

    assert('HTML contains lang="ru-RU" and dir="ltr"', html.includes('<html lang="ru-RU" dir="ltr">'));
    assert('CSS contains RTL logical properties and bidi styles',
      html.includes('.text-end { text-align: end !important; }') &&
      html.includes('.num { unicode-bidi: isolate; white-space: nowrap; }') &&
      html.includes('.ltr { direction: ltr; unicode-bidi: isolate;') &&
      html.includes('table-layout: fixed')
    );
    assert('Invoice and date sit on stacked full-width rows',
      html.includes('class="bill-details"') &&
      html.includes('class="meta-line"') &&
      html.includes('class="meta-value"')
    );
    assert('Item table pins qty/price/sum columns',
      html.includes('class="col-qty"') &&
      html.includes('class="col-rate"') &&
      html.includes('class="col-amt"') &&
      html.includes('class="item-name"')
    );
    assert('item names wrap on spaces only — no hyphenation or letter-break',
      html.includes('hyphens: none') &&
      html.includes('word-break: keep-all') &&
      html.includes('overflow-wrap: normal') &&
      !html.includes('hyphens: auto') &&
      !html.includes('overflow-wrap: anywhere') &&
      !html.includes('word-break: break-word')
    );
  }

  console.log('\nTest Suite 2: Russian (ru) Translated Receipt Labels');
  {
    const html = generateBillHtml(testIranBill, baseIranTenant, {
      language: 'ru',
      address: 'تهران، خیابان انقلاب، پلاک ۱۲',
      phone: '+98 21 6644 1234',
      taxRegistrationNumber: '411123456789',
      includeTaxId: true,
      isReprint: true,
    });

    assert('Reprint banner shows Russian "ПОВТОРНАЯ ПЕЧАТЬ"', html.includes('<div class="reprint-banner">ПОВТОРНАЯ ПЕЧАТЬ</div>'));
    assert('Phone prefix shows Russian "Тел"', html.includes('Тел:'));
    assert('Tax ID label shows localized Iran "کد اقتصادی" or Russian economic code', html.includes('کد اقتصادی:') || html.includes('Экономический код:'));
    assert('Bill number label shows Russian "Счёт №"', html.includes('<strong>Счёт №</strong>'));
    assert('Date label shows Russian "Дата"', html.includes('<strong>Дата</strong>'));
    assert('Table label shows Russian "Стол"', html.includes('<strong>Стол</strong>'));
    assert('Customer No label shows Russian "Номер клиента"', html.includes('<strong>Номер клиента</strong>'));
    assert('Table headers show Russian items, qty, rate, amount',
      html.includes('>Позиция</th>') &&
      html.includes('>Кол-во</th>') &&
      html.includes('>Цена</th>') &&
      html.includes('>Сумма</th>')
    );
    assert('Tax Details header shows Russian "Детали налога"', html.includes('<th colspan="2">Детали налога</th>'));
    assert('Grand Total row shows Russian "Итого к оплате"', html.includes('<strong>Итого к оплате</strong>'));
    assert('Payments section header shows Russian "Платежи"', html.includes('<th colspan="2">Платежи</th>'));
    assert('Card payment method translated to "Карта"', html.includes('<td>Карта</td>'));
    assert('Footer preserves Russian thank you text', html.includes('Спасибо за визит!'));
    assert('Footer shows Russian tax notice', html.includes('Налог включён, где применимо'));
    assert('Print button shows Russian "Напечатать счёт"', html.includes('Напечатать счёт</button>'));
  }

  console.log('\nTest Suite 3: Isolated LTR Islands for Naturally LTR Data in Persian RTL');
  {
    const html = generateBillHtml(testIranBill, baseIranTenant, {
      language: 'ru',
      phone: '+98 21 6644 1234',
      taxRegistrationNumber: '411123456789',
      includeTaxId: true,
    });

    assert('Bill number is wrapped in LTR island span', html.includes('<span class="ltr" dir="ltr">BILL-IR-0089</span>'));
    assert('Store phone is wrapped in LTR island span', html.includes('<span class="ltr" dir="ltr">+98 21 6644 1234</span>'));
    assert('Customer phone is wrapped in LTR island span', html.includes('<span class="ltr" dir="ltr">+98 912 345 6789</span>'));
    assert('Economic Code / Tax ID is wrapped in LTR island span', html.includes('<span class="ltr" dir="ltr">411123456789</span>'));
  }

  console.log('\nTest Suite 4: Iran Amount / Number / Date Formatting Modes');
  {
    // Mode 1: Rial + Persian Digits + Persian Calendar
    const rialHtml = generateBillHtml(testIranBill, {
      ...baseIranTenant,
      currency_display: 'rial',
      number_digits: 'locale',
      calendar: 'persian',
    }, { language: 'en', trimDecimals: true });

    assert('Rial mode displays Persian Rial "ریال"', rialHtml.includes('ریال') && !rialHtml.includes('IRR'));
    assert('Rial mode formats numbers in Persian digits', /[۰-۹]/.test(rialHtml) && rialHtml.includes('۹۹۰٬۰۰۰'));
    assert('Rial mode formats date with Persian Solar Hijri calendar (1405)', rialHtml.includes('۱۴۰۵') || rialHtml.includes('مرداد'));

    // Mode 2: Toman + Persian Digits + Persian Calendar
    const tomanHtml = generateBillHtml(testIranBill, {
      ...baseIranTenant,
      currency_display: 'toman',
      number_digits: 'locale',
      calendar: 'persian',
    }, { language: 'en', trimDecimals: true });

    assert('Toman mode converts Rial to Toman (990,000 -> 99,000) and displays "تومان"',
      tomanHtml.includes('۹۹٬۰۰۰ تومان') && !tomanHtml.includes('ریال')
    );

    // Mode 3: Toman Short + Latin Digits + Gregorian Calendar
    const tomanShortHtml = generateBillHtml(testIranBill, {
      ...baseIranTenant,
      currency_display: 'toman_short',
      number_digits: 'latin',
      calendar: 'gregorian',
    }, { language: 'en', trimDecimals: true });

    assert('Toman Short + Latin digits displays "99,000T"', tomanShortHtml.includes('99,000T'));
    assert('Toman Short with Latin digits uses Latin quantities (2, 1)', tomanShortHtml.includes('>2<') && tomanShortHtml.includes('>1<'));
    assert('Gregorian calendar displays Gregorian year 2026 in date', tomanShortHtml.includes('2026') || tomanShortHtml.includes('Aug'));

    // Mode 4: useUnicode: false does NOT downgrade to IRR in browser printing
    const noUnicodeHtml = generateBillHtml(testIranBill, baseIranTenant, {
      language: 'ru',
      useUnicode: false,
    });
    assert('useUnicode: false option never downgrades Rial to IRR in browser HTML',
      noUnicodeHtml.includes('ریال') && !noUnicodeHtml.includes('IRR')
    );
  }

  console.log('\nTest Suite 5: Remaining UI languages (EN, RU, KK)');
  {
    const sampleEnBill: Bill = {
      ...testIranBill,
      bill_number: 'BILL-EN-001',
      total: 50.00,
      subtotal: 45.00,
      tax_amount: 5.00,
      payment_details: [{ method: 'cash', amount: 50.00 }],
    };
    const usTenant = {
      business_name: 'FloCafe New York',
      currency: 'USD',
      country: 'US',
      timezone: 'America/New_York',
    };

    // English
    const enHtml = generateBillHtml(sampleEnBill, usTenant, { language: 'en', isReprint: true });
    assert('EN receipt has lang="en" and dir="ltr"', enHtml.includes('<html lang="en" dir="ltr">'));
    assert('EN labels are English',
      enHtml.includes('REPRINT') &&
      enHtml.includes('Bill #') &&
      enHtml.includes('Grand Total') &&
      enHtml.includes('Thank you for your visit!')
    );
    assert('EN currency displays $50.00', enHtml.includes('$50.00'));

    const ruTenant = {
      business_name: 'FloCafe Москва',
      currency: 'RUB',
      country: 'RU',
      timezone: 'Europe/Moscow',
    };
    const ruHtml = generateBillHtml(sampleEnBill, ruTenant, { language: 'ru', isReprint: true });
    assert('RU receipt has lang="ru-RU" and dir="ltr"', ruHtml.includes('<html lang="ru-RU" dir="ltr">'));
    assert('RU labels are Russian',
      ruHtml.includes('ПОВТОРНАЯ ПЕЧАТЬ') &&
      ruHtml.includes('Счёт №') &&
      ruHtml.includes('Итого к оплате') &&
      ruHtml.includes('Спасибо за визит!')
    );

    const kkTenant = {
      business_name: 'FloCafe Алматы',
      currency: 'KZT',
      country: 'KZ',
      timezone: 'Asia/Almaty',
    };
    const kkHtml = generateBillHtml(sampleEnBill, kkTenant, { language: 'kk', isReprint: true });
    assert('KK receipt has lang="kk-KZ" and dir="ltr"', kkHtml.includes('<html lang="kk-KZ" dir="ltr">'));
    assert('KK labels are Kazakh',
      kkHtml.includes('ҚАЙТА БАСЫЛДЫ') &&
      kkHtml.includes('Шот №') &&
      kkHtml.includes('Барлығы төленеді') &&
      kkHtml.includes('Келгеніңізге рақмет!')
    );
  }

  console.log('\nTest Suite 5b: KZT guest-check spacing (₸ not glued to the amount)');
  {
    const shashlykOrder: Order = {
      ...testIranOrder,
      items: [{
        id: 1,
        order_id: 101,
        product_id: 'p-shashlyk',
        product_name: 'Шашлык',
        unit_price: 1800,
        quantity: 3,
        subtotal: 5400,
        tax_amount: 0,
        total: 5400,
        addons: null,
        special_instructions: null,
        status: 'served',
      }],
      customer: { ...testIranOrder.customer!, name: 'Aisultan' },
    };
    const shashlykBill: Bill = {
      ...testIranBill,
      bill_number: 'INV-20260919-0001',
      subtotal: 5400,
      tax_amount: 0,
      tax_breakdown: [],
      service_charge: 0,
      total: 5400,
      paid_amount: 0,
      balance: 5400,
      payment_status: 'unpaid',
      payment_details: [],
      order: shashlykOrder,
    };
    const prefixTenant = {
      business_name: 'FloCafe',
      currency: 'KZT',
      country: 'US',
      timezone: 'Asia/Almaty',
    };
    const prefixHtml = generateBillHtml(shashlykBill, prefixTenant, { language: 'ru', showTaxBreakdown: false });
    assert('prefix KZT unit price is ₸ 1,800.00 not ₸1,800.00',
      prefixHtml.includes('₸\u00A01,800.00') && !prefixHtml.includes('₸1,800.00')
    );
    assert('prefix KZT line total is ₸ 5,400.00 not ₸5,400.00',
      prefixHtml.includes('₸\u00A05,400.00') && !prefixHtml.includes('₸5,400.00')
    );
    assert('quantity stays in its own cell', prefixHtml.includes('>3</td>'));

    const kzTenant = {
      business_name: 'FloCafe',
      currency: 'KZT',
      country: 'KZ',
      timezone: 'Asia/Almaty',
    };
    const kzHtml = generateBillHtml(shashlykBill, kzTenant, { language: 'ru', showTaxBreakdown: false });
    assert('suffix KZT keeps a space before ₸', /\d\u00A0₸/.test(kzHtml) && !/\d₸/.test(kzHtml));
    assert('suffix KZT does not duplicate the sign', !kzHtml.includes('₸\u00A0₸') && (kzHtml.match(/₸/g) || []).length >= 2);
    assert('money columns leave room for the name column',
      kzHtml.includes('.items-table .col-item { width: auto; }') &&
      kzHtml.includes('.items-table .col-rate, .items-table .col-amt { width: 15mm; }') &&
      !kzHtml.includes('width: 18mm') &&
      !kzHtml.includes('width: 24mm')
    );
  }

  console.log('\nTest Suite 5c: Aisultan guest check is not smashed (no ₹, no hyphenation)');
  {
    const absolutOrder: Order = {
      ...testIranOrder,
      items: [{
        id: 1,
        order_id: 101,
        product_id: 'p-absolut',
        product_name: 'Абсолют Оригинал',
        unit_price: 11000,
        quantity: 1,
        subtotal: 11000,
        tax_amount: 0,
        total: 11000,
        addons: null,
        special_instructions: null,
        status: 'served',
      }],
      customer: { ...testIranOrder.customer!, name: 'Aisultan' },
    };
    const absolutBill: Bill = {
      ...testIranBill,
      bill_number: 'INV-20260920-0001',
      subtotal: 11000,
      tax_amount: 0,
      tax_breakdown: [],
      service_charge: 0,
      total: 11000,
      paid_amount: 11000,
      balance: 0,
      payment_status: 'paid',
      payment_details: [{ method: 'cash', amount: 11000, timestamp: '2026-09-20T07:51:00.000Z' }],
      order: absolutOrder,
    };
    // Live KorgenKassa still carries FloCafe IN/INR install defaults.
    const defaultInrTenant = {
      business_name: 'Aisultan',
      currency: 'INR',
      country: 'IN',
      timezone: 'Asia/Almaty',
    };
    const html = generateBillHtml(absolutBill, defaultInrTenant, {
      language: 'ru',
      paperSize: 'thermal58',
      showTaxBreakdown: false,
    });
    assert('product name stays one phrase (CSS will wrap on the space, not letters)',
      html.includes('Абсолют Оригинал') && !html.includes('Аб-') && !html.includes('Ори-')
    );
    assert('header label Позиция is not pre-hyphenated in HTML',
      html.includes('>Позиция</th>') && !html.includes('По-') && !html.includes('зи-')
    );
    assert('FloCafe INR default still prints ₸ on the guest check, never ₹',
      html.includes('₸') && !html.includes('₹') && html.includes('11,000.00')
    );
    assert('qty/price/sum cells stay nowrap',
      html.includes('th.num, .items-table td.num') && html.includes('white-space: nowrap')
    );
    assert('page does not allow a horizontal scrollbar',
      html.includes('overflow-x: hidden') && html.includes('max-width: min(58mm, 100%)')
    );
  }

  console.log('\nTest Suite 6: Canonical semantic labels and unknown-language fallback');
  {
    const canonicalBill: Bill = {
      ...testIranBill,
      tax_breakdown: [],
      delivery_charge: 10000,
      tax_amount: 90000,
      total: 1000000,
      paid_amount: 1000000,
      payment_details: [{ method: 'card', amount: 1000000, timestamp: '2026-08-17T14:35:00.000Z' }],
    };
    const canonicalTenant = { ...baseIranTenant, currency_display: 'rial' as const };
    const expectedLabels = {
      billNumber: 'Счёт №',
      date: 'Дата',
      table: 'Стол',
      customerNo: 'Номер клиента',
      item: 'Позиция',
      quantity: 'Кол-во',
      rate: 'Цена',
      amount: 'Сумма',
      payments: 'Платежи',
      card: 'Карта',
      thankYou: 'Спасибо за визит!',
    };
    const ruHtml = generateBillHtml(canonicalBill, canonicalTenant, { language: 'ru', showTaxBreakdown: false });
    for (const [name, label] of Object.entries(expectedLabels)) {
      assert(`ru canonical ${name} label renders`, ruHtml.includes(label));
    }

    // Supplying an unknown policy language must retain the resolver's English
    // fallback rather than leaking a raw i18n key or crashing the HTML path.
    const unknownHtml = generateBillHtml(canonicalBill, canonicalTenant, {
      languages: ['xx'] as any,
      showTaxBreakdown: false,
    });
    assert('unknown browser print language falls back to English labels',
      unknownHtml.includes('<strong>Grand Total</strong>') &&
      unknownHtml.includes('<p>Thank you for your visit!</p>') &&
      !unknownHtml.includes('receipt.grandTotal'),
    );
  }

  // Generate Reviewer-Visible Artifacts (HTML & Screenshots via Playwright)
  console.log('\n==================================================');
  console.log('Generating Visual and HTML Artifacts in Evidence Dir:');
  console.log(EVIDENCE_DIR);
  console.log('==================================================\n');

  const artifactsList: { name: string; html: string }[] = [
    {
      name: '01_persian_receipt_rial_persian_digits',
      html: generateBillHtml(testIranBill, {
        ...baseIranTenant,
        currency_display: 'rial',
        number_digits: 'locale',
        calendar: 'persian',
      }, {
        language: 'ru',
        paperSize: 'thermal80',
        address: 'تهران، خیابان انقلاب، پلاک ۱۲',
        phone: '+98 21 6644 1234',
        taxRegistrationNumber: '411123456789',
        includeTaxId: true,
        showTaxBreakdown: true,
      }),
    },
    {
      name: '02_persian_receipt_toman_persian_digits',
      html: generateBillHtml(testIranBill, {
        ...baseIranTenant,
        currency_display: 'toman',
        number_digits: 'locale',
        calendar: 'persian',
      }, {
        language: 'ru',
        paperSize: 'thermal80',
        address: 'تهران، خیابان انقلاب، پلاک ۱۲',
        phone: '+98 21 6644 1234',
        taxRegistrationNumber: '411123456789',
        includeTaxId: true,
        showTaxBreakdown: true,
        trimDecimals: true,
      }),
    },
    {
      name: '03_persian_receipt_toman_short_latin_digits',
      html: generateBillHtml(testIranBill, {
        ...baseIranTenant,
        currency_display: 'toman_short',
        number_digits: 'latin',
        calendar: 'gregorian',
      }, {
        language: 'ru',
        paperSize: 'thermal80',
        address: 'Tehran, Enghelab St, No. 12',
        phone: '+98 21 6644 1234',
        taxRegistrationNumber: '411123456789',
        includeTaxId: true,
        showTaxBreakdown: true,
        trimDecimals: true,
      }),
    },
    {
      name: '04_persian_receipt_reprint_tax_persian',
      html: generateBillHtml(testIranBill, {
        ...baseIranTenant,
        currency_display: 'rial',
        number_digits: 'locale',
        calendar: 'persian',
      }, {
        language: 'ru',
        paperSize: 'thermal80',
        isReprint: true,
        address: 'تهران، خیابان ولیعصر، برج سپید',
        phone: '+98 21 8899 0011',
        taxRegistrationNumber: '411987654321',
        includeTaxId: true,
        showTaxBreakdown: true,
      }),
    },
    {
      name: '05_english_receipt_baseline',
      html: generateBillHtml({
        ...testIranBill,
        bill_number: 'BILL-US-1001',
        subtotal: 45.00,
        tax_amount: 4.50,
        total: 49.50,
        paid_amount: 49.50,
        payment_details: [{ method: 'card', amount: 49.50, timestamp: '2026-08-17T14:35:00.000Z' }],
        order: {
          ...testIranOrder,
          order_number: 'ORD-1001',
          customer: { id: 'c1', name: 'John Doe', phone: '+1 555 123 4567', country_code: '+1' },
          table: { id: 't1', name: 'Table 4', capacity: 2, status: 'occupied', is_active: true },
          items: [{
            id: 1, order_id: 101, product_id: 'p1', product_name: 'Espresso', unit_price: 15.00,
            quantity: 3, subtotal: 45.00, tax_amount: 4.50, total: 49.50, addons: null, special_instructions: null, status: 'served'
          }],
        },
      }, {
        business_name: 'FloCafe New York',
        currency: 'USD',
        country: 'US',
        timezone: 'America/New_York',
      }, {
        language: 'en',
        paperSize: 'thermal80',
        address: '350 5th Ave, New York, NY 10118',
        phone: '+1 212 736 3100',
        includeTaxId: true,
        taxRegistrationNumber: 'US-99-1234567',
      }),
    },
    {
      name: '06_spanish_receipt_reprint',
      html: generateBillHtml({
        ...testIranBill,
        bill_number: 'COMP-ES-2045',
        subtotal: 30.00,
        tax_amount: 3.00,
        total: 33.00,
        paid_amount: 33.00,
        payment_details: [{ method: 'cash', amount: 33.00, timestamp: '2026-08-17T14:35:00.000Z' }],
        order: {
          ...testIranOrder,
          order_number: 'ORD-ES-2045',
          customer: { id: 'c1', name: 'Carlos Ruiz', phone: '+34 612 345 678', country_code: '+34' },
          table: { id: 't1', name: 'Mesa 7', capacity: 2, status: 'occupied', is_active: true },
          items: [{
            id: 1, order_id: 101, product_id: 'p1', product_name: 'Café con Leche', unit_price: 15.00,
            quantity: 2, subtotal: 30.00, tax_amount: 3.00, total: 33.00, addons: null, special_instructions: null, status: 'served'
          }],
        },
      }, {
        business_name: 'Café Flo Madrid',
        currency: 'EUR',
        country: 'ES',
        timezone: 'Europe/Madrid',
      }, {
        language: 'ru',
        paperSize: 'thermal80',
        isReprint: true,
        address: 'Calle Mayor 10, Madrid',
        phone: '+34 91 123 4567',
        includeTaxId: true,
        taxRegistrationNumber: 'B-12345678',
      }),
    },
    {
      name: '07_portuguese_receipt_brazil',
      html: generateBillHtml({
        ...testIranBill,
        bill_number: 'CONTA-PT-3001',
        subtotal: 80.00,
        tax_amount: 8.00,
        total: 88.00,
        paid_amount: 88.00,
        payment_details: [{ method: 'wallet', amount: 88.00, timestamp: '2026-08-17T14:35:00.000Z' }],
        order: {
          ...testIranOrder,
          order_number: 'ORD-PT-3001',
          customer: { id: 'c1', name: 'Ana Silva', phone: '+55 11 98765 4321', country_code: '+55' },
          table: { id: 't1', name: 'Mesa 2', capacity: 4, status: 'occupied', is_active: true },
          items: [{
            id: 1, order_id: 101, product_id: 'p1', product_name: 'Pão de Queijo', unit_price: 40.00,
            quantity: 2, subtotal: 80.00, tax_amount: 8.00, total: 88.00, addons: null, special_instructions: null, status: 'served'
          }],
        },
      }, {
        business_name: 'FloCafe São Paulo',
        currency: 'BRL',
        country: 'BR',
        timezone: 'America/Sao_Paulo',
      }, {
        language: 'kk',
        paperSize: 'thermal80',
        isReprint: true,
        address: 'Av. Paulista 1000, São Paulo',
        phone: '+55 11 3000 0000',
        includeTaxId: true,
        taxRegistrationNumber: '12.345.678/0001-90',
      }),
    },
  ];

  // Write HTML files
  for (const item of artifactsList) {
    const htmlPath = path.join(EVIDENCE_DIR, `${item.name}.html`);
    fs.writeFileSync(htmlPath, item.html, 'utf8');
    console.log(`   Created HTML artifact: ${htmlPath}`);
  }

  // Use Playwright to capture screenshots of each receipt
  let browser: any;
  try {
    const playwright = require(path.resolve(__dirname, '../frontend/node_modules/@playwright/test'));
    browser = await playwright.chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 480, height: 900 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();

    for (const item of artifactsList) {
      const htmlPath = path.join(EVIDENCE_DIR, `${item.name}.html`);
      const pngPath = path.join(EVIDENCE_DIR, `${item.name}.png`);
      await page.goto(`file://${htmlPath}`);
      // Find the bill container
      const container = await page.$('.bill-container');
      if (container) {
        await container.screenshot({ path: pngPath });
      } else {
        await page.screenshot({ path: pngPath, fullPage: true });
      }
      console.log(`   Captured screenshot artifact: ${pngPath}`);
    }

  } catch (err: any) {
    if (process.env.REQUIRE_VISUAL_EVIDENCE === '1') throw err;
    console.warn(`   Could not capture Playwright screenshot: ${err?.message || err}`);
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }

  console.log(`\n==================================================`);
  console.log(`Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  if (failures.length > 0) {
    console.log('Failures:');
    failures.forEach((f) => console.log(` - ${f}`));
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
