import { useEffect, useRef, useState } from 'react';
import { useStore } from '../model/store';

/**
 * Numeric input. The first change after focusing records an undo step; the
 * following keystrokes update live without flooding the history.
 */
export function NumberField({
  label,
  value,
  onChange,
  unit = 'mm',
  step = 1,
  min,
  max,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number, history: boolean) => void;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  hint?: string;
}) {
  const [text, setText] = useState(String(value));
  const focused = useRef(false);
  const recorded = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(String(Math.round(value * 100) / 100));
  }, [value]);
  const commit = (raw: string) => {
    const v = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(v)) return;
    const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
    onChange(clamped, !recorded.current);
    recorded.current = true;
  };
  return (
    <label className="field" title={hint}>
      <span className="field-label">{label}</span>
      <span className="field-input">
        <input
          type="number"
          value={text}
          step={step}
          min={min}
          max={max}
          onFocus={() => {
            focused.current = true;
            recorded.current = false;
          }}
          onBlur={() => {
            focused.current = false;
            setText(String(Math.round(value * 100) / 100));
          }}
          onChange={(e) => {
            setText(e.target.value);
            commit(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            e.stopPropagation();
          }}
        />
        {unit && <span className="unit">{unit}</span>}
      </span>
    </label>
  );
}

export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="field toggle">
      <span className="field-label">{label}</span>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

/** Helper: wraps the store's checkpoint semantics for multi-field updates. */
export function useCommit() {
  const checkpoint = useStore((s) => s.checkpoint);
  return (history: boolean, fn: () => void) => {
    if (history) checkpoint();
    fn();
  };
}
