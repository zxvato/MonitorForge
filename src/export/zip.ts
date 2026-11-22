import JSZip from 'jszip';
import { printMesh } from '../geometry/cache';
import { toBinarySTL } from './stl';
import { cutListCSV } from './bom';
import { buildPDF } from './pdf';
import type { Report } from './report';

export const slug = (s: string) =>
  s.toLowerCase().replace(/×/g, 'x').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export async function buildZip(r: Report, snapshot?: string): Promise<Blob> {
  const zip = new JSZip();
  const s = r.design.settings;
  const used = new Set<string>();
  for (const l of r.parts) {
    const pm = printMesh(l.spec, s);
    let name = `${slug(l.spec.group)}/${slug(l.spec.name)}_x${l.qty}.stl`;
    for (let k = 2; used.has(name); k++) name = `${slug(l.spec.group)}/${slug(l.spec.name)}-${k}_x${l.qty}.stl`;
    used.add(name);
    zip.file(`parts/${name}`, toBinarySTL(pm.positions, pm.indices, l.spec.name));
  }
  zip.file('cut-list.csv', cutListCSV(r.topo.rods));
  zip.file('design.json', JSON.stringify(r.design, null, 2));
  zip.file('assembly.pdf', buildPDF(r, snapshot).output('arraybuffer'));
  const readme = [
    `${r.design.name}`,
    '',
    `Broom handle diameter: ${s.rodDiameter} mm (socket clearance ${s.socketClearance} mm)`,
    `Handles to buy: ${r.stock.bars.length} × ${s.stockLength} mm`,
    `Printed parts: ${r.parts.reduce((a, l) => a + l.qty, 0)} (${r.parts.length} unique files — print each file the number of times in its name, _xN)`,
    '',
    'parts/        STL files, already in print orientation',
    'cut-list.csv  handle lengths to saw',
    'assembly.pdf  overview, cutting plan and assembly steps',
    'design.json   load this back into the planner (Open)',
    '',
    'Tip: print one Elbow first and check the fit on your handle. Too tight? Raise',
    '"socket clearance" in Settings and export again.',
  ].join('\n');
  zip.file('README.txt', readme);
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
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
