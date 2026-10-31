/**
 * Text effect presets.
 *
 * A text layer is rasterised by the browser (see `textRaster.ts`) and then
 * shaded on the GPU by `TEXT_FRAG`. Each preset here selects one branch of that
 * shader and supplies its default look, palette and tunable parameters.
 *
 * Parameters live in `layer.params` under the `fx.` prefix so they travel with
 * the rest of the layer document and survive save/load without extra schema.
 */

import type { Layer } from '@/types';

export type TextEffectParamKey = 'intensity' | 'speed' | 'reveal';

export interface TextEffectDef {
  id: string;
  label: string;
  description: string;
  /** Branch index inside TEXT_FRAG. */
  mode: number;
  palette: { a: string; b: string; c: string };
  /** Parameter sliders shown in the properties panel. */
  params: TextEffectParamKey[];
  defaults: Partial<Record<TextEffectParamKey, number>>;
}

export const TEXT_EFFECT_PARAM_LABELS: Record<TextEffectParamKey, string> = {
  intensity: 'Intensity',
  speed: 'Speed',
  reveal: 'Reveal (s)',
};

export const TEXT_EFFECT_PARAM_RANGES: Record<
  TextEffectParamKey,
  { min: number; max: number; step: number }
> = {
  intensity: { min: 0, max: 2, step: 0.01 },
  speed: { min: 0, max: 4, step: 0.01 },
  reveal: { min: 0.1, max: 10, step: 0.1 },
};

const BASE_DEFAULTS: Record<TextEffectParamKey, number> = {
  intensity: 1,
  speed: 1,
  reveal: 1.5,
};

export const TEXT_EFFECTS: TextEffectDef[] = [
  {
    id: 'plain',
    label: 'Plain',
    description: 'Flat palette fill with a soft halo. The original text look.',
    mode: 0,
    palette: { a: '#f8fafc', b: '#22d3ee', c: '#8b5cf6' },
    params: [],
    defaults: {},
  },
  {
    id: 'neon',
    label: 'Neon Flicker',
    description: 'Glowing tube lettering with a subtle mains-style flicker.',
    mode: 1,
    palette: { a: '#22d3ee', b: '#a5f3fc', c: '#8b5cf6' },
    params: ['intensity'],
    defaults: { intensity: 1 },
  },
  {
    id: 'chrome',
    label: 'Chrome',
    description: 'Polished metal bands across the glyphs, shaded by their bevel.',
    mode: 2,
    palette: { a: '#e8ebf0', b: '#22d3ee', c: '#0f172a' },
    params: ['intensity', 'speed'],
    defaults: { intensity: 1, speed: 0.6 },
  },
  {
    id: 'outline',
    label: 'Outline',
    description: 'Hollow stroked title with a faint fill so it stays readable.',
    mode: 3,
    palette: { a: '#f8fafc', b: '#22d3ee', c: '#8b5cf6' },
    params: ['intensity'],
    defaults: { intensity: 1 },
  },
  {
    id: 'glitch',
    label: 'Glitch Split',
    description: 'RGB channels tear apart in horizontal bands timed to the clock.',
    mode: 4,
    palette: { a: '#f472b6', b: '#22d3ee', c: '#facc15' },
    params: ['intensity', 'speed'],
    defaults: { intensity: 1, speed: 1 },
  },
  {
    id: 'crt',
    label: 'CRT Scanlines',
    description: 'Phosphor scanlines, flicker and a touch of chromatic bleed.',
    mode: 5,
    palette: { a: '#4ade80', b: '#22d3ee', c: '#8b5cf6' },
    params: ['intensity', 'speed'],
    defaults: { intensity: 1, speed: 1 },
  },
  {
    id: 'typewriter',
    label: 'Typewriter Reveal',
    description: 'Sweeps the copy in from the left with a bright cursor edge.',
    mode: 6,
    palette: { a: '#f8fafc', b: '#fbbf24', c: '#fbbf24' },
    params: ['reveal'],
    defaults: { reveal: 1.5 },
  },
  {
    id: 'wave',
    label: 'Wave Motion',
    description: 'Sine displacement rolls through the letters.',
    mode: 7,
    palette: { a: '#22d3ee', b: '#8b5cf6', c: '#f472b6' },
    params: ['intensity', 'speed'],
    defaults: { intensity: 1, speed: 1 },
  },
  {
    id: 'pulse',
    label: 'Beat Pulse',
    description: 'Scales and flares with the audio beat and level.',
    mode: 8,
    palette: { a: '#f8fafc', b: '#f472b6', c: '#22d3ee' },
    params: ['intensity'],
    defaults: { intensity: 1 },
  },
  {
    id: 'shadow',
    label: 'Hard Shadow',
    description: 'Offset solid drop shadow for poster-style titling.',
    mode: 9,
    palette: { a: '#f8fafc', b: '#22d3ee', c: '#0b1020' },
    params: ['intensity'],
    defaults: { intensity: 1 },
  },
  {
    id: 'gradient',
    label: 'Gradient Sweep',
    description: 'Animated three-colour gradient travelling across the glyphs.',
    mode: 10,
    palette: { a: '#22d3ee', b: '#8b5cf6', c: '#f472b6' },
    params: ['speed'],
    defaults: { speed: 1 },
  },
  {
    id: 'pixel',
    label: 'Pixel Mosaic',
    description: 'Quantises the glyphs into chunky blocks.',
    mode: 11,
    palette: { a: '#22d3ee', b: '#f472b6', c: '#facc15' },
    params: ['intensity'],
    defaults: { intensity: 0.6 },
  },
];

export const TEXT_EFFECT_MAP: Record<string, TextEffectDef> = Object.fromEntries(
  TEXT_EFFECTS.map((effect) => [effect.id, effect]),
);

/** Resolve a preset id, falling back to the plain look for unknown ids. */
export function textEffectFor(id: string | undefined | null): TextEffectDef {
  return (id ? TEXT_EFFECT_MAP[id] : undefined) ?? TEXT_EFFECT_MAP.plain;
}

export function textEffectParamKey(key: TextEffectParamKey): string {
  return `fx.${key}`;
}

/** Defaults for a preset, keyed for `layer.params`. */
export function defaultTextEffectParams(effect: TextEffectDef): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of Object.keys(BASE_DEFAULTS) as TextEffectParamKey[]) {
    out[textEffectParamKey(key)] = effect.defaults[key] ?? BASE_DEFAULTS[key];
  }
  return out;
}

/** Read a preset parameter from a layer, falling back to the preset default. */
export function textEffectValue(layer: Layer, key: TextEffectParamKey): number {
  const effect = textEffectFor(layer.textEffect);
  const raw = layer.params[textEffectParamKey(key)];
  const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : NaN;
  return Number.isFinite(value) ? value : effect.defaults[key] ?? BASE_DEFAULTS[key];
}

/**
 * 0..1 reveal for effects that animate in over the clip (typewriter).
 * Measured from the clip start so it matches what the exporter renders.
 */
export function textEffectProgress(layer: Layer, time: number): number {
  const reveal = Math.max(0.1, textEffectValue(layer, 'reveal'));
  return Math.min(1, Math.max(0, (time - layer.start) / reveal));
}
