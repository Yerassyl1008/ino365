/* GENERATED FILE — edit messages, then run `npm run generate:print-labels`. */
// Derived view of frontend/src/lib/i18n/messages/*.json for backend thermal
// printing (#440). Do not edit by hand: regeneration must be byte-identical.

/** Stable concept identifiers resolvable through printLabel(). */
export type PrintConceptId =
  | 'print.taxInvoiceTitle'
  | 'print.invoiceTitle'
  | 'print.invoiceNumber'
  | 'print.time'
  | 'print.customerShort'
  | 'print.numberShort'
  | 'print.address'
  | 'print.call'
  | 'print.note'
  | 'print.phoneLong'
  | 'print.subtotalExclTax'
  | 'print.serviceChargeShort'
  | 'print.grandTotal'
  | 'print.thankYouShort'
  | 'print.thankYouVisitAgain'
  | 'print.pleaseComeAgain'
  | 'print.ratesInclusiveNote'
  | 'print.pointsEarned'
  | 'print.pointsBalance'
  | 'print.pointsRedeemed'
  | 'print.kot.title'
  | 'print.kot.banner'
  | 'print.kot.station'
  | 'print.kot.type'
  | 'print.kot.noPendingItems'
  | 'print.kot.end'
  | 'print.hsn'
  | 'print.test.title'
  | 'print.test.networkUsb'
  | 'print.test.columns'
  | 'print.test.wrapHint'
  | 'print.test.success'
  | 'receipt.billNumber'
  | 'receipt.date'
  | 'pos.tableLabel'
  | 'pos.customer'
  | 'receipt.customerNo'
  | 'receipt.phone'
  | 'receipt.item'
  | 'receipt.qty'
  | 'receipt.rate'
  | 'receipt.amount'
  | 'printTest.amt'
  | 'pos.subtotal'
  | 'pos.discount'
  | 'pos.tax'
  | 'pos.delivery'
  | 'receipt.totalTax'
  | 'receipt.serviceCharge'
  | 'receipt.taxDetails'
  | 'receipt.payments'
  | 'receipt.thankYou'
  | 'receipt.taxIncluded'
  | 'receipt.reprint'
  | 'receipt.onlineOrder'
  | 'pos.orderNumber'
  | 'pos.orderTypeDineIn'
  | 'pos.orderTypeDelivery'
  | 'pos.orderTypeOnline'
  | 'pos.orderTypeTakeaway'
  | 'pos.methodCash'
  | 'pos.methodCard'
  | 'pos.methodWallet'
  ;

export const PRINT_LABEL_LANGUAGES = [
  'en',
  'ru',
  'kk',
] as const;

export type PrintLabelLanguage = (typeof PRINT_LABEL_LANGUAGES)[number];

type PrintLabelTable = Record<PrintConceptId, string>;

