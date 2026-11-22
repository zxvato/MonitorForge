import { useEffect } from 'react';
import { useStore } from './model/store';
import { Inspector } from './ui/Inspector';
import { Palette } from './ui/Palette';
import { PartsView } from './ui/PartsView';
import { SettingsDialog } from './ui/SettingsDialog';
import { TopBar } from './ui/TopBar';
import { Viewport } from './ui/Viewport';

export function App() {
  const tab = useStore((s) => s.tab);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
      const st = useStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        st.redo();
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        st.duplicateSelected();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        st.removeSelected();
      } else if (e.key === 'Escape') {
        st.select(null);
        st.set({ settingsOpen: false });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app">
      <TopBar />
      <div className="main">
        <Palette />
        <div className="stage">
          <Viewport />
          {tab === 'parts' && <PartsView />}
        </div>
        {tab === 'design' && <Inspector />}
      </div>
      <SettingsDialog />
    </div>
  );
}
