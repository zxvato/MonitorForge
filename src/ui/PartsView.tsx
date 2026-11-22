import { Canvas } from '@react-three/fiber';
import { Grid, OrbitControls } from '@react-three/drei';
import { useMemo, useState } from 'react';
import { useStore } from '../model/store';
import type { PartLine } from '../export/bom';
import { printMesh } from '../geometry/cache';
import { toBinarySTL } from '../export/stl';
import { cutListCSV } from '../export/bom';
import { buildPDF } from '../export/pdf';
import { buildZip, download, slug } from '../export/zip';
import type { Report } from '../export/report';
import { GRAMS_PER_MM3 } from '../export/report';
import { mixColor, threeGeometry } from './three-helpers';
import { thumbnail } from './thumbs';
import { useReport } from './useReport';
import { sceneApi } from './Viewport';

export function PartsView() {
  const report = useReport();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<PartLine | null>(null);
  const s = report.design.settings;
  const errors = report.warnings.filter((w) => w.level === 'error');
  const groups = useMemo(() => {
    const m = new Map<string, Report['parts']>();
    for (const p of report.parts) m.set(p.spec.group, [...(m.get(p.spec.group) ?? []), p]);
    return [...m.entries()];
  }, [report]);
  const fileBase = slug(report.design.name || 'desk') || 'desk';

  const exportZip = () => {
    setBusy(true);
    // let the button repaint before the (synchronous) packing starts
    setTimeout(() => {
      try {
        download(buildZip(report, sceneApi.snapshot?.()), `${fileBase}-parts.zip`);
      } finally {
        setBusy(false);
      }
    }, 30);
  };
  const exportPdf = () => download(buildPDF(report, sceneApi.snapshot?.()).output('blob'), `${fileBase}-assembly.pdf`);
  const exportCsv = () => download(new Blob([cutListCSV(report.topo.rods)], { type: 'text/csv' }), `${fileBase}-cut-list.csv`);

  return (
    <div className="parts-view" data-testid="parts-view">
      <div className="parts-head">
        <div>
          <h2>{report.design.name}</h2>
          <p className="muted">
            {report.parts.reduce((a, p) => a + p.qty, 0)} printed parts ({report.parts.length} files) · ≈ {Math.round(report.grams)} g filament ·{' '}
            {report.stock.bars.length} broom handle{report.stock.bars.length === 1 ? '' : 's'} of {s.stockLength} mm
          </p>
        </div>
        <div className="btn-row">
          <button className="primary" onClick={exportZip} disabled={busy} data-testid="export-zip">
            {busy ? 'Packing…' : 'Download all parts (.zip)'}
          </button>
          <button onClick={exportPdf} data-testid="export-pdf">Assembly PDF</button>
          <button onClick={exportCsv}>Cut list CSV</button>
        </div>
      </div>
      {errors.length > 0 && (
        <div className="error-banner">
          <b>{errors.length} problem{errors.length > 1 ? 's' : ''} to fix before printing:</b>
          <ul>{errors.map((e, i) => <li key={i}>{e.message}</li>)}</ul>
        </div>
      )}

      <section>
        <h3>Broom handles</h3>
        <div className="handles">
          <table className="cut-table">
            <thead>
              <tr><th>Cut length</th><th>Qty</th><th>For</th></tr>
            </thead>
            <tbody>
              {report.cuts.map((c) => (
                <tr key={c.length}><td>{c.length} mm</td><td>{c.qty}</td><td className="muted">{c.kind === 'mixed' ? 'posts + beams' : c.kind + 's'}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="stock">
            <div className="muted small">Cutting plan · {s.stockLength} mm handles · {s.kerf} mm saw kerf</div>
            {report.stock.bars.map((b, i) => (
              <div key={i} className="bar" title={`${b.waste} mm left over`}>
                {b.pieces.map((p, k) => (
                  <div key={k} className="piece" style={{ width: `${(p / s.stockLength) * 100}%` }}>
                    {p / s.stockLength > 0.06 ? p : ''}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {groups.map(([group, lines]) => (
        <section key={group}>
          <h3>{group}</h3>
          <div className="cards">
            {lines.map((l) => (
              <PartCard key={l.spec.key} line={l} report={report} onOpen={() => setPreview(l)} />
            ))}
          </div>
        </section>
      ))}
      {preview && <PartPreview line={preview} report={report} onClose={() => setPreview(null)} />}
    </div>
  );
}

function PartCard({ line, report, onOpen }: { line: Report['parts'][number]; report: Report; onOpen: () => void }) {
  const s = report.design.settings;
  const color = line.spec.group === 'Connectors' ? s.partColor : mixColor(s.partColor, '#ffffff', 0.45);
  const img = useMemo(() => thumbnail(line.spec, s, color), [line.spec, s, color]);
  const stl = () => {
    const pm = printMesh(line.spec, s);
    download(new Blob([toBinarySTL(pm.positions, pm.indices, line.spec.name)], { type: 'model/stl' }), `${slug(line.spec.name)}_x${line.qty}.stl`);
  };
  return (
    <div className={`card ${line.fitsBed ? '' : 'bad'}`}>
      <button className="thumb" onClick={onOpen} title="Open 3D preview">
        <img src={img} alt={line.spec.name} />
        <span className="qty">×{line.qty}</span>
      </button>
      <div className="card-body">
        <b>{line.spec.name}</b>
        <div className="muted small">
          {line.size.map((v) => v.toFixed(0)).join(' × ')} mm · ≈ {Math.round(line.volume * GRAMS_PER_MM3)} g each
        </div>
        {!line.fitsBed && <div className="bad small">Too big for the bed</div>}
        {line.spec.note && <div className="note small">{line.spec.note}</div>}
      </div>
      <button className="small" onClick={stl}>STL</button>
    </div>
  );
}

function PartPreview({ line, report, onClose }: { line: PartLine; report: Report; onClose: () => void }) {
  const s = report.design.settings;
  const pm = printMesh(line.spec, s);
  const geom = threeGeometry(`print|${line.spec.key}`, pm);
  const [bx, by] = s.bed;
  const r = Math.max(...pm.size, 60);
  const color = useStore((st) => st.design.settings.partColor);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="kicker">On the print bed · {bx}×{by} mm</div>
            <h2>{line.spec.name}</h2>
          </div>
          <button onClick={onClose}>Close</button>
        </div>
        <div className="preview-canvas">
          <Canvas camera={{ position: [r * 1.4, r * 1.2, r * 1.8], fov: 35, near: 1, far: r * 50 }}>
            <color attach="background" args={['#f4f5f7']} />
            <hemisphereLight args={['#ffffff', '#999999', 1.2]} />
            <directionalLight position={[r, r * 2, r]} intensity={1.8} />
            <mesh geometry={geom} rotation-x={-Math.PI / 2}>
              <meshStandardMaterial color={line.spec.group === 'Connectors' ? color : mixColor(color, '#ffffff', 0.45)} roughness={0.55} />
            </mesh>
            <mesh rotation-x={-Math.PI / 2} position={[0, -0.3, 0]}>
              <planeGeometry args={[bx, by]} />
              <meshStandardMaterial color="#2b2f36" />
            </mesh>
            <Grid args={[bx, by]} position={[0, 0.01, 0]} cellSize={10} sectionSize={50} cellColor="#4a505a" sectionColor="#6b7380" />
            <OrbitControls makeDefault target={[0, pm.size[2] / 3, 0]} />
          </Canvas>
        </div>
        <p className="muted small">
          {pm.size.map((v) => v.toFixed(1)).join(' × ')} mm · print {line.qty}× · {line.spec.note ?? 'No supports needed'}
        </p>
      </div>
    </div>
  );
}
