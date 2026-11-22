// Physical sanity check: no two parts (printed parts or wooden handles) occupy the same space.
import { beforeAll, describe, expect, it } from 'vitest';
import { Matrix4, Vector3 } from 'three';
import { initManifold, M, type Manifold } from '../src/geometry/manifold';
import { partMesh } from '../src/geometry/cache';
import { collectParts } from '../src/geometry/parts';
import { computeTopology } from '../src/model/topology';
import { dualBridge, organiser, singleRiser } from '../src/model/templates';
import { dims } from '../src/geometry/dims';
import type { Design } from '../src/model/types';

beforeAll(async () => {
  await initManifold();
});

interface Body {
  name: string;
  solid: Manifold;
  min: number[];
  max: number[];
  group: string;
}

function bodies(design: Design): Body[] {
  const { Manifold, Mesh } = M() as any;
  const topo = computeTopology(design);
  const { instances } = collectParts(design, topo);
  const out: Body[] = [];
  instances.forEach((inst, k) => {
    const mesh = partMesh(inst.spec, design.settings);
    const m = new Mesh({ numProp: 3, vertProperties: new Float32Array(mesh.positions), triVerts: new Uint32Array(mesh.indices) });
    m.merge();
    const solid = Manifold.ofMesh(m).transform(Array.from(inst.world.elements) as any);
    const bb = solid.boundingBox();
    out.push({ name: `${inst.spec.name}#${k}`, solid, min: bb.min, max: bb.max, group: inst.spec.group });
  });
  const d = dims(design.settings);
  for (const r of topo.rods) {
    const a = topo.nodes.get(r.a)!, b = topo.nodes.get(r.b)!;
    const A = new Vector3(...a.pos), B = new Vector3(...b.pos);
    const dir = B.clone().sub(A).normalize();
    const sa = a.kind === 'foot' ? d.footFloor : d.hubStop;
    const p0 = A.clone().addScaledVector(dir, sa + 0.3);
    const len = r.cut - 0.6;
    // cylinder along +Z, rotated onto dir
    const q = new Matrix4().lookAt(new Vector3(), dir, Math.abs(dir.z) > 0.9 ? new Vector3(0, 1, 0) : new Vector3(0, 0, 1));
    // lookAt maps -Z to dir; flip
    const rot = q.multiply(new Matrix4().makeRotationX(Math.PI));
    const mtx = new Matrix4().makeTranslation(p0.x, p0.y, p0.z).multiply(rot);
    // clips grip with a deliberate 0.15 mm interference, so model the handle at the clip radius
    const solid = Manifold.cylinder(len, d.Rc - 0.05, d.Rc - 0.05, 48).transform(Array.from(mtx.elements) as any);
    const bb = solid.boundingBox();
    out.push({ name: `handle ${r.id}`, solid, min: bb.min, max: bb.max, group: 'handle' });
  }
  return out;
}

const overlapBB = (a: Body, b: Body) => [0, 1, 2].every((k) => a.min[k] < b.max[k] && b.min[k] < a.max[k]);

describe('no collisions in templates', () => {
  for (const make of [singleRiser, dualBridge, organiser]) {
    it(make.name, () => {
      const list = bodies(make());
      const hits: string[] = [];
      for (let i = 0; i < list.length; i++)
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i], b = list[j];
          if (!overlapBB(a, b)) continue;
          const v = a.solid.intersect(b.solid).volume();
          if (v > 2) hits.push(`${a.name} × ${b.name}: ${v.toFixed(1)} mm³`);
        }
      expect(hits).toEqual([]);
    });
  }
});
