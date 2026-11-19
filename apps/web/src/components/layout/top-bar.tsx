import { ConnectionBadge } from '../status/connection-badge.tsx';
import { LiveMetric } from '../status/live-metric.tsx';
import { Badge } from '../ui/badge.tsx';

export function TopBar() {
  return (
    <header className="flex min-w-0 items-center gap-3 bg-panel px-4">
      <h1 className="text-[13px] font-semibold tracking-wide whitespace-nowrap text-ink">
        Realtime Market Terminal
      </h1>
      <Badge>DEMO · MOCK FEED</Badge>
      <ConnectionBadge />
      <div className="ml-auto flex items-center gap-4">
        <LiveMetric label="IN" metric="in" unit="msg/s" />
        <LiveMetric label="FPS" metric="fps" />
        <LiveMetric label="LAT p95" metric="toScreenP95" unit="ms" />
      </div>
    </header>
  );
}
