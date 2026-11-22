// Turns a design into concrete printed parts: one PartInstance per physical
// part, each pointing at a PartSpec (unique geometry) shared by identical parts.

import { Matrix4 } from 'three';
import type { AddOn, Design, DividerAddOn, DrawerAddOn, Selection, Settings, ShelfAddOn, WatchAddOn, Warning } from '../model/types';
import { canonicalize, connectorName, printRotation, type Mat3i } from '../model/rotations';
import { beamGeometry, type BeamInfo, type Topology } from '../model/topology';
import { dims } from './dims';
import type { Manifold } from './manifold';
import { buildFoot, buildHub } from './connector';
import { buildShelf, shelfTiles, type ShelfParams } from './addons/shelf';
import { buildDrawerBox, buildHanger, drawerFrame, hangerOffset } from './addons/drawer';
import { CLIP_H, buildDividerClip, buildDividerPanel, panelInset, panelTiles, type DividerParams } from './addons/divider';
import { WATCH_RING_H, buildWatchStand } from './addons/watch';

export type PartGroup = 'Connectors' | 'Monitor shelves' | 'Drawers' | 'Dividers' | 'Watch stands';

export interface PartSpec {
  key: string;
  name: string;
  group: PartGroup;
  /** Builds the part in its local frame. */
  build: (s: Settings) => Manifold;
  /** Rotation from the local frame to the print orientation. */
  print: Matrix4;
  /** Short printing hint. */
  note?: string;
}

export interface PartInstance {
  spec: PartSpec;
  /** Local frame → world (model space, Z-up). */
  world: Matrix4;
  source: Selection;
}

export function settingsKey(s: Settings): string {
  return [s.rodDiameter, s.socketClearance, s.clipGrip, s.wall, s.socketDepth, s.footScrews ? 1 : 0, s.bed.join('x')].join(',');
}

const r1 = (v: number) => Math.round(v * 10) / 10;

function mat3iTo4(m: Mat3i): Matrix4 {
  return new Matrix4().set(m[0], m[1], m[2], 0, m[3], m[4], m[5], 0, m[6], m[7], m[8], 0, 0, 0, 0, 1);
}
const T = (x: number, y: number, z: number) => new Matrix4().makeTranslation(x, y, z);
const RZ = (deg: number) => new Matrix4().makeRotationZ((deg * Math.PI) / 180);
const RX = (deg: number) => new Matrix4().makeRotationX((deg * Math.PI) / 180);
const RY = (deg: number) => new Matrix4().makeRotationY((deg * Math.PI) / 180);
const mul = (...ms: Matrix4[]) => ms.reduce((acc, m) => acc.multiply(m), new Matrix4());

// ---------------------------------------------------------------------------
// Occupancy along posts — used to keep clips away from connectors.

