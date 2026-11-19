import { RATE_MIN, type StreamConfig } from '@trade-terminal/protocol';
import { useEffect, useRef, useState } from 'react';

import { setConfig } from '../../feed/feed-client.ts';
import { useAppStore, type Notional } from '../../stores/app-store.ts';
import { Panel } from '../ui/panel.tsx';
import { Segmented, type SegmentedOption } from '../ui/segmented.tsx';
import { Slider } from '../ui/slider.tsx';
import { ControlRow } from './control-row.tsx';

const SLIDER_STEPS = 1000;
const RATE_ROUNDING = 10;
const RATE_DEBOUNCE_MS = 150;

const RATE_PRESETS: readonly SegmentedOption<number>[] = [
  { value: 100, label: '100' },
  { value: 500, label: '500' },
  { value: 1000, label: '1k' },
  { value: 5000, label: '5k' },
  { value: 10000, label: '10k' },
  { value: 20000, label: '20k' },
];

const EDGE_SIZE_OPTIONS: readonly SegmentedOption<Notional>[] = [
  { value: 100, label: '100' },
  { value: 500, label: '500' },
  { value: 2000, label: '2000' },
];

// A rate the user picked; it is shown only while config is still the one it
// was picked against, so the next config from the server replaces it.
interface RateDraft {
  position: number;
  rate: number;
  config: StreamConfig;
}

// The slider position maps to the rate on a log scale from RATE_MIN to
// maxRate.
function positionToRate(position: number, maxRate: number): number {
  const rate = RATE_MIN * (maxRate / RATE_MIN) ** (position / SLIDER_STEPS);
  const rounded = Math.round(rate / RATE_ROUNDING) * RATE_ROUNDING;
  return Math.min(Math.max(rounded, RATE_MIN), maxRate);
}

function rateToPosition(rate: number, maxRate: number): number {
  if (maxRate <= RATE_MIN || rate <= RATE_MIN) {
    return 0;
  }
  const share = Math.log(rate / RATE_MIN) / Math.log(maxRate / RATE_MIN);
  return Math.min(Math.round(share * SLIDER_STEPS), SLIDER_STEPS);
}

export function LoadControls() {
  const config = useAppStore((state) => state.config);
  const limits = useAppStore((state) => state.limits);
  const notional = useAppStore((state) => state.notional);
  const setNotional = useAppStore((state) => state.setNotional);
  const isLive = useAppStore((state) => state.connection.state === 'live');

  const [draft, setDraft] = useState<RateDraft | null>(null);
  const timerRef = useRef(0);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const activeDraft = draft?.config === config ? draft : null;
  const rate = activeDraft?.rate ?? config.rate;
  const position =
    activeDraft?.position ?? rateToPosition(config.rate, limits.maxRate);
  const presets = RATE_PRESETS.filter(
    (preset) => preset.value <= limits.maxRate,
  );
  const marketOptions = limits.marketCounts.map((count) => ({
    value: count,
    label: String(count),
  }));
  const isDisabled = !isLive;

  const handleRateChange = (nextPosition: number) => {
    const nextRate = positionToRate(nextPosition, limits.maxRate);
    setDraft({ position: nextPosition, rate: nextRate, config });
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(
      () => setConfig({ rate: nextRate }),
      RATE_DEBOUNCE_MS,
    );
  };

  const handlePresetChange = (preset: number) => {
    window.clearTimeout(timerRef.current);
    setDraft({
      position: rateToPosition(preset, limits.maxRate),
      rate: preset,
      config,
    });
    setConfig({ rate: preset });
  };

  const handleMarketsChange = (markets: number) => {
    setConfig({ markets });
  };

  return (
    <Panel title="Load" className="h-[200px] shrink-0">
      <div className="flex flex-col gap-3 p-3">
        <div className="flex flex-col gap-2">
          <Slider
            label="Message rate"
            value={position}
            min={0}
            max={SLIDER_STEPS}
            valueText={`${rate} msg/s`}
            isDisabled={isDisabled}
            onChange={handleRateChange}
          />
          <Segmented
            options={presets}
            value={rate}
            onChange={handlePresetChange}
            label="Rate presets"
            isDisabled={isDisabled}
          />
        </div>
        <ControlRow label="Markets">
          <Segmented
            options={marketOptions}
            value={config.markets}
            onChange={handleMarketsChange}
            label="Markets"
            isDisabled={isDisabled}
          />
        </ControlRow>
        <ControlRow label="Edge size">
          <Segmented
            options={EDGE_SIZE_OPTIONS}
            value={notional}
            onChange={setNotional}
            label="Edge size"
            isDisabled={isDisabled}
          />
        </ControlRow>
      </div>
    </Panel>
  );
}
