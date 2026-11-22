import type { Design } from '../model/types';
import type { TRod } from '../model/topology';
import type { PartInstance, PartSpec } from '../geometry/parts';

export interface PartLine {
  spec: PartSpec;
  qty: number;
}

export interface CutLine {
  length: number;
  qty: number;
  kind: 'post' | 'beam' | 'mixed';
}

export interface StockPlan {
  /** Each entry is one stock handle with the pieces cut from it. */
  bars: { pieces: number[]; waste: number }[];
  tooLong: number[];
}

export function partLines(instances: PartInstance[]): PartLine[] {
  const map = new Map<string, PartLine>();
  for (const i of instances) {
    const l = map.get(i.spec.key);
    if (l) l.qty++;
    else map.set(i.spec.key, { spec: i.spec, qty: 1 });
  }
  const order = ['Connectors', 'Monitor shelves', 'Drawers', 'Dividers', 'Watch stands'];
  return [...map.values()].sort((a, b) => order.indexOf(a.spec.group) - order.indexOf(b.spec.group) || a.spec.name.localeCompare(b.spec.name));
}

export function cutLines(rods: TRod[]): CutLine[] {
  const map = new Map<number, CutLine>();
  for (const r of rods) {
    const len = Math.round(r.cut);
    const l = map.get(len);
    if (l) {
      l.qty++;
      if (l.kind !== r.kind) l.kind = 'mixed';
    } else map.set(len, { length: len, qty: 1, kind: r.kind });
  }
  return [...map.values()].sort((a, b) => b.length - a.length);
}

/** First-fit decreasing: how many stock handles to buy and how to cut them. */
export function planStock(rods: TRod[], stock: number, kerf: number): StockPlan {
  const pieces = rods.map((r) => Math.round(r.cut)).sort((a, b) => b - a);
  const bars: { pieces: number[]; used: number }[] = [];
  const tooLong: number[] = [];
  for (const p of pieces) {
    if (p > stock) {
      tooLong.push(p);
      continue;
    }
    const bar = bars.find((b) => b.used + kerf + p <= stock || (b.pieces.length === 0 && p <= stock));
    if (bar) {
      bar.used += (bar.pieces.length ? kerf : 0) + p;
      bar.pieces.push(p);
    } else bars.push({ pieces: [p], used: p });
  }
  return { bars: bars.map((b) => ({ pieces: b.pieces, waste: stock - b.used })), tooLong };
}

export function overallSize(design: Design) {
  if (!design.posts.length) return { w: 0, d: 0, h: 0, minX: 0, minY: 0 };
  const xs = design.posts.map((p) => p.x), ys = design.posts.map((p) => p.y);
  const h = Math.max(...design.posts.map((p) => p.height));
  return { w: Math.max(...xs) - Math.min(...xs), d: Math.max(...ys) - Math.min(...ys), h, minX: Math.min(...xs), minY: Math.min(...ys) };
}

export function cutListCSV(rods: TRod[]): string {
  const lines = ['length_mm,quantity,used_for'];
  for (const c of cutLines(rods)) lines.push(`${c.length},${c.qty},${c.kind}`);
  return lines.join('\n') + '\n';
}