const PRINT_LABELS: Record<PrintLabelLanguage, PrintLabelTable> = {
  en: {
    'print.taxInvoiceTitle': "TAX INVOICE",
    'print.invoiceTitle': "INVOICE",
    'print.invoiceNumber': "Invoice #:",
    'print.time': "Time",
    'print.customerShort': "Customer",
    'print.numberShort': "Customer No",
    'print.address': "Address",
    'print.call': "Call",
    'print.note': "Note",
    'print.phoneLong': "Phone",
    'print.subtotalExclTax': "Subtotal (excl. tax)",
    'print.serviceChargeShort': "Service Chg",
    'print.grandTotal': "TOTAL",
    'print.thankYouShort': "Thank you!",
    'print.thankYouVisitAgain': "Thank you for your visit!",
    'print.pleaseComeAgain': "Please come again!",
    'print.ratesInclusiveNote': "Rates are inclusive of taxes",
    'print.pointsEarned': "Points Earned",
    'print.pointsBalance': "Points Balance",
    'print.pointsRedeemed': "Points Redeemed",
    'print.kot.title': "Kitchen Order Ticket",
    'print.kot.banner': "KITCHEN ORDER TICKET",
    'print.kot.station': "Station",
    'print.kot.type': "Type",
    'print.kot.noPendingItems': "No pending items",
    'print.kot.end': "END",
    'print.hsn': "HSN",
    'print.test.title': "Flo Printer Test",
    'print.test.networkUsb': "Network / USB test print",
    'print.test.columns': "Columns",
    'print.test.wrapHint': "If the next line wraps, choose a smaller column value.",
    'print.test.success': "If you can read this, your printer is working!",
    'receipt.billNumber': "Bill #",
    'receipt.date': "Date",
    'pos.tableLabel': "Table: {name}",
    'pos.customer': "Customer",
    'receipt.customerNo': "Customer No",
    'receipt.phone': "Ph",
    'receipt.item': "Item",
    'receipt.qty': "Qty",
    'receipt.rate': "Rate",
    'receipt.amount': "Amount",
    'printTest.amt': "Amt",
    'pos.subtotal': "Subtotal",
    'pos.discount': "Discount",
    'pos.tax': "Tax",
    'pos.delivery': "Delivery",
    'receipt.totalTax': "Total Tax",
    'receipt.serviceCharge': "Service Charge",
    'receipt.taxDetails': "Tax Details",
    'receipt.payments': "Payments",
    'receipt.thankYou': "Thank you for your visit!",
    'receipt.taxIncluded': "Tax included where applicable",
    'receipt.reprint': "REPRINT",
    'receipt.onlineOrder': "ONLINE ORDER",
    'pos.orderNumber': "Order #{number}",
    'pos.orderTypeDineIn': "Dine in",
    'pos.orderTypeDelivery': "Delivery",
    'pos.orderTypeOnline': "Online",
    'pos.orderTypeTakeaway': "Takeaway",
    'pos.methodCash': "Cash",
    'pos.methodCard': "Card",
    'pos.methodWallet': "Wallet",
  },
  ru: {
    'print.taxInvoiceTitle': "НАЛОГОВЫЙ СЧЁТ",
    'print.invoiceTitle': "СЧЁТ",
    'print.invoiceNumber': "Счёт №:",
    'print.time': "Время",
    'print.customerShort': "Клиент",
    'print.numberShort': "Номер клиента",
    'print.address': "Адрес",
    'print.call': "Тел.",
    'print.note': "Примечание",
    'print.phoneLong': "Телефон",
    'print.subtotalExclTax': "Подытог (без налога)",
    'print.serviceChargeShort': "Серв. сбор",
    'print.grandTotal': "ИТОГО",
    'print.thankYouShort': "Спасибо!",
    'print.thankYouVisitAgain': "Спасибо за визит!",
    'print.pleaseComeAgain': "Приходите ещё!",
    'print.ratesInclusiveNote': "Цены указаны с учётом налогов",
    'print.pointsEarned': "Начислено баллов",
    'print.pointsBalance': "Остаток баллов",
    'print.pointsRedeemed': "Списано баллов",
    'print.kot.title': "Заказ для кухни",
    'print.kot.banner': "ЗАКАЗ ДЛЯ КУХНИ",
    'print.kot.station': "Станция",
    'print.kot.type': "Тип",
    'print.kot.noPendingItems': "Нет позиций в ожидании",
    'print.kot.end': "КОНЕЦ",
    'print.hsn': "HSN",
    'print.test.title': "Проверка принтера Flo",
    'print.test.networkUsb': "Тестовая печать по сети / USB",
    'print.test.columns': "Столбцы",
    'print.test.wrapHint': "Если следующая строка переносится, выберите меньшее число столбцов.",
    'print.test.success': "Если вы это читаете — принтер работает!",
    'receipt.billNumber': "Счёт №",
    'receipt.date': "Дата",
    'pos.tableLabel': "Стол: {name}",
    'pos.customer': "Клиент",
    'receipt.customerNo': "Номер клиента",
    'receipt.phone': "Тел",
    'receipt.item': "Позиция",
    'receipt.qty': "Кол-во",
    'receipt.rate': "Цена",
    'receipt.amount': "Сумма",
    'printTest.amt': "Сумма",
    'pos.subtotal': "Подытог",
    'pos.discount': "Скидка",
    'pos.tax': "Налог",
    'pos.delivery': "Доставка",
    'receipt.totalTax': "Всего налога",
    'receipt.serviceCharge': "Сервисный сбор",
    'receipt.taxDetails': "Детали налога",
    'receipt.payments': "Платежи",
    'receipt.thankYou': "Спасибо за визит!",
    'receipt.taxIncluded': "Налог включён, где применимо",
    'receipt.reprint': "ПОВТОРНАЯ ПЕЧАТЬ",
    'receipt.onlineOrder': "ОНЛАЙН-ЗАКАЗ",
    'pos.orderNumber': "Заказ №{number}",
    'pos.orderTypeDineIn': "В зале",
    'pos.orderTypeDelivery': "Доставка",
    'pos.orderTypeOnline': "Онлайн",
    'pos.orderTypeTakeaway': "На вынос",
    'pos.methodCash': "Наличные",
    'pos.methodCard': "Карта",
    'pos.methodWallet': "Бонусный счёт",
  },
  kk: {
    'print.taxInvoiceTitle': "САЛЫҚ ШОТЫ",
    'print.invoiceTitle': "ШОТ",
    'print.invoiceNumber': "Шот №:",
    'print.time': "Уақыты",
    'print.customerShort': "Клиент",
    'print.numberShort': "Клиент нөмірі",
    'print.address': "Мекенжай",
    'print.call': "Тел.",
    'print.note': "Ескертпе",
    'print.phoneLong': "Телефон",
    'print.subtotalExclTax': "Аралық сома (салықсыз)",
    'print.serviceChargeShort': "Қызм. ақысы",
    'print.grandTotal': "ЖИЫНТЫҚ",
    'print.thankYouShort': "Рақмет!",
    'print.thankYouVisitAgain': "Келгеніңізге рақмет!",
    'print.pleaseComeAgain': "Тағы келіңіз!",
    'print.ratesInclusiveNote': "Бағаларға салық қосылған",
    'print.pointsEarned': "Есептелген баллдар",
    'print.pointsBalance': "Баллдар қалдығы",
    'print.pointsRedeemed': "Жұмсалған баллдар",
    'print.kot.title': "Ас үй тапсырысы",
    'print.kot.banner': "АС ҮЙ ТАПСЫРЫСЫ",
    'print.kot.station': "Бекет",
    'print.kot.type': "Түрі",
    'print.kot.noPendingItems': "Күтудегі позициялар жоқ",
    'print.kot.end': "СОҢЫ",
    'print.hsn': "HSN",
    'print.test.title': "Flo принтерін тексеру",
    'print.test.networkUsb': "Желі / USB арқылы сынама басып шығару",
    'print.test.columns': "Бағандар",
    'print.test.wrapHint': "Келесі жол тасымалданса, бағандардың кіші мәнін таңдаңыз.",
    'print.test.success': "Мұны оқып отырсаңыз, принтеріңіз жұмыс істеп тұр!",
    'receipt.billNumber': "Шот №",
    'receipt.date': "Күні",
    'pos.tableLabel': "Үстел: {name}",
    'pos.customer': "Клиент",
    'receipt.customerNo': "Клиент нөмірі",
    'receipt.phone': "Тел",
    'receipt.item': "Позиция",
    'receipt.qty': "Саны",
    'receipt.rate': "Бағасы",
    'receipt.amount': "Сома",
    'printTest.amt': "Сома",
    'pos.subtotal': "Аралық сома",
    'pos.discount': "Жеңілдік",
    'pos.tax': "Салық",
    'pos.delivery': "Жеткізу",
    'receipt.totalTax': "Жалпы салық",
    'receipt.serviceCharge': "Қызмет ақысы",
    'receipt.taxDetails': "Салық мәліметтері",
    'receipt.payments': "Төлемдер",
    'receipt.thankYou': "Келгеніңізге рақмет!",
    'receipt.taxIncluded': "Қажет жерде салық қосылған",
    'receipt.reprint': "ҚАЙТА БАСЫЛДЫ",
    'receipt.onlineOrder': "ОНЛАЙН ТАПСЫРЫС",
    'pos.orderNumber': "№{number} тапсырыс",
    'pos.orderTypeDineIn': "Залда",
    'pos.orderTypeDelivery': "Жеткізу",
    'pos.orderTypeOnline': "Онлайн",
    'pos.orderTypeTakeaway': "Алып кету",
    'pos.methodCash': "Қолма-қол",
    'pos.methodCard': "Карта",
    'pos.methodWallet': "Бонус шоты",
  },
};

/**
 * Resolve a receipt/KOT label concept in the requested language.
 * Unknown languages and unknown languages missing individual entries fall
 * back to English so a receipt always renders real labels, never raw keys.
 */
export function printLabel(lang: string, conceptId: PrintConceptId): string {
  const table = (PRINT_LABELS as Record<string, PrintLabelTable | undefined>)[lang];
  return table?.[conceptId] ?? PRINT_LABELS.en[conceptId];
}

/** True when the generated view carries a dedicated table for `lang`. */
export function isGeneratedPrintLanguage(lang: string): lang is PrintLabelLanguage {
  return (PRINT_LABELS as Record<string, unknown>).hasOwnProperty(lang);
}
