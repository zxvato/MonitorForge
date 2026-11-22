// All dimensions are millimetres. Model space is Z-up:
//   X = width (left → right), Y = depth (front → back), Z = height above the desk.

export type Vec3 = [number, number, number];

export interface Settings {
  /** Broom handle diameter. */
  rodDiameter: number;
  /** Extra diameter added to sockets so a handle slides in. */
  socketClearance: number;
  /** Diameter reduction for snap clips so they grip the handle. */
  clipGrip: number;
  /** Wall thickness around sockets. */
  wall: number;
  /** How deep a handle goes into a connector. */
  socketDepth: number;
  /** Printer build volume. */
  bed: Vec3;
  /** Grid snap when dragging. */
  gridSnap: number;
  /** Length of one broom handle you buy (for the cut plan). */
  stockLength: number;
  /** Saw blade width. */
  kerf: number;
  /** Lowest allowed beam height (room for the foot). */
  minBeamHeight: number;
  /** Add countersunk screw holes to feet. */
  footScrews: boolean;
  /** Display colour for printed parts. */
  partColor: string;
}

export const DEFAULT_SETTINGS: Settings = {
  rodDiameter: 22,
  socketClearance: 0.4,
  clipGrip: 0.3,
  wall: 3.5,
  socketDepth: 40,
  bed: [256, 256, 256],
  gridSnap: 10,
  stockLength: 1200,
  kerf: 2,
  minBeamHeight: 60,
  footScrews: true,
  partColor: '#3d7be0',
};

/** A vertical broom handle standing on the desk. */
export interface Post {
  id: string;
  x: number;
  y: number;
  height: number;
}

/** A horizontal broom handle between two posts that line up along X or Y. */
export interface Beam {
  id: string;
  a: string;
  b: string;
  z: number;
}

export interface ShelfAddOn {
  id: string;
  kind: 'shelf';
  beams: [string, string];
  /** Centre position along the beam axis (world X or Y). */
  center: number;
  width: number;
  overhang: number;
  thickness: number;
  cableNotch: boolean;
}

export interface DrawerAddOn {
  id: string;
  kind: 'drawer';
  beams: [string, string];
  center: number;
  /** Outer width of the drawer box. */
  width: number;
  /** Outer height of the drawer box. */
  height: number;
}

export interface DividerAddOn {
  id: string;
  kind: 'divider';
  posts: [string, string];
  z0: number;
  z1: number;
  thickness: number;
}

export interface WatchAddOn {
  id: string;
  kind: 'watch';
  post: string;
  z: number;
  /** Direction the arm points, degrees counter-clockwise from +X. */
  angle: number;
  armLength: number;
  tilt: number;
  puckDiameter: number;
  puckDepth: number;
}

export type AddOn = ShelfAddOn | DrawerAddOn | DividerAddOn | WatchAddOn;
export type AddOnKind = AddOn['kind'];

export interface Design {
  name: string;
  posts: Post[];
  beams: Beam[];
  addons: AddOn[];
  settings: Settings;
}

export type Selection =
  | { type: 'post'; id: string }
  | { type: 'beam'; id: string }
  | { type: 'addon'; id: string }
  | { type: 'node'; id: string }
  | null;

export interface Warning {
  level: 'error' | 'warn' | 'info';
  message: string;
  ref?: string;
}

let counter = 0;
export function uid(prefix: string): string {
  counter = (counter + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}
