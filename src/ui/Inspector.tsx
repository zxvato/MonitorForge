import { useStore } from '../model/store';
import type { AddOn, Design, Warning } from '../model/types';
import { canonicalize, connectorName } from '../model/rotations';
import { beamGeometry } from '../model/topology';
import { beamLabel, postLabel, type Report } from '../export/report';
import { addOnParts, clearSpan, pairFrame } from '../geometry/parts';
import { printMesh } from '../geometry/cache';
import { NumberField, Stat, Toggle } from './Fields';
import { useReport } from './useReport';

export function Inspector() {
  const report = useReport();
  const sel = useStore((s) => s.selection);
  const design = report.design;
  let body: React.ReactNode = <Overview report={report} />;
  if (sel?.type === 'post' && design.posts.some((p) => p.id === sel.id)) body = <PostPanel id={sel.id} report={report} />;
  else if (sel?.type === 'beam' && design.beams.some((p) => p.id === sel.id)) body = <BeamPanel id={sel.id} report={report} />;
  else if (sel?.type === 'addon' && design.addons.some((p) => p.id === sel.id)) body = <AddOnPanel id={sel.id} report={report} />;
  return <aside className="inspector">{body}</aside>;
}

function Warnings({ list, title = 'Check these' }: { list: Warning[]; title?: string }) {
  const select = useStore((s) => s.select);
  const design = useStore((s) => s.design);
  if (!list.length) return null;
  const refType = (id?: string) =>
    !id ? null : design.posts.some((p) => p.id === id) ? 'post' : design.beams.some((b) => b.id === id) ? 'beam' : design.addons.some((a) => a.id === id) ? 'addon' : null;
  return (
    <div className="warnings">
      <h4>{title}</h4>
      {list.map((w, i) => {
        const t = refType(w.ref);
        return (
          <button key={i} className={`warning ${w.level}`} onClick={() => t && w.ref && select({ type: t as 'post', id: w.ref })} disabled={!t}>
            {w.message}
          </button>
        );
      })}
    </div>
  );
}

function Header({ kicker, title, onDelete }: { kicker: string; title: string; onDelete?: () => void }) {
  return (
    <div className="insp-header">
      <div>
        <div className="kicker">{kicker}</div>
        <h2>{title}</h2>
      </div>
      {onDelete && (
        <button className="danger small" onClick={onDelete} title="Delete (Del)">
          Delete
        </button>
      )}
    </div>
  );
}

function Overview({ report }: { report: Report }) {
  const change = useStore((s) => s.change);
  const set = useStore((s) => s.set);
  const d = report.design;
  const parts = report.parts.reduce((a, p) => a + p.qty, 0);
  const errors = report.warnings.filter((w) => w.level === 'error');
  return (
    <>
      <div className="insp-header">
        <div style={{ flex: 1 }}>
          <div className="kicker">Design</div>
          <input
            className="title-input"
            value={d.name}
            onChange={(e) => change((dd) => ({ ...dd, name: e.target.value }), false)}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </div>
      </div>
      <div className="stats">
        <Stat label="Footprint" value={`${Math.round(report.size.w + d.settings.rodDiameter)} × ${Math.round(report.size.d + d.settings.rodDiameter)} mm`} />
        <Stat label="Height" value={`${report.size.h} mm`} />
        <Stat label="Handles to buy" value={`${report.stock.bars.length} × ${d.settings.stockLength} mm`} />
        <Stat label="Handle pieces" value={report.topo.rods.length} />
        <Stat label="Printed parts" value={`${parts} (${report.parts.length} unique)`} />
        <Stat label="Filament (est.)" value={`≈ ${Math.round(report.grams)} g`} />
      </div>
      {errors.length === 0 ? (
        <div className="ok-banner">Everything fits together and every part fits your print bed.</div>
      ) : null}
      <Warnings list={report.warnings} />
      <div className="tips">
        <h4>How it works</h4>
        <ul>
          <li><b>Posts</b> stand on printed feet. <b>Beams</b> run between posts that line up along X or Y.</li>
          <li>Connectors are picked for you (elbow, tee, corner, cross…) from how the handles meet.</li>
          <li>Shelves sit on two parallel beams, drawers hang under them, dividers and watch stands clip onto posts.</li>
          <li>When you're done, open <a href="#" onClick={(e) => { e.preventDefault(); set({ tab: 'parts' }); }}>Parts &amp; export</a>.</li>
        </ul>
      </div>
    </>
  );
}

