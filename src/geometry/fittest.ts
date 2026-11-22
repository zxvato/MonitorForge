import { Matrix4 } from 'three';
import type { Settings } from '../model/types';
import type { PartSpec } from './parts';
import { settingsKey } from './parts';
import { M, type Manifold } from './manifold';
import { roundedRect } from './primitives';

/** Socket clearances on the fit-test piece, left to right. */
export function fitTestClearances(s: Settings): number[] {
  const c = s.socketClearance;
  return [-0.2, -0.1, 0, 0.1, 0.2].map((d) => Math.round(Math.max(0, c + d) * 100) / 100);
}

/**
 * A strip of five short sockets with different clearances. Socket N (from the
 * left) has N small bumps on its top edge. Printed upright, takes a few minutes.
 */
export function buildFitTest(s: Settings): Manifold {
  const { Manifold } = M();
  const H = 12;
  const wall = 2.4;
  const parts: Manifold[] = [];
  const holes: Manifold[] = [];
  const clear = fitTestClearances(s);
  const rMax = (s.rodDiameter + Math.max(...clear)) / 2;
  const pitch = 2 * (rMax + wall) - wall + 1;
  clear.forEach((c, i) => {
    const r = (s.rodDiameter + c) / 2;
    const x = i * pitch;
    const outer = 2 * (rMax + wall);
    parts.push(Manifold.extrude(roundedRect(outer, outer, 3), H).translate([x, 0, 0]));
    holes.push(Manifold.cylinder(H + 2, r, r, 96).translate([x, 0, -1]));
    for (let k = 0; k <= i; k++) {
      parts.push(Manifold.sphere(1.3, 16).translate([x - (i * 3.2) / 2 + k * 3.2, -(rMax + wall), H]));
    }
  });
  return Manifold.union(parts).subtract(Manifold.union(holes)).trimByPlane([0, 0, 1], 0);
}

export function fitTestSpec(s: Settings): PartSpec {
  return {
    key: `${settingsKey(s)}|fittest:${fitTestClearances(s).join(',')}`,
    name: 'Fit test',
    group: 'Connectors',
    build: (ss) => buildFitTest(ss),
    print: new Matrix4(),
    note: `Sockets 1–5 (count the bumps): ${fitTestClearances(s).map((c) => `+${c}`).join(' / ')} mm`,
  };
}
