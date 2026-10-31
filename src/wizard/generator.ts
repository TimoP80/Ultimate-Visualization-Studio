/**
 * Wizard -> Project conversion.
 *
 * The generator is the only place that knows how wizard settings map onto the
 * native document. It builds a normal `Project` with normal layers, effects,
 * modulation routes and scenes — there is no parallel project format, so every
 * generated element is editable, saveable and exportable by the existing
 * editor, persistence layer and MP4 exporter.
 */

import type {
  AudioRef,
  EffectInstance,
  EffectType,
  Layer,
  Marker,
  Palette,
  Project,
  Scene,
  TemplateDef,
} from '@/types';
import { EFFECT_DEF_MAP, defaultEffectParams, type EffectDef } from '@/render/effects';
import { defaultTextEffectParams, textEffectFor } from '@/render/textEffects';
import { allTemplates, getTemplateById } from '@/templates/registry';
import { FORMAT_VERSION, createLayerFromTemplate, defaultExportSettings, identityTransform, uid } from '@/state/project';
import { clamp } from '@/timeline/easing';
import { gradePalette, mixHex } from './color';
import { createDefaultConfig, normalizeConfig } from './config';
import { analyzeTrackSummary, planSections, type SectionPlan, type TrackSummary } from './plan';
import { stylePreset, typographyPreset } from './presets';
import type { WizardConfig, WizardContext } from './types';

export interface GenerationResult {
  project: Project;
  summary: TrackSummary;
  sections: SectionPlan[];
  notes: string[];
  warnings: string[];
  layerCount: number;
  templateNames: string[];
}

const MODULATION_SOURCES = ['kick', 'bass', 'mid', 'treble', 'snare', 'rms'] as const;

function pseudoSeed(seed: number, index: number): number {
  const value = (seed + index * 2654435761) % 4294967296;
  return value / 4294967296;
}

function unique<T>(items: T[]): T[] {
  return items.filter((item, index) => items.indexOf(item) === index);
}

function availableTemplates(ids: string[]): TemplateDef[] {
  return ids
    .map((id) => getTemplateById(id))
    .filter((def): def is TemplateDef => Boolean(def));
}

function fallbackTemplate(): TemplateDef | null {
  return allTemplates()[0] ?? null;
}

/* ------------------------------------------------------------------ */
/* Modulation                                                          */
/* ------------------------------------------------------------------ */

const UNSUITABLE_TARGET = /invert|mode|preset|variant|seed|flip|style|orientation|quality|channel|show/i;

function modulationTargets(def: TemplateDef): { key: string; range: number }[] {
  const numeric = def.params
    .filter((param) => (param.type === 'float' || param.type === 'int') && !UNSUITABLE_TARGET.test(param.key))
    .filter((param) => param.min !== undefined && param.max !== undefined && param.max > param.min)
    .map((param) => ({ key: param.key, range: (param.max ?? 1) - (param.min ?? 0) }))
    .filter((param) => param.range > 0.02);
  return numeric.sort((a, b) => b.range - a.range);
}

