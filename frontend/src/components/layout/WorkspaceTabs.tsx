'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { House, X } from 'lucide-react';
import { useTranslations, type AppConfig } from 'use-intl';
import { useWorkspaceTabs } from '@/store/workspace-tabs';
import { useAuthStore } from '@/store/auth';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { normalizeWorkspaceHref, workspaceLabelForHref } from '@/lib/workspace-nav';
import { ROLE_ACCESS, hasRole } from '@shared/role-permissions';

type NavKey = keyof AppConfig['Messages']['nav'];

export default function WorkspaceTabs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const t = useTranslations('nav');
  const role = useAuthStore((s) => s.currentTenant?.role);
  const isOwner = hasRole(role, ROLE_ACCESS.owner);
  const { tabs, activeHref, openTab, closeTab } = useWorkspaceTabs();

  useEffect(() => {
    if (!pathname) return;
    const query = searchParams.toString();
    const href = normalizeWorkspaceHref(query ? `${pathname}?${query}` : pathname);
    if (workspaceLabelForHref(href)) openTab(href);
  }, [pathname, searchParams, openTab]);

  const visibleTabs = tabs.filter((tab) => tab.id !== 'workbench' || isOwner);

  return (
    <div
      className="flo-h-scroll flex items-center gap-1 border-b border-border bg-background px-2 shrink-0 min-w-0 md:px-3"
      role="tablist"
      aria-label={t('workspaceTabs')}
    >
      <SidebarTrigger className="size-8 shrink-0 md:hidden" aria-label="Open navigation" />
      {visibleTabs.map((tab) => {
        const currentHref = normalizeWorkspaceHref(
          searchParams.toString() ? `${pathname}?${searchParams.toString()}` : (pathname || ''),
        );
        const selected = normalizeWorkspaceHref(activeHref) === tab.href
          || currentHref === tab.href;
        const canClose = !tab.pinned && visibleTabs.length > 1;
        return (
          <div
            key={tab.id}
            className={`group relative flex items-center gap-1 px-2.5 py-2 text-sm shrink-0 border-b-2 ${
              selected
                ? 'border-brand text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Link
              href={tab.href}
              role="tab"
              aria-selected={selected}
              onClick={() => openTab(tab.href)}
              className="flex items-center gap-1.5 max-w-48"
            >
              {tab.pinned ? <House className="size-3.5 shrink-0" /> : null}
              <span className="truncate">{t(tab.labelKey as NavKey)}</span>
            </Link>
            {canClose && (
              <button
                type="button"
                className="rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-muted hover:text-foreground"
                aria-label={t('closeTab')}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  const next = closeTab(tab.id);
                  if (selected) router.push(next);
                }}
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
