'use client';

import { useFormatCurrency } from '@/hooks/useFormatCurrency';

interface Props {
  original: number;
  discounted?: number | null;
  className?: string;
  originalClassName?: string;
}

export default function DishPrice({
  original,
  discounted,
  className = 'text-brand font-bold',
  originalClassName = 'text-xs text-gray-400 line-through',
}: Props) {
  const fmt = useFormatCurrency();
  const hasSale = discounted != null && Number.isFinite(discounted) && discounted < original - 0.0001;
  if (!hasSale) {
    return <span className={className}>{fmt(original)}</span>;
  }
  return (
    <span className="inline-flex items-baseline gap-1.5 flex-wrap">
      <span className={originalClassName}>{fmt(original)}</span>
      <span className={className}>{fmt(discounted)}</span>
    </span>
  );
}
