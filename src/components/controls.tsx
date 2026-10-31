import { useId, useState, type ReactNode } from 'react';
import { ChevronIcon } from './Icons';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange(value: number): void;
  format?(value: number): string;
  disabled?: boolean;
}

export function SliderField({
  label,
  value,
  min,
  max,
  step = 0.01,
  onChange,
  format,
  disabled,
}: SliderProps) {
  const id = useId();
  const safe = Number.isFinite(value) ? value : min;
  const [draft, setDraft] = useState<string | null>(null);
  const precision = step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3;
  const raw = String(Number(safe.toFixed(precision)));

  const commit = (): void => {
    if (draft === null) return;
    const parsed = Number(draft.replace(',', '.').replace(/[^0-9eE+.-]/g, ''));
    setDraft(null);
    if (!Number.isFinite(parsed)) return;
    onChange(Math.max(min, Math.min(max, parsed)));
  };

  return (
    <div className="field">
      <label className="field-label" htmlFor={id} title={label}>
        {label}
      </label>
      <div className="field-control">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={safe}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        {/* The readout is also a numeric field, so every value can be typed. */}
        <input
          className="field-value"
          value={draft ?? (format ? format(safe) : safe.toFixed(2))}
          disabled={disabled}
          spellCheck={false}
          inputMode="decimal"
          aria-label={`${label} value`}
          onFocus={(e) => {
            const field = e.currentTarget;
            setDraft(raw);
            window.setTimeout(() => field.select(), 0);
          }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
              e.currentTarget.blur();
            } else if (e.key === 'Escape') {
              setDraft(null);
              e.currentTarget.blur();
            }
          }}
        />
      </div>
    </div>
  );
}

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange(value: boolean): void;
}

export function ToggleField({ label, checked, onChange }: ToggleProps) {
  const id = useId();
  return (
    <div className="field auto">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: 'var(--accent)', width: 13, height: 13 }}
      />
      <label className="field-label" htmlFor={id} style={{ flex: '1' }}>
        {label}
      </label>
    </div>
  );
}

interface SelectProps<T extends string> {
  label: string;
  value: T;
  options: { label: string; value: T }[];
  onChange(value: T): void;
}

export function SelectField<T extends string>({ label, value, options, onChange }: SelectProps<T>) {
  const id = useId();
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className="field-control">
        <select
          id={id}
          className="input"
          value={value}
          onChange={(e) => onChange(e.target.value as T)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

interface ColorProps {
  label: string;
  value: string;
  onChange(value: string): void;
}

export function ColorField({ label, value, onChange }: ColorProps) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="field-control">
        <span className="color-swatch" style={{ background: value }}>
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} />
        </span>
        <span className="field-value mono" style={{ fontSize: 10 }}>
          {value.toUpperCase()}
        </span>
      </div>
    </div>
  );
}

interface CollapsibleProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  actions?: ReactNode;
}

export function Collapsible({ title, children, defaultOpen = true, actions }: CollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="panel">
      <header className="panel-header" onClick={() => setOpen((v) => !v)}>
        <span className={`panel-chevron ${open ? 'open' : ''}`}>
          <ChevronIcon size={12} />
        </span>
        <span className="panel-title">{title}</span>
        {actions ? (
          <span
            className="row gap-2"
            onClick={(e) => e.stopPropagation()}
            role="presentation"
          >
            {actions}
          </span>
        ) : null}
      </header>
      {open ? <div className="panel-body">{children}</div> : null}
    </section>
  );
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return <div className="hint" style={{ padding: '10px 4px' }}>{children}</div>;
}
