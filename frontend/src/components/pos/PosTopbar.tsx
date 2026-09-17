'use client';

import PrinterStatus from './PrinterStatus';
import CustomerSearch from './CustomerSearch';
import { useCartStore } from '@/store/cart';
import { useAuthStore } from '@/store/auth';
import { usePosSettingsStore } from '@/store/pos-settings';
import { LayoutGrid, Maximize2, Minimize2 } from 'lucide-react';
import type { Table } from '@/lib/types';
import { useTranslations } from 'use-intl';

interface Props {
  tables: Table[];
  onShowTablePicker: () => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
}

export default function PosTopbar({ tables, onShowTablePicker, fullscreen, onToggleFullscreen }: Props) {
  const cart = useCartStore();
  const { currentTenant } = useAuthStore();
  const tablesRequired = usePosSettingsStore((s) => s.tablesRequired);
  const t = useTranslations('pos');
  const isRestaurant = (currentTenant?.business_type ?? 'restaurant') === 'restaurant';
  const showTableBtn = isRestaurant && cart.orderType === 'dine_in' && tablesRequired;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-card shrink-0 px-3 py-2 md:gap-3 md:px-4 md:py-2.5">
      <div className="w-full min-w-0 md:flex-1 md:w-auto">
        <CustomerSearch variant="topbar" />
      </div>

      <div className="flex w-full items-center gap-2 md:w-auto md:shrink-0">
        {showTableBtn && (
          <button
            onClick={onShowTablePicker}
            className={`touch-target min-w-0 flex-1 gap-1.5 px-3 text-sm rounded-lg border font-medium transition-colors whitespace-nowrap md:flex-none ${
              cart.tableId
                ? 'bg-orange-500 text-white border-orange-500 hover:bg-orange-600'
                : 'bg-amber-50 border-amber-400 text-amber-700 hover:bg-amber-100'
            }`}
          >
            <LayoutGrid size={14} />
            {cart.tableId
              ? t('tableLabel', { name: tables.find(t => t.id === cart.tableId)?.name || cart.tableId })
              : t('selectTable')}
          </button>
        )}

        <div className="shrink-0">
          <PrinterStatus />
        </div>
        <button
          type="button"
          onClick={onToggleFullscreen}
          className="touch-target shrink-0 rounded-lg border border-border bg-card px-3 text-muted-foreground transition-colors hover:bg-muted active:bg-muted"
          title={fullscreen ? t('exitFullscreen') : t('enterFullscreen')}
          aria-label={fullscreen ? t('exitFullscreen') : t('enterFullscreen')}
        >
          {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>
    </div>
  );
}
