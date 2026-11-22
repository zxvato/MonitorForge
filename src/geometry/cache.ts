import { Matrix4, Vector3 } from 'three';
import type { Settings } from '../model/types';
import { buildMesh, type MeshData } from './manifold';
import type { PartSpec } from './parts';

const cache = new Map<string, MeshData>();
const MAX = 300;

/** Mesh of a part in its local frame (memoised by the spec key). */
export function partMesh(spec: PartSpec, s: Settings): MeshData {
  const hit = cache.get(spec.key);
  if (hit) {
    cache.delete(spec.key);
    cache.set(spec.key, hit);
    return hit;
  }
  const mesh = buildMesh(() => spec.build(s));
  cache.set(spec.key, mesh);
  if (cache.size > MAX) cache.delete(cache.keys().next().value!);
  return mesh;
}

export interface PrintInfo {
  /** Positions in print orientation, resting on z = 0, centred in XY. */
  positions: Float32Array;
  indices: Uint32Array;
  size: [number, number, number];
  fitsBed: boolean;
  volume: number;
  status: string;
}

const printCache = new Map<string, PrintInfo>();

export function printMesh(spec: PartSpec, s: Settings): PrintInfo {
  const key = `${spec.key}|${s.bed.join('x')}`;
  const hit = printCache.get(key);
  if (hit) return hit;
  const m = partMesh(spec, s);
  const p = transformPositions(m.positions, spec.print);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3)
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], p[i + k]);
      max[k] = Math.max(max[k], p[i + k]);
    }
  const cx = (min[0] + max[0]) / 2, cy = (min[1] + max[1]) / 2;
  for (let i = 0; i < p.length; i += 3) {
    p[i] -= cx;
    p[i + 1] -= cy;
    p[i + 2] -= min[2];
  }
  const size: [number, number, number] = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const [bx, by, bz] = s.bed;
  const fitsBed = size[2] <= bz && ((size[0] <= bx && size[1] <= by) || (size[0] <= by && size[1] <= bx));
  const info: PrintInfo = { positions: p, indices: m.indices, size, fitsBed, volume: m.volume, status: m.status };
  printCache.set(key, info);
  if (printCache.size > MAX) printCache.delete(printCache.keys().next().value!);
  return info;
}

export function transformPositions(src: Float32Array, m: Matrix4): Float32Array {
  const out = new Float32Array(src.length);
  const v = new Vector3();
  for (let i = 0; i < src.length; i += 3) {
    v.set(src[i], src[i + 1], src[i + 2]).applyMatrix4(m);
    out[i] = v.x;
    out[i + 1] = v.y;
    out[i + 2] = v.z;
  }
  return out;
}

export function clearGeometryCache() {
  cache.clear();
  printCache.clear();
}
