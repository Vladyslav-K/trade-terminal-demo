import type { Ref } from 'react';

interface StatProps {
  label: string;
  valueRef: Ref<HTMLSpanElement>;
}

// The value is never rendered by React after mount: the owner writes it
// through valueRef.current.textContent.
export function Stat({ label, valueRef }: StatProps) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 bg-panel-raised px-2 py-1.5">
      <span className="truncate text-[10px] tracking-wide text-muted uppercase">
        {label}
      </span>
      <span
        ref={valueRef}
        className="truncate font-mono text-[13px] text-ink tabular-nums"
      >
        —
      </span>
    </div>
  );
}
