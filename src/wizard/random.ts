/**
 * Seeded randomness for the wizard.
 *
 * Every randomisation takes an explicit seed, so a composition can be
 * reproduced exactly from the seed shown in the Advanced panel. Locks are
 * respected here rather than in the UI, which keeps Quick Start, the
 * "Randomize" button and the review step consistent.
 */

import type { EffectType, Palette } from '@/types';
import { hslToHex } from './color';
import { styleTypographyId } from './config';
import {
  EFFECT_INTENSITY_PRESETS,
  PALETTE_PRESETS,
  REACTIVITY_PROFILES,
  STYLE_PRESETS,
  TYPOGRAPHY_PRESETS,
  palettePreset,
  stylePreset,
} from './presets';
import { recommendStyle } from './plan';
import type { TrackSummary } from './plan';
import type { WizardConfig, WizardSceneMode, WizardTransition } from './types';
import { WIZARD_LOCK_KEYS } from './types';

export type Rng = () => number;

/** Mulberry32 — small, fast and stable across browsers. */
export function mulberry32(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: Rng, list: readonly T[]): T {
  return list[Math.floor(rng() * list.length) % list.length];
}

function shuffle<T>(rng: Rng, list: readonly T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function between(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** A coherent split-complementary palette in the current hue family. */
export function randomPalette(rng: Rng): Palette {
  const hue = rng() * 360;
  const rotate = between(rng, 60, 170);
  return {
    a: hslToHex(hue, between(rng, 0.75, 1), between(rng, 0.48, 0.6)),
    b: hslToHex(hue + rotate, between(rng, 0.65, 0.95), between(rng, 0.45, 0.62)),
    c: hslToHex(hue - rotate * 0.55, between(rng, 0.7, 1), between(rng, 0.52, 0.68)),
    d: hslToHex(hue, between(rng, 0.05, 0.3), between(rng, 0.9, 0.97)),
    background: hslToHex(hue + 18, between(rng, 0.25, 0.5), between(rng, 0.02, 0.06)),
  };
}

const SCENE_MODES: WizardSceneMode[] = ['arc', 'arc', 'scenes', 'beat', 'single', 'custom'];
const TRANSITIONS: WizardTransition[] = ['cut', 'crossfade', 'dissolve', 'fadeBlack'];

const LAYOUTS: WizardConfig['branding']['layout'][] = ['lower-third', 'centre', 'corner'];

export interface RandomizeOptions {
  /** 0..1 from the Creative panel; higher values stray further. */
  creativity?: number;
  summary?: TrackSummary;
}

/**
 * Produce the next configuration. Any section the user locked is copied
 * verbatim, so "randomise" only touches what they asked it to.
 */
export function randomizeConfig(
  config: WizardConfig,
  seed: number,
  options: RandomizeOptions = {},
): WizardConfig {
  const rng = mulberry32(seed);
  const creativity = Math.max(0, Math.min(1, options.creativity ?? config.creative.creativity));
  const summary = options.summary;
  const locks = config.locks;
  const next: WizardConfig = {
    ...config,
    locks: { ...config.locks },
    palette: { ...config.palette },
    reactivity: { ...config.reactivity },
    branding: { ...config.branding },
    effects: { enabled: [...config.effects.enabled] },
    scenes: { ...config.scenes },
    output: { ...config.output },
    creative: { ...config.creative, seed },
    appearance: { ...config.appearance },
    updatedAt: new Date().toISOString(),
  };

  // ---- Style ---------------------------------------------------------
  let style = stylePreset(config.styleId);
  if (!locks.style) {
    const recommendation = summary ? recommendStyle(summary).styleId : null;
    const balanced = STYLE_PRESETS.filter((preset) => preset.id !== config.styleId);
    let chosen = recommendation && creativity < 0.45 ? recommendation : null;
    if (!chosen || chosen === config.styleId) {
      // Bias towards the current energy band instead of jumping genre every time.
      const near = balanced.filter(
        (preset) => Math.abs(preset.energy - style.energy) < 0.3 && preset.id !== config.styleId,
      );
      chosen = pick(rng, near.length > 0 ? near : balanced).id;
    }
    style = stylePreset(chosen);
    next.styleId = style.id;
    next.scenes.transition = style.transition;
    next.scenes.transitionSeconds = style.transition === 'cut' ? 0 : round(between(rng, 0.5, 1.4));
  }

  // ---- Templates -----------------------------------------------------
  if (!locks.templates) {
    const pool = style.templates;
    const main = pool[Math.floor(rng() * pool.length) % pool.length];
    const supporting = shuffle(rng, pool.filter((id) => id !== main)).slice(
      0,
      Math.min(2, Math.max(0, config.creative.maxLayers - 1)),
    );
    next.mainTemplateId = main;
    next.supportingTemplateIds = supporting;
  }

  // ---- Palette -------------------------------------------------------
  if (!locks.palette) {
    if (!locks.style && creativity < 0.65) {
      const scheme = palettePreset(style.paletteId);
      next.paletteId = scheme.id;
      next.palette = { ...scheme.palette };
    } else if (creativity < 0.35) {
      const scheme = pick(rng, PALETTE_PRESETS.filter((preset) => preset.id !== 'custom'));
      next.paletteId = scheme.id;
      next.palette = { ...scheme.palette };
    } else {
      next.paletteId = 'custom';
      next.palette = randomPalette(rng);
    }
  }

  // ---- Appearance ----------------------------------------------------
  next.appearance = {
    lighting: round(clamp01(config.appearance.lighting + between(rng, -0.15, 0.15) * creativity), 2),
    bloom: round(clamp01(config.appearance.bloom + between(rng, -0.18, 0.18) * creativity), 2),
    glow: round(clamp01(config.appearance.glow + between(rng, -0.2, 0.2) * creativity), 2),
    contrast: round(between(rng, 0.9, 1.2) * (1 - creativity) + config.appearance.contrast * creativity, 2),
    saturation: round(between(rng, 0.9, 1.35) * (1 - creativity) + config.appearance.saturation * creativity, 2),
    brightness: round(between(rng, 0.9, 1.15) * (1 - creativity) + config.appearance.brightness * creativity, 2),
  };

  // ---- Reactivity ----------------------------------------------------
  if (!locks.reactivity) {
    const profile = pick(rng, REACTIVITY_PROFILES.filter((item) => item.id !== 'custom'));
    const base = profile.values;
    next.reactivityProfileId = creativity < 0.4 ? profile.id : 'custom';
    next.reactivity = {
      bass: round(clamp01(base.bass + between(rng, -0.15, 0.15) * creativity), 2),
      kick: round(clamp01(base.kick + between(rng, -0.15, 0.15) * creativity), 2),
      mid: round(clamp01(base.mid + between(rng, -0.15, 0.15) * creativity), 2),
      high: round(clamp01(base.high + between(rng, -0.15, 0.15) * creativity), 2),
      beatSync: round(clamp01(base.beatSync + between(rng, -0.2, 0.2) * creativity), 2),
      particle: round(clamp01(base.particle + between(rng, -0.15, 0.15) * creativity), 2),
      speed: round(between(rng, 0.75, 1.5), 2),
      smoothing: round(clamp01(base.smoothing + between(rng, -0.15, 0.15) * creativity), 2),
      pulse: round(clamp01(base.pulse + between(rng, -0.15, 0.15) * creativity), 2),
    };
  }

  // ---- Branding ------------------------------------------------------
  if (!locks.branding) {
    const styleTypo = styleTypographyId(style.id);
    const typography =
      creativity > 0.5
        ? pick(rng, TYPOGRAPHY_PRESETS).id
        : TYPOGRAPHY_PRESETS.some((preset) => preset.id === styleTypo)
          ? styleTypo
          : TYPOGRAPHY_PRESETS[0].id;
    next.branding.typographyId = typography;
    next.branding.layout = pick(rng, LAYOUTS);
  }

  // ---- Effects -------------------------------------------------------
  if (!locks.effects) {
    const pool = EFFECT_INTENSITY_PRESETS.filter(
      (preset) => preset.id !== 'extreme' || config.creative.advanced,
    );
    const base = stylePreset(next.styleId);
    const preset = creativity < 0.3 ? null : pick(rng, pool);
    let enabled: EffectType[];
    if (preset) {
      enabled = [...preset.effects];
      next.creative.effectIntensity = round(clamp(preset.intensity + between(rng, -0.1, 0.2), 0.2, 1.8), 2);
    } else {
      enabled = [...base.effects];
    }
    // Keep the stack inside the performance budget.
    const unique = enabled.filter((item, index) => enabled.indexOf(item) === index);
    next.effects = { enabled: unique.slice(0, creativity > 0.7 ? 6 : 4) };
  }

  // ---- Structure -----------------------------------------------------
  if (!locks.scenes) {
    const mode = pick(rng, SCENE_MODES);
    next.scenes.mode = mode;
    next.scenes.sectionCount = Math.round(between(rng, 2, 5));
    next.scenes.barsPerCut = [4, 8, 16, 32][Math.floor(rng() * 4) % 4];
    next.scenes.introSeconds = Math.round(between(rng, 3, 10));
    next.scenes.outroSeconds = Math.round(between(rng, 4, 12));
    const transition = mode === 'beat' ? 'cut' : pick(rng, TRANSITIONS);
    next.scenes.transition = transition;
    next.scenes.transitionSeconds = transition === 'cut' ? 0 : round(between(rng, 0.5, 1.5));
  }

  // ---- Creative ------------------------------------------------------
  next.creative.complexity = round(
    clamp01(config.creative.complexity + between(rng, -0.12, 0.12) * creativity),
    2,
  );
  next.creative.effectIntensity = round(
    clamp(next.creative.effectIntensity + between(rng, -0.1, 0.1) * creativity, 0.2, 1.8),
    2,
  );
  next.creative.maxLayers = Math.max(2, Math.min(6, config.creative.maxLayers));

  // Never leave a lock section mutated by default values.
  for (const key of WIZARD_LOCK_KEYS) next.locks[key] = config.locks[key];
  return next;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}
