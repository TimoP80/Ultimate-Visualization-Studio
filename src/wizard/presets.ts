/**
 * Wizard creative presets.
 *
 * Styles are complete art directions, not just colour swaps: they name the
 * templates that carry the look, the palette, the post-effect stack, the text
 * treatment and the audio-response curve. Everything here is plain data so the
 * generator (and the tests) can reason about it without React or WebGL.
 */

import type { EffectType, Palette } from '@/types';
import type { WizardReactivity, WizardTransition } from './types';

function palette(a: string, b: string, c: string, d: string, background: string): Palette {
  return { a, b, c, d, background };
}

/* ------------------------------------------------------------------ */
/* Colour schemes                                                      */
/* ------------------------------------------------------------------ */

export interface PalettePreset {
  id: string;
  name: string;
  description: string;
  palette: Palette;
}

export const PALETTE_PRESETS: PalettePreset[] = [
  {
    id: 'classic-rave',
    name: 'Classic Rave',
    description: 'Acid green, hot magenta and cyan — the original warehouse palette.',
    palette: palette('#c6ff00', '#ff2d95', '#22d3ee', '#f8fafc', '#05060a'),
  },
  {
    id: 'rotterdam',
    name: 'Rotterdam Hardcore',
    description: 'Hazard yellow and signal red over black.',
    palette: palette('#ffd400', '#ff2b2b', '#ffffff', '#d4d9e2', '#080506'),
  },
  {
    id: 'acid',
    name: 'Acid Green',
    description: 'One searing acid tone with a cold cyan counterpoint.',
    palette: palette('#a3ff12', '#22d3ee', '#e6ff9b', '#f1f5f9', '#040805'),
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk Neon',
    description: 'Cyan, violet and magenta with deep blue-black shadows.',
    palette: palette('#22d3ee', '#8b5cf6', '#f472b6', '#e8ebf0', '#05060b'),
  },
  {
    id: 'purple-haze',
    name: 'Purple Haze',
    description: 'Lavender, indigo and a soft rose highlight.',
    palette: palette('#c4b5fd', '#7c3aed', '#f0abfc', '#f5f3ff', '#080514'),
  },
  {
    id: 'blood',
    name: 'Blood Red',
    description: 'Crimson, ember orange and bone white.',
    palette: palette('#ef4444', '#f97316', '#fecdd3', '#f8fafc', '#0a0405'),
  },
  {
    id: 'electric',
    name: 'Electric Blue',
    description: 'Saturated blue with a white-hot core.',
    palette: palette('#3b82f6', '#22d3ee', '#bfdbfe', '#f8fafc', '#04070f'),
  },
  {
    id: 'sunset',
    name: 'Synthwave Sunset',
    description: 'Magenta sky, orange sun and teal grid.',
    palette: palette('#ff4fd8', '#ffb86b', '#22d3ee', '#fff1e6', '#0a0418'),
  },
  {
    id: 'steel',
    name: 'Industrial Steel',
    description: 'Cold galvanised greys with an alarm-red accent.',
    palette: palette('#cbd5e1', '#64748b', '#f43f5e', '#f1f5f9', '#050607'),
  },
  {
    id: 'nebula',
    name: 'Cosmic Nebula',
    description: 'Deep space violets, teal dust and a warm star core.',
    palette: palette('#a78bfa', '#2dd4bf', '#fda4af', '#f8fafc', '#03040d'),
  },
  {
    id: 'mono',
    name: 'Monochrome',
    description: 'Pure black and white, built for shape and motion.',
    palette: palette('#ffffff', '#a1a1aa', '#52525b', '#f4f4f5', '#050505'),
  },
  {
    id: 'custom',
    name: 'Custom Palette',
    description: 'Your own four colours plus background.',
    palette: palette('#22d3ee', '#8b5cf6', '#f472b6', '#e8ebf0', '#07080c'),
  },
];

