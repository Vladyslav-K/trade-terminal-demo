import { SIGNAL_KIND_EDGE } from '../../feed/frame-layout.ts';
import {
  formatClock,
  formatSignedPrice,
  formatVenue,
} from '../../lib/format.ts';

// One signal of the hot store queue; record is its queue index, unique for
// the page lifetime. a, b and value follow the SIGNAL_* fields.
export interface SignalView {
  record: number;
  market: number;
  ts: number;
  kind: number;
  a: number;
  b: number;
  value: number;
}

function describeSignal(signal: SignalView, title: string): string {
  if (signal.kind === SIGNAL_KIND_EDGE) {
    return `EDGE · ${title} · buy ${formatVenue(signal.a)} / sell ${formatVenue(signal.b)} · ${formatSignedPrice(signal.value)}`;
  }
  return `SHIFT · ${title} · ${formatSignedPrice(signal.a * signal.value)} / 10s`;
}

interface SignalItemProps {
  signal: SignalView;
  title: string;
  onSelect: (market: number) => void;
}

export function SignalItem({ signal, title, onSelect }: SignalItemProps) {
  const handleClick = () => {
    onSelect(signal.market);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="block w-full border-b border-line px-2 py-1 text-left text-[11px] leading-4 text-ink hover:bg-panel-raised/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
    >
      <span className="mr-1.5 font-mono text-muted tabular-nums">
        {formatClock(signal.ts)}
      </span>
      {describeSignal(signal, title)}
    </button>
  );
}
