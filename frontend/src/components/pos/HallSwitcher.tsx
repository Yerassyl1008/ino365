'use client';

import type { Hall } from '@/lib/types';

interface Props {
  halls: Hall[];
  selectedHallId: string | null;
  onSelect: (hallId: string) => void;
  testId?: string;
  tone?: 'pos' | 'waiter';
}

export default function HallSwitcher({ halls, selectedHallId, onSelect, testId, tone = 'pos' }: Props) {
  if (halls.length === 0) return null;

  return (
    <div
      data-testid={testId}
      className="flo-h-scroll mb-2 flex min-h-8 min-w-0 max-w-full flex-nowrap gap-1.5 pb-1 md:mb-4 md:min-h-10 md:gap-2"
      role="tablist"
    >
      {halls.map((hall) => {
        const selected = hall.id === selectedHallId;
        return (
          <button
            key={hall.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onSelect(hall.id)}
            className={`h-8 shrink-0 whitespace-nowrap rounded-full px-3 text-xs font-medium transition-colors md:h-10 md:px-4 md:text-sm ${
              selected
                ? 'bg-brand text-white'
                : tone === 'waiter'
                  ? 'bg-gray-100 text-gray-700'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            {hall.name}
          </button>
        );
      })}
    </div>
  );
}
