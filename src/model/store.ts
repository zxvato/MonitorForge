import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { dualBridge, TEMPLATES, emptyDesign } from './templates';
import { DEFAULT_SETTINGS, uid, type AddOn, type Beam, type Design, type Post, type Selection, type Settings } from './types';

export type ViewMode = 'persp' | 'top' | 'front';
export type Tab = 'design' | 'parts';

interface State {
  design: Design;
  past: Design[];
  future: Design[];
  selection: Selection;
  showDims: boolean;
  view: ViewMode;
  tab: Tab;
  settingsOpen: boolean;
  /** Set while dragging so the camera stays still. */
  dragging: boolean;
  /** Incremented to ask the viewport to frame the whole design. */
  fitToken: number;
  toast: string | null;
  showToast: (msg: string) => void;

  /** Change the design. `history: false` skips the undo stack (used during drags). */
  change: (fn: (d: Design) => Design, history?: boolean) => void;
  /** Snapshot the current design onto the undo stack (call at drag start). */
  checkpoint: () => void;
  undo: () => void;
  redo: () => void;
  select: (s: Selection) => void;
  set: (p: Partial<Pick<State, 'showDims' | 'view' | 'tab' | 'settingsOpen' | 'dragging'>>) => void;

  addPost: (x: number, y: number, height?: number) => string;
  addBeam: (a: string, b: string, z: number) => string | null;
  addAddOn: (a: AddOn) => void;
  updatePost: (id: string, p: Partial<Post>, history?: boolean) => void;
  updateBeam: (id: string, p: Partial<Beam>, history?: boolean) => void;
  updateAddOn: (id: string, p: Partial<AddOn>, history?: boolean) => void;
  updateSettings: (p: Partial<Settings>) => void;
  removeSelected: () => void;
  duplicateSelected: () => void;
  loadTemplate: (id: string) => void;
  loadDesign: (d: Design) => void;
  clear: () => void;
}

const HISTORY = 100;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      design: dualBridge(),
      past: [],
      future: [],
      selection: null,
      showDims: true,
      view: 'persp',
      tab: 'design',
      settingsOpen: false,
      dragging: false,
      fitToken: 0,
      toast: null,
      showToast: (msg) => {
        set({ toast: msg });
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => set({ toast: null }), 3500);
      },

      change: (fn, history = true) =>
        set((st) => {
          const next = fn(st.design);
          if (next === st.design) return {};
          return history
            ? { design: next, past: [...st.past, st.design].slice(-HISTORY), future: [] }
            : { design: next };
        }),
      checkpoint: () => set((st) => ({ past: [...st.past, st.design].slice(-HISTORY), future: [] })),
      undo: () =>
        set((st) => {
          if (!st.past.length) return {};
          const prev = st.past[st.past.length - 1];
          return { design: prev, past: st.past.slice(0, -1), future: [st.design, ...st.future] };
        }),
      redo: () =>
        set((st) => {
          if (!st.future.length) return {};
          return { design: st.future[0], future: st.future.slice(1), past: [...st.past, st.design] };
        }),
      select: (selection) => set({ selection }),
      set: (p) => set(p),

      addPost: (x, y, height = 300) => {
        const p: Post = { id: uid('post'), x, y, height };
        get().change((d) => ({ ...d, posts: [...d.posts, p] }));
        set({ selection: { type: 'post', id: p.id } });
        return p.id;
      },
      addBeam: (a, b, z) => {
        const d = get().design;
        if (d.beams.some((x) => ((x.a === a && x.b === b) || (x.a === b && x.b === a)) && Math.abs(x.z - z) < 1)) return null;
        const beam: Beam = { id: uid('beam'), a, b, z };
        get().change((dd) => ({ ...dd, beams: [...dd.beams, beam] }));
        set({ selection: { type: 'beam', id: beam.id } });
        return beam.id;
      },
      addAddOn: (a) => {
        get().change((d) => ({ ...d, addons: [...d.addons, a] }));
        set({ selection: { type: 'addon', id: a.id } });
      },
      updatePost: (id, p, history = true) =>
        get().change((d) => ({ ...d, posts: d.posts.map((x) => (x.id === id ? { ...x, ...p } : x)) }), history),
      updateBeam: (id, p, history = true) =>
        get().change((d) => ({ ...d, beams: d.beams.map((x) => (x.id === id ? { ...x, ...p } : x)) }), history),
      updateAddOn: (id, p, history = true) =>
        get().change((d) => ({ ...d, addons: d.addons.map((x) => (x.id === id ? ({ ...x, ...p } as AddOn) : x)) }), history),
      updateSettings: (p) => get().change((d) => ({ ...d, settings: { ...d.settings, ...p } })),

      removeSelected: () => {
        const sel = get().selection;
        if (!sel) return;
        get().change((d) => {
          if (sel.type === 'post') {
            const beams = d.beams.filter((b) => b.a !== sel.id && b.b !== sel.id);
            const beamIds = new Set(beams.map((b) => b.id));
            return {
              ...d,
              posts: d.posts.filter((p) => p.id !== sel.id),
              beams,
              addons: d.addons.filter((a) => {
                if (a.kind === 'shelf' || a.kind === 'drawer') return a.beams.every((b) => beamIds.has(b));
                if (a.kind === 'divider') return !a.posts.includes(sel.id);
                return a.post !== sel.id;
              }),
            };
          }
          if (sel.type === 'beam')
            return {
              ...d,
              beams: d.beams.filter((b) => b.id !== sel.id),
              addons: d.addons.filter((a) => !((a.kind === 'shelf' || a.kind === 'drawer') && a.beams.includes(sel.id))),
            };
          if (sel.type === 'addon') return { ...d, addons: d.addons.filter((a) => a.id !== sel.id) };
          return d;
        });
        set({ selection: null });
      },
      duplicateSelected: () => {
        const sel = get().selection;
        const d = get().design;
        if (sel?.type === 'post') {
          const p = d.posts.find((x) => x.id === sel.id);
          if (p) get().addPost(p.x + 200, p.y, p.height);
        } else if (sel?.type === 'addon') {
          const a = d.addons.find((x) => x.id === sel.id);
          if (!a) return;
          const copy = { ...a, id: uid(a.kind) } as AddOn;
          if (copy.kind === 'shelf' || copy.kind === 'drawer') copy.center += copy.width + 60;
          if (copy.kind === 'watch') copy.angle += 90;
          get().addAddOn(copy);
        }
      },
      loadTemplate: (id) => {
        const t = TEMPLATES.find((x) => x.id === id);
        if (!t) return;
        get().change((d) => t.make(d.settings));
        set((st) => ({ selection: null, fitToken: st.fitToken + 1 }));
      },
      loadDesign: (d) => {
        get().change(() => ({ ...emptyDesign(), ...d, settings: { ...DEFAULT_SETTINGS, ...d.settings } }));
        set((st) => ({ selection: null, fitToken: st.fitToken + 1 }));
      },
      clear: () => {
        get().change((d) => emptyDesign(d.settings));
        set({ selection: null });
      },
    }),
    {
      name: 'rod-desk-planner',
      version: 1,
      partialize: (st) => ({ design: st.design, showDims: st.showDims }),
    },
  ),
);
