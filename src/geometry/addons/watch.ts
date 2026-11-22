import type { Settings } from '../../model/types';
import { dims } from '../dims';
import { M, type Manifold } from '../manifold';
import { box, clipProfile } from '../primitives';

export interface WatchParams {
  armLength: number;
  tilt: number;
  puckDiameter: number;
  puckDepth: number;
}

export const WATCH_RING_H = 24;
const BLOCK_D = 30;
const BLOCK_W = 48;
const BLOCK_H = 52;
const PUCK_Z = 28;

/**
 * Apple Watch charger stand that snaps onto a post.
 * Local frame: handle axis at the origin, stand bottom at z = 0, arm along +X.
 * The cradle face leans back by `tilt` degrees and holds the magnetic charging
 * puck; a slot lets the puck's cable drop out underneath.
 */
export function buildWatchStand(p: WatchParams, s: Settings): Manifold {
  const { Manifold } = M();
  const d = dims(s);
  const ro = d.Rc + d.clipWall;
  const ring = Manifold.extrude(clipProfile(d.Rc, d.clipWall, 110, 180), WATCH_RING_H);
  const xc = ro + p.armLength;
  const xf = xc + BLOCK_D;
  const arm = box([ro - 1.5, -8, 0], [xc + 1, 8, 8]).subtract(Manifold.cylinder(20, d.Rc, d.Rc, 96).translate([0, 0, -5]));
  const t = (p.tilt * Math.PI) / 180;
  const n: [number, number, number] = [Math.cos(t), 0, Math.sin(t)];
  let block = box([xc, -BLOCK_W / 2, 0], [xf, BLOCK_W / 2, BLOCK_H]);
  // keep everything behind the leaning face plane
  block = block.trimByPlane([-n[0], -n[1], -n[2]], -xf * n[0]);

  // Puck recess centre on the face
  const pc: [number, number, number] = [xf - PUCK_Z * Math.tan(t), 0, PUCK_Z];
  const rec = Manifold.cylinder(p.puckDepth + 10, p.puckDiameter / 2 + 0.25, p.puckDiameter / 2 + 0.25, 96)
    .translate([0, 0, -p.puckDepth])
    .rotate([0, 90 - p.tilt, 0])
    .translate(pc);
  const cableHole = Manifold.cylinder(BLOCK_D + 20, 3, 3, 32)
    .translate([0, 0, -BLOCK_D - 10])
    .rotate([0, 90 - p.tilt, 0])
    .translate(pc);
  const slot = box([xc - 2, -2.5, -1], [xf + 1, 2.5, PUCK_Z]);
  const solid = Manifold.union([ring, arm, block]);
  return solid.subtract(Manifold.union([rec, cableHole, slot]));
}
