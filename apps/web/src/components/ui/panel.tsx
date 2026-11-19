import type { ReactNode } from 'react';
import { cn } from '../../lib/cn.ts';

interface PanelProps {
  title: string;
  actions?: ReactNode;
  overlay?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Panel({
  title,
  actions,
  overlay,
  children,
  className,
}: PanelProps) {
  return (
    <section
      className={cn('flex min-h-0 min-w-0 flex-col bg-panel', className)}
    >
      <header className="flex h-7 shrink-0 items-center justify-between gap-2 border-b border-line px-3">
        <h2 className="truncate text-[11px] font-medium tracking-wide text-muted uppercase">
          {title}
        </h2>
        {actions && (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        )}
      </header>
      <div className="relative min-h-0 flex-1 overflow-hidden contain-strict">
        {children}
        {overlay && <div className="absolute inset-0 z-10">{overlay}</div>}
      </div>
    </section>
  );
}
