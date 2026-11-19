import { cn } from '../../lib/cn.ts';
import { formatClockMs } from '../../lib/format.ts';
import { useAppStore, type LogLevel } from '../../stores/app-store.ts';
import { EmptyState } from '../ui/empty-state.tsx';
import { Panel } from '../ui/panel.tsx';

const LEVEL_CLASSES: Record<LogLevel, string> = {
  info: 'text-muted',
  warn: 'text-warn',
  error: 'text-ask',
};

// Newest entries come first.
export function EventLog() {
  const eventLog = useAppStore((state) => state.eventLog);

  return (
    <Panel title="Event log" className="min-h-[240px] flex-1">
      {eventLog.length === 0 ? (
        <EmptyState>No events</EmptyState>
      ) : (
        <ol className="h-full overflow-y-auto py-1 font-mono text-[11px] leading-4">
          {eventLog.map((entry) => (
            <li
              key={entry.id}
              className={cn(
                'px-3 py-0.5 whitespace-pre-wrap wrap-break-word',
                LEVEL_CLASSES[entry.level],
              )}
            >
              {`${formatClockMs(entry.ts)}  ${entry.text}`}
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
