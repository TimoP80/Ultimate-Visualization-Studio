/**
 * Wizard configuration defaults and normalisation.
 *
 * `createDefaultConfig` is what a new wizard session starts from; it is derived
 * from a style preset so the first preview already looks designed rather than
 * empty. `normalizeConfig` is the guard used when a draft or imported preset is
 * read back: every field is validated and clamped, so a stale or hand-edited
 * payload cannot crash the generator or the renderer.
 */

import type { EffectType, Palette } from '@/types';
import {
  ASPECT_PRESETS,
  OUTPUT_PRESETS,
  PALETTE_PRESETS,
  STYLE_PRESETS,
  TYPOGRAPHY_PRESETS,
  outputPreset,
  palettePreset,
  reactivityProfile,
  stylePreset,
} from './presets';
import type {
  WizardBranding,
  WizardConfig,
  WizardCreative,
  WizardLocks,
  WizardOutput,
  WizardReactivity,
  WizardSceneMode,
  WizardScenes,
  WizardTransition,
} from './types';
import { WIZARD_LOCK_KEYS } from './types';

export const DEFAULT_SEED = 7919;

const STYLE_TYPOGRAPHY: Record<string, string> = {
  rave: 'industrial',
  hardcore: 'industrial',
  hardstyle: 'futuristic',
  techno: 'minimalist',
  dnb: 'cyberpunk',
  jungle: 'retro',
  trance: 'cinematic',
  synthwave: 'retro',
  cyberpunk: 'cyberpunk',
  abstract: 'futuristic',
  cinematic: 'cinematic',
  minimal: 'minimalist',
  ambient: 'minimalist',
  experimental: 'cyberpunk',
};

export const DEFAULT_LOCKS: WizardLocks = {
  style: false,
  templates: false,
  palette: false,
  reactivity: false,
  branding: false,
  effects: false,
  scenes: false,
  output: false,
};

export const ALL_EFFECT_TYPES = [
  'bloom',
  'glow',
  'lightRays',
  'volumetric',
  'neon',
  'rgbSplit',
  'glitch',
  'displacement',
  'pixelSort',
  'kaleidoscope',
  'vhs',
  'scanlines',
  'filmGrain',
  'feedback',
  'motionBlur',
  'cameraShake',
  'zoomPulse',
  'vignette',
  'halftone',
  'colorGrade',
] as const;

const SCENE_MODES: WizardSceneMode[] = ['single', 'scenes', 'beat', 'arc', 'custom'];
const TRANSITIONS: WizardTransition[] = [
  'none',
  'cut',
  'crossfade',
  'fadeBlack',
  'fadeWhite',
  'wipe',
  'dissolve',
];

export function styleTypographyId(styleId: string): string {
  return STYLE_TYPOGRAPHY[styleId] ?? 'minimalist';
}

/** Friendly title from a file name ("Artist - Track.mp3" -> "Artist - Track"). */
export function titleFromFileName(name: string): string {
  return name
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[_]+/g, ' ')
    .trim();
}

export interface DefaultConfigOptions {
  audioName?: string;
  seed?: number;
  bpm?: number | null;
  styleId?: string;
}

export function createDefaultConfig(options: DefaultConfigOptions = {}): WizardConfig {
  const style = stylePreset(options.styleId ?? 'cyberpunk');
  const scheme = palettePreset(style.paletteId);
  const output = outputPreset('youtube');
  const title = options.audioName ? titleFromFileName(options.audioName) : 'Visualiser';
  const branding: WizardBranding = {
    enabled: true,
    artist: '',
    title,
    album: '',
    label: '',
    releaseDate: '',
    customText: '',
    typographyId: styleTypographyId(style.id),
    layout: 'lower-third',
    alwaysShowTitle: true,
  };
  return {
    version: 1,
    bpmOverride: options.bpm ?? null,
    styleId: style.id,
    mainTemplateId: style.templates[0],
    supportingTemplateIds: style.templates.slice(1),
    paletteId: scheme.id,
    palette: { ...scheme.palette },
    appearance: {
      lighting: 0.6,
      bloom: 0.55,
      glow: 0.45,
      contrast: 1,
      saturation: 1,
      brightness: 1,
    },
    reactivityProfileId: 'balanced',
    reactivity: { ...reactivityProfile('balanced').values },
    branding,
    effects: { enabled: [...style.effects] },
    scenes: {
      // One scene spanning the whole track by default: the editor plays and
      // exports the active scene, so an intro/main/outro split would only ever
      // render its first (short) section unless the user picks it explicitly.
      mode: 'single',
      sectionCount: 3,
      introSeconds: 6,
      outroSeconds: 8,
      barsPerCut: 8,
      transition: style.transition,
      transitionSeconds: style.transition === 'cut' ? 0 : 0.8,
    },
    output: {
      presetId: output.id,
      width: output.width,
      height: output.height,
      fps: output.fps,
      codec: output.codec,
      bitrateMbps: output.bitrateMbps,
      crf: output.crf,
      audioCodec: 'aac',
      audioBitrateKbps: 256,
      encoder: 'auto',
    },
    creative: {
      creativity: 0.5,
      complexity: 0.45,
      effectIntensity: 1,
      seed: options.seed ?? DEFAULT_SEED,
      maxLayers: 4,
      advanced: false,
    },
    locks: { ...DEFAULT_LOCKS },
    updatedAt: new Date().toISOString(),
    finished: false,
  };
}