export function palettePreset(id: string): PalettePreset {
  return PALETTE_PRESETS.find((preset) => preset.id === id) ?? PALETTE_PRESETS[3];
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

export interface StylePreset {
  id: string;
  name: string;
  family: string;
  description: string;
  /** One main + two supporting templates that read as a single look. */
  templates: [string, string, string];
  paletteId: string;
  effects: EffectType[];
  textEffect: string;
  transition: WizardTransition;
  reactivity: WizardReactivity;
  /** 0..1 — used by randomisation and by the scene planner. */
  energy: number;
  tags: string[];
}

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: 'rave',
    name: 'Oldschool Rave',
    family: 'Rave / Gabber',
    description:
      'Strobe-cut slices, hazard plating and acid colour. Built for 150+ BPM and hard kicks.',
    templates: ['hardcore.strobeCuts', 'classic.circularSpectrum', 'hardcore.hazardBars'],
    paletteId: 'classic-rave',
    effects: ['glow', 'rgbSplit', 'filmGrain'],
    textEffect: 'neon',
    transition: 'cut',
    energy: 0.95,
    tags: ['rave', 'gabber', 'strobe', 'hardcore'],
    reactivity: {
      bass: 0.8,
      kick: 1,
      mid: 0.6,
      high: 0.55,
      beatSync: 0.9,
      particle: 0.7,
      speed: 1.45,
      smoothing: 0.12,
      pulse: 0.85,
    },
  },
  {
    id: 'hardcore',
    name: 'Hardcore / Frenchcore',
    family: 'Hardcore',
    description:
      'Brutal reactor spikes and distortion walls. Maximum kick response, minimal decoration.',
    templates: ['hardcore.bassReactor', 'hardcore.distortionWall', 'hardcore.industrialGrate'],
    paletteId: 'rotterdam',
    effects: ['glitch', 'rgbSplit', 'filmGrain'],
    textEffect: 'glitch',
    transition: 'cut',
    energy: 1,
    tags: ['hardcore', 'frenchcore', 'industrial', 'kick'],
    reactivity: {
      bass: 0.95,
      kick: 1,
      mid: 0.55,
      high: 0.4,
      beatSync: 0.95,
      particle: 0.55,
      speed: 1.6,
      smoothing: 0.08,
      pulse: 1,
    },
  },
  {
    id: 'hardstyle',
    name: 'Hardstyle',
    family: 'Hardstyle',
    description:
      'Big-room strobes, radial bars and reverse-bass light rays with a euphoric lead palette.',
    templates: ['hardcore.strobeCuts', 'classic.radialBars', 'misc.warpTunnel'],
    paletteId: 'electric',
    effects: ['bloom', 'lightRays', 'vignette'],
    textEffect: 'chrome',
    transition: 'fadeWhite',
    energy: 0.9,
    tags: ['hardstyle', 'bigroom', 'euphoric', 'strobe'],
    reactivity: {
      bass: 0.85,
      kick: 0.95,
      mid: 0.7,
      high: 0.6,
      beatSync: 0.85,
      particle: 0.7,
      speed: 1.3,
      smoothing: 0.16,
      pulse: 0.8,
    },
  },
  {
    id: 'techno',
    name: 'Techno / Industrial',
    family: 'Techno',
    description:
      'Circuit-board traces and moiré interference in cold steel. Restrained motion, relentless pulse.',
    templates: ['electronic.circuitPulse', 'hardcore.industrialGrate', 'misc.moireBands'],
    paletteId: 'steel',
    effects: ['glow', 'scanlines', 'vignette'],
    textEffect: 'outline',
    transition: 'crossfade',
    energy: 0.7,
    tags: ['techno', 'industrial', 'minimal', 'circuit'],
    reactivity: {
      bass: 0.7,
      kick: 0.8,
      mid: 0.6,
      high: 0.45,
      beatSync: 0.75,
      particle: 0.4,
      speed: 0.95,
      smoothing: 0.22,
      pulse: 0.55,
    },
  },
  {
    id: 'dnb',
    name: 'Drum & Bass',
    family: 'Drum & Bass',
    description:
      'Mirrored spectra, feedback smears and data rain. Fast transients, tight sub control.',
    templates: ['classic.mirroredSpectrum', 'hardcore.feedbackSmear', 'electronic.dataStream'],
    paletteId: 'cyberpunk',
    effects: ['rgbSplit', 'glitch', 'motionBlur'],
    textEffect: 'neon',
    transition: 'dissolve',
    energy: 0.85,
    tags: ['dnb', 'drumandbass', 'liquid', 'neurofunk'],
    reactivity: {
      bass: 0.9,
      kick: 0.85,
      mid: 0.75,
      high: 0.7,
      beatSync: 0.8,
      particle: 0.6,
      speed: 1.25,
      smoothing: 0.14,
      pulse: 0.7,
    },
  },
  {
    id: 'jungle',
    name: 'Jungle',
    family: 'Jungle / Breaks',
    description:
      'Organic waveform fields and kaleidoscopic breakbeats in warm amber and green.',
    templates: ['classic.frequencyWaveform', 'misc.kaleidoBloom', 'electronic.dataStream'],
    paletteId: 'sunset',
    effects: ['bloom', 'filmGrain', 'vignette'],
    textEffect: 'crt',
    transition: 'dissolve',
    energy: 0.8,
    tags: ['jungle', 'breaks', 'organic', 'amen'],
    reactivity: {
      bass: 0.85,
      kick: 0.8,
      mid: 0.8,
      high: 0.75,
      beatSync: 0.7,
      particle: 0.6,
      speed: 1.15,
      smoothing: 0.2,
      pulse: 0.65,
    },
  },
  {
    id: 'trance',
    name: 'Trance / Psytrance',
    family: 'Trance',
    description:
      'Warp tunnels, circular waveforms and starfields that breathe with the pads and lead.',
    templates: ['misc.warpTunnel', 'classic.circularWaveform', 'misc.starfield'],
    paletteId: 'purple-haze',
    effects: ['bloom', 'lightRays', 'feedback'],
    textEffect: 'gradient',
    transition: 'crossfade',
    energy: 0.75,
    tags: ['trance', 'psytrance', 'melodic', 'hypnotic'],
    reactivity: {
      bass: 0.65,
      kick: 0.75,
      mid: 0.85,
      high: 0.7,
      beatSync: 0.7,
      particle: 0.65,
      speed: 1.05,
      smoothing: 0.3,
      pulse: 0.6,
    },
  },
  {
    id: 'synthwave',
    name: 'Synthwave / Retrowave',
    family: 'Synthwave',
    description:
      'A neon horizon, chrome type and VHS scanlines. Sunset gradients with slow, confident motion.',
    templates: ['electronic.neonGrid', 'classic.horizontalSpectrum', 'misc.starfield'],
    paletteId: 'sunset',
    effects: ['bloom', 'vhs', 'scanlines'],
    textEffect: 'chrome',
    transition: 'fadeBlack',
    energy: 0.6,
    tags: ['synthwave', 'retro', '80s', 'grid'],
    reactivity: {
      bass: 0.7,
      kick: 0.6,
      mid: 0.6,
      high: 0.5,
      beatSync: 0.6,
      particle: 0.5,
      speed: 0.9,
      smoothing: 0.32,
      pulse: 0.5,
    },
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    family: 'Cyberpunk',
    description:
      'HUD reticles, tunnel rings and data streams in cyan and violet. Dense, technical, fast.',
    templates: ['electronic.cyberTunnel', 'electronic.hudReticle', 'electronic.dataStream'],
    paletteId: 'cyberpunk',
    effects: ['bloom', 'rgbSplit', 'glitch'],
    textEffect: 'neon',
    transition: 'cut',
    energy: 0.85,
    tags: ['cyberpunk', 'hud', 'sci-fi', 'neon'],
    reactivity: {
      bass: 0.8,
      kick: 0.8,
      mid: 0.75,
      high: 0.7,
      beatSync: 0.8,
      particle: 0.75,
      speed: 1.2,
      smoothing: 0.16,
      pulse: 0.7,
    },
  },
  {
    id: 'abstract',
    name: 'Abstract / Generative',
    family: 'Abstract',
    description:
      'Plasma, liquid metal and kaleidoscopic symmetry. The music drives form rather than bars.',
    templates: ['misc.plasmaField', 'misc.liquidMetal', 'misc.kaleidoBloom'],
    paletteId: 'nebula',
    effects: ['displacement', 'feedback', 'bloom'],
    textEffect: 'gradient',
    transition: 'dissolve',
    energy: 0.65,
    tags: ['abstract', 'generative', 'organic', 'plasma'],
    reactivity: {
      bass: 0.75,
      kick: 0.55,
      mid: 0.7,
      high: 0.6,
      beatSync: 0.5,
      particle: 0.7,
      speed: 1,
      smoothing: 0.35,
      pulse: 0.55,
    },
  },
  {
    id: 'cinematic',
    name: 'Cinematic',
    family: 'Cinematic',
    description:
      'Slow warp, volumetric light and film grain. Built for long builds, breakdowns and outros.',
    templates: ['misc.warpTunnel', 'classic.circularWaveform', 'misc.starfield'],
    paletteId: 'nebula',
    effects: ['bloom', 'filmGrain', 'vignette', 'lightRays'],
    textEffect: 'shadow',
    transition: 'fadeBlack',
    energy: 0.45,
    tags: ['cinematic', 'film', 'atmospheric', 'slow'],
    reactivity: {
      bass: 0.55,
      kick: 0.4,
      mid: 0.55,
      high: 0.45,
      beatSync: 0.4,
      particle: 0.35,
      speed: 0.75,
      smoothing: 0.45,
      pulse: 0.4,
    },
  },
  {
    id: 'minimal',
    name: 'Minimalist',
    family: 'Minimal',
    description:
      'A single radial meter and fine moiré on a near-black frame. Nothing extra.',
    templates: ['classic.radialBars', 'classic.verticalEq', 'misc.moireBands'],
    paletteId: 'mono',
    effects: ['vignette'],
    textEffect: 'plain',
    transition: 'crossfade',
    energy: 0.35,
    tags: ['minimal', 'clean', 'restrained', 'mono'],
    reactivity: {
      bass: 0.5,
      kick: 0.55,
      mid: 0.5,
      high: 0.35,
      beatSync: 0.5,
      particle: 0.2,
      speed: 0.85,
      smoothing: 0.3,
      pulse: 0.4,
    },
  },
  {
    id: 'ambient',
    name: 'Ambient',
    family: 'Ambient',
    description:
      'Liquid metal and starfields with long envelopes. Slow, generative, almost weightless.',
    templates: ['misc.liquidMetal', 'misc.starfield', 'classic.circularWaveform'],
    paletteId: 'nebula',
    effects: ['bloom', 'filmGrain'],
    textEffect: 'plain',
    transition: 'dissolve',
    energy: 0.2,
    tags: ['ambient', 'drone', 'slow', 'generative'],
    reactivity: {
      bass: 0.4,
      kick: 0.25,
      mid: 0.45,
      high: 0.35,
      beatSync: 0.25,
      particle: 0.25,
      speed: 0.6,
      smoothing: 0.6,
      pulse: 0.3,
    },
  },
  {
    id: 'experimental',
    name: 'Experimental',
    family: 'Experimental',
    description:
      'Feedback smears and kaleidoscopic breakage. Unpredictable, glitch-led, studio-grade noise.',
    templates: ['hardcore.feedbackSmear', 'misc.kaleidoBloom', 'electronic.dataStream'],
    paletteId: 'acid',
    effects: ['feedback', 'displacement', 'glitch'],
    textEffect: 'pixel',
    transition: 'cut',
    energy: 0.7,
    tags: ['experimental', 'noise', 'glitch', 'feedback'],
    reactivity: {
      bass: 0.8,
      kick: 0.6,
      mid: 0.8,
      high: 0.85,
      beatSync: 0.45,
      particle: 0.8,
      speed: 1.15,
      smoothing: 0.25,
      pulse: 0.65,
    },
  },
];

