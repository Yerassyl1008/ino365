'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  LayoutDashboard,
  ShoppingCart,
  ClipboardList,
  Package,
  Grid3X3,
  Users,
  UserCog,
  Settings,
  LogOut,
  Lock,
  ChefHat,
  UserCircle,
  MessageCircle,
  LifeBuoy,
  ChevronDown,
  Sun,
  Moon,
  Monitor,
  Languages,
  Boxes,
  Lightbulb,
  Search,
  BarChart3,
  PieChart,
  Tags,
  Ban,
  ReceiptText,
  Wallet,
  ArrowLeftRight,
  SlidersHorizontal,
  FileText,
  ConciergeBell,
  ListChecks,
  type LucideIcon,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslations, type AppConfig } from 'use-intl';
import { LANGUAGES, type Language } from '@/lib/i18n';
import { useAuthStore } from '@/store/auth';
import { useCartStore } from '@/store/cart';
import { usePosSettingsStore } from '@/store/pos-settings';
import { useWorkspaceTabs } from '@/store/workspace-tabs';
import { getLandingPage } from '@/components/layout/AuthGuard';
import api from '@/lib/api';
import { useConfirm } from '@/hooks/use-confirm';
import { useThemeModeToggle } from '@/hooks/useThemeModeToggle';
import { ROLE_ACCESS, hasRole, type Role } from '@shared/role-permissions';
import { ADVISOR_HREF, WORKBENCH_HREF } from '@/lib/workspace-nav';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';

type NavKey = keyof AppConfig['Messages']['nav'];

interface NavItem {
  href: string;
  labelKey: NavKey;
  icon: LucideIcon;
  roles: readonly Role[];
  businessTypes: string[] | null;
}

type NavSectionId =
  | 'recent'
  | 'work'
  | 'reports'
  | 'warehouse'
  | 'apps'
  | 'settings';

