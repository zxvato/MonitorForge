import type { Settings } from '../model/types';

/** Derived dimensions shared by geometry, topology and the cut list. */
export function dims(s: Settings) {
  const R = s.rodDiameter / 2;
  /** Socket bore radius. */
  const Rs = (s.rodDiameter + s.socketClearance) / 2;
  /** Half-width of a connector sleeve (outer). */
  const Ro = Rs + s.wall;
  /** Distance from a node centre to where the bore starts (the handle bottoms out here). */
  const hubStop = Rs + 2;
  const sleeveLen = hubStop + s.socketDepth;
  /** Foot: base plate thickness, the handle stands on it. */
  const footFloor = 5;
  const footRadius = Ro * 2.2;
  /** Snap clip inner radius (grips the handle). */
  const Rc = (s.rodDiameter - s.clipGrip) / 2;
  const clipWall = 3;
  /** Shelf groove depth (how far the handle sits into the shelf underside). */
  const grooveDepth = R * 0.25;
  /** Pin holes for joining split tiles with 1.75 mm filament. */
  const pinHole = 2.1;
  /** Length subtracted from every cut so handles don't bind. */
  const rodSlack = 1;
  return { R, Rs, Ro, hubStop, sleeveLen, footFloor, footRadius, Rc, clipWall, grooveDepth, pinHole, rodSlack };
}

export type Dims = ReturnType<typeof dims>;
