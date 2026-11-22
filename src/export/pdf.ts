import { jsPDF } from 'jspdf';
import { connectorName, canonicalize } from '../model/rotations';
import { beamLabel, postLabel, type Report } from './report';

const MARGIN = 15;

export function buildPDF(r: Report, snapshot?: string): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const s = r.design.settings;
  let y = MARGIN;

  const h1 = (t: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(t, MARGIN, y + 6);
    y += 12;
  };
  const h2 = (t: string) => {
    ensure(14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(t, MARGIN, y + 5);
    y += 9;
  };
  const p = (t: string, size = 10) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(t, W - 2 * MARGIN);
    ensure(lines.length * size * 0.42 + 2);
    doc.text(lines, MARGIN, y + 4);
    y += lines.length * size * 0.42 + 2;
  };
  const ensure = (h: number) => {
    if (y + h > H - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  };
  const table = (cols: { title: string; w: number; align?: 'right' }[], rows: string[][]) => {
    doc.setFontSize(9);
    const row = (cells: string[], bold: boolean) => {
      ensure(6);
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      let x = MARGIN;
      cells.forEach((c, i) => {
        const col = cols[i];
        const txt = doc.splitTextToSize(c, col.w - 2)[0] ?? '';
        doc.text(txt, col.align === 'right' ? x + col.w - 2 : x, y + 4, { align: col.align === 'right' ? 'right' : 'left' });
        x += col.w;
      });
      y += 5.5;
      doc.setDrawColor(220);
      doc.line(MARGIN, y - 1, MARGIN + cols.reduce((a, c) => a + c.w, 0), y - 1);
    };
    row(cols.map((c) => c.title), true);
    rows.forEach((rr) => row(rr, false));
    y += 3;
  };

  // --- Page 1: overview
  h1(r.design.name || 'Desk setup');
  p(`Generated ${new Date().toLocaleDateString()} · broom-handle Ø${s.rodDiameter} mm · socket clearance ${s.socketClearance} mm · bed ${s.bed.join('×')} mm`, 9);
  y += 2;
  if (snapshot) {
    const iw = W - 2 * MARGIN;
    const props = doc.getImageProperties(snapshot);
    const ih = Math.min(iw * (props.height / props.width), 150);
    try {
      doc.addImage(snapshot, snapshot.startsWith('data:image/png') ? 'PNG' : 'JPEG', MARGIN, y, ih * (props.width / props.height), ih);
      y += ih + 4;
    } catch {
      /* ignore bad image */
    }
  }
  h2('Overall size');
  p(`Width ${r.size.w + s.rodDiameter} mm × depth ${r.size.d + s.rodDiameter} mm × height ${r.size.h} mm (outside of handles).`);
  h2('Shopping list');
  const totalParts = r.parts.reduce((a, l) => a + l.qty, 0);
  const lines = [
    `${r.stock.bars.length} broom handle(s), Ø${s.rodDiameter} mm, at least ${s.stockLength} mm long (${(r.totalHandle / 1000).toFixed(2)} m of handle in total).`,
    `${totalParts} printed parts, roughly ${Math.round(r.grams)} g of filament.`,
  ];
  if (s.footScrews) lines.push(`${r.parts.filter((l) => l.spec.name === 'Foot').reduce((a, l) => a + l.qty * 3, 0)} × 4 mm countersunk wood screws (optional, to fix the feet).`);
  if (r.parts.some((l) => l.spec.note?.includes('pins'))) lines.push('A few cm of 1.75 mm filament as dowel pins, plus superglue, to join split tiles.');
  for (const l of lines) p('• ' + l);
  const errs = r.warnings.filter((w) => w.level === 'error');
  if (errs.length) {
    h2('Problems to fix first');
    for (const w of errs) p('• ' + w.message);
  }

  // --- Cut list
  doc.addPage();
  y = MARGIN;
  h1('Cut list');
  table(
    [{ title: 'Length (mm)', w: 35, align: 'right' }, { title: 'Qty', w: 20, align: 'right' }, { title: 'Used for', w: 40 }],
    r.cuts.map((c) => [String(c.length), String(c.qty), c.kind === 'post' ? 'posts' : c.kind === 'beam' ? 'beams' : 'posts + beams']),
  );
  h2(`Cutting plan (${s.stockLength} mm handles, ${s.kerf} mm saw kerf)`);
  const barW = W - 2 * MARGIN;
  r.stock.bars.forEach((b, i) => {
    ensure(12);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Handle ${i + 1}`, MARGIN, y + 3);
    y += 4;
    let x = MARGIN;
    for (const piece of b.pieces) {
      const w = (piece / s.stockLength) * barW;
      doc.setFillColor(222, 184, 135);
      doc.setDrawColor(120, 80, 40);
      doc.rect(x, y, w, 6, 'FD');
      if (w > 10) doc.text(String(piece), x + w / 2, y + 4.2, { align: 'center' });
      x += w + (s.kerf / s.stockLength) * barW;
    }
    doc.setDrawColor(180);
    doc.rect(MARGIN, y, barW, 6);
    y += 9;
  });

  // Per-post assembly
  h2('Frame assembly, post by post (bottom to top)');
  for (const post of r.design.posts) {
    const nodes = [...r.topo.nodes.values()].filter((n) => n.postId === post.id).sort((a, b) => a.pos[2] - b.pos[2]);
    const parts: string[] = [];
    nodes.forEach((n, i) => {
      parts.push(n.kind === 'foot' ? 'Foot' : `${connectorName(canonicalize(n.mask).mask)} @${n.pos[2]}`);
      const rod = r.topo.rods.find((rr) => rr.kind === 'post' && rr.a === n.id);
      if (rod && i < nodes.length - 1) parts.push(`[${Math.round(rod.cut)} mm]`);
    });
    p(`${postLabel(r.design, post.id)} at (${post.x}, ${post.y}): ${parts.join(' > ')}`, 9);
  }
  h2('Beams');
  for (const b of r.design.beams) {
    const rods = r.topo.rods.filter((rr) => rr.kind === 'beam' && rr.sourceId === b.id);
    if (!rods.length) continue;
    p(`${beamLabel(r.design, b.id)}: ${postLabel(r.design, b.a)} to ${postLabel(r.design, b.b)} at ${b.z} mm: pieces ${rods.map((rr) => Math.round(rr.cut) + ' mm').join(', ')}`, 9);
  }

  // --- Printed parts
  doc.addPage();
  y = MARGIN;
  h1('Printed parts');
  table(
    [
      { title: 'Part', w: 78 },
      { title: 'Qty', w: 12, align: 'right' },
      { title: 'Print size (mm)', w: 34 },
      { title: 'Fits', w: 12 },
      { title: 'Note', w: 44 },
    ],
    r.parts.map((l) => [l.spec.name, String(l.qty), l.size.map((v) => v.toFixed(0)).join('×'), l.fitsBed ? 'yes' : 'NO', l.spec.note ?? '']),
  );
  h2('Assembly order');
  [
    '1. Cut the handles to the lengths in the cut list. Label every piece with a pencil.',
    '2. Print all parts. PLA or PETG, 3–4 walls, 20–30% infill. Connectors print without supports in the saved orientation.',
    '3. Push the feet onto the bottom of every post, then build up each post with its connectors as listed post by post. A rubber mallet helps; add a drop of wood glue once you are happy with the fit.',
    '4. Fit the beams between the posts. Tilt the frame slightly to get the last beam in.',
    '5. Drawers: push both hangers up onto the front and back beams until they snap on, then slide the drawer box in from the front.',
    '6. Monitor shelves: lay them on top of the beams; the grooves underneath keep them in place.',
    '7. Dividers: snap the bottom clips onto the posts, drop in the panel, then snap the top clips on (slot facing down).',
    '8. Watch stand: snap it onto its post at the height you want, press in the charging puck and route the cable down the slot.',
  ].forEach((t) => p(t, 9.5));
  return doc;
}
