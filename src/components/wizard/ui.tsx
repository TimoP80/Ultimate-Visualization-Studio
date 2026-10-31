import type { ReactNode } from 'react';
import type { Palette } from '@/types';
import { LockIcon } from '../Icons';

export function StepHeading({
  title,
  blurb,
  actions,
}: {
  title: string;
  blurb: string;
  actions?: ReactNode;
}) {
  return (
    <div className="wiz-step-heading">
      <div className="col" style={{ gap: 3 }}>
        <h2>{title}</h2>
        <p>{blurb}</p>
      </div>
      {actions ? <div className="row gap-2">{actions}</div> : null}
    </div>
  );
}

export function SelectCard({
  selected,
  onSelect,
  children,
  className = '',
  disabled = false,
  title,
}: {
  selected: boolean;
  onSelect(): void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      className={`wiz-card ${selected ? 'selected' : ''} ${className}`}
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      title={title}
    >
      {children}
    </button>
  );
}

export function StepNotice({
  kind = 'info',
  children,
}: {
  kind?: 'info' | 'warn' | 'error' | 'ok';
  children: ReactNode;
}) {
  return <div className={`wiz-notice ${kind}`}>{children}</div>;
}

export function LockButton({
  locked,
  onToggle,
  label,
}: {
  locked: boolean;
  onToggle(): void;
  label: string;
}) {
  return (
    <button
      type="button"
      className={`wiz-lock ${locked ? 'locked' : ''}`}
      onClick={onToggle}
      aria-pressed={locked}
      title={locked ? `${label} is locked — randomise leaves it alone` : `Lock ${label.toLowerCase()} when randomising`}
    >
      <LockIcon size={11} locked={locked} />
      {locked ? 'Locked' : 'Lock'}
    </button>
  );
}

export function PaletteStrip({ palette, className = '' }: { palette: Palette; className?: string }) {
  return (
    <span className={`wiz-palette-strip ${className}`} aria-hidden="true">
      <i style={{ background: palette.a }} />
      <i style={{ background: palette.b }} />
      <i style={{ background: palette.c }} />
      <i style={{ background: palette.d }} />
      <i style={{ background: palette.background }} />
    </span>
  );
}

export function StyleThumb({
  palette,
  variant = 0,
  className = '',
}: {
  palette: Palette;
  variant?: number;
  className?: string;
}) {
  const angle = 120 + (variant % 5) * 28;
  return (
    <span
      className={`wiz-thumb ${className}`}
      style={{
        background: [
          `radial-gradient(circle at 50% 56%, ${palette.a} 0%, ${palette.a}00 52%)`,
          `radial-gradient(circle at ${20 + (variant % 4) * 15}% ${20 + (variant % 3) * 18}%, ${palette.b}cc 0%, ${palette.b}00 58%)`,
          `linear-gradient(${angle}deg, ${palette.background} 10%, ${palette.c}33 78%, ${palette.background} 100%)`,
        ].join(', '),
      }}
      aria-hidden="true"
    >
      <span className="wiz-thumb-ring" style={{ borderColor: `${palette.c}88` }} />
      <span className="wiz-thumb-bars">
        {[0.42, 0.7, 0.95, 0.62, 0.34, 0.78, 0.5].map((height, index) => (
          <i
            key={index}
            style={{
              height: `${height * 100}%`,
              background: index % 2 === 0 ? palette.a : palette.b,
              opacity: 0.75,
            }}
          />
        ))}
      </span>
    </span>
  );
}

export function TemplateThumb({
  palette,
  seed = 0,
  className = '',
}: {
  palette: Palette;
  seed?: number;
  className?: string;
}) {
  const bars = Array.from({ length: 12 }, (_, index) => {
    const wave = Math.sin((index + seed) * 0.85) * 0.5 + 0.5;
    return 0.22 + wave * 0.78;
  });
  return (
    <span
      className={`wiz-thumb wiz-thumb--template ${className}`}
      style={{ background: `linear-gradient(160deg, ${palette.background}, ${palette.b}22)` }}
      aria-hidden="true"
    >
      <span className="wiz-template-bars">
        {bars.map((height, index) => (
          <i
            key={index}
            style={{
              height: `${Math.round(height * 100)}%`,
              background: index % 3 === 0 ? palette.c : index % 2 === 0 ? palette.a : palette.b,
            }}
          />
        ))}
      </span>
      <span className="wiz-thumb-glow" style={{ background: `radial-gradient(circle, ${palette.a}55, transparent 70%)` }} />
    </span>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string; title?: string }[];
  onChange(value: T): void;
  ariaLabel: string;
}) {
  return (
    <div className="wiz-segmented" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={option.value === value ? 'on' : ''}
          onClick={() => onChange(option.value)}
          title={option.title ?? option.label}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function MiniStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="wiz-stat" title={hint}>
      <span className="wiz-stat-label">{label}</span>
      <span className="wiz-stat-value">{value}</span>
    </div>
  );
}

export function HelpText({ children }: { children: ReactNode }) {
  return <p className="wiz-help">{children}</p>;
}
