// What happens when something from the palette is dropped into the scene.
import { clearSpan, freeIntervals, pairFrame, postBlocked } from '../geometry/parts';
import { drawerFrame } from '../geometry/addons/drawer';
import { CLIP_H } from '../geometry/addons/divider';
import { WATCH_RING_H } from '../geometry/addons/watch';
import { beamGeometry, type Topology } from '../model/topology';
import { uid, type AddOn, type Beam, type Design, type Post } from '../model/types';
import { snap } from './three-helpers';

export type PaletteKind = 'post' | 'beam' | 'shelf' | 'drawer' | 'divider' | 'watch';

export interface Hit {
  type: 'desk' | 'post' | 'beam';
  id?: string;
  /** Model-space point. */
  point: [number, number, number];
}

export type DropResult =
  | { action: 'post'; x: number; y: number; height: number }
  | { action: 'beam'; a: string; b: string; z: number }
  | { action: 'addon'; addon: AddOn }
  | { action: 'none'; message: string };

export function planDrop(kind: PaletteKind, hit: Hit | null, design: Design, topo: Topology): DropResult {
  const s = design.settings;
  const g = s.gridSnap;
  if (!hit) return { action: 'none', message: 'Drop it onto the desk or the frame' };
  const post = hit.type === 'post' ? design.posts.find((p) => p.id === hit.id) : undefined;
  const beam = hit.type === 'beam' ? design.beams.find((b) => b.id === hit.id) : undefined;

  switch (kind) {
    case 'post': {
      const tallest = design.posts.length ? Math.max(...design.posts.map((p) => p.height)) : 300;
      return { action: 'post', x: snap(hit.point[0], g), y: snap(hit.point[1], g), height: tallest };
    }
    case 'beam': {
      if (!post) return { action: 'none', message: 'Drop a beam onto a post — it connects to the nearest post in line with it' };
      let z = Math.max(s.minBeamHeight, Math.min(snap(hit.point[2], g), post.height));
      if (post.height - z < 15) z = post.height;
      const partner = nearestAligned(design, post, hit.point, z);
      if (!partner) return { action: 'none', message: 'No other post lines up with this one (same X or Y) at that height' };
      return { action: 'beam', a: post.id, b: partner.id, z: Math.min(z, partner.height) };
    }
    case 'shelf':
    case 'drawer': {
      if (!beam) return { action: 'none', message: `Drop the ${kind === 'shelf' ? 'monitor shelf' : 'drawer'} onto a beam — it needs a parallel beam behind it` };
      const partner = parallelPartner(topo, beam);
      if (!partner) return { action: 'none', message: 'This beam needs a parallel beam at the same height (60–600 mm away)' };
      const pf = pairFrame(topo, [beam.id, partner.id]);
      if (!pf.ok) return { action: 'none', message: pf.error ?? 'Invalid beam pair' };
      const along = pf.axis === 'x' ? hit.point[0] : hit.point[1];
      const [lo, hi] = clearSpan(pf, along, s);
      const span = hi - lo;
      const center = Math.round((lo + hi) / 2);
      // keep front beam first (smaller fixed coordinate)
      const pair: [string, string] = pf.fa <= pf.fb ? [beam.id, partner.id] : [partner.id, beam.id];
      if (kind === 'shelf') {
        if (span < 60) return { action: 'none', message: 'Not enough room between the connectors for a shelf' };
        return {
          action: 'addon',
          addon: { id: uid('shelf'), kind: 'shelf', beams: pair, center, width: Math.floor(span), overhang: 20, thickness: 6, cableNotch: true },
        };
      }
      const { zF, T } = drawerFrame(pf.S, s);
      const maxW = span - 2 * (6.8 + T + 1);
      if (maxW < 60) return { action: 'none', message: 'Not enough room between the connectors for a drawer' };
      const maxH = pf.z + zF - 6;
      if (maxH < 25) return { action: 'none', message: 'These beams are too low for a drawer underneath' };
      return {
        action: 'addon',
        addon: { id: uid('drawer'), kind: 'drawer', beams: pair, center, width: Math.floor(Math.min(240, maxW) / 5) * 5, height: Math.floor(Math.min(70, maxH) / 5) * 5 },
      };
    }
    case 'divider': {
      if (!post) return { action: 'none', message: 'Drop the divider onto a post — it spans to the nearest post in line' };
      const partner = nearestAligned(design, post, hit.point, 0);
      if (!partner) return { action: 'none', message: 'No other post lines up with this one' };
      const top = Math.min(post.height, partner.height);
      const free = intersectIntervals(
        freeIntervals(postBlocked(topo, post.id, s), top),
        freeIntervals(postBlocked(topo, partner.id, s), top),
      ).filter(([a, b]) => b - a >= CLIP_H * 2 + 20);
      if (!free.length) return { action: 'none', message: 'No free height between connectors on these posts' };
      const z = hit.point[2];
      const pick = free.find(([a, b]) => z >= a && z <= b) ?? free.reduce((m, f) => (f[1] - f[0] > m[1] - m[0] ? f : m));
      const z0 = Math.ceil(pick[0]);
      const z1 = Math.floor(Math.min(pick[1], z0 + 260));
      return { action: 'addon', addon: { id: uid('divider'), kind: 'divider', posts: [post.id, partner.id], z0, z1, thickness: 5 } };
    }
    case 'watch': {
      if (!post) return { action: 'none', message: 'Drop the watch stand onto a post' };
      const free = freeIntervals(postBlocked(topo, post.id, s), post.height).filter(([a, b]) => b - a >= WATCH_RING_H + 2);
      if (!free.length) return { action: 'none', message: 'No free spot on this post — make it taller' };
      const want = snap(hit.point[2] - WATCH_RING_H / 2, g);
      let z = want;
      const inside = free.find(([a, b]) => want >= a && want + WATCH_RING_H <= b);
      if (!inside) {
        const best = free.reduce((m, f) => (Math.abs((f[0] + f[1]) / 2 - want) < Math.abs((m[0] + m[1]) / 2 - want) ? f : m));
        z = Math.max(best[0], Math.min(want, best[1] - WATCH_RING_H));
      }
      return {
        action: 'addon',
        addon: { id: uid('watch'), kind: 'watch', post: post.id, z: Math.ceil(z), angle: -90, armLength: 30, tilt: 15, puckDiameter: 27.5, puckDepth: 7 },
      };
    }
  }
}