export function postBlocked(topo: Topology, postId: string, s: Settings): [number, number][] {
  const d = dims(s);
  const out: [number, number][] = [];
  for (const n of topo.nodes.values()) {
    if (n.postId !== postId) continue;
    const z = n.pos[2];
    if (n.kind === 'foot') out.push([0, d.footFloor + s.socketDepth]);
    else out.push([z - (n.mask & 32 ? d.sleeveLen : d.Ro), z + (n.mask & 16 ? d.sleeveLen : d.Ro)]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

export function freeIntervals(blocked: [number, number][], top: number, pad = 2): [number, number][] {
  const out: [number, number][] = [];
  let cur = 0;
  for (const [a, b] of blocked) {
    if (a - pad > cur) out.push([cur, a - pad]);
    cur = Math.max(cur, b + pad);
  }
  if (top > cur) out.push([cur, top]);
  return out.filter(([a, b]) => b - a > 1);
}

const overlaps = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1;

// ---------------------------------------------------------------------------
// Beam-pair add-ons (shelf, drawer)

export interface PairFrame {
  ok: boolean;
  error?: string;
  S: number;
  axis: 'x' | 'y';
  z: number;
  /** Fixed coordinates of beam A and B. */
  fa: number;
  fb: number;
  /** Overlapping range along the axis. */
  from: number;
  to: number;
  /** Connector positions along the axis on either beam. */
  stations: number[];
  /** Local frame (centre at given axis coordinate) → world. */
  frame: (center: number) => Matrix4;
}

export function pairFrame(topo: Topology, beams: [string, string]): PairFrame {
  const A = topo.beams.get(beams[0]);
  const B = topo.beams.get(beams[1]);
  const bad = (error: string): PairFrame => ({ ok: false, error, S: 0, axis: 'x', z: 0, fa: 0, fb: 0, from: 0, to: 0, stations: [], frame: () => new Matrix4() });
  if (!A || !B) return bad('Needs two beams');
  if (!A.valid || !B.valid) return bad('One of the beams is invalid');
  if (A.axis !== B.axis) return bad('Beams must be parallel');
  if (Math.abs(A.z - B.z) > 0.5) return bad('Beams must be at the same height');
  const S = Math.abs(A.fixed - B.fixed);
  if (S < 60) return bad('Beams are too close together');
  if (S > 600) return bad('Beams are too far apart (max 600 mm)');
  const from = Math.max(A.from, B.from), to = Math.min(A.to, B.to);
  if (to - from < 40) return bad('Beams do not overlap');
  const lo = Math.min(A.fixed, B.fixed), hi = Math.max(A.fixed, B.fixed);
  const mid = (lo + hi) / 2;
  const stations = [...(A as BeamInfo).stations, ...(B as BeamInfo).stations].map((s) => s.t);
  const axis = A.axis;
  const z = A.z;
  const frame = (c: number) =>
    axis === 'x'
      ? T(c, mid, z)
      : // local X → world +Y, local +Y → world -X
        mul(T(mid, c, z), RZ(90));
  return { ok: true, S, axis, z, fa: A.fixed, fb: B.fixed, from, to, stations, frame };
}

/** Largest clear span between connectors around `near`, inside a beam pair. */
export function clearSpan(pf: PairFrame, near: number, s: Settings): [number, number] {
  const d = dims(s);
  const pts = [...new Set([pf.from, pf.to, ...pf.stations])].sort((a, b) => a - b);
  let lo = pf.from, hi = pf.to;
  for (const p of pts) {
    if (p <= near) lo = Math.max(lo, p);
    if (p > near) hi = Math.min(hi, p);
  }
  return [lo + d.Ro + 2, hi - d.Ro - 2];
}

function spanWarning(pf: PairFrame, a0: number, a1: number, s: Settings, what: string, id: string): Warning | null {
  const d = dims(s);
  if (a0 < pf.from - d.Ro || a1 > pf.to + d.Ro) return { level: 'error', message: `${what} hangs past the end of the beams`, ref: id };
  for (const t of pf.stations)
    if (overlaps(a0, a1, t - d.Ro - 1, t + d.Ro + 1)) return { level: 'error', message: `${what} collides with a connector — make it narrower or move it`, ref: id };
  return null;
}

// ---------------------------------------------------------------------------

export function collectParts(design: Design, topo: Topology): { instances: PartInstance[]; warnings: Warning[] } {
  const s = design.settings;
  const sk = settingsKey(s);
  const instances: PartInstance[] = [];
  const warnings: Warning[] = [];

  // Connectors
  const footSpec: PartSpec = {
    key: `${sk}|foot`,
    name: 'Foot',
    group: 'Connectors',
    build: (ss) => buildFoot(ss),
    print: new Matrix4(),
  };
  const hubSpecs = new Map<number, PartSpec>();
  for (const n of topo.nodes.values()) {
    const src: Selection = { type: 'node', id: n.id };
    if (n.kind === 'foot') {
      instances.push({ spec: footSpec, world: T(...n.pos), source: src });
      continue;
    }
    const c = canonicalize(n.mask);
    let spec = hubSpecs.get(c.mask);
    if (!spec) {
      const P = printRotation(c.mask);
      spec = {
        key: `${sk}|hub:${c.mask}`,
        name: connectorName(c.mask),
        group: 'Connectors',
        build: (ss) => buildHub(c.mask, ss),
        print: mat3iTo4(P),
        note: c.mask === 63 ? 'Needs supports' : undefined,
      };
      hubSpecs.set(c.mask, spec);
    }
    instances.push({ spec, world: mul(T(...n.pos), mat3iTo4(c.toActual)), source: src });
  }

  for (const a of design.addons) {
    const res = addOnParts(a, design, topo, sk);
    instances.push(...res.instances);
    warnings.push(...res.warnings);
  }
  return { instances, warnings };
}

export function addOnParts(a: AddOn, design: Design, topo: Topology, sk = settingsKey(design.settings)) {
  switch (a.kind) {
    case 'shelf':
      return shelfParts(a, design, topo, sk);
    case 'drawer':
      return drawerParts(a, design, topo, sk);
    case 'divider':
      return dividerParts(a, design, topo, sk);
    case 'watch':
      return watchParts(a, design, topo, sk);
  }
}

type Res = { instances: PartInstance[]; warnings: Warning[] };

function shelfParts(a: ShelfAddOn, design: Design, topo: Topology, sk: string): Res {
  const s = design.settings;
  const pf = pairFrame(topo, a.beams);
  if (!pf.ok) return { instances: [], warnings: [{ level: 'error', message: `Monitor shelf: ${pf.error}`, ref: a.id }] };
  const warnings: Warning[] = [];
  const w = spanWarning(pf, a.center - a.width / 2, a.center + a.width / 2, s, 'Monitor shelf', a.id);
  if (w) warnings.push(w);
  const p: ShelfParams = { S: r1(pf.S), width: r1(a.width), overhang: r1(a.overhang), thickness: r1(a.thickness), cableNotch: a.cableNotch };
  const tiles = shelfTiles(p, s);
  const base = `${sk}|shelf:${p.S}:${p.width}:${p.overhang}:${p.thickness}:${p.cableNotch ? 1 : 0}`;
  const instances = tiles.map((_, i) => ({
    spec: {
      key: `${base}:${i}`,
      name: tiles.length > 1 ? `Monitor shelf ${p.width}×${r1(p.S + 2 * p.overhang)} — tile ${i + 1}/${tiles.length}` : `Monitor shelf ${p.width}×${r1(p.S + 2 * p.overhang)}`,
      group: 'Monitor shelves' as PartGroup,
      build: (ss: Settings) => buildShelf(p, ss, tiles.length > 1 ? i : -1),
      print: RX(180),
      note: tiles.length > 1 ? 'Join tiles with 1.75 mm filament pins + glue' : 'Print top-side down',
    },
    world: pf.frame(a.center),
    source: { type: 'addon', id: a.id } as Selection,
  }));
  if (tiles.length > 1) warnings.push({ level: 'info', message: `Monitor shelf is split into ${tiles.length} tiles to fit the bed`, ref: a.id });
  return { instances, warnings };
}

function drawerParts(a: DrawerAddOn, design: Design, topo: Topology, sk: string): Res {
  const s = design.settings;
  const pf = pairFrame(topo, a.beams);
  if (!pf.ok) return { instances: [], warnings: [{ level: 'error', message: `Drawer: ${pf.error}`, ref: a.id }] };
  const warnings: Warning[] = [];
  const S = r1(pf.S);
  const { T: th, zF } = drawerFrame(S, s);
  const xo = hangerOffset(a.width);
  const w = spanWarning(pf, a.center - xo - th, a.center + xo + th, s, 'Drawer', a.id);
  if (w) warnings.push(w);
  if (pf.z + zF - a.height < 2) warnings.push({ level: 'error', message: 'Drawer hits the desk — raise the beams or make it shorter', ref: a.id });
  if (a.height < 25) warnings.push({ level: 'error', message: 'Drawer must be at least 25 mm tall', ref: a.id });
  const frame = pf.frame(a.center);
  const src: Selection = { type: 'addon', id: a.id };
  const hanger: PartSpec = {
    key: `${sk}|hanger:${S}`,
    name: `Drawer hanger (beam gap ${S})`,
    group: 'Drawers',
    build: (ss) => buildHanger(S, ss),
    print: RY(90),
    note: 'Print flat, tongue up',
  };
  const W = r1(a.width), H = r1(a.height);
  const boxSpec: PartSpec = {
    key: `${sk}|drawerbox:${S}:${W}:${H}`,
    name: `Drawer box ${W}×${r1(drawerFrame(S, s).Db)}×${H}`,
    group: 'Drawers',
    build: (ss) => buildDrawerBox(S, W, H, ss),
    print: new Matrix4(),
  };
  return {
    instances: [
      { spec: hanger, world: mul(frame.clone(), T(xo, 0, 0)), source: src },
      { spec: hanger, world: mul(frame.clone(), T(-xo, 0, 0), RZ(180)), source: src },
      { spec: boxSpec, world: frame, source: src },
    ],
    warnings,
  };
}

export function dividerFrame(design: Design, a: DividerAddOn) {
  const A = design.posts.find((p) => p.id === a.posts[0]);
  const B = design.posts.find((p) => p.id === a.posts[1]);
  if (!A || !B) return null;
  const g = beamGeometry(A, B);
  if (!g) return null;
  const L = Math.hypot(B.x - A.x, B.y - A.y);
  const ang = (Math.atan2(B.y - A.y, B.x - A.x) * 180) / Math.PI;
  return { A, B, L, frame: mul(T((A.x + B.x) / 2, (A.y + B.y) / 2, 0), RZ(ang)) };
}

function dividerParts(a: DividerAddOn, design: Design, topo: Topology, sk: string): Res {
  const s = design.settings;
  const f = dividerFrame(design, a);
  const src: Selection = { type: 'addon', id: a.id };
  if (!f) return { instances: [], warnings: [{ level: 'error', message: 'Divider posts must line up along X or Y', ref: a.id }] };
  const warnings: Warning[] = [];
  if (a.z1 - a.z0 < CLIP_H * 2 + 10) return { instances: [], warnings: [{ level: 'error', message: 'Divider is too short', ref: a.id }] };
  if (f.L - 2 * panelInset(s) < 30) return { instances: [], warnings: [{ level: 'error', message: 'Divider posts are too close', ref: a.id }] };
  if (a.z1 > Math.min(f.A.height, f.B.height)) warnings.push({ level: 'error', message: 'Divider is taller than its posts', ref: a.id });
  for (const pid of a.posts)
    for (const [lo, hi] of postBlocked(topo, pid, s))
      if (overlaps(a.z0, a.z0 + CLIP_H, lo, hi) || overlaps(a.z1 - CLIP_H, a.z1, lo, hi)) {
        warnings.push({ level: 'error', message: 'Divider clip collides with a connector — change the divider height', ref: a.id });
        break;
      }
  const d = dims(s);
  for (const bi of topo.beams.values()) {
    if (!bi.valid) continue;
    const ids = bi.stations.map((st) => st.postId);
    const ia = ids.indexOf(a.posts[0]), ib = ids.indexOf(a.posts[1]);
    if (ia >= 0 && ib >= 0 && overlaps(a.z0 - d.Ro, a.z1 + d.Ro, bi.z - d.Ro, bi.z + d.Ro))
      warnings.push({ level: 'error', message: 'A beam runs through the divider', ref: a.id });
  }
  const p: DividerParams = { L: r1(f.L), z0: r1(a.z0), z1: r1(a.z1), thickness: r1(a.thickness) };
  const tiles = panelTiles(p, s);
  const base = `${sk}|panel:${p.L}:${r1(p.z1 - p.z0)}:${p.thickness}`;
  // Panel geometry depends only on size, so build it relative to z0 and shift.
  const pz: DividerParams = { ...p, z0: 0, z1: r1(p.z1 - p.z0) };
  const instances: PartInstance[] = tiles.map((_, i) => ({
    spec: {
      key: `${base}:${i}`,
      name: tiles.length > 1 ? `Divider panel ${r1(p.L - 2 * panelInset(s))}×${r1(p.z1 - p.z0 - 4)} — tile ${i + 1}/${tiles.length}` : `Divider panel ${r1(p.L - 2 * panelInset(s))}×${r1(p.z1 - p.z0 - 4)}`,
      group: 'Dividers' as PartGroup,
      build: (ss: Settings) => buildDividerPanel(pz, ss, tiles.length > 1 ? i : -1),
      print: RX(90),
      note: tiles.length > 1 ? 'Join tiles with 1.75 mm filament pins + glue' : undefined,
    },
    world: mul(f.frame.clone(), T(0, 0, p.z0)),
    source: src,
  }));
  if (tiles.length > 1) warnings.push({ level: 'info', message: `Divider panel is split into ${tiles.length} tiles to fit the bed`, ref: a.id });
  const clip: PartSpec = {
    key: `${sk}|divclip:${p.thickness}`,
    name: `Divider clip (${p.thickness} mm panel)`,
    group: 'Dividers',
    build: (ss) => buildDividerClip(p.thickness, ss),
    print: new Matrix4(),
  };
  const hx = f.L / 2;
  instances.push(
    { spec: clip, world: mul(f.frame.clone(), T(-hx, 0, p.z0)), source: src },
    { spec: clip, world: mul(f.frame.clone(), T(hx, 0, p.z0), RZ(180)), source: src },
    { spec: clip, world: mul(f.frame.clone(), T(-hx, 0, p.z1), RX(180)), source: src },
    { spec: clip, world: mul(f.frame.clone(), T(hx, 0, p.z1), RZ(180), RX(180)), source: src },
  );
  return { instances, warnings };
}

function watchParts(a: WatchAddOn, design: Design, topo: Topology, sk: string): Res {
  const s = design.settings;
  const post = design.posts.find((p) => p.id === a.post);
  if (!post) return { instances: [], warnings: [{ level: 'error', message: 'Watch stand: post is missing', ref: a.id }] };
  const warnings: Warning[] = [];
  for (const [lo, hi] of postBlocked(topo, post.id, s))
    if (overlaps(a.z, a.z + WATCH_RING_H, lo, hi)) {
      warnings.push({ level: 'error', message: 'Watch stand collides with a connector — move it up or down', ref: a.id });
      break;
    }
  if (a.z + WATCH_RING_H > post.height) warnings.push({ level: 'error', message: 'Watch stand is above the top of its post', ref: a.id });
  const p = { armLength: r1(a.armLength), tilt: r1(a.tilt), puckDiameter: r1(a.puckDiameter), puckDepth: r1(a.puckDepth) };
  const spec: PartSpec = {
    key: `${sk}|watch:${p.armLength}:${p.tilt}:${p.puckDiameter}:${p.puckDepth}`,
    name: 'Apple Watch stand',
    group: 'Watch stands',
    build: (ss) => buildWatchStand(p, ss),
    print: new Matrix4(),
  };
  return { instances: [{ spec, world: mul(T(post.x, post.y, a.z), RZ(a.angle)), source: { type: 'addon', id: a.id } }], warnings };
}
