import { strToU8, zipSync, type Zippable } from 'fflate';
import { printMesh } from '../geometry/cache';
import { toBinarySTL } from './stl';
import { cutListCSV } from './bom';
import { buildPDF } from './pdf';
import type { Report } from './report';
import { fitTestSpec } from '../geometry/fittest';

export const slug = (s: string) =>
  s.toLowerCase().replace(/×/g, 'x').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function buildZip(r: Report, snapshot?: string): Blob {
  const files: Zippable = {};
  const s = r.design.settings;
  const used = new Set<string>();
  for (const l of r.parts) {
    const pm = printMesh(l.spec, s);
    let name = `${slug(l.spec.group)}/${slug(l.spec.name)}_x${l.qty}.stl`;
    for (let k = 2; used.has(name); k++) name = `${slug(l.spec.group)}/${slug(l.spec.name)}-${k}_x${l.qty}.stl`;
    used.add(name);
    files[`parts/${name}`] = new Uint8Array(toBinarySTL(pm.positions, pm.indices, l.spec.name));
  }
  const ft = printMesh(fitTestSpec(s), s);
  files['fit-test.stl'] = new Uint8Array(toBinarySTL(ft.positions, ft.indices, 'fit test'));
  files['cut-list.csv'] = strToU8(cutListCSV(r.topo.rods));
  files['design.json'] = strToU8(JSON.stringify(r.design, null, 2));
  files['assembly.pdf'] = [new Uint8Array(buildPDF(r, snapshot).output('arraybuffer')), { level: 0 }];
  const readme = [
    `${r.design.name}`,
    '',
    `Broom handle diameter: ${s.rodDiameter} mm (socket clearance ${s.socketClearance} mm)`,
    `Handles to buy: ${r.stock.bars.length} × ${s.stockLength} mm`,
    `Printed parts: ${r.parts.reduce((a, l) => a + l.qty, 0)} (${r.parts.length} unique files — print each file the number of times in its name, _xN)`,
    '',
    'fit-test.stl  print this first: 5 short sockets with different clearances',
    'parts/        STL files, already in print orientation',
    'cut-list.csv  handle lengths to saw',
    'assembly.pdf  overview, cutting plan and assembly steps',
    'design.json   load this back into the planner (Open)',
    '',
    'Tip: print one connector first and check the fit on your handle. Too tight? Raise',
    '"socket clearance" in Settings and export again.',
  ].join('\n');
  files['README.txt'] = strToU8(readme);
  const data = zipSync(files, { level: 6 });
  return new Blob([data], { type: 'application/zip' });
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