function PostPanel({ id, report }: { id: string; report: Report }) {
  const design = report.design;
  const p = design.posts.find((x) => x.id === id)!;
  const update = useStore((s) => s.updatePost);
  const addBeam = useStore((s) => s.addBeam);
  const remove = useStore((s) => s.removeSelected);
  const aligned = design.posts.filter((q) => q.id !== id && beamGeometry(p, q));
  const nodes = [...report.topo.nodes.values()].filter((n) => n.postId === id).sort((a, b) => a.pos[2] - b.pos[2]);
  const rods = report.topo.rods.filter((r) => r.kind === 'post' && r.sourceId === id);
  return (
    <>
      <Header kicker="Post" title={postLabel(design, id)} onDelete={remove} />
      <div className="fields">
        <NumberField label="X" value={p.x} step={design.settings.gridSnap} onChange={(v, h) => update(id, { x: v }, h)} />
        <NumberField label="Y (depth)" value={p.y} step={design.settings.gridSnap} onChange={(v, h) => update(id, { y: v }, h)} />
        <NumberField label="Height" value={p.height} step={design.settings.gridSnap} min={60} onChange={(v, h) => update(id, { height: v }, h)} />
      </div>
      <h4>Built from (top → bottom)</h4>
      <ol className="stack">
        {nodes.map((n, i) => (
          <li key={n.id}>
            <span><span className="chip part">{n.kind === 'foot' ? 'Foot' : connectorName(canonicalize(n.mask).mask)}</span></span>
            <span className="muted">@ {n.pos[2]}</span>
            {i < nodes.length - 1 && rods[i] && <div className="chip wood">handle {Math.round(rods[i].cut)} mm</div>}
          </li>
        ))}
      </ol>
      {aligned.length > 0 && (
        <>
          <h4>Connect a beam</h4>
          <div className="btn-list">
            {aligned.map((q) => {
              const z = Math.min(p.height, q.height);
              return (
                <button key={q.id} onClick={() => addBeam(id, q.id, z)}>
                  → {postLabel(design, q.id)} at {z} mm
                </button>
              );
            })}
          </div>
        </>
      )}
      <Warnings list={report.warnings.filter((w) => w.ref === id)} />
    </>
  );
}

function BeamPanel({ id, report }: { id: string; report: Report }) {
  const design = report.design;
  const b = design.beams.find((x) => x.id === id)!;
  const update = useStore((s) => s.updateBeam);
  const remove = useStore((s) => s.removeSelected);
  const rods = report.topo.rods.filter((r) => r.kind === 'beam' && r.sourceId === id);
  const pa = design.posts.find((p) => p.id === b.a), pb = design.posts.find((p) => p.id === b.b);
  return (
    <>
      <Header kicker="Beam" title={`${beamLabel(design, id)}  ${postLabel(design, b.a)} → ${postLabel(design, b.b)}`} onDelete={remove} />
      <div className="fields">
        <NumberField
          label="Height"
          value={b.z}
          step={design.settings.gridSnap}
          min={design.settings.minBeamHeight}
          max={Math.min(pa?.height ?? 9999, pb?.height ?? 9999)}
          onChange={(v, h) => update(id, { z: v }, h)}
        />
      </div>
      <div className="stats">
        {pa && pb && <Stat label="Centre to centre" value={`${Math.round(Math.hypot(pb.x - pa.x, pb.y - pa.y))} mm`} />}
        <Stat label="Pieces to cut" value={rods.length ? rods.map((r) => `${Math.round(r.cut)}`).join(' + ') + ' mm' : '—'} />
      </div>
      <p className="muted small">Drag the beam in the 3D view to move it up or down. If it passes another post, it is split there with a tee.</p>
      <Warnings list={report.warnings.filter((w) => w.ref === id)} />
    </>
  );
}

const KIND_NAME: Record<AddOn['kind'], string> = { shelf: 'Monitor shelf', drawer: 'Drawer', divider: 'Divider', watch: 'Apple Watch stand' };

