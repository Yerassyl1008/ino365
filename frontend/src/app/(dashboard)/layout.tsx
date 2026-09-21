'use client';

import { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import AppSidebar from '@/components/layout/Sidebar';
import WorkspaceTabs from '@/components/layout/WorkspaceTabs';
import AuthGuard from '@/components/layout/AuthGuard';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import StatusBar from '@/components/layout/StatusBar';
import GlobalNotifications from '@/components/layout/GlobalNotifications';
import TitleBar from '@/components/layout/TitleBar';
import { usePrinterStatusSync } from '@/hooks/usePrinter';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPos = pathname === '/pos' || pathname === '/pos/' || pathname === '/kds' || pathname === '/kds/' || Boolean(pathname?.startsWith('/kds/'));
  const isPosPage = pathname === '/pos' || pathname === '/pos/';
  const isOrders = pathname === '/orders' || pathname === '/orders/';
  const isSettings = pathname === '/settings';
  // Hoisted here (rather than only in PrinterStatus/Settings) so hardwarePrinter
  // and the WebUSB reconnect attempt are ready before the POS page can place
  // its first order — closes the startup race described in issue #534.
  usePrinterStatusSync();

  return (
    <AuthGuard>
      <SidebarProvider
        defaultOpen
        className={isPosPage
          ? 'flex min-h-0 flex-col w-full flo-phone-page-scroll md:h-screen'
          : 'flex h-screen min-h-0 flex-col w-full'}
        style={{ minHeight: 0 }}
      >
        <TitleBar />
        <div className={isPosPage
          ? 'flex min-h-0 flex-1 w-full flo-phone-page-scroll md:overflow-hidden'
          : 'flex min-h-0 flex-1 w-full overflow-hidden'}
        >
          {/* Sidebar, workspace tabs, and tabbed pages read useSearchParams().
              Next.js static export requires a Suspense boundary around those
              callers (missing-suspense-with-csr-bailout on /kds). */}
          <Suspense fallback={null}>
            <AppSidebar />
          </Suspense>
          <SidebarInset className={isPosPage
            ? 'min-h-0 flex flex-col flo-phone-page-scroll md:h-full md:overflow-hidden'
            : 'h-full min-h-0 overflow-hidden flex flex-col'}
          >
            <Suspense fallback={null}>
              <WorkspaceTabs />
            </Suspense>
            {!isPos && <GlobalNotifications />}
            <div className={isPosPage
              ? 'flex-1 min-h-0 flex flex-col flo-phone-page-scroll p-1.5 md:overflow-hidden md:p-4'
              : isPos
              ? 'flex-1 min-h-0 flex flex-col overflow-hidden p-1.5 md:p-4'
              : isOrders
              ? 'flex-1 min-h-0 flex flex-col overflow-hidden p-3 sm:p-4 min-w-0'
              : isSettings
              ? 'flex-1 min-h-0 p-4 overflow-auto md:overflow-hidden min-w-0'
              : 'flex-1 min-h-0 p-3 sm:p-4 overflow-auto min-w-0'
            }>
              <Suspense fallback={null}>
                {children}
              </Suspense>
            </div>
            <StatusBar showUpdateBadge={false} />
          </SidebarInset>
        </div>
      </SidebarProvider>
    </AuthGuard>
  );
}
