import { useEffect, useLayoutEffect, useRef } from 'react';

// width and height are CSS pixels; the backing store is scaled by dpr.
export interface CanvasSize {
  width: number;
  height: number;
  dpr: number;
}

export type CanvasRedraw = (
  context: CanvasRenderingContext2D,
  size: CanvasSize,
) => void;

export function useCanvas(onRedraw: CanvasRedraw) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const sizeRef = useRef<CanvasSize>({ width: 0, height: 0, dpr: 1 });
  const onRedrawRef = useRef(onRedraw);

  useLayoutEffect(() => {
    onRedrawRef.current = onRedraw;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');

    if (!canvas || !context) {
      return;
    }

    contextRef.current = context;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];

      if (!entry) {
        return;
      }

      const { width, height } = entry.contentRect;
      const dpr = window.devicePixelRatio || 1;
      const size = { width, height, dpr };

      sizeRef.current = size;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (width > 0 && height > 0) {
        onRedrawRef.current(context, size);
      }
    });

    observer.observe(canvas);

    return () => {
      observer.disconnect();
      contextRef.current = null;
    };
  }, []);

  return { canvasRef, contextRef, sizeRef };
}
