import type { Metadata, Viewport } from 'next';
import { KdsHtmlLang } from '@/components/kds/KdsHtmlLang';

export const metadata: Metadata = {
  title: 'KorgenKassa Waiter',
  description: 'Tableside ordering for KorgenKassa',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'KorgenKassa Waiter',
  },
};

export const viewport: Viewport = {
  themeColor: '#3248FF',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function ServerStandaloneLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-slate-50 text-[17px] leading-normal text-gray-900 scheme-light">
      <KdsHtmlLang />
      {children}
    </div>
  );
}
