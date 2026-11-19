import { useAppStore, type ConnectionState } from '../../stores/app-store.ts';
import { Badge, type BadgeTone } from '../ui/badge.tsx';

interface ConnectionBadgeView {
  tone: BadgeTone;
  text: string;
}

const CONNECTION_BADGES: Record<ConnectionState, ConnectionBadgeView> = {
  connecting: { tone: 'neutral', text: 'CONNECTING' },
  live: { tone: 'good', text: 'LIVE' },
  stale: { tone: 'warn', text: 'STALE' },
  reconnecting: { tone: 'warn', text: 'RECONNECTING' },
  offline: { tone: 'bad', text: 'OFFLINE' },
  incompatible: { tone: 'bad', text: 'INCOMPATIBLE' },
};

export function ConnectionBadge() {
  const connectionState = useAppStore((state) => state.connection.state);
  const badge = CONNECTION_BADGES[connectionState];

  return (
    <Badge tone={badge.tone} hasDot>
      {badge.text}
    </Badge>
  );
}