const ALL_NAV_ITEMS: NavItem[] = [
  { href: '/pos', labelKey: 'pos', icon: ShoppingCart, roles: ROLE_ACCESS.sales, businessTypes: null },
  { href: '/tables', labelKey: 'tables', icon: Grid3X3, roles: ROLE_ACCESS.ownerManager, businessTypes: ['restaurant'] },
  { href: '/orders', labelKey: 'orders', icon: ClipboardList, roles: ROLE_ACCESS.ownerManagerCashier, businessTypes: null },
  { href: '/orders?status=cancelled', labelKey: 'cancelledOrders', icon: Ban, roles: ROLE_ACCESS.ownerManagerCashier, businessTypes: null },
  { href: '/products', labelKey: 'menu', icon: Package, roles: ROLE_ACCESS.ownerManager, businessTypes: null },
  { href: '/addon-groups', labelKey: 'modifiers', icon: SlidersHorizontal, roles: ROLE_ACCESS.ownerManager, businessTypes: ['restaurant'] },
  { href: '/customers', labelKey: 'customers', icon: Users, roles: ROLE_ACCESS.ownerManager, businessTypes: null },
  { href: WORKBENCH_HREF, labelKey: 'workbench', icon: LayoutDashboard, roles: ROLE_ACCESS.owner, businessTypes: null },
  { href: ADVISOR_HREF, labelKey: 'advisor', icon: Lightbulb, roles: ROLE_ACCESS.owner, businessTypes: null },
  { href: '/analytics/sales', labelKey: 'salesAnalytics', icon: BarChart3, roles: ROLE_ACCESS.ownerManager, businessTypes: null },
  { href: '/analytics/abc', labelKey: 'abcAnalysis', icon: PieChart, roles: ROLE_ACCESS.ownerManager, businessTypes: null },
  { href: '/analytics/staff', labelKey: 'staffAnalytics', icon: UserCog, roles: ROLE_ACCESS.ownerManager, businessTypes: null },
  { href: '/analytics/products', labelKey: 'productAnalytics', icon: Tags, roles: ROLE_ACCESS.ownerManager, businessTypes: null },
  { href: '/reports/day-close', labelKey: 'dayCloseReport', icon: ReceiptText, roles: ROLE_ACCESS.ownerManager, businessTypes: null },
  { href: '/reports/financial', labelKey: 'financialReport', icon: Wallet, roles: ROLE_ACCESS.owner, businessTypes: null },
  { href: '/reports/service-charge', labelKey: 'serviceChargeReport', icon: ConciergeBell, roles: ROLE_ACCESS.owner, businessTypes: null },
  { href: '/warehouse?tab=movements', labelKey: 'stockMovements', icon: ArrowLeftRight, roles: ROLE_ACCESS.ownerManager, businessTypes: ['restaurant'] },
  { href: '/warehouse?tab=recipes', labelKey: 'recipes', icon: ClipboardList, roles: ROLE_ACCESS.ownerManager, businessTypes: ['restaurant'] },
  { href: '/warehouse?tab=ingredients', labelKey: 'stockBalances', icon: Boxes, roles: ROLE_ACCESS.ownerManager, businessTypes: ['restaurant'] },
  { href: '/warehouse?tab=count', labelKey: 'stockCount', icon: ListChecks, roles: ROLE_ACCESS.ownerManager, businessTypes: ['restaurant'] },
  { href: '/stock', labelKey: 'stockBalances', icon: Boxes, roles: ROLE_ACCESS.ownerManager, businessTypes: ['retail'] },
  { href: '/staff', labelKey: 'staff', icon: UserCog, roles: ROLE_ACCESS.ownerManager, businessTypes: null },
  { href: '/whatsapp', labelKey: 'whatsapp', icon: MessageCircle, roles: ROLE_ACCESS.ownerManagerCashier, businessTypes: null },
  { href: '/kds', labelKey: 'kds', icon: ChefHat, roles: ['chef'], businessTypes: ['restaurant'] },
  { href: '/print-test', labelKey: 'printTest', icon: FileText, roles: ROLE_ACCESS.ownerManager, businessTypes: null },
  { href: '/settings', labelKey: 'settings', icon: Settings, roles: ROLE_ACCESS.ownerManager, businessTypes: null },
  { href: '/support', labelKey: 'support', icon: LifeBuoy, roles: ROLE_ACCESS.allStaff, businessTypes: null },
];

const NAV_SECTIONS: Array<{ id: NavSectionId; labelKey: NavKey; hrefs: string[] }> = [
  { id: 'work', labelKey: 'work', hrefs: ['/pos', '/tables', '/orders', '/orders?status=cancelled', '/products', '/addon-groups', '/customers', '/staff'] },
  { id: 'reports', labelKey: 'analytics', hrefs: [WORKBENCH_HREF, ADVISOR_HREF, '/analytics/sales', '/analytics/abc', '/analytics/staff', '/analytics/products', '/reports/day-close', '/reports/financial', '/reports/service-charge'] },
  { id: 'warehouse', labelKey: 'sectionWarehouse', hrefs: ['/warehouse?tab=movements', '/warehouse?tab=recipes', '/warehouse?tab=ingredients', '/warehouse?tab=count', '/stock'] },
  { id: 'apps', labelKey: 'apps', hrefs: ['/whatsapp', '/kds', '/print-test'] },
  { id: 'settings', labelKey: 'settings', hrefs: ['/settings'] },
];

const SELECTABLE_LANGUAGES: Language[] = (Object.keys(LANGUAGES) as Language[]).filter(
  (lang) => LANGUAGES[lang].selectable,
);

