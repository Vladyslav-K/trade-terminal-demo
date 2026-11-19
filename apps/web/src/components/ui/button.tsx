import type { ReactNode } from 'react';
import { cn } from '../../lib/cn.ts';

export type ButtonVariant = 'default' | 'primary' | 'danger';

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: ButtonVariant;
  isDisabled?: boolean;
  className?: string;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  default: 'border-line bg-panel-raised text-ink enabled:hover:border-muted',
  primary:
    'border-accent/40 bg-accent/15 text-accent enabled:hover:bg-accent/25',
  danger: 'border-ask/40 bg-ask/15 text-ask enabled:hover:bg-ask/25',
};

export function Button({
  children,
  onClick,
  variant = 'default',
  isDisabled = false,
  className,
}: ButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      className={cn(
        'inline-flex h-7 items-center justify-center gap-1.5 rounded-sm border px-3 text-[11px] font-medium whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40',
        VARIANT_CLASSES[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}
