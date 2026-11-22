// Turns the high-level design (posts, beams) into the physical frame:
// nodes where handles meet (each becomes a printed connector) and rods (cut handles).

import { dims } from '../geometry/dims';
import type { Beam, Design, Post, Vec3, Warning } from './types';
import { DIR_VECS, dirIndex } from './rotations';

export interface TNode {
  id: string;
  postId: string;
  pos: Vec3;
  /** Bitmask of socket directions (see rotations.ts). */
  mask: number;
  kind: 'foot' | 'hub';
}

export interface TRod {
  id: string;
  kind: 'post' | 'beam';
  sourceId: string;
  a: string;
  b: string;
  axis: 'x' | 'y' | 'z';
  /** Node centre to node centre. */
  length: number;
  /** Length to saw the broom handle to. */
  cut: number;
}

export interface BeamInfo {
  valid: boolean;
  axis: 'x' | 'y';
  /** Coordinates along the axis of each station (post) the beam passes, sorted. */
  stations: { postId: string; t: number }[];
  /** The fixed coordinate (y for an X beam, x for a Y beam). */
  fixed: number;
  z: number;
  from: number;
  to: number;
}

export interface Topology {
  nodes: Map<string, TNode>;
  rods: TRod[];
  beams: Map<string, BeamInfo>;
  warnings: Warning[];
}

const EPS = 0.5;
const roundZ = (z: number) => Math.round(z * 10) / 10;
export const nodeId = (postId: string, z: number) => `${postId}@${roundZ(z)}`;

export function beamGeometry(a: Post, b: Post): { axis: 'x' | 'y'; fixed: number; from: number; to: number } | null {
  const sameX = Math.abs(a.x - b.x) < EPS;
  const sameY = Math.abs(a.y - b.y) < EPS;
  if (sameX && sameY) return null;
  if (sameY) return { axis: 'x', fixed: a.y, from: Math.min(a.x, b.x), to: Math.max(a.x, b.x) };
  if (sameX) return { axis: 'y', fixed: a.x, from: Math.min(a.y, b.y), to: Math.max(a.y, b.y) };
  return null;
}

