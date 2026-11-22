import type { Settings } from '../../model/types';
import { dims } from '../dims';
import { M, type Manifold } from '../manifold';
import { box, clipProfile } from '../primitives';
import { planTiles } from './shelf';

export const CLIP_H = 20;
const SLOT_DEPTH = 12;

/**
 * Divider clip, local frame: handle axis at the origin, clip from z = 0 to CLIP_H.
 * The ring opens towards -X; the tab with the panel slot points to +X. The slot
 * has a 2 mm floor at the bottom (flip the clip for the top of the panel).
 */
export function buildDividerClip(thickness: number, s: Settings): Manifold {
  const { Manifold } = M();
  const d = dims(s);
  const ro = d.Rc + d.clipWall;
  const ring = Manifold.extrude(clipProfile(d.Rc, d.clipWall, 110, 180), CLIP_H);
  const hw = (thickness + 0.4) / 2;
  const tab = box([ro - 1.5, -hw - 2.5, 0], [ro + SLOT_DEPTH + 1, hw + 2.5, CLIP_H]);
  const slot = box([ro + 1, -hw, 2], [ro + SLOT_DEPTH + 2, hw, CLIP_H + 1]);
  return ring.add(tab.subtract(Manifold.cylinder(CLIP_H + 2, d.Rc, d.Rc, 96).translate([0, 0, -1]))).subtract(slot);
}

/** Panel edge distance from a post axis. */
export function panelInset(s: Settings) {
  const d = dims(s);
  return d.Rc + d.clipWall + 2;
}

export interface DividerParams {
  L: number;
  z0: number;
  z1: number;
  thickness: number;
}

export interface PanelTile {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export function panelTiles(p: DividerParams, s: Settings): PanelTile[] {
  const inset = panelInset(s);
  const X0 = -p.L / 2 + inset, X1 = p.L / 2 - inset;
  const Z0 = p.z0 + 2, Z1 = p.z1 - 2;
  const { nx, ny } = planTiles(X1 - X0, Z1 - Z0, s.bed);
  const out: PanelTile[] = [];
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++)
      out.push({
        x0: X0 + ((X1 - X0) * i) / nx,
        x1: X0 + ((X1 - X0) * (i + 1)) / nx,
        z0: Z0 + ((Z1 - Z0) * j) / ny,
        z1: Z0 + ((Z1 - Z0) * (j + 1)) / ny,
      });
  return out;
}

/**
 * Panel, local frame: origin on the desk midway between the posts, X from post A
 * to post B, the panel lies in the XZ plane.
 */
export function buildDividerPanel(p: DividerParams, s: Settings, tileIndex = -1): Manifold {
  const { Manifold } = M();
  const d = dims(s);
  const tiles = panelTiles(p, s);
  const X0 = tiles[0].x0, X1 = tiles[tiles.length - 1].x1;
  const Z0 = tiles[0].z0, Z1 = tiles[tiles.length - 1].z1;
  const t = p.thickness;
  let panel = box([X0, -t / 2, Z0], [X1, t / 2, Z1]);
  const pins: Manifold[] = [];
  const pin = (len: number) => Manifold.cylinder(len, d.pinHole / 2, d.pinHole / 2, 16, true);
  for (const sx of [...new Set(tiles.map((q) => q.x1))].filter((x) => x < X1 - 1)) {
    const n = Math.max(2, Math.floor((Z1 - Z0) / 60));
    for (let k = 0; k < n; k++) pins.push(pin(20).rotate([0, 90, 0]).translate([sx, 0, Z0 + 15 + ((Z1 - Z0 - 30) * k) / (n - 1)]));
  }
  for (const sz of [...new Set(tiles.map((q) => q.z1))].filter((z) => z < Z1 - 1)) {
    const n = Math.max(2, Math.floor((X1 - X0) / 60));
    for (let k = 0; k < n; k++) pins.push(pin(20).translate([X0 + 15 + ((X1 - X0 - 30) * k) / (n - 1), 0, sz]));
  }
  if (pins.length && t >= 3.5) panel = panel.subtract(Manifold.union(pins));
  if (tileIndex >= 0 && tiles.length > 1) {
    const q = tiles[tileIndex];
    panel = panel.intersect(box([q.x0, -t, q.z0], [q.x1, t, q.z1]));
  }
  return panel;
}
