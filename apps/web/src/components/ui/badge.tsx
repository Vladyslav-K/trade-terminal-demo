import type { ReactNode } from 'react';
import { cn } from '../../lib/cn.ts';

export type BadgeTone = 'neutral' | 'good' | 'warn' | 'bad';

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  hasDot?: boolean;
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'border-line bg-panel-raised text-muted',
  good: 'border-bid/30 bg-bid/10 text-bid',
  warn: 'border-warn/30 bg-warn/10 text-warn',
  bad: 'border-ask/30 bg-ask/10 text-ask',
};

export function Badge({
  children,
  tone = 'neutral',
  hasDot = false,
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1.5 rounded-sm border px-1.5 font-mono text-[10px] font-semibold tracking-wider whitespace-nowrap',
        TONE_CLASSES[tone],
      )}
    >
      {hasDot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