export function nearestAligned(design: Design, post: Post, toward: readonly number[], z: number): Post | null {
  let best: Post | null = null;
  let bestScore = Infinity;
  const dx = toward[0] - post.x, dy = toward[1] - post.y;
  for (const p of design.posts) {
    if (p.id === post.id || !beamGeometry(post, p) || p.height < z - 0.5) continue;
    if (design.beams.some((b) => ((b.a === post.id && b.b === p.id) || (b.b === post.id && b.a === p.id)) && Math.abs(b.z - z) < 1)) continue;
    const vx = p.x - post.x, vy = p.y - post.y;
    const dist = Math.hypot(vx, vy);
    // prefer posts in the direction of the drop point, then the closest
    const dirBonus = Math.hypot(dx, dy) > 5 ? (vx * dx + vy * dy) / (dist * Math.hypot(dx, dy)) : 0;
    const score = dist * (1.5 - dirBonus);
    if (score < bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

export function parallelPartner(topo: Topology, beam: Beam): Beam | null {
  const A = topo.beams.get(beam.id);
  if (!A?.valid) return null;
  let best: { id: string; d: number } | null = null;
  for (const [id, B] of topo.beams) {
    if (id === beam.id || !B.valid || B.axis !== A.axis || Math.abs(B.z - A.z) > 0.5) continue;
    const d = Math.abs(B.fixed - A.fixed);
    if (d < 60 || d > 600) continue;
    if (Math.min(A.to, B.to) - Math.max(A.from, B.from) < 40) continue;
    if (!best || d < best.d) best = { id, d };
  }
  return best ? { ...beam, id: best.id } : null;
}

function intersectIntervals(a: [number, number][], b: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const [a0, a1] of a)
    for (const [b0, b1] of b) {
      const lo = Math.max(a0, b0), hi = Math.min(a1, b1);
      if (hi > lo) out.push([lo, hi]);
    }
  return out;
}

export const PALETTE: { kind: PaletteKind; name: string; hint: string }[] = [
  { kind: 'post', name: 'Post', hint: 'Upright handle — drop on the desk' },
  { kind: 'beam', name: 'Beam', hint: 'Horizontal handle — drop on a post' },
  { kind: 'shelf', name: 'Monitor shelf', hint: 'Drop on a beam with a parallel beam' },
  { kind: 'drawer', name: 'Drawer', hint: 'Hangs under two parallel beams' },
  { kind: 'divider', name: 'Divider', hint: 'Panel between two posts' },
  { kind: 'watch', name: 'Watch stand', hint: 'Apple Watch charger on a post' },
];
