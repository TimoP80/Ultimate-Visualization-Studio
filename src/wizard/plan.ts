/**
 * Pure planning logic for the wizard: track summary, style recommendation,
 * section layout and configuration validation.
 *
 * Nothing here imports React, the registry or WebGL, which keeps it testable in
 * Node and reusable by both the UI (live summaries) and the generator.
 */

import type { AnalysisTrack } from '@/audio/analysis';
import { SC } from '@/audio/bands';
import { clamp } from '@/timeline/easing';
import { stylePreset } from './presets';
import type { ReactivityProfile } from './presets';
import { REACTIVITY_PROFILES } from './presets';
import type { WizardConfig, WizardContext, WizardReactivity } from './types';

const MIN_SECTION_SECONDS = 1.5;

/* ------------------------------------------------------------------ */
/* Track summary                                                       */
/* ------------------------------------------------------------------ */

export interface TrackSummary {
  analysed: boolean;
  bpm: number;
  duration: number;
  kick: number;
  bass: number;
  mid: number;
  high: number;
  energy: number;
  brightness: number;
  dynamicRange: number;
  beatCount: number;
  downbeatCount: number;
}

export const EMPTY_SUMMARY: TrackSummary = {
  analysed: false,
  bpm: 0,
  duration: 0,
  kick: 0,
  bass: 0,
  mid: 0,
  high: 0,
  energy: 0,
  brightness: 0,
  dynamicRange: 0,
  beatCount: 0,
  downbeatCount: 0,
};

/** Average band energies and dynamics, computed from the analysis cache. */
export function analyzeTrackSummary(track: AnalysisTrack | null): TrackSummary {
  if (!track || track.frameCount < 2) return { ...EMPTY_SUMMARY, duration: track?.duration ?? 0 };
  const frames = track.frameCount;
  const stride = Math.max(1, Math.floor(frames / 1600));
  let bass = 0;
  let mid = 0;
  let high = 0;
  let kick = 0;
  let energy = 0;
  let centroid = 0;
  let count = 0;
  const rms: number[] = [];

  for (let f = 0; f < frames; f += stride) {
    const base = f * 16;
    bass += track.scalars[base + SC.bass] + track.scalars[base + SC.subBass];
    mid += track.scalars[base + SC.lowMid] + track.scalars[base + SC.mid];
    high += track.scalars[base + SC.highMid] + track.scalars[base + SC.treble] + track.scalars[base + SC.air];
    kick += track.scalars[base + SC.kick];
    energy += track.scalars[base + SC.energy];
    centroid += track.scalars[base + SC.centroid];
    rms.push(track.scalars[base + SC.rms]);
    count++;
  }
  if (count === 0) return { ...EMPTY_SUMMARY, duration: track.duration };
  rms.sort((a, b) => a - b);
  const low = rms[Math.floor(rms.length * 0.1)] ?? 0;
  const highPercentile = rms[Math.floor(rms.length * 0.9)] ?? 0;

  return {
    analysed: true,
    bpm: track.bpm,
    duration: track.duration,
    kick: clamp(kick / count, 0, 1),
    bass: clamp(bass / (count * 2), 0, 1),
    mid: clamp(mid / (count * 2), 0, 1),
    high: clamp(high / (count * 3), 0, 1),
    energy: clamp(energy / count, 0, 1),
    brightness: clamp(centroid / count, 0, 1),
    dynamicRange: clamp(highPercentile - low, 0, 1),
    beatCount: track.beats.length,
    downbeatCount: track.downbeats.length,
  };
}

/* ------------------------------------------------------------------ */
/* Recommendations                                                     */
/* ------------------------------------------------------------------ */

export interface StyleRecommendation {
  styleId: string;
  reason: string;
}

