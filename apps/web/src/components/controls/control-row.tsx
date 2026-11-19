import type { ReactNode } from 'react';

interface ControlRowProps {
  label: string;
  children: ReactNode;
}

export function ControlRow({ label, children }: ControlRowProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] whitespace-nowrap text-muted">{label}</span>
      {children}
    </div>
  );
}