/* ------------------------------------------------------------------ */
/* Style application                                                   */
/* ------------------------------------------------------------------ */

/** Apply a style's full art direction, preserving locked sections. */
export function applyStyle(config: WizardConfig, styleId: string): WizardConfig {
  const style = stylePreset(styleId);
  const scheme = palettePreset(style.paletteId);
  const next: WizardConfig = {
    ...config,
    styleId: style.id,
    locks: { ...config.locks },
    palette: { ...config.palette },
    reactivity: { ...config.reactivity },
    branding: { ...config.branding },
    effects: { enabled: [...config.effects.enabled] },
    scenes: { ...config.scenes },
    output: { ...config.output },
    creative: { ...config.creative },
  };
  if (!config.locks.templates) {
    next.mainTemplateId = style.templates[0];
    next.supportingTemplateIds = style.templates.slice(1);
  }
  if (!config.locks.palette) {
    next.paletteId = scheme.id;
    next.palette = { ...scheme.palette };
  }
  if (!config.locks.reactivity) {
    next.reactivityProfileId = 'custom';
    next.reactivity = { ...style.reactivity };
  }
  if (!config.locks.effects) {
    next.effects = { enabled: [...style.effects] };
  }
  if (!config.locks.scenes) {
    next.scenes = {
      ...next.scenes,
      transition: style.transition,
      transitionSeconds: style.transition === 'cut' ? 0 : 0.8,
    };
  }
  if (!config.locks.branding) {
    next.branding.typographyId = styleTypographyId(style.id);
  }
  return next;
}

/* ------------------------------------------------------------------ */
/* Normalisation                                                       */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function text(value: unknown, fallback: string, maxLength = 120): string {
  if (typeof value !== 'string') return fallback;
  return value.slice(0, maxLength);
}

const HEX_RE = /^#[0-9a-f]{6}$/i;

function hex(value: unknown, fallback: string): string {
  return typeof value === 'string' && HEX_RE.test(value.trim()) ? value.trim().toLowerCase() : fallback;
}

function palette(value: unknown, fallback: Palette): Palette {
  const raw = isRecord(value) ? value : {};
  return {
    a: hex(raw.a, fallback.a),
    b: hex(raw.b, fallback.b),
    c: hex(raw.c, fallback.c),
    d: hex(raw.d, fallback.d),
    background: hex(raw.background, fallback.background),
  };
}

export function normalizeReactivity(value: unknown, fallback: WizardReactivity): WizardReactivity {
  const raw = isRecord(value) ? value : {};
  return {
    bass: num(raw.bass, fallback.bass, 0, 1),
    kick: num(raw.kick, fallback.kick, 0, 1),
    mid: num(raw.mid, fallback.mid, 0, 1),
    high: num(raw.high, fallback.high, 0, 1),
    beatSync: num(raw.beatSync, fallback.beatSync, 0, 1),
    particle: num(raw.particle, fallback.particle, 0, 1),
    speed: num(raw.speed, fallback.speed, 0.4, 2),
    smoothing: num(raw.smoothing, fallback.smoothing, 0, 1),
    pulse: num(raw.pulse, fallback.pulse, 0, 1),
  };
}

