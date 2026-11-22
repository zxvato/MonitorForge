import type { Settings } from '../model/types';
import { DIR_VECS, applyMat, maskDirs, printRotation, transpose } from '../model/rotations';
import { dims } from './dims';
import { M, type Manifold } from './manifold';
import { box, cylZ, extrudeAlong, frameMatrix, perpendicular, roundedRect, teardrop, type V3 } from './primitives';

/**
 * A connector with a socket in each direction of `mask` (canonical frame,
 * node centre at the origin). Sleeves are rounded squares so the part sits flat
 * on the bed; horizontal bores are teardrops so it prints without supports.
 */
export function buildHub(mask: number, s: Settings): Manifold {
  const d = dims(s);
  const { Manifold } = M();
  // Print "up" in the canonical frame:
  const P = printRotation(mask);
  const up = applyMat(transpose(P), [0, 0, 1]) as V3;

  const sleeve = roundedRect(2 * d.Ro, 2 * d.Ro, 3);
  const solids: Manifold[] = [box([-d.Ro, -d.Ro, -d.Ro], [d.Ro, d.Ro, d.Ro])];
  const bores: Manifold[] = [];
  for (const i of maskDirs(mask)) {
    const dir = DIR_VECS[i] as V3;
    const vertical = Math.abs(dir[0] * up[0] + dir[1] * up[1] + dir[2] * up[2]) > 0.5;
    const holeUp: V3 = vertical ? perpendicular(dir) : up;
    solids.push(extrudeAlong(sleeve, dir, perpendicular(dir), 0, d.sleeveLen));
    const cs = vertical ? M().CrossSection.circle(d.Rs, 64) : teardrop(d.Rs, Math.min(d.Rs * Math.SQRT2, d.Ro - 1.6));
    bores.push(extrudeAlong(cs, dir, holeUp, d.hubStop, d.sleeveLen + 1));
    // small entry chamfer
    const cham = Manifold.cylinder(1.2, d.Rs, d.Rs + 1.2, 64).translate([0, 0, d.sleeveLen - 1.2 + 0.001]);
    bores.push(cham.transform(frameMatrix(dir, perpendicular(dir)) as any));
  }
  return Manifold.union(solids).subtract(Manifold.union(bores));
}

/** Foot: base plate on the desk with an upward socket. Origin = desk at post centre. */
export function buildFoot(s: Settings): Manifold {
  const d = dims(s);
  const { Manifold } = M();
  const sleeve = roundedRect(2 * d.Ro, 2 * d.Ro, 3);
  const h = d.footFloor + s.socketDepth;
  const parts: Manifold[] = [
    cylZ(d.footRadius, 0, d.footFloor, 0, 0, 96),
    Manifold.extrude(sleeve, h),
    // fillet-ish flare between plate and sleeve
    Manifold.extrude(roundedRect(3 * d.Ro, 3 * d.Ro, 6), 12, 0, 0, [2 / 3, 2 / 3]).translate([0, 0, d.footFloor - 0.01]),
  ];
  let foot = Manifold.union(parts);
  const holes: Manifold[] = [cylZ(d.Rs, d.footFloor, h + 1)];
  holes.push(Manifold.cylinder(1.2, d.Rs, d.Rs + 1.2, 64).translate([0, 0, h - 1.2 + 0.001]));
  if (s.footScrews) {
    const rr = (d.footRadius + d.Ro * 1.5) / 2 + 1;
    for (let k = 0; k < 3; k++) {
      const a = (k * 2 * Math.PI) / 3 + Math.PI / 2;
      const x = rr * Math.cos(a), y = rr * Math.sin(a);
      holes.push(cylZ(2.25, -1, d.footFloor + 1, x, y, 24));
      holes.push(Manifold.cylinder(2.5, 2.25, 4.75, 24).translate([x, y, d.footFloor - 2.5 + 0.01]));
    }
  }
  foot = foot.subtract(Manifold.union(holes));
  return foot;
}
