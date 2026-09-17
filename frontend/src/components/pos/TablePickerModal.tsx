'use client';

import { X } from 'lucide-react';
import type { Table } from '@/lib/types';
import { useHeldOrdersStore } from '@/store/held-orders';
import { useTranslations, type AppConfig } from 'use-intl';
import { useFormatCurrency } from '@/hooks/useFormatCurrency';

interface Props {
  tables: Table[];
  selectedTableId: string | null;
  onSelectAvailable: (tableId: string, customer?: { id: number; name: string; phone: string } | null) => void;
  onSelectOccupied: (table: Table) => void;
  onSelectHeld: (tableId: string) => void;
  onPlaceOrder: () => void;
  onHoldTable: (tableId: string) => void;
  onClose: () => void;
}

type PosKey = keyof AppConfig['Messages']['pos'];

const statusStyles: Record<string, { border: string; badge: string; badgeKey: PosKey | null }> = {
  available: { border: 'border-green-400 bg-green-50', badge: 'bg-green-500', badgeKey: null },
  occupied: { border: 'border-red-400 bg-red-50', badge: 'bg-red-500', badgeKey: 'tableOccupied' },
  reserved: { border: 'border-purple-400 bg-purple-50', badge: 'bg-purple-500', badgeKey: 'tableReserved' },
  cleaning: { border: 'border-gray-300 dark:border-border bg-muted', badge: 'bg-gray-500', badgeKey: 'tableCleaning' },
  held: { border: 'border-blue-400 bg-blue-50', badge: 'bg-blue-500', badgeKey: 'tableHeld' },
  precheck: { border: 'border-yellow-400 bg-yellow-50', badge: 'bg-yellow-500', badgeKey: 'tablePrecheck' },
};

function stayLabel(startedAt: string | null | undefined, t: (key: PosKey, values?: Record<string, number>) => string): string | null {
  if (!startedAt) return null;
  const mins = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000));
  if (mins < 60) return t('stayMinutes', { count: mins });
  return t('stayHours', { hours: Math.floor(mins / 60), minutes: mins % 60 });
}

export default function TablePickerModal({
  tables, selectedTableId, onSelectAvailable, onSelectOccupied, onSelectHeld, onPlaceOrder, onHoldTable, onClose,
}: Props) {
  const heldOrders = useHeldOrdersStore();
  const t = useTranslations('pos');
  const fmt = useFormatCurrency();

  const handleClick = (table: Table) => {
    if (heldOrders.hasHeldOrder(table.id)) {
      onSelectHeld(table.id);
      return;
    }
    if (table.status === 'occupied' || table.status === 'precheck') {
      onSelectOccupied(table);
      return;
    }
    if (table.status === 'available' || table.status === 'reserved') {
      const customer = table.status === 'reserved' && table.reservation_customer_id
        ? { id: table.reservation_customer_id, name: table.reservation_customer_name ?? '', phone: table.reservation_customer_phone ?? '' }
        : null;
      onSelectAvailable(table.id, customer);
      return;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-2xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold">{t('selectTable')}</h2>
          <button onClick={onClose} className="touch-target rounded-full text-gray-400 hover:text-muted-foreground active:bg-muted" aria-label={t('close')}>
            <X size={20} />
          </button>
        </div>

        <div className="mb-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-green-500" />{t('tableLegendFree')}</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-500" />{t('tableLegendOccupied')}</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-yellow-500" />{t('tableLegendPrecheck')}</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-purple-500" />{t('tableLegendReserved')}</span>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {tables.map((table) => {
            const isHeld = heldOrders.hasHeldOrder(table.id);
            const isSelected = selectedTableId === table.id;
            const style = statusStyles[table.status] || statusStyles.available;
            const isDisabled = table.status === 'cleaning';
            const stay = stayLabel(table.stay_started_at, t);
            const total = table.order_total;

            return (
              <button
                key={table.id}
                onClick={() => !isDisabled && handleClick(table)}
                disabled={isDisabled}
                className={`min-h-28 p-4 rounded-xl border-2 text-center transition-colors relative ${
                  isSelected
                    ? 'border-brand bg-brand-light'
                    : isHeld
                      ? 'border-blue-400 bg-blue-50'
                      : style.border
                } ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                {isHeld && (
                  <span className="absolute -top-2 -end-2 bg-blue-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                    {t('tableHeld')}
                  </span>
                )}
                {!isHeld && style.badgeKey && (
                  <span className={`absolute -top-2 -end-2 ${style.badge} text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold`}>
                    {t(style.badgeKey)}
                  </span>
                )}
                <p className="font-bold text-foreground">{table.name}</p>
                <p className="text-xs text-muted-foreground">{t('tableSeats', { count: table.capacity })}</p>
                {(table.status === 'occupied' || table.status === 'precheck') && (table.current_order || table.activeOrder) && (
                  <p className="text-xs text-red-600 font-medium mt-1">
                    #{(table.current_order || table.activeOrder)?.order_number}
                  </p>
                )}
                {typeof total === 'number' && Number.isFinite(total) && (table.status === 'occupied' || table.status === 'precheck') && (
                  <p className="text-xs font-semibold text-foreground mt-0.5">{fmt(total)}</p>
                )}
                {stay && (table.status === 'occupied' || table.status === 'precheck') && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">{stay}</p>
                )}
              </button>
            );
          })}
        </div>

        {tables.length === 0 && (
          <p className="text-center text-muted-foreground py-8">{t('noTablesFound')}</p>
        )}

        {selectedTableId && (
          <div className="flex gap-3 mt-4 pt-4 border-t border-border">
            <button
              onClick={() => onHoldTable(selectedTableId)}
              className="touch-target flex-1 px-4 rounded-xl border-2 border-border text-foreground font-medium hover:bg-muted active:bg-muted transition-colors"
            >
              {t('holdTable')}
            </button>
            <button
              onClick={() => {
                onPlaceOrder();
                onClose();
              }}
              className="touch-target flex-1 px-4 rounded-xl bg-brand text-white font-medium hover:bg-brand/90 active:bg-brand/90 transition-colors"
            >
              {t('placeOrderButton')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
