import { useEffect } from 'react';

import { SPARK_POINTS } from '../../feed/frame-layout.ts';
import { hotStore } from '../../feed/hot-store.ts';
import { useCanvas, type CanvasSize } from '../../hooks/use-canvas.ts';

const INSET_LEFT = 6;
const INSET_RIGHT = 1;
const INSET_Y = 2;

// The line color comes from the canvas text color class; it is read once,
// because getComputedStyle forces a style recalculation.
let lineColor: string | null = null;

function drawSparkline(
  context: CanvasRenderingContext2D,
  size: CanvasSize,
  market: number,
): void {
  const { width, height } = size;
  context.clearRect(0, 0, width, height);

  const sparks = hotStore.getSparks();
  const base = market * SPARK_POINTS;
  if (sparks === null || base + SPARK_POINTS > sparks.length) {
    return;
  }

  let min = Infinity;
  let max = -Infinity;
  for (let point = 0; point < SPARK_POINTS; point++) {
    const value = sparks[base + point] ?? NaN;
    if (Number.isFinite(value)) {
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  }
  if (min > max) {
    return;
  }

  const range = max - min;
  const step = (width - INSET_LEFT - INSET_RIGHT) / (SPARK_POINTS - 1);
  const usableHeight = height - INSET_Y * 2;
  // A flat line sits on a half pixel to stay 1px sharp.
  const flatY = Math.floor(height / 2) + 0.5;

  context.beginPath();
  let isDrawing = false;
  for (let point = 0; point < SPARK_POINTS; point++) {
    const value = sparks[base + point] ?? NaN;
    if (!Number.isFinite(value)) {
      isDrawing = false;
      continue;
    }
    const x = INSET_LEFT + point * step;
    const y =
      range > 0 ? INSET_Y + ((max - value) / range) * usableHeight : flatY;
    if (isDrawing) {
      context.lineTo(x, y);
    } else {
      context.moveTo(x, y);
      isDrawing = true;
    }
  }

  lineColor ??= getComputedStyle(context.canvas).color;
  context.strokeStyle = lineColor;
  context.lineWidth = 1;
  context.stroke();
}

interface SparklineProps {
  market: number;
}

export function Sparkline({ market }: SparklineProps) {
  const handleRedraw = (context: CanvasRenderingContext2D, size: CanvasSize) =>
    drawSparkline(context, size, market);

  const { canvasRef, contextRef, sizeRef } = useCanvas(handleRedraw);

  useEffect(() => {
    const handleSparks = () => {
      const context = contextRef.current;
      const size = sizeRef.current;

      if (context && size.width > 0 && size.height > 0) {
        drawSparkline(context, size, market);
      }
    };

    handleSparks();

    return hotStore.subscribeTopic('sparks', handleSparks);
  }, [market, contextRef, sizeRef]);

  return <canvas ref={canvasRef} className="block h-[18px] w-16 text-accent" />;
}
