/**
 * Resolves a layer's final render parameters for a given time: keyframes and
 * audio modulation are folded into the base values, then packed into the
 * uniform slots that templates read through `uP[8]` / `uBands[16]`.
 *
 * This module is shared by the live preview and the video exporter, which is
 * what keeps the two in sync.
 */

import type { AudioSample } from '@/audio/analysis';
import type { Layer, Palette, TemplateDef, Transform, ModulationRoute } from '@/types';
import { applyEasing, blendModeIndex, clamp, clamp01 } from '@/timeline/easing';
import { hexToRgba } from '@/render/gl';

export interface ResolvedLayer {
  transform: Transform;
  palette: Palette;
  slots: Float32Array;
  opacity: number;
  blend: number;
  /** Numeric parameter values keyed by the template's param keys. */
  values: Record<string, number>;
}

const MODULATION_SOURCES: Record<string, (a: AudioSample) => number> = {
  rms: (a) => a.rms,
  peak: (a) => a.peak,
  subBass: (a) => a.subBass,
  bass: (a) => a.bass,
  lowMid: (a) => a.lowMid,
  mid: (a) => a.mid,
  highMid: (a) => a.highMid,
  treble: (a) => a.treble,
  air: (a) => a.air,
  centroid: (a) => a.centroid,
  flux: (a) => a.flux,
  beat: (a) => a.beat,
  beatPhase: (a) => a.beatPhase,
  bar: (a) => a.bar,
  kick: (a) => a.kick,
  snare: (a) => a.snare,
  onset: (a) => a.onset,
  band: () => 0, // handled separately (needs the band index)
};

export function modulationSourceValue(route: ModulationRoute, audio: AudioSample): number {
  let raw: number;
  if (route.source === 'band') {
    const idx = clamp(Math.round(route.bandIndex ?? 0), 0, audio.bands.length - 1);
    raw = audio.bands[idx];
  } else {
    raw = (MODULATION_SOURCES[route.source] ?? (() => 0))(audio);
  }
  let v = raw * route.sensitivity;
  if (v < route.threshold) v = 0;
  else v = (v - route.threshold) / Math.max(1e-4, 1 - route.threshold);
  if (route.invert) v = 1 - v;
  return clamp01(v);
}

/**
 * Envelope state for modulation routes.
 *
 * Routes follow their own attack/release so a slow pad can drive one parameter
 * while a snappy kick drives another. The state is reset on transport seeks so
 * a normal forward playthrough matches the exporter exactly.
 */
export class ModulationState {
  private values = new Map<string, number>();

  reset(): void {
    this.values.clear();
  }

  step(route: ModulationRoute, input: number, dt: number): number {
    const prev = this.values.get(route.id) ?? 0;
    const atk = Math.max(1e-4, route.attack);
    const rel = Math.max(1e-4, route.release);
    const coef = 1 - Math.exp(-dt / (input > prev ? atk : rel));
    const next = prev + (input - prev) * coef;
    this.values.set(route.id, next);
    return next;
  }
}

/* ------------------------------------------------------------------ */
/* Keyframes                                                           */
/* ------------------------------------------------------------------ */

export function evaluateKeyframes(layer: Layer, path: string, time: number): number | null {
  let relevant: typeof layer.keyframes | null = null;
  for (const kf of layer.keyframes) {
    if (kf.path !== path) continue;
    if (!relevant) relevant = [];
    relevant.push(kf);
  }
  if (!relevant || relevant.length === 0) return null;

  relevant.sort((a, b) => a.time - b.time);
  if (time <= relevant[0].time) return relevant[0].value;
  const last = relevant[relevant.length - 1];
  if (time >= last.time) return last.value;

  for (let i = 0; i < relevant.length - 1; i++) {
    const a = relevant[i];
    const b = relevant[i + 1];
    if (time >= a.time && time <= b.time) {
      const span = b.time - a.time;
      const t = span <= 1e-6 ? 0 : (time - a.time) / span;
      const eased = applyEasing(t, b.easing, b.bezier);
      return a.value + (b.value - a.value) * eased;
    }
  }
  return last.value;
}

export function hasKeyframesFor(layer: Layer, path: string): boolean {
  return layer.keyframes.some((k) => k.path === path);
}

/* ------------------------------------------------------------------ */
/* Layer resolution                                                    */
/* ------------------------------------------------------------------ */

const SLOT_COUNT = 8;
const scratchSlots = new Float32Array(SLOT_COUNT);