export function stylePreset(id: string): StylePreset {
  return STYLE_PRESETS.find((preset) => preset.id === id) ?? STYLE_PRESETS[8];
}

/* ------------------------------------------------------------------ */
/* Typography                                                          */
/* ------------------------------------------------------------------ */

export interface TypographyPreset {
  id: string;
  name: string;
  description: string;
  /** Text effect id from render/textEffects.ts. */
  textEffect: string;
  weight: number;
  /** Letter spacing in em. */
  tracking: number;
  fontSize: number;
  /** Apply uppercase to generated copy. */
  uppercase: boolean;
}

export const TYPOGRAPHY_PRESETS: TypographyPreset[] = [
  {
    id: 'minimalist',
    name: 'Minimalist',
    description: 'Light, widely tracked uppercase with no decoration.',
    textEffect: 'plain',
    weight: 400,
    tracking: 0.16,
    fontSize: 0.8,
    uppercase: true,
  },
  {
    id: 'neon',
    name: 'Neon',
    description: 'Glowing tube lettering with a subtle flicker.',
    textEffect: 'neon',
    weight: 700,
    tracking: 0.06,
    fontSize: 1,
    uppercase: true,
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    description: 'Channel-split glitch type with tight tracking.',
    textEffect: 'glitch',
    weight: 800,
    tracking: 0.02,
    fontSize: 1.05,
    uppercase: true,
  },
  {
    id: 'industrial',
    name: 'Industrial',
    description: 'Heavy condensed caps with a hard offset shadow.',
    textEffect: 'shadow',
    weight: 900,
    tracking: 0.1,
    fontSize: 1.1,
    uppercase: true,
  },
  {
    id: 'retro',
    name: 'Retro',
    description: 'CRT scanlines and a soft chroma bloom.',
    textEffect: 'crt',
    weight: 700,
    tracking: 0.08,
    fontSize: 1,
    uppercase: false,
  },
  {
    id: 'cinematic',
    name: 'Cinematic',
    description: 'Gradient title with generous tracking and a slow reveal.',
    textEffect: 'gradient',
    weight: 500,
    tracking: 0.2,
    fontSize: 0.95,
    uppercase: true,
  },
  {
    id: 'futuristic',
    name: 'Futuristic',
    description: 'Thin gradient type that pulses gently on the beat.',
    textEffect: 'pulse',
    weight: 300,
    tracking: 0.24,
    fontSize: 0.9,
    uppercase: true,
  },
];

