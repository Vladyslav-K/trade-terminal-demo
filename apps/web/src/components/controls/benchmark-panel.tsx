import { useState } from 'react';

import {
  cancelBenchmark,
  getBenchmarkSeconds,
  getBenchmarkSteps,
  startBenchmark,
} from '../../benchmark/benchmark-runner.ts';
import {
  formatSustainedLimit,
  type BenchmarkReportData,
} from '../../benchmark/report-format.ts';
import { useAppStore } from '../../stores/app-store.ts';
import {
  useBenchmarkStore,
  type BenchmarkAbortReason,
} from '../../stores/benchmark-store.ts';
import { Button } from '../ui/button.tsx';
import { Modal } from '../ui/modal.tsx';
import { Panel } from '../ui/panel.tsx';
import { BenchmarkReport } from './benchmark-report.tsx';

interface AbortMessage {
  text: string;
  className: string;
}

const ABORT_MESSAGES: Record<BenchmarkAbortReason, AbortMessage> = {
  hidden: {
    text: 'Benchmark aborted: the tab was hidden',
    className: 'text-warn',
  },
  connection: {
    text: 'Benchmark aborted: connection lost',
    className: 'text-warn',
  },
  cancelled: { text: 'Benchmark cancelled', className: 'text-muted' },
};

export function BenchmarkPanel() {
  const isLive = useAppStore((state) => state.connection.state === 'live');
  const maxRate = useAppStore((state) => state.limits.maxRate);
  const status = useBenchmarkStore((state) => state.status);
  const steps = useBenchmarkStore((state) => state.steps);
  const stepIndex = useBenchmarkStore((state) => state.stepIndex);
  const secondsLeft = useBenchmarkStore((state) => state.secondsLeft);
  const baselineFps = useBenchmarkStore((state) => state.baselineFps);
  const results = useBenchmarkStore((state) => state.results);
  const abortReason = useBenchmarkStore((state) => state.abortReason);
  const environment = useBenchmarkStore((state) => state.environment);

  const [isReportOpen, setIsReportOpen] = useState(false);

  const plannedSteps = getBenchmarkSteps(maxRate);
  const canRun = isLive && plannedSteps.length > 0;
  const abortMessage =
    abortReason === null ? null : ABORT_MESSAGES[abortReason];
  const report: BenchmarkReportData | null =
    status === 'done' && environment !== null && baselineFps !== null
      ? { steps, results, environment, baselineFps }
      : null;

  const progressText =
    stepIndex < 0
      ? 'Measuring baseline…'
      : `Step ${stepIndex + 1}/${steps.length} · ${steps[stepIndex]} msg/s · ${secondsLeft}s left`;

  const handleRun = () => startBenchmark();
  const handleCancel = () => cancelBenchmark();
  const handleOpenReport = () => setIsReportOpen(true);
  const handleCloseReport = () => setIsReportOpen(false);

  return (
    <>
      <Panel title="Benchmark" className="h-[136px] shrink-0">
        <div className="flex flex-col gap-2 p-3">
          {status === 'idle' && (
            <>
              <Button
                variant="primary"
                isDisabled={!canRun}
                onClick={handleRun}
              >
                Run benchmark
              </Button>
              <p className="text-[11px] leading-4 text-muted">
                {`Ramps the feed from 100 to ${plannedSteps.at(-1) ?? maxRate} msg/s and finds the sustainable limit. Takes about ${getBenchmarkSeconds(plannedSteps.length)}s.`}
              </p>
            </>
          )}
          {status === 'running' && (
            <>
              <p className="truncate font-mono text-[11px] leading-4 text-ink tabular-nums">
                {progressText}
              </p>
              <Button onClick={handleCancel}>Cancel</Button>
            </>
          )}
          {status === 'done' && (
            <>
              <p className="font-medium text-ink">
                {formatSustainedLimit(steps, results)}
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                <Button variant="primary" onClick={handleOpenReport}>
                  View report
                </Button>
                <Button isDisabled={!canRun} onClick={handleRun}>
                  Run again
                </Button>
              </div>
            </>
          )}
          {status === 'aborted' && (
            <>
              {abortMessage && (
                <p className={abortMessage.className}>{abortMessage.text}</p>
              )}
              <Button
                variant="primary"
                isDisabled={!canRun}
                onClick={handleRun}
              >
                Run benchmark
              </Button>
            </>
          )}
        </div>
      </Panel>
      {report && (
        <Modal
          isOpen={isReportOpen}
          onClose={handleCloseReport}
          title="Benchmark report"
        >
          <BenchmarkReport report={report} onClose={handleCloseReport} />
        </Modal>
      )}
    </>
  );
}
