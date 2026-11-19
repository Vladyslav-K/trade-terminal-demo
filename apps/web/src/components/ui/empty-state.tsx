import type { ReactNode } from 'react';

interface EmptyStateProps {
  children: ReactNode;
}

export function EmptyState({ children }: EmptyStateProps) {
  return (
    <div className="flex h-full items-center justify-center px-4 text-center text-muted">
      {children}
    </div>
  );
}