function createModulation(
  def: TemplateDef,
  config: WizardConfig,
  routes: number,
  intensity: number,
): Layer['modulation'] {
  const targets = modulationTargets(def).slice(0, routes);
  const { reactivity } = config;
  return targets.map((target, index) => {
    const source = MODULATION_SOURCES[index % MODULATION_SOURCES.length];
    const gain =
      source === 'kick'
        ? reactivity.kick
        : source === 'bass'
          ? reactivity.bass
          : source === 'mid'
            ? reactivity.mid
            : source === 'treble'
              ? reactivity.high
              : source === 'snare'
                ? reactivity.high * 0.7
                : reactivity.bass * 0.6;
    const depth = 0.1 + reactivity.pulse * 0.14;
    const amount =
      target.range * depth * Math.max(0.15, gain) * intensity * (index % 3 === 1 ? -1 : 1);
    return {
      id: uid('mod'),
      enabled: true,
      source,
      target: target.key,
      amount: Number(amount.toFixed(4)),
      attack: Number((0.008 + (1 - reactivity.beatSync) * 0.03 + reactivity.smoothing * 0.06).toFixed(3)),
      release: Number((0.07 + reactivity.smoothing * 0.55).toFixed(3)),
      sensitivity: 1,
      threshold: Number((0.02 + reactivity.smoothing * 0.06).toFixed(3)),
      invert: false,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Layers                                                              */
/* ------------------------------------------------------------------ */

interface LayerTiming {
  start: number;
  end: number;
}

function fadeKeyframes(layer: Layer, timing: LayerTiming, baseOpacity: number): void {
  const span = timing.end - timing.start;
  if (span < 2.5) return;
  const fadeIn = Math.min(0.7, span * 0.12);
  const fadeOut = Math.min(0.9, span * 0.16);
  layer.keyframes.push(
    {
      id: uid('kf'),
      path: 'transform.opacity',
      time: timing.start,
      value: 0,
      easing: 'easeOut',
    },
    {
      id: uid('kf'),
      path: 'transform.opacity',
      time: timing.start + fadeIn,
      value: baseOpacity,
      easing: 'linear',
    },
    {
      id: uid('kf'),
      path: 'transform.opacity',
      time: timing.end - fadeOut,
      value: baseOpacity,
      easing: 'easeIn',
    },
    {
      id: uid('kf'),
      path: 'transform.opacity',
      time: timing.end,
      value: 0,
      easing: 'linear',
    },
  );
}

interface TemplateLayerOptions {
  timing: LayerTiming;
  palette: Palette;
  section: SectionPlan;
  role: 'main' | 'support';
  index: number;
  seed: number;
  id?: string;
}

function templateLayer(
  def: TemplateDef,
  config: WizardConfig,
  options: TemplateLayerOptions,
): Layer {
  const layer = createLayerFromTemplate(def, options.timing.start, options.timing.end);
  if (options.id) layer.id = options.id;
  layer.name = options.role === 'main' ? def.name : `${def.name} · overlay`;
  layer.palette = { ...options.palette };
  layer.seed = pseudoSeed(options.seed, options.index);
  layer.blend = options.role === 'main' ? 'normal' : 'screen';
  const opacity =
    options.role === 'main'
      ? 1
      : clamp(0.35 + config.reactivity.particle * 0.35, 0.25, 0.8);
  layer.transform = { ...identityTransform(), opacity };
  const routes = options.role === 'main' ? 4 : 2;
  layer.modulation = createModulation(def, config, routes, options.section.intensity);
  layer.effects = [];
  fadeKeyframes(layer, options.timing, opacity);
  return layer;
}

interface TextOptions {
  name: string;
  copy: string;
  kind: 'title' | 'artist' | 'meta' | 'compact' | 'custom';
  timing: LayerTiming;
  palette: Palette;
  config: WizardConfig;
  role: SectionPlan['role'];
  seed: number;
  index: number;
  id?: string;
}

interface TextPlacement {
  x: number;
  y: number;
  scale: number;
}

function textPlacement(
  config: WizardConfig,
  kind: TextOptions['kind'],
  role: SectionPlan['role'],
): TextPlacement {
  const layout = config.branding.layout;
  const centred = layout === 'centre' || role === 'intro';
  if (kind === 'compact') {
    return { x: 0, y: -0.32, scale: 0.28 };
  }
  if (kind === 'custom') {
    return centred
      ? { x: 0, y: role === 'intro' ? 0.3 : -0.02, scale: 0.24 }
      : { x: 0, y: -0.4, scale: 0.2 };
  }
  if (layout === 'corner') {
    const base = { x: -0.34, y: -0.3 };
    if (kind === 'title') return { x: base.x, y: base.y, scale: 0.44 };
    if (kind === 'artist') return { x: base.x, y: base.y + 0.1, scale: 0.22 };
    return { x: base.x, y: base.y - 0.1, scale: 0.15 };
  }
  if (centred) {
    if (kind === 'title') return { x: 0, y: 0.02, scale: 0.6 };
    if (kind === 'artist') return { x: 0, y: 0.14, scale: 0.24 };
    return { x: 0, y: -0.12, scale: 0.16 };
  }
  if (kind === 'title') return { x: 0, y: -0.28, scale: 0.52 };
  if (kind === 'artist') return { x: 0, y: -0.2, scale: 0.2 };
  return { x: 0, y: -0.37, scale: 0.14 };
}

function textLayer(options: TextOptions): Layer | null {
  const copy = options.copy.trim();
  if (!copy) return null;
  const preset = typographyPreset(options.config.branding.typographyId);
  const effect = textEffectFor(preset.textEffect);
  const placed = textPlacement(options.config, options.kind, options.role);
  const uppercase = preset.uppercase ? copy.toUpperCase() : copy;
  const layer: Layer = {
    id: options.id ?? uid('layer'),
    name: options.name,
    type: 'text',
    visible: true,
    locked: false,
    solo: false,
    groupId: null,
    transform: {
      ...identityTransform(),
      x: placed.x,
      y: placed.y,
      scaleX: placed.scale * preset.fontSize,
      scaleY: placed.scale * preset.fontSize,
    },
    blend: 'screen',
    palette: {
      a: options.palette.a,
      b: options.palette.b,
      c: options.palette.c,
      d: options.palette.d,
      background: options.palette.background,
    },
    params: {
      fontSize: 1,
      weight: preset.weight,
      letterSpacing: preset.tracking,
      ...defaultTextEffectParams(effect),
    },
    effects: [],
    modulation: [],
    keyframes: [],
    start: options.timing.start,
    end: options.timing.end,
    seed: pseudoSeed(options.seed, options.index + 31),
    text: uppercase,
    textEffect: effect.id,
  };
  return layer;
}

function sectionTextLayers(
  config: WizardConfig,
  section: SectionPlan,
  timing: LayerTiming,
  palette: Palette,
  seed: number,
  idPrefix?: string,
): Layer[] {
  if (!config.branding.enabled) return [];
  const branding = config.branding;
  const full = section.role === 'intro' || section.role === 'outro' || config.scenes.mode === 'single';
  const layers: Layer[] = [];
  let index = 0;
  const add = (kind: TextOptions['kind'], name: string, copy: string): void => {
    const layer = textLayer({
      name,
      copy,
      kind,
      timing,
      palette,
      config,
      role: section.role,
      seed,
      index: index++,
      id: idPrefix ? `${idPrefix}_text_${kind}` : undefined,
    });
    if (layer) layers.push(layer);
  };

  if (full) {
    add('artist', 'Artist', branding.artist);
    add('title', 'Track Title', branding.title);
    add('meta', 'Release Info', [branding.album, branding.label, branding.releaseDate].filter(Boolean).join(' · '));
    add('custom', 'Custom Text', branding.customText);
  } else if (branding.alwaysShowTitle) {
    const compact = [branding.artist, branding.title].filter((value) => value.trim().length > 0);
    add('compact', 'Track Credit', compact.join('  ·  '));
  }
  return layers;
}

/* ------------------------------------------------------------------ */
/* Effects                                                             */
/* ------------------------------------------------------------------ */

const SCALED_EFFECT_PARAMS = new Set([
  'intensity',
  'strength',
  'gain',
  'amount',
  'mix',
  'bloomMix',
  'density',
  'warp',
  'noise',
  'chroma',
  'dropout',
  'radius',
  'spread',
]);

function makeEffect(type: EffectType, intensity: number, appearance: WizardConfig['appearance']): EffectInstance | null {
  const def: EffectDef | undefined = EFFECT_DEF_MAP[type];
  if (!def) return null;
  const params = defaultEffectParams(def);
  for (const key of Object.keys(params)) {
    if (!SCALED_EFFECT_PARAMS.has(key)) continue;
    const param = def.params.find((item) => item.key === key);
    if (!param) continue;
    let scaled = params[key] * intensity;
    if (type === 'bloom' && key === 'gain') scaled = 0.7 + appearance.bloom * 1.5;
    if (type === 'bloom' && key === 'bloomMix') scaled = 0.35 + appearance.bloom * 0.6;
    if (type === 'glow' && key === 'strength') scaled = 0.25 + appearance.glow * 1.6;
    params[key] = clamp(scaled, param.min, param.max);
  }
  return {
    id: uid('fx'),
    type,
    enabled: true,
    params,
  };
}

function sceneEffects(config: WizardConfig, section: SectionPlan): EffectInstance[] {
  const effects = [...config.effects.enabled];
  if (config.appearance.bloom > 0.5 && !effects.includes('bloom')) effects.unshift('bloom');
  if (config.appearance.glow > 0.65 && !effects.includes('glow')) effects.push('glow');
  const intensity =
    config.creative.effectIntensity *
    (0.55 + config.appearance.lighting * 0.6) *
    (section.role === 'intro' || section.role === 'outro' ? 0.82 : 1);
  const out: EffectInstance[] = [];
  for (const type of unique(effects).slice(0, 6)) {
    const effect = makeEffect(type, clamp(intensity, 0.15, 2), config.appearance);
    if (effect) out.push(effect);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Scenes                                                              */
/* ------------------------------------------------------------------ */

function sceneBackground(palette: Palette, role: SectionPlan['role']): [string, string] {
  const base = role === 'intro' || role === 'outro' ? mixHex(palette.background, '#000000', 0.25) : palette.background;
  return [base, mixHex(base, palette.b, role === 'intro' ? 0.06 : 0.12)];
}

function sectionMarkers(
  section: SectionPlan,
  track: AnalysisTrackLike | null,
  local: boolean,
): Marker[] {
  const markers: Marker[] = [
    {
      id: uid('mk'),
      time: 0,
      label: section.label,
      color: '#22d3ee',
      kind: 'section',
    },
  ];
  if (track && track.downbeats.length > 0) {
    let count = 0;
    for (const time of track.downbeats) {
      const mapped = local ? time - section.start : time;
      if (mapped <= 0) continue;
      if (mapped >= (local ? section.duration : track.duration)) break;
      markers.push({ id: uid('mk'), time: mapped, label: 'Bar', color: '#8b5cf6', kind: 'beat' });
      count++;
      if (count >= 64) break;
    }
  }
  return markers;
}

interface AnalysisTrackLike {
  duration: number;
  downbeats: Float32Array;
}

interface SceneBuildOptions {
  section: SectionPlan;
  timing: LayerTiming;
  sceneDuration: number;
  palette: Palette;
  config: WizardConfig;
  defs: TemplateDef[];
  seed: number;
  track: AnalysisTrackLike | null;
  localMarkers: boolean;
  idPrefix?: string;
  name?: string;
  isFirst: boolean;
}

function buildScene(options: SceneBuildOptions): Scene {
  const { config, defs, palette, section, timing } = options;
  const layers: Layer[] = [];
  const maxLayers = Math.max(1, config.creative.maxLayers);
  const templateBudget = Math.max(1, Math.min(defs.length, maxLayers));

  for (let i = 0; i < templateBudget; i++) {
    const def = defs[i];
    if (!def) break;
    layers.push(
      templateLayer(def, config, {
        timing,
        palette,
        section,
        role: i === 0 ? 'main' : 'support',
        index: i,
        seed: options.seed,
        id: options.idPrefix ? `${options.idPrefix}_visual_${i}` : undefined,
      }),
    );
  }

  const textBudget = Math.max(0, maxLayers - templateBudget);
  if (config.branding.enabled) {
    const textLayers = sectionTextLayers(
      config,
      section,
      timing,
      palette,
      options.seed,
      options.idPrefix,
    );
    // Branding always gets at least one line, even when the templates already
    // use the whole layer budget — the artist/title must never silently vanish.
    layers.push(...textLayers.slice(0, Math.max(1, textBudget + 1)));
  }

  return {
    id: uid('scene'),
    name: options.name ?? section.label,
    layers,
    duration: Math.max(0.1, options.sceneDuration),
    markers: sectionMarkers(section, options.track, options.localMarkers),
    transitionIn:
      options.isFirst
        ? { type: 'none', duration: 0 }
        : {
            type: config.scenes.transition,
            duration: clamp(
              config.scenes.transitionSeconds,
              0,
              Math.min(2, options.sceneDuration * 0.25),
            ),
          },
    bgColors: sceneBackground(palette, section.role),
    bgMode: 'gradient',
    effects: sceneEffects(config, section),
  };
}

/* ------------------------------------------------------------------ */
/* Project                                                             */
/* ------------------------------------------------------------------ */

function contextDuration(context: WizardContext): number {
  const trackDuration = context.track?.duration ?? 0;
  const audioDuration = context.audioRef?.duration ?? context.audioDuration ?? 0;
  const duration = trackDuration || audioDuration || context.fallbackDuration || 180;
  return Math.max(4, Math.min(3600, duration));
}

function projectName(config: WizardConfig, context: WizardContext): string {
  const { artist, title } = config.branding;
  if (artist.trim() && title.trim()) return `${artist.trim()} — ${title.trim()}`;
  if (title.trim()) return title.trim();
  if (context.audioName) return context.audioName.replace(/\.[a-z0-9]{2,5}$/i, '');
  return 'Wizard Composition';
}

function resolveTemplates(config: WizardConfig): { defs: TemplateDef[]; warnings: string[] } {
  const warnings: string[] = [];
  const style = stylePreset(config.styleId);
  const wanted = [config.mainTemplateId, ...config.supportingTemplateIds];
  const defs = availableTemplates(wanted);

  if (defs.length === 0) {
    const styleDefs = availableTemplates(style.templates);
    if (styleDefs.length > 0) {
      warnings.push(`Template “${config.mainTemplateId}” is not installed — using ${styleDefs[0].name}.`);
      return { defs: styleDefs, warnings };
    }
    const fallback = fallbackTemplate();
    if (fallback) {
      warnings.push('No selected template is installed — using the first available template.');
      return { defs: [fallback], warnings };
    }
    return { defs: [], warnings };
  }

  if (defs.length < wanted.length) {
    warnings.push('Some selected templates are no longer installed; skipped them.');
  }
  return { defs, warnings };
}

function exportSettingsFor(config: WizardConfig): Project['exportSettings'] {
  return {
    ...defaultExportSettings(),
    codec: config.output.codec,
    width: config.output.width,
    height: config.output.height,
    fps: config.output.fps,
    bitrateMbps: config.output.bitrateMbps,
    crf: config.output.crf,
    audioCodec: config.output.audioCodec,
    audioBitrateKbps: config.output.audioBitrateKbps,
    encoder: config.output.encoder,
    quality: 'high',
    sceneId: null,
    rangeStart: 0,
    rangeEnd: null,
  };
}

/**
 * Convert a validated wizard configuration into a complete project.
 * The caller decides when to apply it, so cancelling the wizard can never
 * damage the document the user is already editing.
 */
export function generateProject(configInput: WizardConfig, context: WizardContext): GenerationResult {
  const config = normalizeConfig(configInput, createDefaultConfig({ seed: configInput.creative.seed }));
  const summary = analyzeTrackSummary(context.track);
  const duration = contextDuration(context);
  const bpm = config.bpmOverride ?? summary.bpm ?? context.audioRef?.bpm ?? 120;
  const { sections, notes } = planSections(config, duration, context.track, bpm);
  const palette = gradePalette(config.palette, {
    saturation: config.appearance.saturation,
    brightness: config.appearance.brightness,
    contrast: config.appearance.contrast,
  });
  const resolved = resolveTemplates(config);
  const defs = resolved.defs;
  const warnings = [...resolved.warnings];
  const seed = config.creative.seed;
  const now = new Date().toISOString();

  let scenes: Scene[] = [];
  const singleScene = config.scenes.mode === 'single';

  if (singleScene) {
    const section = sections[0];
    scenes = [
      buildScene({
        section,
        timing: { start: 0, end: duration },
        sceneDuration: duration,
        palette,
        config,
        defs,
        seed,
        track: context.track,
        localMarkers: false,
        name: 'Main',
        isFirst: true,
      }),
    ];
  } else {
    scenes = sections.map((section, index) =>
      buildScene({
        section,
        timing: { start: 0, end: section.duration },
        sceneDuration: section.duration,
        palette,
        config,
        defs,
        seed: seed + index * 101,
        track: context.track,
        localMarkers: true,
        name: section.label,
        isFirst: index === 0,
      }),
    );
  }

  const layerCount = scenes.reduce((count, scene) => count + scene.layers.length, 0);

  const audio: AudioRef | null = context.audioRef
    ? {
        ...context.audioRef,
        duration: context.audioRef.duration || duration,
        bpm,
      }
    : null;

  const project: Project = {
    formatVersion: FORMAT_VERSION,
    id: uid('project'),
    name: projectName(config, context),
    audio,
    assets: [],
    scenes,
    activeSceneId: scenes[0]?.id ?? uid('scene'),
    exportSettings: exportSettingsFor(config),
    createdAt: now,
    modifiedAt: now,
  };

  if (layerCount === 0) {
    warnings.push('No layers were generated. Check the template selection.');
  }

  return {
    project,
    summary,
    sections,
    notes,
    warnings,
    layerCount,
    templateNames: defs.map((def) => def.name),
  };
}

/* ------------------------------------------------------------------ */
/* Preview                                                             */
/* ------------------------------------------------------------------ */

/**
 * A compact, single-scene project for the wizard's live preview.
 *
 * Stable ids keep the preview's GPU programs and text textures cached between
 * renders; generating new ids on every keystroke would recompile constantly.
 */
export function buildPreviewScene(configInput: WizardConfig, context: WizardContext): Scene {
  const config = normalizeConfig(configInput, createDefaultConfig({ seed: configInput.creative.seed }));
  const duration = Math.max(6, Math.min(context.track?.duration ?? context.audioDuration ?? 18, 24));
  const palette = gradePalette(config.palette, {
    saturation: config.appearance.saturation,
    brightness: config.appearance.brightness,
    contrast: config.appearance.contrast,
  });
  const { defs } = resolveTemplates(config);
  const section: SectionPlan = {
    index: 0,
    label: 'Preview',
    role: 'intro',
    start: 0,
    end: duration,
    duration,
    intensity: 1,
  };
  const scene = buildScene({
    section,
    timing: { start: 0, end: duration },
    sceneDuration: duration,
    palette,
    config,
    defs: defs.slice(0, Math.max(1, Math.min(defs.length, config.creative.maxLayers))),
    seed: config.creative.seed,
    track: null,
    localMarkers: false,
    idPrefix: 'wizpreview',
    name: 'Preview',
    isFirst: true,
  });
  return scene;
}

/** Unique signature used to decide when the preview must be rebuilt. */
export function previewSignature(config: WizardConfig): string {
  return JSON.stringify({
    style: config.styleId,
    main: config.mainTemplateId,
    support: config.supportingTemplateIds,
    palette: config.palette,
    appearance: config.appearance,
    effects: config.effects,
    reactivity: config.reactivity,
    branding: config.branding,
    creative: config.creative,
    size: [config.output.width, config.output.height],
  });
}
