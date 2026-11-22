import type { Settings } from '../../model/types';
import { dims } from '../dims';
import { M, type Manifold } from '../manifold';
import { box, cylX, roundedRect } from '../primitives';

export interface ShelfParams {
  /** Distance between the two beam axes. */
  S: number;
  width: number;
  overhang: number;
  thickness: number;
  cableNotch: boolean;
  /** Length of the corner notches at the left/right ends that clear connector sleeves. */
  notchL: number;
  notchR: number;
}

export interface Tile {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/**
 * Local frame: origin midway between the two beam axes, at beam-axis height.
 * X runs along the beams, beam A at y = -S/2, beam B (the back) at +S/2.
 */
export function shelfExtents(p: ShelfParams, s: Settings) {
  const d = dims(s);
  const zb = d.R - d.grooveDepth;
  const depth = p.S + 2 * p.overhang;
  return { zb, zt: zb + p.thickness, depth, d };
}

/** Split a W×D plate into the fewest tiles that fit the bed (either orientation). */
export function planTiles(W: number, D: number, bed: [number, number, number], margin = 6): { nx: number; ny: number } {
  const bx = bed[0] - margin, by = bed[1] - margin;
  let best = { nx: 1, ny: 1, n: Infinity };
  for (let nx = 1; nx <= 12; nx++)
    for (let ny = 1; ny <= 12; ny++) {
      const w = W / nx, h = D / ny;
      const fits = (w <= bx && h <= by) || (w <= by && h <= bx);
      if (fits && nx * ny < best.n) best = { nx, ny, n: nx * ny };
    }
  if (!isFinite(best.n)) return { nx: 12, ny: 12 };
  return { nx: best.nx, ny: best.ny };
}

export function shelfTiles(p: ShelfParams, s: Settings): Tile[] {
  const { depth } = shelfExtents(p, s);
  const { nx, ny } = planTiles(p.width, depth, s.bed);
  const tiles: Tile[] = [];
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++)
      tiles.push({
        x0: -p.width / 2 + (p.width * i) / nx,
        x1: -p.width / 2 + (p.width * (i + 1)) / nx,
        y0: -depth / 2 + (depth * j) / ny,
        y1: -depth / 2 + (depth * (j + 1)) / ny,
      });
  return tiles;
}

export function buildShelf(p: ShelfParams, s: Settings, tileIndex = -1): Manifold {
  const { Manifold } = M();
  const { zb, zt, depth, d } = shelfExtents(p, s);
  const W = p.width;
  const tiles = shelfTiles(p, s);
  const solids: Manifold[] = [box([-W / 2, -depth / 2, zb], [W / 2, depth / 2, zt])];

  // Ribs underneath between the beams, kept clear of tile seams.
  // Keep ribs clear of the beams and of drawer-hanger lips (which reach ~R+3 from the axis).
  const ribY0 = -p.S / 2 + d.R + 5, ribY1 = p.S / 2 - d.R - 5;
  if (ribY1 - ribY0 > 10) {
    const xs = [...new Set(tiles.map((t) => `${t.x0}|${t.x1}`))].map((k) => k.split('|').map(Number));
    for (const [x0, x1] of xs) {
      const n = Math.max(2, Math.ceil((x1 - x0) / 90) + 1);
      for (let k = 0; k < n; k++) {
        const x = x0 + 8 + ((x1 - x0 - 16) * k) / (n - 1);
        solids.push(box([x - 1.5, ribY0, 0], [x + 1.5, ribY1, zb + 0.5]));
      }
    }
    // Edge ribs along the sides of the shelf
    solids.push(box([-W / 2, ribY0, 0], [-W / 2 + 3, ribY1, zb + 0.5]));
    solids.push(box([W / 2 - 3, ribY0, 0], [W / 2, ribY1, zb + 0.5]));
  }

  let shelf = Manifold.union(solids);
  const cuts: Manifold[] = [
    cylX(d.R + 0.4, -W / 2 - 1, W / 2 + 1, -p.S / 2, 0, 96),
    cylX(d.R + 0.4, -W / 2 - 1, W / 2 + 1, p.S / 2, 0, 96),
  ];
  // Corner notches so the shelf clears the connector sleeves around the beams.
  const nw = d.Ro + 1;
  for (const [len, x0, x1] of [[p.notchL, -W / 2 - 1, -W / 2 + p.notchL], [p.notchR, W / 2 - p.notchR, W / 2 + 1]] as const) {
    if (len <= 0) continue;
    cuts.push(box([x0, -depth / 2 - 1, -1], [x1, -p.S / 2 + nw, zt + 1]));
    cuts.push(box([x0, p.S / 2 - nw, -1], [x1, depth / 2 + 1, zt + 1]));
  }
  if (p.cableNotch) {
    const nd = Math.min(p.overhang - 3, 18);
    if (nd >= 8) {
      const notchW = Math.min(70, W * 0.4);
      cuts.push(Manifold.extrude(roundedRect(notchW, nd * 2, 8), zt - zb + 2).translate([0, depth / 2, zb - 1]));
    }
  }
  // Pin holes along tile seams (1.75 mm filament as dowels).
  const zPin = (zb + zt) / 2;
  const nearGroove = (y: number) => Math.abs(Math.abs(y) - p.S / 2) < d.R + 4;
  const seamsX = [...new Set(tiles.map((t) => t.x1))].filter((x) => x < W / 2 - 1);
  const seamsY = [...new Set(tiles.map((t) => t.y1))].filter((y) => y < depth / 2 - 1);
  for (const sx of seamsX) {
    const n = Math.max(2, Math.floor(depth / 45));
    for (let k = 0; k < n; k++) {
      const y = -depth / 2 + 12 + ((depth - 24) * k) / (n - 1);
      if (nearGroove(y)) continue;
      cuts.push(cylX(d.pinHole / 2, sx - 10, sx + 10, y, zPin, 16));
    }
  }
  for (const sy of seamsY) {
    const n = Math.max(2, Math.floor(W / 45));
    for (let k = 0; k < n; k++) {
      const x = -W / 2 + 12 + ((W - 24) * k) / (n - 1);
      cuts.push(cylX(d.pinHole / 2, -10, 10, 0, 0, 16).rotate([0, 0, 90]).translate([x, sy, zPin]));
    }
  }
  shelf = shelf.subtract(Manifold.union(cuts));

  if (tileIndex >= 0 && tiles.length > 1) {
    const t = tiles[tileIndex];
    shelf = shelf.intersect(box([t.x0, t.y0, -50], [t.x1, t.y1, 100]));
  }
  return shelf;
}
