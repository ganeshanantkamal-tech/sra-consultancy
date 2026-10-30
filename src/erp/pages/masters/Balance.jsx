import { cn, inr } from '../../lib/format.js';

// A Dr-positive balance shown the accounting way, with the Dr/Cr suffix small and muted.
export default function Balance({ value, className }) {
  const n = Number(value || 0);
  return (
    <span className={cn('whitespace-nowrap font-semibold tabular-nums text-ink', className)}>
      {inr(Math.abs(n))}{n !== 0 && <span className="ml-1 text-[10px] font-bold uppercase text-muted">{n > 0 ? 'Dr' : 'Cr'}</span>}
    </span>
  );
}
