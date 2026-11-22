import { useStore } from '../model/store';
import { TEMPLATES } from '../model/templates';
import { PALETTE, planDrop, type Hit, type PaletteKind } from './interactions';
import { getReport } from './useReport';

function Icon({ kind }: { kind: PaletteKind | 'template' }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (kind) {
    case 'post':
      return (
        <svg viewBox="0 0 32 32" {...common}>
          <rect x="13" y="4" width="6" height="22" rx="3" />
          <path d="M8 28h16" />
        </svg>
      );
    case 'beam':
      return (
        <svg viewBox="0 0 32 32" {...common}>
          <path d="M6 6v20M26 6v20" />
          <rect x="6" y="12" width="20" height="5" rx="2.5" />
        </svg>
      );
    case 'shelf':
      return (
        <svg viewBox="0 0 32 32" {...common}>
          <rect x="7" y="5" width="18" height="11" rx="1.5" />
          <path d="M16 16v3M3 21h26M6 21v7M26 21v7" />
        </svg>
      );
    case 'drawer':
      return (
        <svg viewBox="0 0 32 32" {...common}>
          <path d="M3 7h26" />
          <rect x="6" y="11" width="20" height="13" rx="1.5" />
          <path d="M13 17h6" />
        </svg>
      );
    case 'divider':
      return (
        <svg viewBox="0 0 32 32" {...common}>
          <path d="M6 4v24M26 4v24" />
          <rect x="9" y="9" width="14" height="14" rx="1" />
        </svg>
      );
    case 'watch':
      return (
        <svg viewBox="0 0 32 32" {...common}>
          <path d="M6 4v24" />
          <path d="M6 18h8" />
          <rect x="14" y="10" width="12" height="15" rx="4" />
          <circle cx="20" cy="17.5" r="3" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 32 32" {...common}>
          <rect x="5" y="5" width="22" height="22" rx="3" />
          <path d="M5 13h22M13 13v14" />
        </svg>
      );
  }
}

/** Click instead of drag: uses the current selection as the drop target. */
function clickAdd(kind: PaletteKind) {
  const st = useStore.getState();
  const d = st.design;
  const sel = st.selection;
  let hit: Hit | null = null;
  const post = sel?.type === 'post' ? d.posts.find((p) => p.id === sel.id) : undefined;
  const beam = sel?.type === 'beam' ? d.beams.find((b) => b.id === sel.id) : undefined;
  if (kind === 'post') {
    const maxX = d.posts.length ? Math.max(...d.posts.map((p) => p.x)) : -300;
    const y = d.posts.length ? Math.min(...d.posts.map((p) => p.y)) : 0;
    hit = { type: 'desk', point: [maxX + 300, y, 0] };
  } else if (post) {
    hit = { type: 'post', id: post.id, point: [post.x, post.y, post.height * 0.6] };
  } else if (beam) {
    const a = d.posts.find((p) => p.id === beam.a)!, b = d.posts.find((p) => p.id === beam.b)!;
    hit = { type: 'beam', id: beam.id, point: [(a.x + b.x) / 2, (a.y + b.y) / 2, beam.z] };
  } else {
    st.showToast(kind === 'beam' || kind === 'divider' || kind === 'watch' ? 'Select a post first, or drag it onto a post' : 'Select a beam first, or drag it onto a beam');
    return;
  }
  const res = planDrop(kind, hit, d, getReport(d).topo);
  if (res.action === 'none') st.showToast(res.message);
  else if (res.action === 'post') st.addPost(res.x, res.y, res.height);
  else if (res.action === 'beam') st.addBeam(res.a, res.b, res.z);
  else st.addAddOn(res.addon);
}

export function Palette() {
  const loadTemplate = useStore((s) => s.loadTemplate);
  const clear = useStore((s) => s.clear);
  return (
    <aside className="palette">
      <h3>Parts</h3>
      <p className="muted small">Drag into the scene, or select a post or beam and click.</p>
      <div className="palette-grid">
        {PALETTE.map((p) => (
          <button
            key={p.kind}
            className="palette-item"
            draggable
            data-testid={`palette-${p.kind}`}
            onDragStart={(e) => {
              e.dataTransfer.setData('application/x-part', p.kind);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            onClick={() => clickAdd(p.kind)}
            title={p.hint}
          >
            <Icon kind={p.kind} />
            <span>{p.name}</span>
          </button>
        ))}
      </div>
      <h3>Start from</h3>
      <div className="template-list">
        {TEMPLATES.map((t) => (
          <button key={t.id} className="template" data-testid={`template-${t.id}`} onClick={() => loadTemplate(t.id)}>
            <Icon kind="template" />
            <span>{t.name}</span>
          </button>
        ))}
        <button className="template ghost" onClick={clear}>
          <span>Empty desk</span>
        </button>
      </div>
    </aside>
  );
}
