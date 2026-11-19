import {
  useStaleState,
  type StaleKind,
  type StaleState,
} from '../../hooks/use-stale-state.ts';
import { cn } from '../../lib/cn.ts';
import { formatMeasure } from '../../lib/format.ts';

const TONE_CLASSES: Record<StaleKind, string> = {
  none: 'text-muted',
  stale: 'text-warn',
  lost: 'text-warn',
  offline: 'text-ask',
  incompatible: 'text-ask',
};

function formatSeconds(ms: number | null): string {
  return formatMeasure(ms === null ? NaN : ms / 1000, 's', 1);
}

function describe({ kind, sinceMs, retryInMs }: StaleState): string {
  switch (kind) {
    case 'stale':
      return `DATA STALE · last update ${formatSeconds(sinceMs)} ago`;
    case 'lost':
      return retryInMs === null || retryInMs <= 0
        ? 'CONNECTION LOST · reconnecting…'
        : `CONNECTION LOST · reconnecting in ${formatSeconds(retryInMs)}`;
    case 'offline':
      return 'OFFLINE · waiting for network';
    case 'incompatible':
      return 'PROTOCOL MISMATCH · reload the page';
    case 'none':
      return '';
  }
}

export function StaleOverlay() {
  const staleState = useStaleState();

  return (
    <div
      className={cn(
        'flex h-full items-center justify-center bg-surface/70 px-4 text-center font-mono text-[11px] font-semibold tracking-wider tabular-nums',
        TONE_CLASSES[staleState.kind],
      )}
    >
      {describe(staleState)}
    </div>
  );
}