export function typographyPreset(id: string): TypographyPreset {
  return TYPOGRAPHY_PRESETS.find((preset) => preset.id === id) ?? TYPOGRAPHY_PRESETS[0];
}

/* ------------------------------------------------------------------ */
/* Reactivity profiles                                                 */
/* ------------------------------------------------------------------ */

export interface ReactivityProfile {
  id: string;
  name: string;
  description: string;
  values: WizardReactivity;
}

export const REACTIVITY_PROFILES: ReactivityProfile[] = [
  {
    id: 'subtle',
    name: 'Subtle',
    description: 'Gentle breathing for ambient sets and background visuals.',
    values: {
      bass: 0.4,
      kick: 0.3,
      mid: 0.4,
      high: 0.3,
      beatSync: 0.35,
      particle: 0.25,
      speed: 0.75,
      smoothing: 0.5,
      pulse: 0.3,
    },
  },
  {
    id: 'balanced',
    name: 'Balanced',
    description: 'Musical response that stays readable across a whole track.',
    values: {
      bass: 0.7,
      kick: 0.65,
      mid: 0.65,
      high: 0.55,
      beatSync: 0.6,
      particle: 0.5,
      speed: 1,
      smoothing: 0.25,
      pulse: 0.55,
    },
  },
  {
    id: 'energetic',
    name: 'Energetic',
    description: 'Snappy transients and obvious movement without clipping.',
    values: {
      bass: 0.85,
      kick: 0.85,
      mid: 0.75,
      high: 0.65,
      beatSync: 0.75,
      particle: 0.7,
      speed: 1.2,
      smoothing: 0.16,
      pulse: 0.7,
    },
  },
  {
    id: 'aggressive',
    name: 'Aggressive',
    description: 'Hard kicks, fast envelopes, big scale changes.',
    values: {
      bass: 0.95,
      kick: 1,
      mid: 0.7,
      high: 0.55,
      beatSync: 0.9,
      particle: 0.8,
      speed: 1.45,
      smoothing: 0.1,
      pulse: 0.9,
    },
  },
  {
    id: 'extreme',
    name: 'Extreme',
    description: 'Punishing response for gabber and peak-time drops. Use with restraint.',
    values: {
      bass: 1,
      kick: 1,
      mid: 0.85,
      high: 0.8,
      beatSync: 1,
      particle: 1,
      speed: 1.7,
      smoothing: 0.06,
      pulse: 1,
    },
  },
  {
    id: 'custom',
    name: 'Custom',
    description: 'Dial every band and envelope yourself.',
    values: {
      bass: 0.7,
      kick: 0.7,
      mid: 0.6,
      high: 0.5,
      beatSync: 0.6,
      particle: 0.5,
      speed: 1,
      smoothing: 0.25,
      pulse: 0.6,
    },
  },
];

