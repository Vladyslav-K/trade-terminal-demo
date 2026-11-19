import {
  METRIC_COLUMNS,
  NOTE_COLUMN,
  VERDICT_COLUMN,
  formatEnvironment,
  formatMetricCells,
  formatNote,
  formatSustainedLimit,
  type BenchmarkReportData,
} from './report-format.ts';
import { DEGRADED_RULE, PASS_RULE } from './verdict.ts';

const TITLE = '# Realtime terminal benchmark';

function toTableRow(cells: readonly string[]): string {
  return `| ${cells.join(' | ')} |`;
}

export function buildReportMarkdown(report: BenchmarkReportData): string {
  const header = toTableRow([...METRIC_COLUMNS, VERDICT_COLUMN, NOTE_COLUMN]);
  const divider = toTableRow([
    ...METRIC_COLUMNS.map(() => '---:'),
    '---',
    '---',
  ]);
  const rows = report.results.map((result) =>
    toTableRow([
      ...formatMetricCells(result),
      result.verdict,
      formatNote(result),
    ]),
  );

  return [
    TITLE,
    '',
    formatEnvironment(report),
    '',
    header,
    divider,
    ...rows,
    '',
    formatSustainedLimit(report.steps, report.results),
    '',
    PASS_RULE,
    '',
    DEGRADED_RULE,
    '',
  ].join('\n');
}
