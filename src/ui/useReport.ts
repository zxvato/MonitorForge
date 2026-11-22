import { useStore } from '../model/store';
import { makeReport, type Report } from '../export/report';
import type { Design } from '../model/types';

let last: { design: Design; report: Report } | null = null;

/** The derived report for the current design, computed once per design change. */
export function getReport(design: Design): Report {
  if (last?.design !== design) last = { design, report: makeReport(design) };
  return last.report;
}

export function useReport(): Report {
  const design = useStore((s) => s.design);
  return getReport(design);
}
