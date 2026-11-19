// Same values as the @theme colors in index.css: canvas and KLineChart
// cannot read Tailwind classes.
export const CHART_COLORS = {
  panel: '#11151c',
  line: '#1e2530',
  muted: '#7c8696',
  accent: '#4c8dff',
  bid: '#22c38e',
  ask: '#f0506e',
  bidFill: 'rgba(34, 195, 142, 0.2)',
  askFill: 'rgba(240, 80, 110, 0.2)',
} as const;

export const CHART_FONT_SIZE = 10;
export const CHART_FONT_FAMILY =
  'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
export const CHART_FONT = `${CHART_FONT_SIZE}px ${CHART_FONT_FAMILY}`;