export function computeTopology(design: Design): Topology {
  const d = dims(design.settings);
  const warnings: Warning[] = [];
  const posts = new Map(design.posts.map((p) => [p.id, p]));
  const heights = new Map<string, Set<number>>();
  for (const p of design.posts) {
    heights.set(p.id, new Set([0, roundZ(p.height)]));
    if (p.height < d.Ro * 2 + 20) warnings.push({ level: 'warn', message: `Post is very short (${p.height} mm)`, ref: p.id });
  }

  // Overlapping posts
  for (let i = 0; i < design.posts.length; i++)
    for (let j = i + 1; j < design.posts.length; j++) {
      const a = design.posts[i], b = design.posts[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) < d.Ro * 2 + 10)
        warnings.push({ level: 'error', message: 'Two posts are too close together', ref: b.id });
    }

  const beams = new Map<string, BeamInfo>();
  const segments: { beam: Beam; p: string; q: string; axis: 'x' | 'y' }[] = [];
  const seen = new Set<string>();

  for (const beam of design.beams) {
    const a = posts.get(beam.a), b = posts.get(beam.b);
    if (!a || !b) {
      warnings.push({ level: 'error', message: 'Beam references a missing post', ref: beam.id });
      continue;
    }
    const g = beamGeometry(a, b);
    const info: BeamInfo = {
      valid: false,
      axis: g?.axis ?? 'x',
      stations: [],
      fixed: g?.fixed ?? 0,
      z: beam.z,
      from: g?.from ?? 0,
      to: g?.to ?? 0,
    };
    beams.set(beam.id, info);
    if (!g) {
      warnings.push({ level: 'error', message: 'Beam posts must line up along X or Y', ref: beam.id });
      continue;
    }
    if (beam.z > Math.min(a.height, b.height) + EPS) {
      warnings.push({ level: 'error', message: 'Beam is higher than one of its posts', ref: beam.id });
      continue;
    }
    if (beam.z < design.settings.minBeamHeight - EPS) {
      warnings.push({ level: 'error', message: `Beam is lower than the minimum (${design.settings.minBeamHeight} mm)`, ref: beam.id });
      continue;
    }
    const key = [beam.a, beam.b].sort().join('|') + '@' + roundZ(beam.z);
    if (seen.has(key)) {
      warnings.push({ level: 'warn', message: 'Duplicate beam', ref: beam.id });
      continue;
    }
    seen.add(key);

    // Posts the beam passes through (collinear, between the ends, tall enough) split it.
    const coord = (p: Post) => (g.axis === 'x' ? p.x : p.y);
    const other = (p: Post) => (g.axis === 'x' ? p.y : p.x);
    const stations = design.posts
      .filter((p) => Math.abs(other(p) - g.fixed) < EPS && coord(p) >= g.from - EPS && coord(p) <= g.to + EPS)
      .filter((p) => p.id === a.id || p.id === b.id || p.height >= beam.z - EPS)
      .map((p) => ({ postId: p.id, t: coord(p) }))
      .sort((m, n) => m.t - n.t);
    info.stations = stations;
    info.valid = true;
    for (const s of stations) heights.get(s.postId)!.add(roundZ(beam.z));
    for (let i = 0; i + 1 < stations.length; i++)
      segments.push({ beam, p: stations[i].postId, q: stations[i + 1].postId, axis: g.axis });
  }

  // Nodes
  const nodes = new Map<string, TNode>();
  const mergedHeights = new Map<string, number[]>();
  for (const p of design.posts) {
    const zs = [...heights.get(p.id)!].sort((m, n) => m - n);
    const merged: number[] = [];
    for (const z of zs) if (!merged.length || z - merged[merged.length - 1] > EPS) merged.push(z);
    mergedHeights.set(p.id, merged);
    for (let i = 0; i < merged.length; i++) {
      const z = merged[i];
      let mask = 0;
      if (i > 0) mask |= 1 << 5;
      if (i < merged.length - 1) mask |= 1 << 4;
      nodes.set(nodeId(p.id, z), { id: nodeId(p.id, z), postId: p.id, pos: [p.x, p.y, z], mask, kind: z === 0 ? 'foot' : 'hub' });
    }
  }

  const stop = (n: TNode) => (n.kind === 'foot' ? d.footFloor : d.hubStop);
  const rods: TRod[] = [];
  const addRod = (kind: TRod['kind'], sourceId: string, na: TNode, nb: TNode, axis: TRod['axis']) => {
    const length = Math.hypot(nb.pos[0] - na.pos[0], nb.pos[1] - na.pos[1], nb.pos[2] - na.pos[2]);
    const cut = Math.round((length - stop(na) - stop(nb) - d.rodSlack) * 10) / 10;
    const rod: TRod = { id: `${na.id}~${nb.id}`, kind, sourceId, a: na.id, b: nb.id, axis, length, cut };
    if (cut < 20) warnings.push({ level: 'error', message: `Handle piece is too short (${cut.toFixed(0)} mm) — move things apart`, ref: sourceId });
    rods.push(rod);
  };

  for (const p of design.posts) {
    const zs = mergedHeights.get(p.id)!;
    for (let i = 0; i + 1 < zs.length; i++) addRod('post', p.id, nodes.get(nodeId(p.id, zs[i]))!, nodes.get(nodeId(p.id, zs[i + 1]))!, 'z');
  }

  const findNode = (postId: string, z: number) => {
    for (const zz of mergedHeights.get(postId)!) if (Math.abs(zz - z) <= EPS) return nodes.get(nodeId(postId, zz))!;
    throw new Error('node not found');
  };
  for (const s of segments) {
    const na = findNode(s.p, s.beam.z);
    const nb = findNode(s.q, s.beam.z);
    const dir = [nb.pos[0] - na.pos[0], nb.pos[1] - na.pos[1], 0];
    const len = Math.hypot(dir[0], dir[1]);
    const unit = [dir[0] / len, dir[1] / len, 0];
    na.mask |= 1 << dirIndex(unit);
    nb.mask |= 1 << dirIndex(unit.map((v) => -v));
    addRod('beam', s.beam.id, na, nb, s.axis);
  }

  return { nodes, rods, beams, warnings };
}

/** Unit vector for a direction index (re-exported for convenience). */
export const dirVec = (i: number) => DIR_VECS[i];
