import { describe, expect, it } from 'vitest';
import { computeTopology } from '../src/model/topology';
import { canonicalize, connectorName, ROTATIONS } from '../src/model/rotations';
import { DEFAULT_SETTINGS, type Design } from '../src/model/types';
import { dualBridge, organiser, singleRiser } from '../src/model/templates';
import { dims } from '../src/geometry/dims';

const s = DEFAULT_SETTINGS;
const design = (posts: Design['posts'], beams: Design['beams']): Design => ({ name: 't', posts, beams, addons: [], settings: s });

describe('rotations', () => {
  it('has 24 proper rotations', () => expect(ROTATIONS.length).toBe(24));
  it('canonicalises congruent connectors to the same shape', () => {
    // elbow +x/+z vs elbow -y/-z
    expect(canonicalize(0b010001).mask).toBe(canonicalize(0b101000).mask);
    // tee vs corner differ
    expect(canonicalize(0b010011).mask).not.toBe(canonicalize(0b010101).mask);
  });
  it('names connectors', () => {
    expect(connectorName(0b010001)).toBe('Elbow');
    expect(connectorName(0b010011)).toBe('Tee');
    expect(connectorName(0b010101)).toBe('Corner (3-way)');
    expect(connectorName(0b001111)).toBe('Cross');
    expect(connectorName(0b110001)).toBe('Tee');
  });
});

describe('topology', () => {
  it('two posts + top beam → feet, elbows and correct cut lengths', () => {
    const t = computeTopology(design(
      [{ id: 'a', x: 0, y: 0, height: 300 }, { id: 'b', x: 500, y: 0, height: 300 }],
      [{ id: 'ab', a: 'a', b: 'b', z: 300 }],
    ));
    expect(t.warnings.filter((w) => w.level === 'error')).toEqual([]);
    const nodes = [...t.nodes.values()];
    expect(nodes.filter((n) => n.kind === 'foot')).toHaveLength(2);
    const tops = nodes.filter((n) => n.kind === 'hub');
    expect(tops.map((n) => connectorName(canonicalize(n.mask).mask))).toEqual(['Elbow', 'Elbow']);
    const d = dims(s);
    const beam = t.rods.find((r) => r.kind === 'beam')!;
    expect(beam.length).toBe(500);
    expect(beam.cut).toBeCloseTo(500 - 2 * d.hubStop - d.rodSlack, 1);
    const post = t.rods.find((r) => r.kind === 'post')!;
    expect(post.cut).toBeCloseTo(300 - d.footFloor - d.hubStop - d.rodSlack, 1);
  });

  it('mid-height beam makes tees and splits the post', () => {
    const t = computeTopology(design(
      [{ id: 'a', x: 0, y: 0, height: 400 }, { id: 'b', x: 0, y: 300, height: 400 }],
      [{ id: 'ab', a: 'a', b: 'b', z: 200 }],
    ));
    const tees = [...t.nodes.values()].filter((n) => n.pos[2] === 200);
    expect(tees.map((n) => connectorName(canonicalize(n.mask).mask))).toEqual(['Tee', 'Tee']);
    expect(t.rods.filter((r) => r.kind === 'post')).toHaveLength(4);
  });

  it('beam through a middle post is split there', () => {
    const t = computeTopology(design(
      [{ id: 'a', x: 0, y: 0, height: 200 }, { id: 'm', x: 300, y: 0, height: 200 }, { id: 'b', x: 600, y: 0, height: 200 }],
      [{ id: 'ab', a: 'a', b: 'b', z: 200 }],
    ));
    expect(t.rods.filter((r) => r.kind === 'beam').map((r) => r.length)).toEqual([300, 300]);
    const mid = t.nodes.get('m@200')!;
    expect(connectorName(canonicalize(mid.mask).mask)).toBe('Tee');
  });

  it('flags misaligned and too-high beams', () => {
    const t = computeTopology(design(
      [{ id: 'a', x: 0, y: 0, height: 200 }, { id: 'b', x: 300, y: 100, height: 200 }, { id: 'c', x: 0, y: 300, height: 100 }],
      [{ id: 'ab', a: 'a', b: 'b', z: 150 }, { id: 'ac', a: 'a', b: 'c', z: 150 }],
    ));
    expect(t.warnings.map((w) => w.ref)).toEqual(expect.arrayContaining(['ab', 'ac']));
  });

  it('templates are free of frame errors', () => {
    for (const make of [singleRiser, dualBridge, organiser]) {
      const t = computeTopology(make());
      expect(t.warnings.filter((w) => w.level === 'error')).toEqual([]);
    }
  });
});
