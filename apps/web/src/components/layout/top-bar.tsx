import { ConnectionBadge } from '../status/connection-badge.tsx';
import { MessageRate } from '../status/message-rate.tsx';
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
        <MessageRate />
      </div>
    </header>
  );
}
