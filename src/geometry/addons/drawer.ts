import type { Settings } from '../../model/types';
import { dims } from '../dims';
import { M, type Manifold } from '../manifold';
import { box, clipProfile, poly } from '../primitives';

/**
 * Drawer system that hangs under two parallel beams: two identical hangers
 * snap up onto the beams, and a drawer box slides on tongues in the hangers.
 *
 * Shared local frame (same as the shelf): origin midway between the beam axes
 * at beam height, X along the beams, Y towards the back beam. The drawer pulls
 * out towards -Y (the front).
 */
export function drawerFrame(S: number, s: Settings) {
  const d = dims(s);
  const w = d.clipWall;
  const zF = -(d.Rc + w + 3); // top of the drawer box
  const Db = S + 2 * (d.Rc + w) - 2; // box depth
  const T = 5; // hanger plate thickness
  const railW = 6;
  const gap = 0.8;
  return { d, w, zF, Db, T, railW, gap };
}

/** Inner face of the right hanger, measured from the drawer centre. */
export function hangerOffset(width: number) {
  return width / 2 + 6 + 0.8;
}

/** One hanger, built with its inner face at x = 0 (tongue at x < 0, plate at x > 0). */
export function buildHanger(S: number, s: Settings): Manifold {
  const { Manifold, CrossSection } = M();
  const { d, w, zF, Db, T, railW, gap } = drawerFrame(S, s);
  // Profile in the YZ plane, drawn as 2D (u = y, v = z).
  let prof = CrossSection.square([Db, -0.3 * d.Rc - (zF - 14)], false).translate([-Db / 2, zF - 14]);
  for (const sy of [-S / 2, S / 2]) prof = prof.add(clipProfile(d.Rc, w, 120, 90).translate([sy, 0]));
  for (const sy of [-S / 2, S / 2]) prof = prof.subtract(CrossSection.circle(d.Rc, 96).translate([sy, 0]));
  // Extrude along local Z, then turn so the profile lies in YZ with thickness along +X.
  const plate = Manifold.extrude(prof, T).transform([0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1] as any);
  // plate now spans x ∈ [0, T]; profile u→y, v→z.
  const tongueLen = railW + gap - 2.6;
  const tongue = box([-tongueLen, -Db / 2, zF - 8.5], [0.01, Db / 2, zF - 5.5]);
  return plate.add(tongue);
}

export function buildDrawerBox(S: number, width: number, height: number, s: Settings): Manifold {
  const { Manifold, CrossSection } = M();
  const { zF, Db, railW } = drawerFrame(S, s);
  const W = width, H = height;
  const z0 = zF - H;
  const solids: Manifold[] = [box([-W / 2, -Db / 2, z0], [W / 2, Db / 2, zF])];
  const railBottom = zF - 12;
  for (const sx of [1, -1]) {
    // rail bar + 45° chamfer underneath so it prints without supports
    const rail = box([W / 2 - 0.01, -Db / 2, railBottom], [W / 2 + railW, Db / 2, zF]);
    const cham = Manifold.extrude(
      poly([[W / 2 - 0.01, railBottom + 0.01], [W / 2 + railW, railBottom + 0.01], [W / 2 - 0.01, railBottom - railW]]),
      Db,
    )
      .transform([1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, -Db / 2, 0, 1] as any);
    let r = rail.add(cham);
    // groove with a 45° roof
    const groove = Manifold.extrude(
      poly([
        [W / 2 + 2, zF - 9],
        [W / 2 + railW + 1, zF - 9],
        [W / 2 + railW + 1, zF],
        [W / 2 + 2, zF - 5],
      ]),
      Db + 2,
    ).transform([1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, -Db / 2 - 1, 0, 1] as any);
    r = r.subtract(groove);
    solids.push(sx === 1 ? r : r.mirror([1, 0, 0]));
  }
  let b = Manifold.union(solids);
  const inner = box([-W / 2 + 2, -Db / 2 + 2, z0 + 2], [W / 2 - 2, Db / 2 - 2, zF + 1]);
  const fingerR = Math.min(16, W / 4, H / 2);
  const finger = Manifold.extrude(CrossSection.circle(fingerR, 48), 6)
    .rotate([90, 0, 0])
    .translate([0, -Db / 2 + 3, zF]);
  b = b.subtract(inner).subtract(finger);
  return b;
}
