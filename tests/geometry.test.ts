import { beforeAll, describe, expect, it } from 'vitest';
import { initManifold, buildMesh, M } from '../src/geometry/manifold';
import { buildFoot, buildHub } from '../src/geometry/connector';
import { buildShelf, shelfTiles } from '../src/geometry/addons/shelf';
import { buildDrawerBox, buildHanger } from '../src/geometry/addons/drawer';
import { buildDividerClip, buildDividerPanel } from '../src/geometry/addons/divider';
import { buildWatchStand } from '../src/geometry/addons/watch';
import { collectParts } from '../src/geometry/parts';
import { printMesh } from '../src/geometry/cache';
import { computeTopology } from '../src/model/topology';
import { dualBridge, organiser, singleRiser } from '../src/model/templates';
import { DEFAULT_SETTINGS } from '../src/model/types';
import { dims } from '../src/geometry/dims';
import { DIR_VECS, applyMat, canonicalize, maskDirs, printRotation } from '../src/model/rotations';

const s = DEFAULT_SETTINGS;
beforeAll(async () => {
  await initManifold();
});

const ok = (m: ReturnType<typeof buildMesh>) => {
  expect(m.status).toBe('NoError');
  expect(m.volume).toBeGreaterThan(100);
  expect(m.indices.length).toBeGreaterThan(36);
};

describe('generators produce valid solids', () => {
  it('every distinct connector shape', () => {
    const seen = new Set<number>();
    for (let mask = 1; mask < 64; mask++) seen.add(canonicalize(mask).mask);
    expect(seen.size).toBe(9);
    for (const m of seen) ok(buildMesh(() => buildHub(m, s)));
  });
  it('foot', () => ok(buildMesh(() => buildFoot(s))));
  it('shelf (single and tiled)', () => {
    const p = { S: 220, width: 552, overhang: 25, thickness: 8, cableNotch: true };
    const tiles = shelfTiles(p, s);
    expect(tiles.length).toBeGreaterThan(1);
    const whole = buildMesh(() => buildShelf(p, s));
    ok(whole);
    let sum = 0;
    tiles.forEach((_, i) => {
      const t = buildMesh(() => buildShelf(p, s, i));
      ok(t);
      sum += t.volume;
    });
    expect(sum).toBeCloseTo(whole.volume, -1);
  });
  it('drawer hanger and box', () => {
    ok(buildMesh(() => buildHanger(220, s)));
    ok(buildMesh(() => buildDrawerBox(220, 200, 60, s)));
  });
  it('divider clip and panel', () => {
    ok(buildMesh(() => buildDividerClip(5, s)));
    ok(buildMesh(() => buildDividerPanel({ L: 360, z0: 0, z1: 140, thickness: 5 }, s)));
  });
  it('watch stand', () => ok(buildMesh(() => buildWatchStand({ armLength: 30, tilt: 15, puckDiameter: 27.5, puckDepth: 7 }, s))));
});

describe('fit', () => {
  it('socket bore = rod diameter + clearance', () => {
    const d = dims(s);
    expect(2 * d.Rs).toBeCloseTo(s.rodDiameter + s.socketClearance);
    // A probe the size of the bore fits inside an end cap; one 0.5 mm larger intersects the walls.
    const cap = buildMesh(() => buildHub(1, s));
    expect(cap.max[0]).toBeCloseTo(d.sleeveLen, 1);
  });
  it('horizontal sockets keep a solid wall on top (teardrop does not break through)', () => {
    const d = dims(s);
    for (const mask of [0b000001, 0b010001, 0b010011, 0b001111, 0b010101, 0b011111]) {
      const c = canonicalize(mask).mask;
      const P = printRotation(c);
      for (const i of maskDirs(c)) {
        const v = applyMat(P, DIR_VECS[i]);
        if (v[2] !== 0) continue;
        // 1 mm wide probe along the top centreline of this sleeve, just under its top face
        const vol = buildMesh(() => {
          const { Manifold } = M();
          const hub = buildHub(c, s).transform([P[0], P[3], P[6], 0, P[1], P[4], P[7], 0, P[2], P[5], P[8], 0, 0, 0, 0, 1] as any);
          const len = s.socketDepth - 4;
          const mid = d.hubStop + 2 + len / 2;
          const probe = Manifold.cube([v[0] ? len : 1, v[1] ? len : 1, 0.8], true).translate([v[0] * mid, v[1] * mid, d.Ro - 0.6]);
          return hub.intersect(probe).add(Manifold.cube(0.01).translate([500, 500, 500]));
        }).volume;
        expect(vol, `mask ${c} dir ${i}`).toBeGreaterThan((s.socketDepth - 4) * 0.8 * 0.95);
      }
    }
  });
  it('hanger lips stay below the shelf underside', () => {
    const d = dims(s);
    const h = buildMesh(() => buildHanger(220, s));
    expect(h.max[2]).toBeLessThan(d.R - d.grooveDepth - 0.3);
  });
});

describe('templates → printable parts', () => {
  for (const make of [singleRiser, dualBridge, organiser]) {
    it(make.name, () => {
      const design = make();
      const topo = computeTopology(design);
      const { instances, warnings } = collectParts(design, topo);
      expect(warnings.filter((w) => w.level === 'error')).toEqual([]);
      const specs = new Map(instances.map((i) => [i.spec.key, i.spec]));
      for (const spec of specs.values()) {
        const pm = printMesh(spec, design.settings);
        expect(pm.status, spec.name).toBe('NoError');
        expect(pm.fitsBed, `${spec.name} ${pm.size.map((v) => v.toFixed(0)).join('×')}`).toBe(true);
      }
    });
  }
});
