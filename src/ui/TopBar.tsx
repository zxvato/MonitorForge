import { useRef } from 'react';
import { useStore } from '../model/store';
import { download, slug } from '../export/zip';
import type { Design } from '../model/types';

export function TopBar() {
  const tab = useStore((s) => s.tab);
  const set = useStore((s) => s.set);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const design = useStore((s) => s.design);
  const loadDesign = useStore((s) => s.loadDesign);
  const showToast = useStore((s) => s.showToast);
  const file = useRef<HTMLInputElement>(null);

  const save = () =>
    download(new Blob([JSON.stringify(design, null, 2)], { type: 'application/json' }), `${slug(design.name || 'desk')}.desk.json`);
  const open = async (f: File) => {
    try {
      const d = JSON.parse(await f.text()) as Design;
      if (!Array.isArray(d.posts) || !Array.isArray(d.beams)) throw new Error('bad file');
      loadDesign(d);
      showToast(`Opened ${f.name}`);
    } catch {
      showToast('That file is not a saved desk design');
    }
  };

  return (
    <header className="topbar">
      <div className="brand">
        <svg viewBox="0 0 32 32" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <path d="M6 28V8M26 28V8M6 12h20" />
          <rect x="9" y="4" width="14" height="6" rx="1.5" />
        </svg>
        <span>Rod Desk Planner</span>
      </div>
      <nav className="tabs">
        <button className={tab === 'design' ? 'on' : ''} onClick={() => set({ tab: 'design' })} data-testid="tab-design">
          Design
        </button>
        <button className={tab === 'parts' ? 'on' : ''} onClick={() => set({ tab: 'parts' })} data-testid="tab-parts">
          Parts &amp; export
        </button>
      </nav>
      <div className="actions">
        <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">Undo</button>
        <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">Redo</button>
        <span className="sep" />
        <button onClick={() => file.current?.click()}>Open</button>
        <button onClick={save}>Save</button>
        <input
          ref={file}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) open(f);
            e.target.value = '';
          }}
        />
        <span className="sep" />
        <button onClick={() => set({ settingsOpen: true })} data-testid="open-settings">Settings</button>
      </div>
    </header>
  );
}
