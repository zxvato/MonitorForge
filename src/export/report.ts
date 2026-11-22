// Everything the PDF / ZIP / parts view needs, computed once from the design.
import type { Design, Warning } from '../model/types';
import { computeTopology, type Topology } from '../model/topology';
import { collectParts, type PartInstance } from '../geometry/parts';
import { printMesh } from '../geometry/cache';
import { cutLines, overallSize, partLines, planStock, type CutLine, type PartLine, type StockPlan } from './bom';

export interface Report {
  design: Design;
  topo: Topology;
  instances: PartInstance[];
  warnings: Warning[];
  parts: (PartLine & { size: [number, number, number]; fitsBed: boolean; volume: number; ok: boolean })[];
  cuts: CutLine[];
  stock: StockPlan;
  size: { w: number; d: number; h: number };
  totalHandle: number;
  grams: number;
}

/** PLA density × a rough "infill + walls" factor. */
export const GRAMS_PER_MM3 = 0.00124 * 0.35;

export function makeReport(design: Design): Report {
  const topo = computeTopology(design);
  const { instances, warnings } = collectParts(design, topo);
  const parts = partLines(instances).map((l) => {
    const pm = printMesh(l.spec, design.settings);
    return { ...l, size: pm.size, fitsBed: pm.fitsBed, volume: pm.volume, ok: pm.status === 'NoError' };
  });
  const all = [...topo.warnings, ...warnings];
  for (const p of parts)
    if (!p.fitsBed) all.push({ level: 'error', message: `${p.spec.name} is larger than the print bed (${p.size.map((v) => v.toFixed(0)).join('×')} mm)` });
  const stock = planStock(topo.rods, design.settings.stockLength, design.settings.kerf);
  for (const t of stock.tooLong) all.push({ level: 'error', message: `A ${t} mm piece is longer than your stock handle (${design.settings.stockLength} mm)` });
  return {
    design,
    topo,
    instances,
    warnings: all,
    parts,
    cuts: cutLines(topo.rods),
    stock,
    size: overallSize(design),
    totalHandle: topo.rods.reduce((a, r) => a + r.cut, 0),
    grams: parts.reduce((a, p) => a + p.volume * p.qty * GRAMS_PER_MM3, 0),
  };
}

export function postLabel(design: Design, id: string) {
  const i = design.posts.findIndex((p) => p.id === id);
  return i >= 0 ? `P${i + 1}` : '?';
}
export function beamLabel(design: Design, id: string) {
  const i = design.beams.findIndex((p) => p.id === id);
  return i >= 0 ? `B${i + 1}` : '?';
}
