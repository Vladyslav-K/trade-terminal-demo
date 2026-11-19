import { useEffect, useRef, useState } from 'react';

import {
  METRIC_COLUMNS,
  NOTE_COLUMN,
  VERDICT_COLUMN,
  formatEnvironment,
  formatMetricCells,
  formatNote,
  formatSustainedLimit,
  type BenchmarkReportData,
} from '../../benchmark/report-format.ts';
import { buildReportMarkdown } from '../../benchmark/report-markdown.ts';
import {
  DEGRADED_RULE,
  PASS_RULE,
  type Verdict,
} from '../../benchmark/verdict.ts';
import { cn } from '../../lib/cn.ts';
import { Badge, type BadgeTone } from '../ui/badge.tsx';
import { Button } from '../ui/button.tsx';

const COPY_FEEDBACK_MS = 2000;

type CopyState = 'idle' | 'copied' | 'failed';

const COPY_LABELS: Record<CopyState, string> = {
  idle: 'Copy as Markdown',
  copied: 'Copied',
  failed: 'Copy failed',
};

const VERDICT_TONES: Record<Verdict, BadgeTone> = {
  PASS: 'good',
  DEGRADED: 'warn',
  FAIL: 'bad',
};

const HEADER_CELL_CLASSES = 'h-7 px-2 font-medium whitespace-nowrap';
const CELL_CLASSES = 'h-7 px-2 whitespace-nowrap';

interface BenchmarkReportProps {
  report: BenchmarkReportData;
  onClose: () => void;
}

export function BenchmarkReport({ report, onClose }: BenchmarkReportProps) {
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const timerRef = useRef(0);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const handleCopy = async () => {
    let nextState: CopyState = 'copied';
    try {
      await navigator.clipboard.writeText(buildReportMarkdown(report));
    } catch {
      nextState = 'failed';
    }
    window.clearTimeout(timerRef.current);
    setCopyState(nextState);
    timerRef.current = window.setTimeout(
      () => setCopyState('idle'),
      COPY_FEEDBACK_MS,
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] wrap-break-word text-muted">
        {formatEnvironment(report)}
      </p>
      <table className="font-mono text-[11px] tabular-nums">
        <thead>
          <tr className="border-b border-line text-muted">
            {METRIC_COLUMNS.map((column) => (
              <th
                key={column}
                scope="col"
                className={cn(HEADER_CELL_CLASSES, 'text-right')}
              >
                {column}
              </th>
            ))}
            <th scope="col" className={cn(HEADER_CELL_CLASSES, 'text-left')}>
              {VERDICT_COLUMN}
            </th>
            <th scope="col" className={cn(HEADER_CELL_CLASSES, 'text-left')}>
              {NOTE_COLUMN}
            </th>
          </tr>
        </thead>
        <tbody>
          {report.results.map((result) => (
            <tr key={result.target} className="border-b border-line">
              {formatMetricCells(result).map((cell, index) => (
                <td key={index} className={cn(CELL_CLASSES, 'text-right')}>
                  {cell}
                </td>
              ))}
              <td className={CELL_CLASSES}>
                <Badge tone={VERDICT_TONES[result.verdict]}>
                  {result.verdict}
                </Badge>
              </td>
              <td className={cn(CELL_CLASSES, 'text-muted')}>
                {formatNote(result)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="font-medium text-ink">
        {formatSustainedLimit(report.steps, report.results)}
      </p>
      <div className="flex flex-col gap-1 text-[11px] text-muted">
        <p>{PASS_RULE}</p>
        <p>{DEGRADED_RULE}</p>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="primary" onClick={handleCopy}>
          {COPY_LABELS[copyState]}
        </Button>
        <Button onClick={onClose}>Close</Button>
      </div>
    </div>
  );
}
