import {
  dispose,
  init,
  registerYAxis,
  utils,
  type Chart,
  type DeepPartial,
  type FormatDateParams,
  type KLineData,
  type Options,
  type Styles,
} from 'klinecharts';
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
import {
  CHART_COLORS,
  CHART_FONT_FAMILY,
  CHART_FONT_SIZE,
} from '../../lib/chart-theme.ts';
import { formatClock } from '../../lib/format.ts';
import { useAppStore } from '../../stores/app-store.ts';
import { EmptyState } from '../ui/empty-state.tsx';
import { Panel } from '../ui/panel.tsx';

const TICKS_PER_CENT = 10;
const MS_PER_SECOND = 1000;
const CENTS_AXIS = 'cents';
// Id of the main pane that KLineChart creates for the candles.
const CANDLE_PANE_ID = 'candle_pane';

registerYAxis({
  name: CENTS_AXIS,
  displayValueToText: (value, precision) =>
    `${utils.formatPrecision(value, precision)}¢`,
});

// Times are shown in local time, like the rest of the terminal.
function formatDate({
  dateTimeFormat,
  timestamp,
  template,
}: FormatDateParams): string {
  if (template === 'HH:mm:ss') {
    return formatClock(timestamp);
  }
  if (template === 'HH:mm') {
    return formatClock(timestamp).slice(0, 5);
  }
  return utils.formatDate(dateTimeFormat, timestamp, template);
}

const FONT = { family: CHART_FONT_FAMILY, size: CHART_FONT_SIZE };

const AXIS_STYLES = {
  axisLine: { color: CHART_COLORS.line },
  tickLine: { color: CHART_COLORS.line },
  tickText: { ...FONT, color: CHART_COLORS.muted },
};

const CROSSHAIR_LINE_STYLES = {
  line: { color: CHART_COLORS.muted },
  text: {
    ...FONT,
    backgroundColor: CHART_COLORS.muted,
    borderColor: CHART_COLORS.muted,
  },
};

const CHART_STYLES: DeepPartial<Styles> = {
  grid: {
    horizontal: { color: CHART_COLORS.line, style: 'solid' },
    vertical: { color: CHART_COLORS.line, style: 'solid' },
  },
  candle: {
    type: 'candle_solid',
    // A candle that closes at its open is drawn as a rising one.
    bar: {
      upColor: CHART_COLORS.bid,
      downColor: CHART_COLORS.ask,
      noChangeColor: CHART_COLORS.bid,
      upBorderColor: CHART_COLORS.bid,
      downBorderColor: CHART_COLORS.ask,
      noChangeBorderColor: CHART_COLORS.bid,
      upWickColor: CHART_COLORS.bid,
      downWickColor: CHART_COLORS.ask,
      noChangeWickColor: CHART_COLORS.bid,
    },
    priceMark: {
      high: { show: false },
      low: { show: false },
      last: {
        upColor: CHART_COLORS.bid,
        downColor: CHART_COLORS.ask,
        noChangeColor: CHART_COLORS.bid,
        text: FONT,
      },
    },
    tooltip: { showRule: 'none' },
  },
  xAxis: AXIS_STYLES,
  yAxis: AXIS_STYLES,
  crosshair: {
    horizontal: CROSSHAIR_LINE_STYLES,
    vertical: CROSSHAIR_LINE_STYLES,
  },
};

// Hotkeys listen on the whole document, so they would also fire outside the
// chart.
const CHART_OPTIONS: Options = {
  styles: CHART_STYLES,
  formatter: { formatDate },
  hotkey: { enabled: false },
};

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

function toBar(values: Float64Array, offset: number): KLineData {
  return {
    timestamp: (values[offset + CANDLE_TIME] ?? 0) * MS_PER_SECOND,
    open: (values[offset + CANDLE_OPEN] ?? NaN) / TICKS_PER_CENT,
    high: (values[offset + CANDLE_HIGH] ?? NaN) / TICKS_PER_CENT,
    low: (values[offset + CANDLE_LOW] ?? NaN) / TICKS_PER_CENT,
    close: (values[offset + CANDLE_CLOSE] ?? NaN) / TICKS_PER_CENT,
  };
}

// Spreads all bars over the pane width.
function fitContent(chart: Chart): void {
  const count = chart.getDataList().length;
  const width = chart.getSize(CANDLE_PANE_ID, 'main')?.width ?? 0;

  if (count === 0 || width <= 0) {
    return;
  }

  const { min, max } = chart.getLayoutOptions().barSpaceLimit;
  chart.setBarSpace(Math.min(max, Math.max(min, width / count)));
}

// The chart lives for the whole mount; a market change only swaps its data
// loader.
export function PriceChart() {
  const market = useAppStore((state) => state.selectedMarket);
  const marketTitle = useAppStore(
    (state) => state.markets[state.selectedMarket]?.title,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const emptyRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const chart = init(container, CHART_OPTIONS);

    if (!chart) {
      return;
    }

    const [priceAxis] = chart.getYAxes({ paneId: CANDLE_PANE_ID });

    if (priceAxis) {
      chart.overrideYAxis({ id: priceAxis.id, name: CENTS_AXIS });
    }

    chart.setOffsetRightDistance(0);
    chart.setPeriod({ type: 'second', span: 1 });
    chart.setSymbol({ ticker: 'probability', pricePrecision: 1 });
    chartRef.current = chart;

    return () => {
      dispose(chart);
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const emptyElement = emptyRef.current;

    if (!chart || !emptyElement) {
      return;
    }

    const previous = new Float64Array(CANDLE_FIELDS).fill(NaN);
    // The open candle must not be older than the newest bar in the chart;
    // a candle that equals a closed one is a stale frame.
    let minTime = 0;
    // Set by the chart while it takes live bars.
    let pushBar: ((bar: KLineData) => void) | null = null;

    const setEmptyShown = (isShown: boolean) => {
      if (emptyElement.hidden === isShown) {
        emptyElement.hidden = !isShown;
      }
    };

    const handleSelected = () => {
      const selected = hotStore.getSelected();

      if (pushBar === null || selected === null || selected.market !== market) {
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
      pushBar(toBar(candle, 0));
      setEmptyShown(false);
    };

    // Every load replaces the whole series. The chart subscribes to live bars
    // inside callback, so the guards are reset before it.
    chart.setDataLoader({
      getBars: ({ callback }) => {
        const history = hotStore.getHistory();
        const bars: KLineData[] = [];
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

        previous.fill(NaN);
        minTime = lastTime + 1;
        setEmptyShown(bars.length === 0);
        callback(bars, false);

        if (bars.length > 0) {
          fitContent(chart);
        }
      },
      subscribeBar: ({ callback }) => {
        pushBar = callback;
        handleSelected();
      },
      unsubscribeBar: () => {
        pushBar = null;
      },
    });

    const unsubscribeSelected = hotStore.subscribeTopic(
      'selected',
      handleSelected,
    );
    const unsubscribeHistory = hotStore.subscribeTopic('history', () =>
      chart.resetData(),
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