/** Pick a style from measured tempo, brightness and low-end weight. */
export function recommendStyle(summary: TrackSummary): StyleRecommendation {
  if (!summary.analysed) {
    return { styleId: 'cyberpunk', reason: 'A balanced default until a track is analysed.' };
  }
  const bpm = summary.bpm;
  if (bpm >= 168) {
    if (summary.brightness > 0.3 && summary.high > summary.bass * 0.85) {
      return { styleId: 'dnb', reason: `${Math.round(bpm)} BPM with bright percussion — drum & bass range.` };
    }
    return { styleId: 'hardcore', reason: `${Math.round(bpm)} BPM with a heavy low end.` };
  }
  if (bpm >= 152) {
    return summary.kick > 0.45
      ? { styleId: 'hardcore', reason: `${Math.round(bpm)} BPM and hard transient density.` }
      : { styleId: 'hardstyle', reason: `${Math.round(bpm)} BPM with a big-room kick.` };
  }
  if (bpm >= 138) {
    return summary.kick > 0.48
      ? { styleId: 'rave', reason: `${Math.round(bpm)} BPM with a rave-weight kick.` }
      : { styleId: 'techno', reason: `${Math.round(bpm)} BPM, steady and industrial.` };
  }
  if (bpm >= 122) {
    return summary.bass > 0.55
      ? { styleId: 'cyberpunk', reason: `${Math.round(bpm)} BPM with strong bass energy.` }
      : { styleId: 'techno', reason: `${Math.round(bpm)} BPM with a restrained low end.` };
  }
  if (bpm >= 104) {
    return summary.brightness < 0.4
      ? { styleId: 'synthwave', reason: `${Math.round(bpm)} BPM, warm and mid-forward.` }
      : { styleId: 'trance', reason: `${Math.round(bpm)} BPM with an open top end.` };
  }
  if (summary.energy < 0.22) {
    return { styleId: 'ambient', reason: `${Math.round(bpm)} BPM and low overall energy.` };
  }
  return { styleId: 'cinematic', reason: `${Math.round(bpm)} BPM with a slow, wide dynamic shape.` };
}

export interface ReactivityRecommendation {
  profileId: string;
  values: WizardReactivity;
  reason: string;
}

function blend(a: WizardReactivity, b: WizardReactivity, amount: number): WizardReactivity {
  const mix = (x: number, y: number): number => x + (y - x) * amount;
  return {
    bass: mix(a.bass, b.bass),
    kick: mix(a.kick, b.kick),
    mid: mix(a.mid, b.mid),
    high: mix(a.high, b.high),
    beatSync: mix(a.beatSync, b.beatSync),
    particle: mix(a.particle, b.particle),
    speed: mix(a.speed, b.speed),
    smoothing: mix(a.smoothing, b.smoothing),
    pulse: mix(a.pulse, b.pulse),
  };
}

function profileById(id: string): ReactivityProfile {
  return REACTIVITY_PROFILES.find((profile) => profile.id === id) ?? REACTIVITY_PROFILES[1];
}

/** Blend the style's response curve with a profile chosen from measured energy. */
export function recommendReactivity(
  styleId: string,
  summary: TrackSummary,
): ReactivityRecommendation {
  if (!summary.analysed) {
    return {
      profileId: 'balanced',
      values: { ...profileById('balanced').values },
      reason: 'Balanced response until a track is analysed.',
    };
  }
  let profileId = 'balanced';
  if (summary.kick > 0.68 && summary.bpm >= 160) profileId = 'extreme';
  else if (summary.kick > 0.5 || summary.bpm >= 145) profileId = 'aggressive';
  else if (summary.energy < 0.2) profileId = 'subtle';
  else if (summary.bpm >= 118 || summary.energy > 0.42) profileId = 'energetic';

  const style = stylePreset(styleId);
  const values = blend(style.reactivity, profileById(profileId).values, 0.45);
  values.kick = clamp(values.kick + (summary.kick - 0.35) * 0.35, 0, 1);
  values.bass = clamp(values.bass + (summary.bass - 0.35) * 0.3, 0, 1);
  values.smoothing = clamp(values.smoothing + (0.25 - summary.energy) * 0.4, 0, 1);

  const reason =
    profileId === 'extreme'
      ? 'Dense kicks at high tempo — extreme response.'
      : profileId === 'aggressive'
        ? 'Hard transients — aggressive response.'
        : profileId === 'subtle'
          ? 'Low overall energy — subtle response.'
          : profileId === 'energetic'
            ? 'Busy, energetic material — energetic response.'
            : 'Even dynamics — balanced response.';
  return { profileId, values, reason };
}

