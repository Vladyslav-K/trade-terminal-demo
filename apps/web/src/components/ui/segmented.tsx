import { cn } from '../../lib/cn.ts';

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: string;
}

interface SegmentedProps<T extends string | number> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  isDisabled?: boolean;
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
  isDisabled = false,
}: SegmentedProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex rounded-sm border border-line bg-surface p-px"
    >
      {options.map((option) => {
        const isActive = option.value === value;

        const handleClick = () => {
          if (!isActive) {
            onChange(option.value);
          }
        };

        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={isActive}
            disabled={isDisabled}
            onClick={handleClick}
            className={cn(
              'h-5 rounded-[1px] px-2 font-mono text-[11px] tabular-nums focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40',
              isActive
                ? 'bg-panel-raised text-ink'
                : 'text-muted enabled:hover:text-ink',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