export function reactivityProfile(id: string): ReactivityProfile {
  return REACTIVITY_PROFILES.find((preset) => preset.id === id) ?? REACTIVITY_PROFILES[1];
}

/* ------------------------------------------------------------------ */
/* Effects                                                             */
/* ------------------------------------------------------------------ */

export interface EffectCatalogEntry {
  type: EffectType;
  label: string;
  group: string;
  description: string;
}

export const EFFECT_CATALOG: EffectCatalogEntry[] = [
  { type: 'bloom', label: 'Bloom', group: 'Lighting', description: 'Threshold, blur and re-add highlights.' },
  { type: 'glow', label: 'Glow', group: 'Lighting', description: 'Soft additive halo driven by level.' },
  { type: 'lightRays', label: 'Light Rays', group: 'Lighting', description: 'Radial god rays from the brightest area.' },
  { type: 'volumetric', label: 'Volumetric Fog', group: 'Lighting', description: 'Bass-reactive noise fog.' },
  { type: 'neon', label: 'Neon Edge', group: 'Lighting', description: 'Sobel edges tinted cyan/violet.' },
  { type: 'rgbSplit', label: 'RGB Split', group: 'Distortion', description: 'Chromatic aberration, pushed by transients.' },
  { type: 'glitch', label: 'Glitch', group: 'Distortion', description: 'Block displacement and scan tearing.' },
  { type: 'displacement', label: 'Displacement', group: 'Distortion', description: 'Noise-driven UV warp.' },
  { type: 'pixelSort', label: 'Pixel Sort', group: 'Distortion', description: 'Sort pixel runs by luminance.' },
  { type: 'kaleidoscope', label: 'Kaleidoscope', group: 'Distortion', description: 'Mirror the frame into symmetry.' },
  { type: 'vhs', label: 'VHS', group: 'Retro', description: 'Tape warp, chroma bleed and dropouts.' },
  { type: 'scanlines', label: 'Scanlines', group: 'Retro', description: 'CRT line structure.' },
  { type: 'filmGrain', label: 'Film Grain', group: 'Retro', description: 'Animated silver-halide grain.' },
  { type: 'feedback', label: 'Feedback', group: 'Motion', description: 'Trails that sample the previous frame.' },
  { type: 'motionBlur', label: 'Motion Blur', group: 'Motion', description: 'Directional frame smear.' },
  { type: 'cameraShake', label: 'Camera Shake', group: 'Motion', description: 'Handheld offset on transients.' },
  { type: 'zoomPulse', label: 'Zoom Pulse', group: 'Motion', description: 'Kick-driven zoom breathing.' },
  { type: 'vignette', label: 'Vignette', group: 'Atmosphere', description: 'Corner falloff to focus the frame.' },
  { type: 'halftone', label: 'Halftone', group: 'Atmosphere', description: 'Print-style dot screen.' },
  { type: 'colorGrade', label: 'Colour Grade', group: 'Atmosphere', description: 'Lift, gamma and gain grade.' },
];