export default function AppSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, currentTenant, logout } = useAuthStore();
  const clearCart = useCartStore((s) => s.clearCart);
  const { tablesRequired, kdsEnabled, whatsappEnabled, setTablesRequired, setKdsEnabled, setWhatsappEnabled, language, setLanguage } = usePosSettingsStore();
  const { isMobile, setOpenMobile, state } = useSidebar();
  const { recentHrefs, openTab } = useWorkspaceTabs();
  const t = useTranslations('nav');
  const tCommon = useTranslations('common');
  const { confirm, ConfirmDialog } = useConfirm();
  const [emailNeedsAttention, setEmailNeedsAttention] = useState(false);
  const [query, setQuery] = useState('');
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    recent: true,
    work: true,
    reports: true,
    warehouse: false,
    apps: false,
    settings: false,
  });
  const closeMobile = () => { if (isMobile) setOpenMobile(false); };
  const tSettings = useTranslations('settings');
  const { mode: themeMode, cycle: cycleThemeMode } = useThemeModeToggle();
  const themeModeIcon = themeMode === 'light' ? Sun : themeMode === 'dark' ? Moon : Monitor;
  const themeModeLabel = themeMode === 'light'
    ? tSettings('themeLight')
    : themeMode === 'dark'
      ? tSettings('themeDark')
      : tSettings('themeSystem');
  const ThemeModeIcon = themeModeIcon;

  const role = currentTenant?.role || 'cashier';
  const businessType = currentTenant?.business_type || 'restaurant';
  const canPersistStoreSettings = hasRole(role, ROLE_ACCESS.ownerManager);

  const changeLanguage = (next: Language) => {
    if (next === language) return;
    setLanguage(next);
    if (!canPersistStoreSettings) return;
    api.put('/settings/business', { language: next }).catch(() => toast.error(tSettings('saveFailed')));
  };

  const navItems = ALL_NAV_ITEMS.filter((item) => {
    if (item.href === '/tables' && !tablesRequired) return false;
    if (item.href === '/kds' && !kdsEnabled) return false;
    if (item.href === '/whatsapp' && !whatsappEnabled) return false;
    return hasRole(role, item.roles)
      && (item.businessTypes === null || item.businessTypes.includes(businessType));
  });

  const visibleByHref = useMemo(
    () => new Map(navItems.map((item) => [item.href, item])),
    [navItems],
  );

  const needle = query.trim().toLocaleLowerCase();
  const matchesQuery = (item: NavItem) => {
    if (!needle) return true;
    return t(item.labelKey).toLocaleLowerCase().includes(needle);
  };

  const resolveHrefs = (hrefs: string[]) => hrefs
    .map((href) => visibleByHref.get(href))
    .filter((item): item is NavItem => Boolean(item && matchesQuery(item)));

  const groupedNav = hasRole(role, ROLE_ACCESS.ownerManager);
  const sections = groupedNav
    ? NAV_SECTIONS.map((section) => ({
        ...section,
        items: resolveHrefs(section.hrefs),
      })).filter((section) => section.items.length > 0)
    : [{ id: 'work' as NavSectionId, labelKey: 'work' as NavKey, hrefs: [], items: navItems.filter(matchesQuery) }];

  const recentItems = recentHrefs
    .map((href) => visibleByHref.get(href))
    .filter((item): item is NavItem => Boolean(item && matchesQuery(item)))
    .slice(0, 6);

  const homeHref = getLandingPage(role, businessType);

  useEffect(() => {
    if (!currentTenant) return;
    api.get('/settings/business')
      .then((res) => {
        setTablesRequired(typeof res.data.tables_required === 'boolean' ? res.data.tables_required : true);
      })
      .catch(() => { });
    api.get('/settings/kds_enabled')
      .then((res) => setKdsEnabled(res.data.setting?.value !== 'false'))
      .catch(() => { });
    if (hasRole(role, ROLE_ACCESS.ownerManagerCashier)) {
      api.get('/whatsapp/status')
        .then((res) => setWhatsappEnabled(!!res.data?.enabled))
        .catch(() => { });
    }
  }, [currentTenant, role, setTablesRequired, setKdsEnabled, setWhatsappEnabled]);

  useEffect(() => {
    if (!hasRole(role, ROLE_ACCESS.owner)) return;
    let active = true;
    const refreshCloudAttention = async () => {
      try {
        const [accountResponse, cloudResponse] = await Promise.all([
          api.get('/settings/cloud/account'),
          api.get('/settings/cloud'),
        ]);
        if (!active) return;
        const deletionStatus = accountResponse.data?.deletion_request?.status || cloudResponse.data?.cloud_deletion_status;
        setEmailNeedsAttention(
          (accountResponse.data?.cloud_account_available !== false && Boolean(accountResponse.data?.email) && !accountResponse.data?.verified)
          || ['pending', 'processing', 'failed'].includes(deletionStatus)
        );
      } catch {
        if (active) setEmailNeedsAttention(false);
      }
    };
    void refreshCloudAttention();
    window.addEventListener('flo:cloud-account-status-changed', refreshCloudAttention);
    return () => {
      active = false;
      window.removeEventListener('flo:cloud-account-status-changed', refreshCloudAttention);
    };
  }, [role]);

  const renderItem = (item: NavItem, keyPrefix = '') => {
    const [hrefPath, hrefQuery] = item.href.split('?');
    const wanted = new URLSearchParams(hrefQuery || '');
    const wantedTab = wanted.get('tab');
    const wantedStatus = wanted.get('status');
    const currentTab = searchParams.get('tab');
    const currentStatus = searchParams.get('status');
    let isActive = pathname === hrefPath;
    if (isActive) {
      if (hrefPath === '/warehouse') {
        const effectiveTab = currentTab || 'ingredients';
        isActive = (wantedTab || 'ingredients') === effectiveTab;
      } else if (wantedTab) isActive = currentTab === wantedTab;
      else if (wantedStatus) isActive = currentStatus === wantedStatus;
      else if (hrefPath === '/settings') isActive = pathname === '/settings';
      else if (hrefPath === '/orders') isActive = currentStatus !== 'cancelled';
    }
    return (
      <SidebarMenuItem key={`${keyPrefix}${item.href}`}>
        <SidebarMenuButton asChild isActive={isActive} tooltip={t(item.labelKey)}>
          <Link
            href={item.href}
            onClick={() => {
              openTab(item.href);
              closeMobile();
            }}
          >
            <span className="relative flex size-4 shrink-0 items-center justify-center">
              <item.icon className="size-4 shrink-0" />
              {(item.href === '/settings') && emailNeedsAttention && (
                <span aria-label="Email verification required" className="absolute -end-1 -top-1 h-2 w-2 rounded-full bg-red-500 ring-2 ring-sidebar" />
              )}
            </span>
            <span>{t(item.labelKey)}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  const toggleSection = (id: string) => {
    setOpenSections((current) => ({ ...current, [id]: !current[id] }));
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href={homeHref} onClick={() => { openTab(homeHref); closeMobile(); }}>
                <div className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground font-semibold">
                  {(currentTenant?.business_name || tCommon('brandName')).charAt(0).toUpperCase()}
                </div>
                <div className="flex flex-col gap-0.5 min-w-0 leading-none">
                  <span className="font-semibold truncate">{currentTenant?.business_name || tCommon('brandName')}</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        {groupedNav && (
          <div className="px-2 group-data-[collapsible=icon]:hidden">
            <div className="relative">
              <Search className="pointer-events-none absolute start-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <SidebarInput
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('menuSearch')}
                className="ps-7"
                aria-label={t('menuSearch')}
              />
            </div>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        {groupedNav && (
          <SidebarGroup>
            <button
              type="button"
              onClick={() => toggleSection('recent')}
              className="flex w-full min-w-0 items-center gap-1 px-2 group-data-[collapsible=icon]:hidden"
            >
              <SidebarGroupLabel className="min-w-0 flex-1 px-0 uppercase tracking-wide whitespace-nowrap text-sidebar-foreground font-semibold">
                {t('recent')}
              </SidebarGroupLabel>
              <ChevronDown className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${openSections.recent ? '' : '-rotate-90'}`} />
            </button>
            {(needle || openSections.recent || state === 'collapsed') && (
              <SidebarGroupContent>
                <SidebarMenu>
                  {recentItems.length === 0
                    ? <p className="px-2 py-1 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">{t('noRecent')}</p>
                    : recentItems.map((item) => renderItem(item))}
                </SidebarMenu>
              </SidebarGroupContent>
            )}
          </SidebarGroup>
        )}

        {sections.map((section) => {
          const expanded = !groupedNav || Boolean(needle) || openSections[section.id] || state === 'collapsed';
          return (
            <SidebarGroup key={section.id}>
              {groupedNav && (
                <button
                  type="button"
                  onClick={() => toggleSection(section.id)}
                  className="flex w-full min-w-0 items-center gap-1 px-2 group-data-[collapsible=icon]:hidden"
                >
                  <SidebarGroupLabel className="min-w-0 flex-1 px-0 uppercase tracking-wide whitespace-nowrap text-sidebar-foreground font-semibold">
                    {t(section.labelKey)}
                  </SidebarGroupLabel>
                  <ChevronDown className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${expanded ? '' : '-rotate-90'}`} />
                </button>
              )}
              {expanded && (
                <SidebarGroupContent>
                  <SidebarMenu>
                    {section.items.map((item) => renderItem(item))}
                  </SidebarMenu>
                </SidebarGroupContent>
              )}
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  tooltip={`${tSettings('languages')}: ${LANGUAGES[language].nativeName}`}
                >
                  <Languages className="size-4 shrink-0" />
                  <span>{tSettings('languages')}</span>
                  <span className="ms-auto text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                    {LANGUAGES[language].nativeName}
                  </span>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side={isMobile ? 'bottom' : 'top'}
                align={isMobile ? 'end' : 'start'}
                className="w-48 rounded-lg"
              >
                <DropdownMenuRadioGroup
                  value={language}
                  onValueChange={(value) => changeLanguage(value as Language)}
                >
                  {SELECTABLE_LANGUAGES.map((lang) => (
                    <DropdownMenuRadioItem key={lang} value={lang} className="cursor-pointer">
                      {LANGUAGES[lang].nativeName}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={cycleThemeMode}
              tooltip={`${tSettings('themeTitle')}: ${themeModeLabel}`}
            >
              <ThemeModeIcon className="size-4 shrink-0" />
              <span>{tSettings('themeTitle')}</span>
              <span className="ms-auto text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                {themeModeLabel}
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  className="rounded-xl border-0 bg-sidebar-accent/60 hover:bg-sidebar-accent hover:shadow-xs data-[state=open]:bg-sidebar-accent/90 transition-all h-9 px-3 font-normal group-data-[collapsible=icon]:h-8! group-data-[collapsible=icon]:p-2! group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:rounded-lg"
                  tooltip={user?.name || user?.email || t('user')}
                >
                  <UserCircle className="size-4 shrink-0 text-sidebar-primary" />
                  <span className="font-medium text-sm truncate group-data-[collapsible=icon]:hidden text-sidebar-foreground">
                    {user?.name || user?.email || t('user')}
                  </span>
                  <ChevronDown className="ms-auto size-4 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden rotate-180" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side={isMobile ? "bottom" : "top"}
                align={isMobile ? "end" : "start"}
                className="w-56 rounded-lg"
              >
                <DropdownMenuItem asChild className="cursor-pointer">
                  <Link href="/support" onClick={() => { openTab('/support'); closeMobile(); }} className="flex items-center gap-2">
                    <LifeBuoy className="size-4 shrink-0" />
                    <span>{t('support')}</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => {
                    if (await confirm(t('confirmSwitchUser'))) {
                      clearCart();
                      logout();
                    }
                  }}
                  className="cursor-pointer flex items-center gap-2"
                >
                  <Lock className="size-4 shrink-0" />
                  <span>{t('switchUser')}</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    if (await confirm(t('confirmLogout'))) {
                      clearCart();
                      logout();
                    }
                  }}
                  className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950/50 flex items-center gap-2"
                >
                  <LogOut className="size-4 shrink-0" />
                  <span>{t('logout')}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
      {ConfirmDialog}
    </Sidebar>
  );
}
