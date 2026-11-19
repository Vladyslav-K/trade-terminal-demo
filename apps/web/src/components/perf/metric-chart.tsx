import { useEffect } from 'react';

import { useCanvas, type CanvasSize } from '../../hooks/use-canvas.ts';
import { CHART_COLORS, CHART_FONT } from '../../lib/chart-theme.ts';
import { formatMeasure } from '../../lib/format.ts';
import { perfMonitor, type PerfHistoryKey } from '../../perf/perf-monitor.ts';

// The top inset keeps the line below the max label.
const INSET_TOP = 14;
const INSET_BOTTOM = 1;
const LABEL_INSET = 1;

// The Y axis goes from 0 to the maximum of the window.
function drawMetric(
  context: CanvasRenderingContext2D,
  size: CanvasSize,
  metric: PerfHistoryKey,
): void {
  const { width, height } = size;
  context.clearRect(0, 0, width, height);

  const history = perfMonitor.getHistory(metric);
  let max = -Infinity;
  for (const value of history) {
    if (Number.isFinite(value)) {
      max = Math.max(max, value);
    }
  }
  if (max === -Infinity) {
    return;
  }

  const scaleMax = max > 0 ? max : 1;
  const bottom = height - INSET_BOTTOM;
  const plotHeight = bottom - INSET_TOP;
  const step = width / (history.length - 1);

  context.beginPath();
  let isDrawing = false;
  history.forEach((value, point) => {
    if (!Number.isFinite(value)) {
      isDrawing = false;
      return;
    }
    const x = point * step;
    const y = bottom - (value / scaleMax) * plotHeight;
    if (isDrawing) {
      context.lineTo(x, y);
    } else {
      context.moveTo(x, y);
      isDrawing = true;
    }
  });
  context.strokeStyle = CHART_COLORS.accent;
  context.lineWidth = 1;
  context.stroke();

  context.font = CHART_FONT;
  context.fillStyle = CHART_COLORS.muted;
  context.textAlign = 'right';
  context.textBaseline = 'top';
  context.fillText(formatMeasure(max), width - LABEL_INSET, LABEL_INSET);
}

interface MetricChartProps {
  title: string;
  metric: PerfHistoryKey;
}

export function MetricChart({ title, metric }: MetricChartProps) {
  const handleRedraw = (context: CanvasRenderingContext2D, size: CanvasSize) =>
    drawMetric(context, size, metric);

  const { canvasRef, contextRef, sizeRef } = useCanvas(handleRedraw);

  useEffect(() => {
    const handleSecond = () => {
      const context = contextRef.current;
      const size = sizeRef.current;

      if (context && size.width > 0 && size.height > 0) {
        drawMetric(context, size, metric);
      }
    };

    handleSecond();

    return perfMonitor.subscribe(handleSecond);
  }, [metric, contextRef, sizeRef]);

  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-1 bg-panel-raised px-2 py-1.5">
      <span className="truncate text-[10px] text-muted">{title}</span>
      <div className="relative min-h-0 flex-1">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 block h-full w-full"
        />
      </div>
    </div>
  );
}