export const EFFECT_GROUPS = ['Lighting', 'Distortion', 'Retro', 'Motion', 'Atmosphere'] as const;

export function effectEntry(type: EffectType): EffectCatalogEntry | null {
  return EFFECT_CATALOG.find((entry) => entry.type === type) ?? null;
}

export interface EffectIntensityPreset {
  id: string;
  name: string;
  description: string;
  effects: EffectType[];
  intensity: number;
}

export const EFFECT_INTENSITY_PRESETS: EffectIntensityPreset[] = [
  { id: 'clean', name: 'Clean', description: 'Vignette only. Maximum performance.', effects: ['vignette'], intensity: 0.8 },
  {
    id: 'cinematic',
    name: 'Cinematic',
    description: 'Filmic bloom, gentle grain and a soft vignette.',
    effects: ['bloom', 'filmGrain', 'vignette'],
    intensity: 1,
  },
  {
    id: 'neon',
    name: 'Neon',
    description: 'Bloom, glow and a touch of channel split.',
    effects: ['bloom', 'glow', 'rgbSplit'],
    intensity: 1.1,
  },
  {
    id: 'psychedelic',
    name: 'Psychedelic',
    description: 'Feedback trails through displacement and kaleidoscope.',
    effects: ['feedback', 'displacement', 'kaleidoscope', 'bloom'],
    intensity: 1.2,
  },
  {
    id: 'distorted',
    name: 'Distorted',
    description: 'Glitch, VHS and pixel sorting for broken-signal looks.',
    effects: ['glitch', 'vhs', 'pixelSort', 'rgbSplit'],
    intensity: 1.3,
  },
  {
    id: 'extreme',
    name: 'Extreme',
    description: 'The full stack. Heavy on the GPU — preview before exporting 4K.',
    effects: ['glitch', 'feedback', 'displacement', 'rgbSplit', 'bloom', 'filmGrain'],
    intensity: 1.5,
  },
];

