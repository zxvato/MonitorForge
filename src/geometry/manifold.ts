// Loads the Manifold WASM kernel and adds a tiny memory scope so that every
// intermediate solid created while building a part is freed afterwards.

import Module from 'manifold-3d';
import type { ManifoldToplevel, Manifold, CrossSection } from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';

export type { Manifold, CrossSection };

let wasm: ManifoldToplevel | null = null;
let loading: Promise<ManifoldToplevel> | null = null;

let scope: Set<{ delete(): void; isDeleted(): boolean }> | null = null;

function track(v: unknown) {
  if (!scope) return;
  if (Array.isArray(v)) v.forEach(track);
  else if (v && typeof v === 'object' && typeof (v as any).isDeleted === 'function') scope.add(v as any);
}

const SKIP = new Set(['constructor', 'delete', 'isDeleted', 'deleteLater', 'isAliasOf', 'clone']);
function patch(target: any) {
  for (const name of Object.getOwnPropertyNames(target)) {
    if (SKIP.has(name) || name === 'prototype' || name === 'length' || name === 'name') continue;
    const fn = target[name];
    if (typeof fn !== 'function' || fn.__tracked) continue;
    const wrapped = function (this: unknown, ...args: unknown[]) {
      const r = fn.apply(this, args);
      track(r);
      return r;
    };
    (wrapped as any).__tracked = true;
    target[name] = wrapped;
  }
}

export async function initManifold(): Promise<ManifoldToplevel> {
  if (wasm) return wasm;
  if (!loading) {
    const isBrowser = typeof window !== 'undefined';
    loading = (isBrowser ? Module({ locateFile: () => wasmUrl }) : Module()).then((w) => {
      w.setup();
      w.setCircularSegments(0);
      w.setMinCircularAngle(6);
      w.setMinCircularEdgeLength(1);
      const { Manifold, CrossSection } = w;
      patch(Object.getPrototypeOf(Manifold.cube(1)));
      patch(Object.getPrototypeOf(CrossSection.square(1)));
      patch(Manifold);
      patch(CrossSection);
      wasm = w;
      return w;
    });
  }
  return loading;
}

export function M(): ManifoldToplevel {
  if (!wasm) throw new Error('Manifold not initialised');
  return wasm;
}

export function isReady() {
  return wasm !== null;
}

export interface MeshData {
  positions: Float32Array;
  indices: Uint32Array;
  volume: number;
  status: string;
  min: [number, number, number];
  max: [number, number, number];
}

/** Run a builder, extract its mesh, then free every solid it created. */
export function buildMesh(build: () => Manifold): MeshData {
  const prev = scope;
  scope = new Set();
  try {
    const m = build();
    const mesh = m.getMesh();
    const np = mesh.numProp;
    const n = mesh.vertProperties.length / np;
    const positions = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      positions[i * 3] = mesh.vertProperties[i * np];
      positions[i * 3 + 1] = mesh.vertProperties[i * np + 1];
      positions[i * 3 + 2] = mesh.vertProperties[i * np + 2];
    }
    const bb = m.boundingBox();
    return {
      positions,
      indices: new Uint32Array(mesh.triVerts),
      volume: m.volume(),
      status: m.status(),
      min: [bb.min[0], bb.min[1], bb.min[2]],
      max: [bb.max[0], bb.max[1], bb.max[2]],
    };
  } finally {
    for (const o of scope) if (!o.isDeleted()) o.delete();
    scope = prev;
  }
}
