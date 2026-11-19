import {
  CandlestickSeries,
  ColorType,
  TickMarkType,
  createChart,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { useEffect, useRef } from 'react';

import {
  CANDLE_CLOSE,
  CANDLE_FIELDS,
  CANDLE_HIGH,
  CANDLE_LOW,
  CANDLE_OPEN,
  CANDLE_TIME,
} from '../../feed/frame-layout.ts';
import { hotStore } from '../../feed/hot-store.ts';
import { CHART_COLORS } from '../../lib/chart-theme.ts';
import { formatClock } from '../../lib/format.ts';
import { useAppStore } from '../../stores/app-store.ts';
import { EmptyState } from '../ui/empty-state.tsx';
import { Panel } from '../ui/panel.tsx';

const TICKS_PER_CENT = 10;

function formatCents(price: number): string {
  return `${price.toFixed(1)}¢`;
}

// Times are shown in local time, like the rest of the terminal.
function formatTime(time: Time): string {
  return typeof time === 'number' ? formatClock(time * 1000) : String(time);
}

function formatTickMark(time: Time, tickMarkType: TickMarkType): string | null {
  if (typeof time !== 'number') {
    return null;
  }
  if (tickMarkType === TickMarkType.TimeWithSeconds) {
    return formatClock(time * 1000);
  }
  if (tickMarkType === TickMarkType.Time) {
    return formatClock(time * 1000).slice(0, 5);
  }
  return null;
}

function isPricedCandle(values: Float64Array, offset: number): boolean {
  return (
    Number.isFinite(values[offset + CANDLE_OPEN] ?? NaN) &&
    Number.isFinite(values[offset + CANDLE_HIGH] ?? NaN) &&
    Number.isFinite(values[offset + CANDLE_LOW] ?? NaN) &&
    Number.isFinite(values[offset + CANDLE_CLOSE] ?? NaN)
  );
}

function isSameCandle(candle: Float64Array, previous: Float64Array): boolean {
  for (let field = 0; field < CANDLE_FIELDS; field++) {
    if (candle[field] !== previous[field]) {
      return false;
    }
  }
  return true;
}

function toBar(values: Float64Array, offset: number): CandlestickData {
  return {
    time: (values[offset + CANDLE_TIME] ?? 0) as UTCTimestamp,
    open: (values[offset + CANDLE_OPEN] ?? NaN) / TICKS_PER_CENT,
    high: (values[offset + CANDLE_HIGH] ?? NaN) / TICKS_PER_CENT,
    low: (values[offset + CANDLE_LOW] ?? NaN) / TICKS_PER_CENT,
    close: (values[offset + CANDLE_CLOSE] ?? NaN) / TICKS_PER_CENT,
  };
}

// The chart lives for the whole mount; a market change only swaps its data.
export function PriceChart() {
  const market = useAppStore((state) => state.selectedMarket);
  const marketTitle = useAppStore(
    (state) => state.markets[state.selectedMarket]?.title,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const emptyRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: CHART_COLORS.panel },
        textColor: CHART_COLORS.muted,
      },
      grid: {
        vertLines: { color: CHART_COLORS.line },
        horzLines: { color: CHART_COLORS.line },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: true,
        tickMarkFormatter: formatTickMark,
      },
      localization: { timeFormatter: formatTime },
    });

    seriesRef.current = chart.addSeries(CandlestickSeries, {
      upColor: CHART_COLORS.bid,
      wickUpColor: CHART_COLORS.bid,
      downColor: CHART_COLORS.ask,
      wickDownColor: CHART_COLORS.ask,
      borderVisible: false,
      priceFormat: { type: 'custom', minMove: 0.1, formatter: formatCents },
    });
    chartRef.current = chart;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    const emptyElement = emptyRef.current;

    if (!chart || !series || !emptyElement) {
      return;
    }

    const previous = new Float64Array(CANDLE_FIELDS).fill(NaN);
    // The open candle must not be older than the newest bar in the series;
    // a candle that equals a closed one is a stale frame.
    let minTime = 0;

    const setEmptyShown = (isShown: boolean) => {
      if (emptyElement.hidden === isShown) {
        emptyElement.hidden = !isShown;
      }
    };

    const handleSelected = () => {
      const selected = hotStore.getSelected();

      if (selected === null || selected.market !== market) {
        return;
      }

      const { candle } = selected;
      const time = candle[CANDLE_TIME] ?? NaN;

      if (
        Number.isNaN(time) ||
        time < minTime ||
        !isPricedCandle(candle, 0) ||
        isSameCandle(candle, previous)
      ) {
        return;
      }

      previous.set(candle);
      minTime = time;
      series.update(toBar(candle, 0));
      setEmptyShown(false);
    };

    // A new market or market list replaces the whole series.
    const handleHistory = () => {
      const history = hotStore.getHistory();
      const bars: CandlestickData[] = [];
      let lastTime = -1;

      if (history !== null && history.market === market) {
        const { candles } = history;

        for (
          let offset = 0;
          offset + CANDLE_FIELDS <= candles.length;
          offset += CANDLE_FIELDS
        ) {
          bars.push(toBar(candles, offset));
          lastTime = candles[offset + CANDLE_TIME] ?? lastTime;
        }
      }

      series.setData(bars);
      previous.fill(NaN);
      minTime = lastTime + 1;

      if (bars.length > 0) {
        chart.timeScale().fitContent();
      }

      setEmptyShown(bars.length === 0);
      handleSelected();
    };

    handleHistory();

    const unsubscribeSelected = hotStore.subscribeTopic(
      'selected',
      handleSelected,
    );
    const unsubscribeHistory = hotStore.subscribeTopic(
      'history',
      handleHistory,
    );

    return () => {
      unsubscribeSelected();
      unsubscribeHistory();
    };
  }, [market]);

  return (
    <Panel
      title={
        marketTitle === undefined
          ? 'Probability'
          : `Probability · ${marketTitle}`
      }
    >
      <div ref={containerRef} className="absolute inset-0" />
      <div ref={emptyRef} className="absolute inset-0 bg-panel">
        <EmptyState>Waiting for data…</EmptyState>
      </div>
    </Panel>
  );
}
