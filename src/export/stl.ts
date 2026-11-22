/** Binary STL from positions + triangle indices. */
export function toBinarySTL(positions: Float32Array, indices: Uint32Array, name = 'part'): ArrayBuffer {
  const tris = indices.length / 3;
  const buf = new ArrayBuffer(84 + tris * 50);
  const view = new DataView(buf);
  const header = `binary STL ${name}`.slice(0, 80);
  for (let i = 0; i < header.length; i++) view.setUint8(i, header.charCodeAt(i) & 0x7f);
  view.setUint32(80, tris, true);
  let o = 84;
  for (let t = 0; t < tris; t++) {
    const a = indices[t * 3] * 3, b = indices[t * 3 + 1] * 3, c = indices[t * 3 + 2] * 3;
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    view.setFloat32(o, nx, true); view.setFloat32(o + 4, ny, true); view.setFloat32(o + 8, nz, true);
    o += 12;
    for (const idx of [a, b, c]) {
      view.setFloat32(o, positions[idx], true);
      view.setFloat32(o + 4, positions[idx + 1], true);
      view.setFloat32(o + 8, positions[idx + 2], true);
      o += 12;
    }
    view.setUint16(o, 0, true);
    o += 2;
  }
  return buf;
}

export function parseBinarySTL(buf: ArrayBuffer) {
  const view = new DataView(buf);
  const tris = view.getUint32(80, true);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let t = 0; t < tris; t++)
    for (let v = 0; v < 3; v++)
      for (let k = 0; k < 3; k++) {
        const x = view.getFloat32(84 + t * 50 + 12 + v * 12 + k * 4, true);
        min[k] = Math.min(min[k], x);
        max[k] = Math.max(max[k], x);
      }
  return { tris, min, max, valid: buf.byteLength === 84 + tris * 50 };
}
