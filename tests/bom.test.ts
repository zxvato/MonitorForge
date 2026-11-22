import { beforeAll, describe, expect, it } from 'vitest';
import { planStock, cutLines } from '../src/export/bom';
import { makeReport } from '../src/export/report';
import { buildPDF } from '../src/export/pdf';
import { toBinarySTL, parseBinarySTL } from '../src/export/stl';
import { initManifold } from '../src/geometry/manifold';
import { printMesh } from '../src/geometry/cache';
import { dualBridge } from '../src/model/templates';
import type { TRod } from '../src/model/topology';

beforeAll(async () => {
  await initManifold();
});

const rod = (cut: number, kind: 'post' | 'beam' = 'beam'): TRod => ({ id: String(Math.random()), kind, sourceId: 'x', a: 'a', b: 'b', axis: 'x', length: cut, cut });

describe('stock planning', () => {
  it('packs pieces first-fit decreasing', () => {
    const plan = planStock([rod(700), rod(500), rod(400), rod(300), rod(200)], 1200, 2);
    expect(plan.bars.map((b) => b.pieces)).toEqual([[700, 400], [500, 300, 200]]);
    expect(plan.tooLong).toEqual([]);
  });
  it('flags pieces longer than stock', () => {
    expect(planStock([rod(1300)], 1200, 2).tooLong).toEqual([1300]);
  });
  it('groups cut lines', () => {
    expect(cutLines([rod(100, 'post'), rod(100, 'beam'), rod(50)])).toEqual([
      { length: 100, qty: 2, kind: 'mixed' },
      { length: 50, qty: 1, kind: 'beam' },
    ]);
  });
});

describe('report + export', () => {
  it('builds report, STLs and PDF for the dual bridge', () => {
    const r = makeReport(dualBridge());
    expect(r.warnings.filter((w) => w.level === 'error')).toEqual([]);
    const qty = r.parts.reduce((a, p) => a + p.qty, 0);
    expect(qty).toBe(r.instances.length);
    expect(r.parts.find((p) => p.spec.name === 'Foot')?.qty).toBe(6);
    for (const p of r.parts) {
      const pm = printMesh(p.spec, r.design.settings);
      const stl = parseBinarySTL(toBinarySTL(pm.positions, pm.indices));
      expect(stl.valid).toBe(true);
      expect(stl.tris).toBeGreaterThan(10);
      expect(stl.min[2]).toBeCloseTo(0, 3);
    }
    const pdf = buildPDF(r).output('arraybuffer');
    expect(pdf.byteLength).toBeGreaterThan(5000);
  });
});
