import { useEffect, useRef } from 'react';

import {
  BOOK_SIDE_ASK,
  BOOK_SIDE_BID,
  DEPTH_POINTS,
  depthIndex,
} from '../../feed/frame-layout.ts';
import { hotStore } from '../../feed/hot-store.ts';
import { useCanvas, type CanvasSize } from '../../hooks/use-canvas.ts';
import { CHART_COLORS, CHART_FONT } from '../../lib/chart-theme.ts';
import { formatPrice, formatSize } from '../../lib/format.ts';
import { useAppStore } from '../../stores/app-store.ts';
import { EmptyState } from '../ui/empty-state.tsx';
import { Panel } from '../ui/panel.tsx';

const INSET_LEFT = 40;
const INSET_RIGHT = 8;
const INSET_TOP = 8;
const INSET_BOTTOM = 18;
const LABEL_GAP = 4;
const PRICE_LABELS = 5;
const SIZE_LABELS = 3;
const MID_DASH = [3, 3];
const NO_DASH: number[] = [];

// Price is in ticks, size is the cumulative size; reused on every draw.
interface PlotScale {
  left: number;
  top: number;
  bottom: number;
  width: number;
  minPrice: number;
  priceSpan: number;
  maxSize: number;
}

const scale: PlotScale = {
  left: 0,
  top: 0,
  bottom: 0,
  width: 0,
  minPrice: 0,
  priceSpan: 1,
  maxSize: 1,
};

// Coordinates sit on half pixels, so 1px lines stay sharp.
function xOf(price: number): number {
  return (
    Math.round(
      scale.left + ((price - scale.minPrice) / scale.priceSpan) * scale.width,
    ) + 0.5
  );
}

function yOf(size: number): number {
  return (
    Math.round(
      scale.bottom - (size / scale.maxSize) * (scale.bottom - scale.top),
    ) + 0.5
  );
}

// Points are packed from the best price; the first missing one ends the side.
function countPoints(depth: Int32Array, side: number): number {
  for (let point = 0; point < DEPTH_POINTS; point++) {
    const index = depthIndex(side, point);
    if ((depth[index] ?? 0) <= 0 || (depth[index + 1] ?? 0) <= 0) {
      return point;
    }
  }
  return DEPTH_POINTS;
}

// Traces the step line from the best price outwards and returns its last x.
function traceSide(
  context: CanvasRenderingContext2D,
  depth: Int32Array,
  side: number,
  count: number,
): number {
  let x = xOf(depth[depthIndex(side, 0)] ?? 0);
  let y = yOf(depth[depthIndex(side, 0) + 1] ?? 0);

  context.beginPath();
  context.moveTo(x, yOf(0));
  context.lineTo(x, y);

  for (let point = 1; point < count; point++) {
    const index = depthIndex(side, point);
    x = xOf(depth[index] ?? 0);
    context.lineTo(x, y);
    y = yOf(depth[index + 1] ?? 0);
    context.lineTo(x, y);
  }

  return x;
}

function drawSide(
  context: CanvasRenderingContext2D,
  depth: Int32Array,
  side: number,
  count: number,
): void {
  if (count === 0) {
    return;
  }

  const isBid = side === BOOK_SIDE_BID;
  const lastX = traceSide(context, depth, side, count);
  context.lineTo(lastX, yOf(0));
  context.closePath();
  context.fillStyle = isBid ? CHART_COLORS.bidFill : CHART_COLORS.askFill;
  context.fill();

  traceSide(context, depth, side, count);
  context.strokeStyle = isBid ? CHART_COLORS.bid : CHART_COLORS.ask;
  context.stroke();
}

function drawMidLine(context: CanvasRenderingContext2D, depth: Int32Array) {
  const bestBid = depth[depthIndex(BOOK_SIDE_BID, 0)] ?? 0;
  const bestAsk = depth[depthIndex(BOOK_SIDE_ASK, 0)] ?? 0;
  const x = xOf((bestBid + bestAsk) / 2);

  context.beginPath();
  context.moveTo(x, scale.top);
  context.lineTo(x, scale.bottom);
  context.setLineDash(MID_DASH);
  context.strokeStyle = CHART_COLORS.muted;
  context.stroke();
  context.setLineDash(NO_DASH);
}

function drawLabels(context: CanvasRenderingContext2D): void {
  context.font = CHART_FONT;
  context.fillStyle = CHART_COLORS.muted;

  context.textBaseline = 'top';
  for (let label = 0; label < PRICE_LABELS; label++) {
    const price =
      scale.minPrice + (scale.priceSpan * label) / (PRICE_LABELS - 1);
    if (label === 0) {
      context.textAlign = 'left';
    } else if (label === PRICE_LABELS - 1) {
      context.textAlign = 'right';
    } else {
      context.textAlign = 'center';
    }
    context.fillText(formatPrice(price), xOf(price), scale.bottom + LABEL_GAP);
  }

  context.textAlign = 'right';
  context.textBaseline = 'middle';
  for (let label = 0; label < SIZE_LABELS; label++) {
    const size = (scale.maxSize * label) / (SIZE_LABELS - 1);
    context.fillText(formatSize(size), scale.left - LABEL_GAP, yOf(size));
  }
}