/* ------------------------------------------------------------------ */
/* Output                                                              */
/* ------------------------------------------------------------------ */

export interface OutputPreset {
  id: string;
  name: string;
  description: string;
  width: number;
  height: number;
  fps: number;
  codec: 'h264' | 'h265';
  bitrateMbps: number;
  crf: number;
}

export const OUTPUT_PRESETS: OutputPreset[] = [
  {
    id: 'youtube',
    name: 'YouTube',
    description: '1080p · 30 fps · H.264 · high quality',
    width: 1920,
    height: 1080,
    fps: 30,
    codec: 'h264',
    bitrateMbps: 24,
    crf: 18,
  },
  {
    id: 'youtube-4k',
    name: 'YouTube 4K',
    description: '2160p · 60 fps · H.265 · archive quality',
    width: 3840,
    height: 2160,
    fps: 60,
    codec: 'h265',
    bitrateMbps: 55,
    crf: 16,
  },
  {
    id: 'shorts',
    name: 'YouTube Shorts',
    description: '1080 × 1920 · 30 fps · H.264',
    width: 1080,
    height: 1920,
    fps: 30,
    codec: 'h264',
    bitrateMbps: 18,
    crf: 20,
  },
  {
    id: 'reels',
    name: 'Instagram Reels',
    description: '1080 × 1920 · 30 fps · H.264',
    width: 1080,
    height: 1920,
    fps: 30,
    codec: 'h264',
    bitrateMbps: 16,
    crf: 21,
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    description: '1080 × 1920 · 30 fps · H.264',
    width: 1080,
    height: 1920,
    fps: 30,
    codec: 'h264',
    bitrateMbps: 14,
    crf: 22,
  },
  {
    id: 'archive',
    name: 'High-quality Archive',
    description: '2160p · 60 fps · H.265 · CRF 14',
    width: 3840,
    height: 2160,
    fps: 60,
    codec: 'h265',
    bitrateMbps: 80,
    crf: 14,
  },
  {
    id: 'custom',
    name: 'Custom',
    description: 'Set every output value manually.',
    width: 1920,
    height: 1080,
    fps: 30,
    codec: 'h264',
    bitrateMbps: 24,
    crf: 18,
  },
];

export interface AspectPreset {
  id: string;
  label: string;
  ratio: string;
  width: number;
  height: number;
}

export const ASPECT_PRESETS: AspectPreset[] = [
  { id: 'landscape', label: 'Landscape', ratio: '16:9', width: 1920, height: 1080 },
  { id: 'portrait', label: 'Portrait', ratio: '9:16', width: 1080, height: 1920 },
  { id: 'square', label: 'Square', ratio: '1:1', width: 1080, height: 1080 },
  { id: 'vertical', label: 'Vertical', ratio: '4:5', width: 1080, height: 1350 },
];

export const FPS_OPTIONS = [24, 25, 30, 50, 60];

export function outputPreset(id: string): OutputPreset {
  return OUTPUT_PRESETS.find((preset) => preset.id === id) ?? OUTPUT_PRESETS[0];
}

/** Scene transition defaults keyed by style, for the structure step. */
export const TRANSITION_OPTIONS: { id: WizardTransition; label: string }[] = [
  { id: 'cut', label: 'Hard cut' },
  { id: 'crossfade', label: 'Crossfade' },
  { id: 'dissolve', label: 'Dissolve' },
  { id: 'fadeBlack', label: 'Fade through black' },
  { id: 'fadeWhite', label: 'Fade through white' },
  { id: 'wipe', label: 'Wipe' },
  { id: 'none', label: 'None' },
];
