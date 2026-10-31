/**
 * Shared building blocks for template definitions.
 *
 * Every template lives in a category module, declares its dashboard parameters
 * with these helpers and a named palette, and registers itself through
 * {@link registerTemplates}. Keeping the palette table central means the whole
 * library shares a coherent colour language while each preset keeps its own
 * identity.
 */

import type { Palette, ParamDef } from '@/types';

export const PALETTES: Record<string, Palette> = {
  cyanViolet: { a: '#22d3ee', b: '#8b5cf6', c: '#f472b6', d: '#e8ebf0', background: '#07080c' },
  acid: { a: '#a3e635', b: '#22d3ee', c: '#facc15', d: '#f8fafc', background: '#05070a' },
  magma: { a: '#f97316', b: '#ef4444', c: '#fbbf24', d: '#fde68a', background: '#0a0605' },
  ice: { a: '#67e8f9', b: '#818cf8', c: '#e0f2fe', d: '#a5b4fc', background: '#04070d' },
  neonPink: { a: '#f472b6', b: '#a855f7', c: '#22d3ee', d: '#fdf2f8', background: '#0b0410' },
  emerald: { a: '#34d399', b: '#06b6d4', c: '#a7f3d0', d: '#ecfeff', background: '#030a09' },
  amber: { a: '#fbbf24', b: '#f97316', c: '#fde68a', d: '#fff7ed', background: '#0a0703' },
  crimson: { a: '#ef4444', b: '#f43f5e', c: '#fb7185', d: '#fee2e2', background: '#0a0304' },
  monochrome: { a: '#f8fafc', b: '#cbd5e1', c: '#94a3b8', d: '#e2e8f0', background: '#050506' },
  ultraviolet: { a: '#c084fc', b: '#6366f1', c: '#f0abfc', d: '#eef2ff', background: '#07050f' },
  toxic: { a: '#bef264', b: '#22c55e', c: '#facc15', d: '#ecfccb', background: '#050805' },
  sunset: { a: '#fb7185', b: '#f59e0b', c: '#c084fc', d: '#fff1f2', background: '#0b0509' },
};

export function palette(name: keyof typeof PALETTES): Palette {
  return { ...PALETTES[name] };
}

/** Float parameter. */
export function f(
  key: string,
  label: string,
  def: number,
  min: number,
  max: number,
  step = 0.01,
  group = 'Shape',
): ParamDef {
  return { key, label, type: 'float', default: def, min, max, step, group };
}

/** Integer parameter. */
export function i(
  key: string,
  label: string,
  def: number,
  min: number,
  max: number,
  group = 'Shape',
): ParamDef {
  return { key, label, type: 'int', default: def, min, max, step: 1, group };
}

/** Boolean parameter (packed as 0/1 in a uniform slot). */
export function b(key: string, label: string, def: boolean, group = 'Style'): ParamDef {
  return { key, label, type: 'bool', default: def, group };
}

/** Enumerated parameter; the slot receives the option index. */
export function sel(
  key: string,
  label: string,
  def: string,
  options: { label: string; value: string }[],
  group = 'Style',
): ParamDef {
  return { key, label, type: 'select', default: def, options, group };
}
