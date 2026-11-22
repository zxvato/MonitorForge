import { BufferAttribute, BufferGeometry, Vector3 } from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MeshData } from '../geometry/manifold';

/** Model space is Z-up; three.js is Y-up. The scene root rotates by -90° about X. */
export const toModel = (v: Vector3): [number, number, number] => [v.x, -v.z, v.y];
export const toThree = (p: readonly number[]) => new Vector3(p[0], p[2], -p[1]);

const geoms = new Map<string, BufferGeometry>();

export function threeGeometry(key: string, mesh: MeshData | { positions: Float32Array; indices: Uint32Array }): BufferGeometry {
  const hit = geoms.get(key);
  if (hit) return hit;
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(mesh.positions, 3));
  g.setIndex(new BufferAttribute(mesh.indices, 1));
  const creased = toCreasedNormals(g, Math.PI / 7);
  creased.computeBoundingBox();
  creased.computeBoundingSphere();
  g.dispose();
  geoms.set(key, creased);
  if (geoms.size > 400) {
    const first = geoms.keys().next().value!;
    geoms.get(first)?.dispose();
    geoms.delete(first);
  }
  return creased;
}

export function snap(v: number, step: number) {
  return step > 0 ? Math.round(v / step) * step : Math.round(v);
}

export function mixColor(hex: string, toward: string, t: number) {
  const a = parseInt(hex.slice(1), 16), b = parseInt(toward.slice(1), 16);
  const ch = (x: number, s: number) => (x >> s) & 255;
  const m = (s: number) => Math.round(ch(a, s) * (1 - t) + ch(b, s) * t);
  return `#${((m(16) << 16) | (m(8) << 8) | m(0)).toString(16).padStart(6, '0')}`;
}