function AddOnPanel({ id, report }: { id: string; report: Report }) {
  const design = report.design;
  const a = design.addons.find((x) => x.id === id)!;
  const update = useStore((s) => s.updateAddOn);
  const remove = useStore((s) => s.removeSelected);
  const duplicate = useStore((s) => s.duplicateSelected);
  const u = (p: Partial<AddOn>, h: boolean) => update(id, p, h);
  const res = addOnParts(a, design, report.topo);
  const lines = new Map<string, { name: string; qty: number; size: string; fits: boolean }>();
  for (const i of res.instances) {
    const l = lines.get(i.spec.key);
    if (l) l.qty++;
    else {
      const pm = printMesh(i.spec, design.settings);
      lines.set(i.spec.key, { name: i.spec.name, qty: 1, size: pm.size.map((v) => v.toFixed(0)).join('×'), fits: pm.fitsBed });
    }
  }
  return (
    <>
      <Header kicker="Add-on" title={KIND_NAME[a.kind]} onDelete={remove} />
      <div className="fields">{fieldsFor(a, design, report, u)}</div>
      <div className="btn-row">
        <button onClick={duplicate}>Duplicate</button>
      </div>
      <h4>Prints as</h4>
      <ul className="part-lines">
        {[...lines.values()].map((l) => (
          <li key={l.name}>
            <span>{l.qty}× {l.name}</span>
            <span className={l.fits ? 'muted' : 'bad'}>{l.size} mm</span>
          </li>
        ))}
      </ul>
      <Warnings list={report.warnings.filter((w) => w.ref === id)} />
    </>
  );
}

function fieldsFor(a: AddOn, design: Design, report: Report, u: (p: Partial<AddOn>, h: boolean) => void) {
  const g = design.settings.gridSnap;
  switch (a.kind) {
    case 'shelf': {
      const pf = pairFrame(report.topo, a.beams);
      const fill = () => {
        if (!pf.ok) return;
        const [lo, hi] = clearSpan(pf, a.center, design.settings);
        u({ center: Math.round((lo + hi) / 2), width: Math.floor(hi - lo) }, true);
      };
      return (
        <>
          <NumberField label="Width" value={a.width} step={g} min={60} onChange={(v, h) => u({ width: v }, h)} />
          <NumberField label="Position" value={a.center} step={g} onChange={(v, h) => u({ center: v }, h)} hint="Centre along the beams" />
          <NumberField label="Overhang" value={a.overhang} step={1} min={5} max={120} onChange={(v, h) => u({ overhang: v }, h)} hint="How far the shelf reaches past the front and back beams" />
          <NumberField label="Thickness" value={a.thickness} step={0.5} min={5} max={20} onChange={(v, h) => u({ thickness: v }, h)} />
          <Toggle label="Cable notch at the back" value={a.cableNotch} onChange={(v) => u({ cableNotch: v }, true)} />
          {pf.ok && <Stat label="Depth" value={`${Math.round(pf.S + 2 * a.overhang)} mm`} />}
          <button className="small" onClick={fill}>Fill the gap between connectors</button>
        </>
      );
    }
    case 'drawer':
      return (
        <>
          <NumberField label="Width" value={a.width} step={5} min={60} onChange={(v, h) => u({ width: v }, h)} />
          <NumberField label="Height" value={a.height} step={5} min={25} onChange={(v, h) => u({ height: v }, h)} />
          <NumberField label="Position" value={a.center} step={g} onChange={(v, h) => u({ center: v }, h)} />
          <p className="muted small">Depth follows the gap between the beams. Two hangers snap up onto the beams; the box slides in from the front.</p>
        </>
      );
    case 'divider':
      return (
        <>
          <NumberField label="Bottom" value={a.z0} step={g / 2} min={0} onChange={(v, h) => u({ z0: v }, h)} />
          <NumberField label="Top" value={a.z1} step={g / 2} onChange={(v, h) => u({ z1: v }, h)} />
          <NumberField label="Panel thickness" value={a.thickness} step={0.5} min={3} max={10} onChange={(v, h) => u({ thickness: v }, h)} />
          <p className="muted small">Bottom clips snap on first, the panel drops in, then the top clips go on upside down.</p>
        </>
      );
    case 'watch':
      return (
        <>
          <NumberField label="Height" value={a.z} step={g / 2} min={0} onChange={(v, h) => u({ z: v }, h)} />
          <NumberField label="Facing" value={a.angle} unit="°" step={15} onChange={(v, h) => u({ angle: v }, h)} hint="-90 faces the front of the desk" />
          <NumberField label="Arm length" value={a.armLength} step={5} min={10} max={120} onChange={(v, h) => u({ armLength: v }, h)} />
          <NumberField label="Lean back" value={a.tilt} unit="°" step={1} min={0} max={40} onChange={(v, h) => u({ tilt: v }, h)} />
          <NumberField label="Puck diameter" value={a.puckDiameter} step={0.1} min={20} max={40} onChange={(v, h) => u({ puckDiameter: v }, h)} hint="Apple magnetic charger is about 27.5 mm" />
          <NumberField label="Puck depth" value={a.puckDepth} step={0.5} min={3} max={12} onChange={(v, h) => u({ puckDepth: v }, h)} />
        </>
      );
  }
}
