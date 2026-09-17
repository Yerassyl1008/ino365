export const WORKBENCH_HREF = '/dashboard';
export const ADVISOR_HREF = '/advisor';

export type WorkspaceLabelKey =
  | 'abcAnalysis'
  | 'about'
  | 'account'
  | 'advisor'
  | 'appearance'
  | 'backupData'
  | 'billsReport'
  | 'cancelledOrders'
  | 'configuration'
  | 'customers'
  | 'dayCloseReport'
  | 'discounts'
  | 'financialReport'
  | 'kds'
  | 'kdsSettings'
  | 'loyalty'
  | 'menu'
  | 'mobileAccess'
  | 'modifiers'
  | 'orders'
  | 'orderflow'
  | 'paymentMethods'
  | 'pos'
  | 'posWorkflow'
  | 'printers'
  | 'printTest'
  | 'privacy'
  | 'productAnalytics'
  | 'products'
  | 'recipes'
  | 'salesAnalytics'
  | 'serviceChargeReport'
  | 'staff'
  | 'staffAnalytics'
  | 'stock'
  | 'stockBalances'
  | 'stockMovements'
  | 'support'
  | 'tables'
  | 'tablesideOrdering'
  | 'taxSettings'
  | 'updates'
  | 'whatsapp'
  | 'whatsappSettings'
  | 'workbench';

const HREF_LABELS: Array<{ href: string; labelKey: WorkspaceLabelKey }> = [
  { href: WORKBENCH_HREF, labelKey: 'workbench' },
  { href: ADVISOR_HREF, labelKey: 'advisor' },
  { href: '/analytics/sales', labelKey: 'salesAnalytics' },
  { href: '/analytics/abc', labelKey: 'abcAnalysis' },
  { href: '/analytics/staff', labelKey: 'staffAnalytics' },
  { href: '/analytics/products', labelKey: 'productAnalytics' },
  { href: '/reports/day-close', labelKey: 'dayCloseReport' },
  { href: '/reports/financial', labelKey: 'financialReport' },
  { href: '/reports/service-charge', labelKey: 'serviceChargeReport' },
  { href: '/pos', labelKey: 'pos' },
  { href: '/orders?status=cancelled', labelKey: 'cancelledOrders' },
  { href: '/orders', labelKey: 'billsReport' },
  { href: '/whatsapp', labelKey: 'whatsapp' },
  { href: '/products', labelKey: 'menu' },
  { href: '/addon-groups', labelKey: 'modifiers' },
  { href: '/stock', labelKey: 'stock' },
  { href: '/warehouse?tab=recipes', labelKey: 'recipes' },
  { href: '/warehouse?tab=movements', labelKey: 'stockMovements' },
  { href: '/warehouse?tab=ingredients', labelKey: 'stockBalances' },
  { href: '/tables', labelKey: 'tables' },
  { href: '/kds', labelKey: 'kds' },
  { href: '/print-test', labelKey: 'printTest' },
  { href: '/settings?tab=kds', labelKey: 'kdsSettings' },
  { href: '/settings?tab=receipts-printers', labelKey: 'printers' },
  { href: '/settings?tab=payments', labelKey: 'paymentMethods' },
  { href: '/settings?tab=discounts', labelKey: 'discounts' },
  { href: '/settings?tab=loyalty', labelKey: 'loyalty' },
  { href: '/settings?tab=pos', labelKey: 'posWorkflow' },
  { href: '/settings?tab=tax', labelKey: 'taxSettings' },
  { href: '/settings?tab=appearance', labelKey: 'appearance' },
  { href: '/settings?tab=whatsapp', labelKey: 'whatsappSettings' },
  { href: '/settings?tab=mobile-access', labelKey: 'mobileAccess' },
  { href: '/settings?tab=data', labelKey: 'backupData' },
  { href: '/settings?tab=orderflow', labelKey: 'orderflow' },
  { href: '/settings?tab=server-app', labelKey: 'tablesideOrdering' },
  { href: '/settings?tab=account', labelKey: 'account' },
  { href: '/settings?tab=privacy', labelKey: 'privacy' },
  { href: '/settings?tab=updates', labelKey: 'updates' },
  { href: '/settings?tab=about', labelKey: 'about' },
  { href: '/customers', labelKey: 'customers' },
  { href: '/staff', labelKey: 'staff' },
  { href: '/settings', labelKey: 'configuration' },
  { href: '/support', labelKey: 'support' },
];

export function normalizeWorkspaceHref(href: string): string {
  const [path, rawQuery] = href.split('?');
  const cleanPath = (path.replace(/\/+$/, '') || '/') as string;
  const params = new URLSearchParams(rawQuery || '');
  if (cleanPath === '/settings') {
    const tab = params.get('tab');
    return tab ? `/settings?tab=${tab}` : cleanPath;
  }
  if (cleanPath === '/orders' && params.get('status') === 'cancelled') {
    return '/orders?status=cancelled';
  }
  if (cleanPath === '/warehouse') {
    const tab = params.get('tab');
    if (tab === 'recipes' || tab === 'movements' || tab === 'ingredients') {
      return `/warehouse?tab=${tab}`;
    }
    return '/warehouse?tab=ingredients';
  }
  if (!rawQuery) return cleanPath;
  return cleanPath;
}

export function workspaceLabelForHref(href: string): WorkspaceLabelKey | null {
  const normalized = normalizeWorkspaceHref(href);
  const exact = HREF_LABELS.find((row) => row.href === normalized);
  if (exact) return exact.labelKey;
  const byPath = HREF_LABELS.find((row) => row.href === normalized.split('?')[0]);
  return byPath?.labelKey ?? null;
}
