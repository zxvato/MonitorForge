import { DEFAULT_SETTINGS, uid, type AddOn, type Beam, type Design, type Post, type Settings } from './types';

function post(x: number, y: number, height: number): Post {
  return { id: uid('post'), x, y, height };
}
function beam(a: Post, b: Post, z: number): Beam {
  return { id: uid('beam'), a: a.id, b: b.id, z };
}

export function emptyDesign(settings: Settings = DEFAULT_SETTINGS): Design {
  return { name: 'My desk setup', posts: [], beams: [], addons: [], settings: { ...settings } };
}

/** A riser for one monitor with a drawer underneath. */
export function singleRiser(settings: Settings = DEFAULT_SETTINGS): Design {
  const h = 140, D = 200, W = 600;
  const fl = post(-W / 2, 0, h), fr = post(W / 2, 0, h), bl = post(-W / 2, D, h), br = post(W / 2, D, h);
  const front = beam(fl, fr, h), back = beam(bl, br, h);
  const addons: AddOn[] = [
    { id: uid('shelf'), kind: 'shelf', beams: [front.id, back.id], center: 0, width: W - 40, overhang: 20, thickness: 6, cableNotch: true },
    { id: uid('drawer'), kind: 'drawer', beams: [front.id, back.id], center: 0, width: 220, height: 60 },
  ];
  return {
    name: 'Single monitor riser',
    posts: [fl, fr, bl, br],
    beams: [front, back, beam(fl, bl, h), beam(fr, br, h)],
    addons,
    settings: { ...settings },
  };
}

/** Wide bridge for two monitors, with a divider and a watch stand on a tall post. */
export function dualBridge(settings: Settings = DEFAULT_SETTINGS): Design {
  const h = 150, D = 200, half = 520;
  const fl = post(-half, 0, h), fm = post(0, 0, h), fr = post(half, 0, h);
  const bl = post(-half, D, h), bm = post(0, D, h), br = post(half, D, 420);
  const front = beam(fl, fr, h), back = beam(bl, br, h);
  const sideL = beam(fl, bl, h), sideR = beam(fr, br, h);
  const addons: AddOn[] = [
    { id: uid('shelf'), kind: 'shelf', beams: [front.id, back.id], center: -half / 2, width: half - 48, overhang: 20, thickness: 6, cableNotch: true },
    { id: uid('shelf'), kind: 'shelf', beams: [front.id, back.id], center: half / 2, width: half - 48, overhang: 20, thickness: 6, cableNotch: true },
    { id: uid('drawer'), kind: 'drawer', beams: [front.id, back.id], center: -half / 2, width: 240, height: 65 },
    { id: uid('watch'), kind: 'watch', post: br.id, z: 300, angle: 0, armLength: 30, tilt: 15, puckDiameter: 27.5, puckDepth: 7 },
  ];
  return {
    name: 'Dual monitor bridge',
    posts: [fl, fm, fr, bl, bm, br],
    beams: [front, back, sideL, sideR],
    addons,
    settings: { ...settings },
  };
}

/** Desk organiser: two bays with drawers, a raised back rail and a divider. */
export function organiser(settings: Settings = DEFAULT_SETTINGS): Design {
  const h = 160, D = 200, W = 360;
  const fl = post(-W, 0, h), fm = post(0, 0, h), fr = post(W, 0, h);
  const bl = post(-W, D, 420), bm = post(0, D, 420), br = post(W, D, 420);
  const front = beam(fl, fr, h), back = beam(bl, br, h), top = beam(bl, br, 420);
  const addons: AddOn[] = [
    { id: uid('drawer'), kind: 'drawer', beams: [front.id, back.id], center: -W / 2, width: 200, height: 70 },
    { id: uid('drawer'), kind: 'drawer', beams: [front.id, back.id], center: W / 2, width: 200, height: 70 },
    { id: uid('shelf'), kind: 'shelf', beams: [front.id, back.id], center: -W / 2, width: W - 48, overhang: 20, thickness: 6, cableNotch: false },
    { id: uid('shelf'), kind: 'shelf', beams: [front.id, back.id], center: W / 2, width: W - 48, overhang: 20, thickness: 6, cableNotch: false },
    { id: uid('divider'), kind: 'divider', posts: [bl.id, bm.id], z0: 222, z1: 360, thickness: 5 },
    { id: uid('watch'), kind: 'watch', post: br.id, z: 230, angle: -90, armLength: 30, tilt: 15, puckDiameter: 27.5, puckDepth: 7 },
  ];
  return {
    name: 'Organiser with drawers',
    posts: [fl, fm, fr, bl, bm, br],
    beams: [front, back, top, beam(fl, bl, h), beam(fr, br, h), beam(fm, bm, h)],
    addons,
    settings: { ...settings },
  };
}

export const TEMPLATES = [
  { id: 'single', name: 'Single monitor riser', make: singleRiser },
  { id: 'dual', name: 'Dual monitor bridge', make: dualBridge },
  { id: 'organiser', name: 'Organiser with drawers', make: organiser },
];
