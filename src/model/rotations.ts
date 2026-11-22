// Axis-direction bookkeeping for connectors.
// Directions: 0:+x 1:-x 2:+y 3:-y 4:+z 5:-z, packed into a 6-bit mask.

export type Mat3i = number[]; // row-major 3x3, entries in {-1,0,1}

export const DIR_NAMES = ['+x', '-x', '+y', '-y', '+z', '-z'] as const;
export const DIR_VECS: [number, number, number][] = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];

export function dirIndex(v: readonly number[]): number {
  for (let i = 0; i < 6; i++) {
    const d = DIR_VECS[i];
    if (Math.round(v[0]) === d[0] && Math.round(v[1]) === d[1] && Math.round(v[2]) === d[2]) return i;
  }
  throw new Error(`not an axis direction: ${v}`);
}

export function applyMat(m: Mat3i, v: readonly number[]): [number, number, number] {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

export function transpose(m: Mat3i): Mat3i {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

function det(m: Mat3i): number {
  return (
    m[0] * (m[4] * m[8] - m[5] * m[7]) -
    m[1] * (m[3] * m[8] - m[5] * m[6]) +
    m[2] * (m[3] * m[7] - m[4] * m[6])
  );
}

/** The 24 proper rotations of the cube. */
export const ROTATIONS: Mat3i[] = (() => {
  const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  const out: Mat3i[] = [];
  for (const p of perms)
    for (let s = 0; s < 8; s++) {
      const m = new Array(9).fill(0);
      for (let r = 0; r < 3; r++) m[r * 3 + p[r]] = (s >> r) & 1 ? -1 : 1;
      if (det(m) === 1) out.push(m);
    }
  // identity first so it wins ties
  out.sort((a, b) => Number(isIdentity(b)) - Number(isIdentity(a)));
  return out;
})();

function isIdentity(m: Mat3i) {
  return m[0] === 1 && m[4] === 1 && m[8] === 1;
}

export function rotateMask(m: Mat3i, mask: number): number {
  let out = 0;
  for (let i = 0; i < 6; i++) if (mask & (1 << i)) out |= 1 << dirIndex(applyMat(m, DIR_VECS[i]));
  return out;
}

export function maskDirs(mask: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < 6; i++) if (mask & (1 << i)) out.push(i);
  return out;
}

export interface Canonical {
  /** Canonical mask (same shape for every rotated copy). */
  mask: number;
  /** Rotation taking canonical directions to the actual ones. */
  toActual: Mat3i;
}

const canonCache = new Map<number, Canonical>();
export function canonicalize(mask: number): Canonical {
  const hit = canonCache.get(mask);
  if (hit) return hit;
  let best = Infinity;
  let bestRot: Mat3i = ROTATIONS[0];
  for (const r of ROTATIONS) {
    const m = rotateMask(r, mask);
    if (m < best) {
      best = m;
      bestRot = r;
    }
  }
  // bestRot maps actual → canonical, so the inverse (transpose) maps back.
  const res = { mask: best, toActual: transpose(bestRot) };
  canonCache.set(mask, res);
  return res;
}

/** Rotation that puts a free direction of the connector on the print bed (-Z). */
export function printRotation(mask: number): Mat3i {
  const order = [5, 4, 1, 0, 3, 2];
  const opposite = (i: number) => i ^ 1;
  // Prefer a free face whose opposite has a socket, so that socket points straight up.
  const free =
    order.find((i) => !(mask & (1 << i)) && mask & (1 << opposite(i))) ?? order.find((i) => !(mask & (1 << i)));
  if (free === undefined) return ROTATIONS[0];
  for (const r of ROTATIONS) {
    const v = applyMat(r, DIR_VECS[free]);
    if (v[2] === -1) return r;
  }
  return ROTATIONS[0];
}

export function connectorName(mask: number): string {
  const dirs = maskDirs(mask);
  const n = dirs.length;
  let pairs = 0;
  for (let a = 0; a < 6; a += 2) if (mask & (1 << a) && mask & (1 << (a + 1))) pairs++;
  if (n === 1) return 'End cap';
  if (n === 2) return pairs ? 'Straight coupler' : 'Elbow';
  if (n === 3) return pairs ? 'Tee' : 'Corner (3-way)';
  if (n === 4) return pairs === 2 ? 'Cross' : 'Tee + branch (4-way)';
  return `${n}-way hub`;
}