function normalizeBranding(value: unknown, fallback: WizardBranding): WizardBranding {
  const raw = isRecord(value) ? value : {};
  const layout = ['centre', 'lower-third', 'corner'].includes(String(raw.layout))
    ? (raw.layout as WizardBranding['layout'])
    : fallback.layout;
  const typography = TYPOGRAPHY_PRESETS.some((preset) => preset.id === raw.typographyId)
    ? String(raw.typographyId)
    : fallback.typographyId;
  return {
    enabled: bool(raw.enabled, fallback.enabled),
    artist: text(raw.artist, fallback.artist, 80),
    title: text(raw.title, fallback.title, 120),
    album: text(raw.album, fallback.album, 120),
    label: text(raw.label, fallback.label, 80),
    releaseDate: text(raw.releaseDate, fallback.releaseDate, 40),
    customText: text(raw.customText, fallback.customText, 160),
    typographyId: typography,
    layout,
    alwaysShowTitle: bool(raw.alwaysShowTitle, fallback.alwaysShowTitle),
  };
}

function normalizeScenes(value: unknown, fallback: WizardScenes): WizardScenes {
  const raw = isRecord(value) ? value : {};
  const mode = SCENE_MODES.includes(raw.mode as WizardSceneMode)
    ? (raw.mode as WizardSceneMode)
    : fallback.mode;
  const transition = TRANSITIONS.includes(raw.transition as WizardTransition)
    ? (raw.transition as WizardTransition)
    : fallback.transition;
  return {
    mode,
    sectionCount: Math.round(num(raw.sectionCount, fallback.sectionCount, 1, 8)),
    introSeconds: num(raw.introSeconds, fallback.introSeconds, 0, 60),
    outroSeconds: num(raw.outroSeconds, fallback.outroSeconds, 0, 60),
    barsPerCut: Math.round(num(raw.barsPerCut, fallback.barsPerCut, 1, 64)),
    transition,
    transitionSeconds: num(raw.transitionSeconds, fallback.transitionSeconds, 0, 5),
  };
}

function normalizeOutput(value: unknown, fallback: WizardOutput): WizardOutput {
  const raw = isRecord(value) ? value : {};
  const preset = OUTPUT_PRESETS.find((item) => item.id === raw.presetId);
  const width = Math.round(num(raw.width, preset?.width ?? fallback.width, 160, 7680));
  const height = Math.round(num(raw.height, preset?.height ?? fallback.height, 90, 4320));
  const codec = raw.codec === 'h265' ? 'h265' : 'h264';
  const audioCodecs: WizardOutput['audioCodec'][] = ['aac', 'mp3', 'opus', 'flac', 'pcm'];
  const encoders: WizardOutput['encoder'][] = ['auto', 'software', 'nvenc', 'amf', 'qsv', 'videotoolbox'];
  return {
    presetId: typeof raw.presetId === 'string' ? raw.presetId : fallback.presetId,
    width,
    height,
    fps: Math.round(num(raw.fps, preset?.fps ?? fallback.fps, 1, 120)),
    codec,
    bitrateMbps: num(raw.bitrateMbps, preset?.bitrateMbps ?? fallback.bitrateMbps, 1, 400),
    crf: Math.round(num(raw.crf, preset?.crf ?? fallback.crf, 0, 51)),
    audioCodec: audioCodecs.includes(raw.audioCodec as WizardOutput['audioCodec'])
      ? (raw.audioCodec as WizardOutput['audioCodec'])
      : fallback.audioCodec,
    audioBitrateKbps: Math.round(num(raw.audioBitrateKbps, fallback.audioBitrateKbps, 64, 512)),
    encoder: encoders.includes(raw.encoder as WizardOutput['encoder'])
      ? (raw.encoder as WizardOutput['encoder'])
      : 'auto',
  };
}

function normalizeCreative(value: unknown, fallback: WizardCreative): WizardCreative {
  const raw = isRecord(value) ? value : {};
  return {
    creativity: num(raw.creativity, fallback.creativity, 0, 1),
    complexity: num(raw.complexity, fallback.complexity, 0, 1),
    effectIntensity: num(raw.effectIntensity, fallback.effectIntensity, 0.2, 2),
    seed: Math.round(num(raw.seed, fallback.seed, 0, 2 ** 31 - 1)),
    maxLayers: Math.round(num(raw.maxLayers, fallback.maxLayers, 1, 8)),
    advanced: bool(raw.advanced, fallback.advanced),
  };
}

function normalizeLocks(value: unknown, fallback: WizardLocks): WizardLocks {
  const raw = isRecord(value) ? value : {};
  const locks = { ...fallback };
  for (const key of WIZARD_LOCK_KEYS) locks[key] = bool(raw[key], fallback[key]);
  return locks;
}