/* ------------------------------------------------------------------ */
/* Section planning                                                    */
/* ------------------------------------------------------------------ */

export type SectionRole = 'intro' | 'main' | 'outro' | 'section';

export interface SectionPlan {
  index: number;
  label: string;
  role: SectionRole;
  /** Absolute seconds on the track. */
  start: number;
  end: number;
  duration: number;
  /** Relative visual intensity (modulation depth, supporting layers). */
  intensity: number;
}

interface BoundarySource {
  downbeats: Float32Array | null;
  beats: Float32Array | null;
  bpm: number;
}

function boundarySource(track: AnalysisTrack | null, bpm: number): BoundarySource {
  return {
    downbeats: track && track.downbeats.length > 0 ? track.downbeats : null,
    beats: track && track.beats.length > 0 ? track.beats : null,
    bpm: bpm > 0 ? bpm : track?.bpm ?? 120,
  };
}

function snapToDownbeat(time: number, source: BoundarySource, tolerance: number): number {
  if (!source.downbeats) return time;
  let best = time;
  let bestDistance = tolerance;
  for (const candidate of source.downbeats) {
    const distance = Math.abs(candidate - time);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

/** Snap an interior boundary, but keep both adjacent sections usable. */
function interiorBoundary(
  desired: number,
  previous: number,
  limit: number,
  source: BoundarySource,
  tolerance: number,
): number {
  const snapped = snapToDownbeat(desired, source, tolerance);
  return clamp(snapped, previous + MIN_SECTION_SECONDS, limit - MIN_SECTION_SECONDS);
}

function finishSections(
  raw: { start: number; end: number; role: SectionRole; label: string; intensity: number }[],
  total: number,
): SectionPlan[] {
  const sections: SectionPlan[] = [];
  for (const item of raw) {
    const start = clamp(item.start, 0, total - MIN_SECTION_SECONDS);
    const end = clamp(item.end, start + MIN_SECTION_SECONDS, total);
    if (end - start < MIN_SECTION_SECONDS - 1e-6) continue;
    sections.push({
      index: sections.length,
      label: item.label,
      role: item.role,
      start,
      end,
      duration: end - start,
      intensity: item.intensity,
    });
  }
  if (sections.length === 0) {
    sections.push({
      index: 0,
      label: 'Main',
      role: 'main',
      start: 0,
      end: Math.max(MIN_SECTION_SECONDS, total),
      duration: Math.max(MIN_SECTION_SECONDS, total),
      intensity: 1,
    });
  }
  return sections;
}

/**
 * Lay out the composition in time. All boundaries come from the detected
 * downbeats/beats when they exist; equal division is only a fallback and is
 * reported through the returned notes, so the UI never claims a musical
 * boundary that was not detected.
 */
export function planSections(
  config: WizardConfig,
  duration: number,
  track: AnalysisTrack | null,
  bpm: number,
): { sections: SectionPlan[]; notes: string[] } {
  const total = Math.max(MIN_SECTION_SECONDS * 2, duration || 180);
  const source = boundarySource(track, bpm);
  const notes: string[] = [];
  const mode = config.scenes.mode;
  const tolerance = Math.max(0.4, total * 0.03);

  if (mode === 'single') {
    return {
      sections: finishSections(
        [{ start: 0, end: total, role: 'main', label: 'Main', intensity: 1 }],
        total,
      ),
      notes,
    };
  }

  if (mode === 'arc') {
    const introWanted = Math.min(config.scenes.introSeconds, total * 0.3);
    const outroWanted = Math.min(config.scenes.outroSeconds, total * 0.3);
    let intro = introWanted;
    let outro = outroWanted;
    if (total - intro - outro < MIN_SECTION_SECONDS * 2) {
      const scale = Math.max(0, total - MIN_SECTION_SECONDS * 2) / Math.max(1, intro + outro);
      intro *= scale;
      outro *= scale;
      notes.push('Track is short — intro and outro were shortened to leave a main section.');
    }
    const mainStart = intro;
    const mainEnd = total - outro;
    const raw: { start: number; end: number; role: SectionRole; label: string; intensity: number }[] = [];
    if (intro >= MIN_SECTION_SECONDS) {
      raw.push({ start: 0, end: mainStart, role: 'intro', label: 'Intro', intensity: 0.62 });
    }
    if (mainEnd - mainStart >= MIN_SECTION_SECONDS) {
      const split = config.creative.complexity > 0.6 && mainEnd - mainStart > 20;
      if (split) {
        const cut = interiorBoundary(
          mainStart + (mainEnd - mainStart) * 0.55,
          mainStart,
          mainEnd,
          source,
          tolerance,
        );
        raw.push({
          start: mainStart,
          end: cut,
          role: 'main',
          label: 'Main I',
          intensity: 0.95,
        });
        raw.push({ start: cut, end: mainEnd, role: 'main', label: 'Main II', intensity: 1.1 });
      } else {
        raw.push({ start: mainStart, end: mainEnd, role: 'main', label: 'Main', intensity: 1 });
      }
    }
    if (outro >= MIN_SECTION_SECONDS) {
      raw.push({ start: mainEnd, end: total, role: 'outro', label: 'Outro', intensity: 0.7 });
    }
    if (raw.length < 2) notes.push('No musical boundaries were detected; the arc uses fixed times.');
    return { sections: finishSections(raw, total), notes };
  }

  if (mode === 'beat') {
    const bars = Math.max(1, config.scenes.barsPerCut);
    const beatsPerBar = 4;
    const step = bars * beatsPerBar;
    const cuts: number[] = [];
    if (source.beats && source.beats.length > step) {
      for (let i = step; i < source.beats.length; i += step) {
        const time = source.beats[i];
        if (time >= total - MIN_SECTION_SECONDS) break;
        if (cuts.length > 0 && time - cuts[cuts.length - 1] < MIN_SECTION_SECONDS) continue;
        cuts.push(time);
        if (cuts.length >= 30) break;
      }
    }
    if (cuts.length === 0) {
      const beatSeconds = 60 / Math.max(40, source.bpm);
      const interval = Math.max(MIN_SECTION_SECONDS, step * beatSeconds);
      for (let time = interval; time < total - MIN_SECTION_SECONDS; time += interval) cuts.push(time);
      notes.push(
        track && track.beats.length > 0
          ? 'The track is too short for that many bars — cuts fall back to a fixed grid.'
          : 'No beat grid available — cuts use the detected tempo instead of transients.',
      );
    }
    const raw = [] as { start: number; end: number; role: SectionRole; label: string; intensity: number }[];
    let start = 0;
    for (const cut of cuts) {
      raw.push({
        start,
        end: cut,
        role: 'section',
        label: `Section ${String(raw.length + 1).padStart(2, '0')}`,
        intensity: 0.95 + (raw.length % 2 === 0 ? 0 : 0.1),
      });
      start = cut;
    }
    raw.push({
      start,
      end: total,
      role: 'section',
      label: `Section ${String(raw.length + 1).padStart(2, '0')}`,
      intensity: 1,
    });
    return { sections: finishSections(raw, total), notes };
  }

  if (mode === 'custom') {
    const count = Math.max(1, config.scenes.sectionCount);
    const intro = Math.min(config.scenes.introSeconds, total * 0.3);
    const outro = Math.min(config.scenes.outroSeconds, total * 0.3);
    const middle = Math.max(MIN_SECTION_SECONDS, total - intro - outro);
    const raw = [] as { start: number; end: number; role: SectionRole; label: string; intensity: number }[];
    if (intro >= MIN_SECTION_SECONDS) {
      raw.push({ start: 0, end: intro, role: 'intro', label: 'Intro', intensity: 0.62 });
    }
    let cursor = intro;
    for (let i = 0; i < count; i++) {
      const desired = intro + (middle * (i + 1)) / count;
      const end =
        i === count - 1
          ? total - outro
          : interiorBoundary(desired, cursor, total - outro, source, tolerance);
      raw.push({
        start: cursor,
        end,
        role: 'section',
        label: `Section ${String(i + 1).padStart(2, '0')}`,
        intensity: 0.9 + (i / Math.max(1, count - 1)) * 0.2,
      });
      cursor = end;
    }
    if (outro >= MIN_SECTION_SECONDS) {
      raw.push({ start: Math.max(cursor, total - outro), end: total, role: 'outro', label: 'Outro', intensity: 0.7 });
    }
    if (!source.downbeats) notes.push('No downbeats detected — custom sections are evenly spaced.');
    return { sections: finishSections(raw, total), notes };
  }

  // 'scenes' — automatic section count, boundaries snapped to musical events.
  const count = clamp(Math.round(2 + config.creative.complexity * 3), 2, 5);
  const raw = [] as { start: number; end: number; role: SectionRole; label: string; intensity: number }[];
  let cursor = 0;
  for (let i = 0; i < count; i++) {
    const desired = (total * (i + 1)) / count;
    const end =
      i === count - 1
        ? total
        : interiorBoundary(desired, cursor, total, source, tolerance);
    raw.push({
      start: cursor,
      end,
      role: i === 0 ? 'intro' : i === count - 1 ? 'outro' : 'section',
      label: `Section ${String(i + 1).padStart(2, '0')}`,
      intensity: i === 0 ? 0.8 : i === count - 1 ? 0.78 : 0.95 + (i % 2) * 0.12,
    });
    cursor = end;
  }
  if (!source.downbeats) {
    notes.push('No downbeats detected — sections are evenly spaced over the track.');
  }
  return { sections: finishSections(raw, total), notes };
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

export interface WizardValidation {
  errors: string[];
  warnings: string[];
}

export function validateConfig(config: WizardConfig, context: WizardContext): WizardValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!config.mainTemplateId) errors.push('Choose a main template before generating.');
  if (!Number.isFinite(config.output.width) || !Number.isFinite(config.output.height)) {
    errors.push('Output dimensions are not valid.');
  }
  if (config.output.width < 160 || config.output.height < 90) {
    errors.push('Output resolution is too small.');
  }
  if (config.output.fps < 1) errors.push('Frame rate must be at least 1 fps.');

  if (!context.track && !context.audioRef) {
    warnings.push(
      'No audio is loaded. The visualisation will be generated silently and react once a track is imported.',
    );
  } else if (!context.track) {
    warnings.push(
      'This audio has no analysis cache. Beat-synced structure falls back to the tempo grid until the track is re-imported.',
    );
  }

  const brandedText = [
    config.branding.artist,
    config.branding.title,
    config.branding.album,
    config.branding.label,
    config.branding.releaseDate,
    config.branding.customText,
  ].some((value) => value.trim().length > 0);
  if (config.branding.enabled && !brandedText) {
    warnings.push('Branding is enabled but every text field is empty — no text layers will be created.');
  }

  if (config.effects.enabled.length > 5) {
    warnings.push(
      `${config.effects.enabled.length} effects are stacked; preview and 4K export may drop frames.`,
    );
  }

  if (config.creative.maxLayers < 2) {
    warnings.push('Only one visual layer is allowed — supporting visuals will be skipped.');
  }

  if (config.scenes.mode !== 'single') {
    warnings.push(
      'This structure creates separate scenes. Switch scenes from the timeline header; Export renders the active scene.',
    );
  }

  const pixels = config.output.width * config.output.height;
  if (pixels >= 3840 * 2160 && config.output.fps >= 50) {
    warnings.push('4K at 50/60 fps is a long encode. Close other GPU-heavy tabs before exporting.');
  }

  return { errors, warnings };
}

/** Layer count the generator is likely to create, for the summary. */
export function estimateLayerCount(config: WizardConfig, sections: number): number {
  const templates = 1 + config.supportingTemplateIds.length;
  const perSection = Math.min(templates, config.creative.maxLayers);
  const textLayers = config.branding.enabled ? Math.max(1, sections) : 0;
  return Math.max(1, sections * perSection + textLayers);
}

export function formatSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}
