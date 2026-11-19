// Same values as the @theme colors in index.css: canvas and Lightweight
// Charts cannot read Tailwind classes.
export const CHART_COLORS = {
  panel: '#11151c',
  line: '#1e2530',
  muted: '#7c8696',
  bid: '#22c38e',
  ask: '#f0506e',
  bidFill: 'rgba(34, 195, 142, 0.2)',
  askFill: 'rgba(240, 80, 110, 0.2)',
} as const;

export const CHART_FONT =
  '10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