/**
 * Validate any stored/imported wizard configuration against the current schema.
 * Unknown fields are dropped, missing fields are taken from `fallback`, and all
 * numbers are clamped to their supported ranges.
 */
export function normalizeConfig(value: unknown, fallback: WizardConfig): WizardConfig {
  if (!isRecord(value)) return fallback;
  const raw = value;

  const styleId =
    typeof raw.styleId === 'string' && STYLE_PRESETS.some((preset) => preset.id === raw.styleId)
      ? raw.styleId
      : fallback.styleId;

  const scheme = PALETTE_PRESETS.find((preset) => preset.id === raw.paletteId);
  const paletteId = scheme ? scheme.id : fallback.paletteId;

  const enabled = Array.isArray(raw.effects)
    ? (raw.effects as unknown[])
    : isRecord(raw.effects) && Array.isArray((raw.effects as Record<string, unknown>).enabled)
      ? ((raw.effects as Record<string, unknown>).enabled as unknown[])
      : [];
  const allowedEffects = new Set<string>(ALL_EFFECT_TYPES);
  const effects = enabled
    .filter((item): item is EffectType => typeof item === 'string' && allowedEffects.has(item))
    .filter((item, index, list) => list.indexOf(item) === index)
    .slice(0, 8);

  const templates = Array.isArray(raw.supportingTemplateIds)
    ? (raw.supportingTemplateIds as unknown[])
        .filter((item): item is string => typeof item === 'string')
        .slice(0, 3)
    : fallback.supportingTemplateIds;

  const appearanceRaw = isRecord(raw.appearance) ? raw.appearance : {};
  const brandingRaw = raw.branding;
  const reactivityRaw = raw.reactivity;

  const profileId =
    typeof raw.reactivityProfileId === 'string' ? raw.reactivityProfileId : fallback.reactivityProfileId;

  return {
    version: 1,
    bpmOverride:
      raw.bpmOverride === null || raw.bpmOverride === undefined
        ? fallback.bpmOverride
        : num(raw.bpmOverride, 120, 40, 260),
    styleId,
    mainTemplateId:
      typeof raw.mainTemplateId === 'string' && raw.mainTemplateId.length > 0
        ? raw.mainTemplateId
        : fallback.mainTemplateId,
    supportingTemplateIds: templates,
    paletteId,
    palette: palette(raw.palette, (scheme ?? palettePreset(fallback.paletteId)).palette),
    appearance: {
      lighting: num(appearanceRaw.lighting, fallback.appearance.lighting, 0, 1),
      bloom: num(appearanceRaw.bloom, fallback.appearance.bloom, 0, 1),
      glow: num(appearanceRaw.glow, fallback.appearance.glow, 0, 1),
      contrast: num(appearanceRaw.contrast, fallback.appearance.contrast, 0.5, 1.8),
      saturation: num(appearanceRaw.saturation, fallback.appearance.saturation, 0, 2),
      brightness: num(appearanceRaw.brightness, fallback.appearance.brightness, 0.5, 1.6),
    },
    reactivityProfileId: profileId,
    reactivity: normalizeReactivity(reactivityRaw, fallback.reactivity),
    branding: normalizeBranding(brandingRaw, fallback.branding),
    effects: { enabled: effects.length > 0 ? (effects as EffectType[]) : [...fallback.effects.enabled] },
    scenes: normalizeScenes(raw.scenes, fallback.scenes),
    output: normalizeOutput(raw.output, fallback.output),
    creative: normalizeCreative(raw.creative, fallback.creative),
    locks: normalizeLocks(raw.locks, fallback.locks),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
    finished: bool(raw.finished, false),
  };
}

/** Recommended aspect preset id for the current dimensions. */
export function aspectIdFor(width: number, height: number): string {
  const ratio = width / Math.max(1, height);
  const target = ASPECT_PRESETS.reduce(
    (best, preset) =>
      Math.abs(preset.width / preset.height - ratio) < Math.abs(best.width / best.height - ratio)
        ? preset
        : best,
    ASPECT_PRESETS[0],
  );
  return target.id;
}

export function applyOutputPreset(config: WizardConfig, presetId: string): WizardConfig {
  if (presetId === 'custom') {
    return { ...config, output: { ...config.output, presetId } };
  }
  const preset = outputPreset(presetId);
  return {
    ...config,
    output: {
      ...config.output,
      presetId: preset.id,
      width: preset.width,
      height: preset.height,
      fps: preset.fps,
      codec: preset.codec,
      bitrateMbps: preset.bitrateMbps,
      crf: preset.crf,
    },
  };
}
