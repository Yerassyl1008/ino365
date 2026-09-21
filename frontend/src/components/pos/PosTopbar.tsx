'use client';

import { useState } from 'react';
import PrinterStatus from './PrinterStatus';
import WaiterQrModal from './WaiterQrModal';
import { useCartStore } from '@/store/cart';
import { useAuthStore } from '@/store/auth';
import { usePosSettingsStore } from '@/store/pos-settings';
import { LayoutGrid, Lock, Maximize2, Minimize2, QrCode } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { Table } from '@/lib/types';
import { useTranslations } from 'use-intl';
import { canShowWaiterQr } from '@shared/role-permissions';
import { tableDisplayName, tableNeedsHallPrefix } from '@shared/table-label';

interface Props {
  tables: Table[];
  onShowTablePicker: () => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  /** Floor plan is already the main POS view — don't also show «Select table». */
  floorOpen?: boolean;
}

export default function PosTopbar({ tables, onShowTablePicker, fullscreen, onToggleFullscreen, floorOpen = false }: Props) {
  const cart = useCartStore();
  const { currentTenant, logout } = useAuthStore();
  const router = useRouter();
  const tablesRequired = usePosSettingsStore((s) => s.tablesRequired);
  const t = useTranslations('pos');
  const isRestaurant = (currentTenant?.business_type ?? 'restaurant') === 'restaurant';
  const showTableBtn = isRestaurant && tablesRequired && !floorOpen;
  const showWaiterQr = isRestaurant && canShowWaiterQr(currentTenant?.role);
  const [waiterQrOpen, setWaiterQrOpen] = useState(false);
  const selectedTable = tables.find((item) => item.id === cart.tableId);
  const selectedTableLabel = selectedTable
    ? tableDisplayName(selectedTable.name, selectedTable.hall_name, tableNeedsHallPrefix(tables))
    : (cart.tableId || '');

  const lockTill = () => {
    cart.clearCart();
    logout();
    router.push('/auth/login');
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5 border-b bg-card shrink-0 px-2 py-1 md:gap-3 md:px-4 md:py-2.5">
        {showTableBtn && (
          <button
            onClick={onShowTablePicker}
            className={`touch-target min-w-0 gap-1.5 px-3 text-sm rounded-lg border font-medium transition-colors whitespace-nowrap ${
              cart.tableId
                ? 'bg-orange-500 text-white border-orange-500 hover:bg-orange-600'
                : 'bg-amber-50 border-amber-400 text-amber-700 hover:bg-amber-100'
            }`}
          >
            <LayoutGrid size={14} />
            {cart.tableId
              ? t('tableLabel', { name: selectedTableLabel })
              : t('selectTable')}
          </button>
        )}

        {showWaiterQr && (
          <button
            type="button"
            onClick={() => setWaiterQrOpen(true)}
            className="touch-target min-w-0 shrink-0 gap-1.5 px-3 text-sm rounded-lg border border-brand/40 bg-brand/10 text-brand font-medium transition-colors hover:bg-brand/15 whitespace-nowrap"
            title={t('waiterQr')}
            aria-label={t('waiterQr')}
          >
            <QrCode size={14} />
            {t('waiterQr')}
          </button>
        )}

        <div className="shrink-0">
          <PrinterStatus />
        </div>
        <button
          type="button"
          onClick={lockTill}
          className="touch-target shrink-0 rounded-lg border border-border bg-card px-3 text-muted-foreground transition-colors hover:bg-muted active:bg-muted"
          title={t('lockTill')}
          aria-label={t('lockTill')}
        >
          <Lock size={16} />
        </button>
        <button
          type="button"
          onClick={onToggleFullscreen}
          className="touch-target shrink-0 rounded-lg border border-border bg-card px-3 text-muted-foreground transition-colors hover:bg-muted active:bg-muted"
          title={fullscreen ? t('exitFullscreen') : t('enterFullscreen')}
          aria-label={fullscreen ? t('exitFullscreen') : t('enterFullscreen')}
        >
          {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>

      {showWaiterQr && (
        <WaiterQrModal open={waiterQrOpen} onOpenChange={setWaiterQrOpen} />
      )}
    </div>
  );
}