export interface ResolveOptions {
  /** Seconds since the previous resolved frame; used by modulation envelopes. */
  dt: number;
  state: ModulationState;
  /** Render time in seconds (absolute timeline position). */
  time: number;
  /** When false, modulation envelopes are updated but not applied (mute). */
  audioActive: boolean;
}

export function resolveLayer(
  layer: Layer,
  template: TemplateDef | null,
  audio: AudioSample,
  options: ResolveOptions,
): ResolvedLayer {
  const { dt, state, time, audioActive } = options;

  // ---- Transform ------------------------------------------------------
  const t: Transform = { ...layer.transform };
  const kfTransform: [keyof Transform, string][] = [
    ['x', 'transform.x'],
    ['y', 'transform.y'],
    ['scaleX', 'transform.scaleX'],
    ['scaleY', 'transform.scaleY'],
    ['rotation', 'transform.rotation'],
    ['opacity', 'transform.opacity'],
  ];
  for (const [key, path] of kfTransform) {
    const v = evaluateKeyframes(layer, path, time);
    if (v !== null) t[key] = v;
  }

  // ---- Numeric parameter base values ---------------------------------
  const values: Record<string, number> = {};
  if (template) {
    for (const def of template.params) {
      const raw = layer.params[def.key] ?? def.default;
      if (def.type === 'bool') values[def.key] = raw ? 1 : 0;
      else if (def.type === 'select') {
        const idx = def.options?.findIndex((o) => o.value === raw) ?? -1;
        values[def.key] = idx >= 0 ? idx : 0;
      } else values[def.key] = typeof raw === 'number' ? raw : Number(raw) || 0;
    }
  } else {
    for (const [k, v] of Object.entries(layer.params)) {
      values[k] = typeof v === 'number' ? v : v ? 1 : 0;
    }
  }

  // ---- Keyframed parameter overrides ---------------------------------
  for (const kf of layer.keyframes) {
    if (!kf.path.startsWith('params.')) continue;
    const key = kf.path.slice('params.'.length);
    const v = evaluateKeyframes(layer, kf.path, time);
    if (v !== null) values[key] = v;
  }

  // ---- Audio modulation ----------------------------------------------
  if (layer.modulation.length > 0) {
    for (const route of layer.modulation) {
      const input = modulationSourceValue(route, audio);
      const enveloped = state.step(route, input, dt);
      if (!audioActive || !route.enabled) continue;
      const key = route.target;
      if (!(key in values)) values[key] = 0;
      values[key] += enveloped * route.amount;
    }
  }

  // ---- Pack uniform slots --------------------------------------------
  const slots = new Float32Array(SLOT_COUNT);
  if (template) {
    for (let i = 0; i < template.params.length && i < SLOT_COUNT; i++) {
      const def = template.params[i];
      let v = values[def.key] ?? 0;
      if (def.type !== 'select' && def.type !== 'bool') {
        if (def.min !== undefined) v = Math.max(def.min, v);
        if (def.max !== undefined) v = Math.min(def.max, v);
      }
      slots[i] = v;
    }
  } else {
    let i = 0;
    for (const [, v] of Object.entries(values)) {
      if (i >= SLOT_COUNT) break;
      slots[i++] = v;
    }
  }

  return {
    transform: t,
    palette: layer.palette,
    slots,
    opacity: clamp01(t.opacity),
    blend: blendModeIndex(layer.blend),
    values,
  };
}

/* ------------------------------------------------------------------ */
/* Effect parameter resolution                                         */
/* ------------------------------------------------------------------ */

import type { EffectInstance } from '@/types';
import type { EffectDef } from '@/render/effects';

export function resolveEffectSlots(effect: EffectInstance, def: EffectDef): Float32Array {
  const slots = scratchSlots;
  slots.fill(0);
  for (const param of def.params) {
    const v = effect.params[param.key];
    slots[param.slot] = v === undefined ? param.default : v;
  }
  return slots;
}

/* ------------------------------------------------------------------ */
/* Palette helpers                                                     */
/* ------------------------------------------------------------------ */

export function paletteRgba(palette: Palette): {
  a: [number, number, number, number];
  b: [number, number, number, number];
  c: [number, number, number, number];
  d: [number, number, number, number];
  background: [number, number, number, number];
} {
  return {
    a: hexToRgba(palette.a),
    b: hexToRgba(palette.b),
    c: hexToRgba(palette.c),
    d: hexToRgba(palette.d),
    background: hexToRgba(palette.background),
  };
}