// Returns false when the selected market has no depth to show.
function drawDepth(
  context: CanvasRenderingContext2D,
  size: CanvasSize,
  market: number,
): boolean {
  const { width, height } = size;
  context.clearRect(0, 0, width, height);

  const selected = hotStore.getSelected();
  if (selected === null || selected.market !== market) {
    return false;
  }

  const { depth } = selected;
  const bidCount = countPoints(depth, BOOK_SIDE_BID);
  const askCount = countPoints(depth, BOOK_SIDE_ASK);
  if (bidCount === 0 && askCount === 0) {
    return false;
  }

  // Points go from the best price outwards with a growing cumulative size, so
  // the extremes of a side are its first and last points. Both sides are
  // compared, because a crossed book can put the best bid above the best ask.
  let minPrice = Infinity;
  let maxPrice = -Infinity;
  let maxSize = 0;
  if (bidCount > 0) {
    const worst = depthIndex(BOOK_SIDE_BID, bidCount - 1);
    minPrice = depth[worst] ?? 0;
    maxPrice = depth[depthIndex(BOOK_SIDE_BID, 0)] ?? 0;
    maxSize = depth[worst + 1] ?? 0;
  }
  if (askCount > 0) {
    const worst = depthIndex(BOOK_SIDE_ASK, askCount - 1);
    minPrice = Math.min(minPrice, depth[depthIndex(BOOK_SIDE_ASK, 0)] ?? 0);
    maxPrice = Math.max(maxPrice, depth[worst] ?? 0);
    maxSize = Math.max(maxSize, depth[worst + 1] ?? 0);
  }
  // A single price level still needs a range to be placed in.
  if (minPrice === maxPrice) {
    minPrice -= 1;
    maxPrice += 1;
  }

  scale.left = INSET_LEFT;
  scale.top = INSET_TOP;
  scale.bottom = height - INSET_BOTTOM;
  scale.width = width - INSET_LEFT - INSET_RIGHT;
  scale.minPrice = minPrice;
  scale.priceSpan = maxPrice - minPrice;
  scale.maxSize = maxSize;
  if (scale.width <= 0 || scale.bottom <= scale.top) {
    return true;
  }

  context.lineWidth = 1;
  drawSide(context, depth, BOOK_SIDE_BID, bidCount);
  drawSide(context, depth, BOOK_SIDE_ASK, askCount);
  if (bidCount > 0 && askCount > 0) {
    drawMidLine(context, depth);
  }
  drawLabels(context);
  return true;
}

function drawFrame(
  context: CanvasRenderingContext2D,
  size: CanvasSize,
  market: number,
  emptyElement: HTMLElement | null,
): void {
  const hasData = drawDepth(context, size, market);
  if (emptyElement !== null && emptyElement.hidden !== hasData) {
    emptyElement.hidden = hasData;
  }
}

// A frame of the selected market only marks the chart; it is drawn once in
// the next animation frame, and right away on a resize.
export function DepthChart() {
  const market = useAppStore((state) => state.selectedMarket);
  const emptyRef = useRef<HTMLDivElement>(null);

  const handleRedraw = (context: CanvasRenderingContext2D, size: CanvasSize) =>
    drawFrame(context, size, market, emptyRef.current);

  const { canvasRef, contextRef, sizeRef } = useCanvas(handleRedraw);

  useEffect(() => {
    const emptyElement = emptyRef.current;
    let frameId = 0;

    const handleFrame = () => {
      frameId = 0;
      const context = contextRef.current;
      const size = sizeRef.current;

      if (context && size.width > 0 && size.height > 0) {
        drawFrame(context, size, market, emptyElement);
      }
    };

    const handleSelected = () => {
      if (frameId === 0) {
        frameId = requestAnimationFrame(handleFrame);
      }
    };

    handleSelected();

    const unsubscribe = hotStore.subscribeTopic('selected', handleSelected);

    return () => {
      unsubscribe();
      cancelAnimationFrame(frameId);
    };
  }, [market, contextRef, sizeRef]);

  return (
    <Panel title="Depth (both venues)">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block h-full w-full"
      />
      <div ref={emptyRef} className="absolute inset-0 bg-panel">
        <EmptyState>Waiting for data…</EmptyState>
      </div>
    </Panel>
  );
}
