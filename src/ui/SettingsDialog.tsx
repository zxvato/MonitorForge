import { useStore } from '../model/store';
import { DEFAULT_SETTINGS } from '../model/types';
import { NumberField, Toggle } from './Fields';

export function SettingsDialog() {
  const open = useStore((s) => s.settingsOpen);
  const set = useStore((s) => s.set);
  const s = useStore((st) => st.design.settings);
  const update = useStore((st) => st.updateSettings);
  const change = useStore((st) => st.change);
  if (!open) return null;
  const u = (p: Partial<typeof s>, h: boolean) => change((d) => ({ ...d, settings: { ...d.settings, ...p } }), h);
  return (
    <div className="modal-backdrop" onClick={() => set({ settingsOpen: false })}>
      <div className="modal" onClick={(e) => e.stopPropagation()} data-testid="settings">
        <div className="modal-head">
          <h2>Settings</h2>
          <button onClick={() => set({ settingsOpen: false })}>Done</button>
        </div>
        <h4>Broom handles</h4>
        <div className="fields two">
          <NumberField label="Handle diameter" value={s.rodDiameter} step={0.1} min={10} max={50} onChange={(v, h) => u({ rodDiameter: v }, h)} hint="Measure your handle with calipers" />
          <NumberField label="Stock length" value={s.stockLength} step={10} min={200} onChange={(v, h) => u({ stockLength: v }, h)} hint="Length of one handle you buy" />
          <NumberField label="Saw kerf" value={s.kerf} step={0.5} min={0} max={5} onChange={(v, h) => u({ kerf: v }, h)} />
          <NumberField label="Lowest beam" value={s.minBeamHeight} step={5} min={50} onChange={(v, h) => u({ minBeamHeight: v }, h)} />
        </div>
        <h4>Fit</h4>
        <div className="fields two">
          <NumberField label="Socket clearance" value={s.socketClearance} step={0.05} min={0} max={2} onChange={(v, h) => u({ socketClearance: v }, h)} hint="Added to the hole diameter. Raise if handles don't go in, lower if loose." />
          <NumberField label="Clip grip" value={s.clipGrip} step={0.05} min={-1} max={2} onChange={(v, h) => u({ clipGrip: v }, h)} hint="How much smaller than the handle the snap clips are" />
          <NumberField label="Socket depth" value={s.socketDepth} step={1} min={15} max={80} onChange={(v, h) => u({ socketDepth: v }, h)} />
          <NumberField label="Wall thickness" value={s.wall} step={0.5} min={2} max={8} onChange={(v, h) => u({ wall: v }, h)} />
        </div>
        <Toggle label="Screw holes in feet" value={s.footScrews} onChange={(v) => update({ footScrews: v })} />
        <h4>Printer</h4>
        <div className="fields three">
          <NumberField label="Bed X" value={s.bed[0]} step={1} min={100} onChange={(v, h) => u({ bed: [v, s.bed[1], s.bed[2]] }, h)} />
          <NumberField label="Bed Y" value={s.bed[1]} step={1} min={100} onChange={(v, h) => u({ bed: [s.bed[0], v, s.bed[2]] }, h)} />
          <NumberField label="Bed Z" value={s.bed[2]} step={1} min={100} onChange={(v, h) => u({ bed: [s.bed[0], s.bed[1], v] }, h)} />
        </div>
        <div className="presets">
          {[
            ['Bambu X1 / P1', [256, 256, 256]],
            ['Prusa MK4', [250, 210, 220]],
            ['Ender 3', [220, 220, 250]],
            ['Bambu A1 mini', [180, 180, 180]],
          ].map(([n, b]) => (
            <button key={n as string} className="small" onClick={() => update({ bed: b as [number, number, number] })}>
              {n as string}
            </button>
          ))}
        </div>
        <h4>Look</h4>
        <label className="field">
          <span className="field-label">Filament colour</span>
          <input type="color" value={s.partColor} onChange={(e) => u({ partColor: e.target.value }, false)} />
        </label>
        <div className="btn-row" style={{ marginTop: 16 }}>
          <button className="small" onClick={() => update({ ...DEFAULT_SETTINGS })}>Reset to defaults</button>
        </div>
      </div>
    </div>
  );
}
