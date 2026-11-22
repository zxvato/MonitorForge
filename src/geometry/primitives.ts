import { M, type Manifold, type CrossSection } from './manifold';

export type V3 = [number, number, number];

/** Axis-aligned box from min to max corner. */
export function box(min: V3, max: V3): Manifold {
  const size: V3 = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  return M().Manifold.cube(size, false).translate(min);
}

/** Rounded rectangle cross-section centred at the origin. */
export function roundedRect(w: number, h: number, r: number): CrossSection {
  const { CrossSection } = M();
  const rr = Math.min(r, w / 2 - 0.01, h / 2 - 0.01);
  if (rr <= 0.05) return CrossSection.square([w, h], true);
  return CrossSection.square([w - 2 * rr, h - 2 * rr], true).offset(rr, 'Round', 2, 24);
}

/**
 * Teardrop cross-section: a circle with a 45° point at +Y, so a horizontal hole
 * prints without supports when +Y is the print's up direction.
 */
export function teardrop(r: number, maxY = r * Math.SQRT2): CrossSection {
  const { CrossSection } = M();
  const c = Math.SQRT1_2 * r;
  const tri = CrossSection.ofPolygons([[[-c, c], [c, c], [0, r * Math.SQRT2]]], 'NonZero');
  let td = CrossSection.circle(r, 48).add(tri);
  // Flat-topped teardrop: cut the point off so it can't break through a thin wall.
  if (maxY < r * Math.SQRT2) td = td.intersect(CrossSection.square([4 * r, r + maxY], false).translate([-2 * r, -r]));
  return td;
}

/**
 * Matrix (column-major, for Manifold.transform) mapping local +Z to `dir`
 * and local +Y to `up`. Both must be perpendicular unit axis vectors.
 */
export function frameMatrix(dir: V3, up: V3, origin: V3 = [0, 0, 0]): number[] {
  const x: V3 = [
    up[1] * dir[2] - up[2] * dir[1],
    up[2] * dir[0] - up[0] * dir[2],
    up[0] * dir[1] - up[1] * dir[0],
  ];
  return [x[0], x[1], x[2], 0, up[0], up[1], up[2], 0, dir[0], dir[1], dir[2], 0, origin[0], origin[1], origin[2], 1];
}

/** Any axis perpendicular to `dir` (used when the hole orientation doesn't matter). */
export function perpendicular(dir: V3): V3 {
  return Math.abs(dir[2]) > 0.5 ? [0, 1, 0] : [0, 0, 1];
}

/** Extrude a cross-section from `start` to `end` distance along `dir`. */
export function extrudeAlong(cs: CrossSection, dir: V3, up: V3, start: number, end: number): Manifold {
  return M()
    .Manifold.extrude(cs, end - start)
    .translate([0, 0, start])
    .transform(frameMatrix(dir, up) as any);
}

/** Cylinder along X between x0 and x1 centred on (y, z). */
export function cylX(r: number, x0: number, x1: number, y: number, z: number, seg = 64): Manifold {
  return M().Manifold.cylinder(x1 - x0, r, r, seg).rotate([0, 90, 0]).translate([x0, y, z]);
}

/** Cylinder along Z. */
export function cylZ(r: number, z0: number, z1: number, x = 0, y = 0, seg = 64): Manifold {
  return M().Manifold.cylinder(z1 - z0, r, r, seg).translate([x, y, z0]);
}

/** Polygon cross-section from a list of points. */
export function poly(points: [number, number][]): CrossSection {
  return M().CrossSection.ofPolygons([points], 'NonZero');
}

/**
 * C-shaped snap clip profile (2D, in the XY plane): a ring around a handle with
 * an opening of `openingDeg` centred on direction `facingDeg`.
 */
export function clipProfile(rIn: number, wall: number, openingDeg: number, facingDeg: number): CrossSection {
  const { CrossSection } = M();
  const ring = CrossSection.circle(rIn + wall, 96).subtract(CrossSection.circle(rIn, 96));
  const L = (rIn + wall) * 3;
  const a0 = ((facingDeg - openingDeg / 2) * Math.PI) / 180;
  const a1 = ((facingDeg + openingDeg / 2) * Math.PI) / 180;
  const wedge = poly([
    [0, 0],
    [L * Math.cos(a0), L * Math.sin(a0)],
    [L * Math.cos((a0 + a1) / 2), L * Math.sin((a0 + a1) / 2)],
    [L * Math.cos(a1), L * Math.sin(a1)],
  ]);
  let c = ring.subtract(wedge);
  // round the lip tips so the clip slides on
  const tipR = wall / 2;
  for (const a of [a0, a1]) {
    const rm = rIn + wall / 2;
    c = c.add(CrossSection.circle(tipR, 24).translate([rm * Math.cos(a), rm * Math.sin(a)]));
  }
  return c;
}
