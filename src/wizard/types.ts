/**
 * Visualization Wizard configuration.
 *
 * This is a *preset* document, not a project document. It is intentionally
 * small and serialisable: the wizard stores it in localStorage, exports it as a
 * reusable preset, and the generator converts it into the application's native
 * `Project`. The editor and the export pipeline never see these types.
 */

import type { ExportSettings, Palette, Scene, EffectType } from '@/types';

export type WizardStepId =
  | 'audio'
  | 'style'
  | 'template'
  | 'appearance'
  | 'reactivity'
  | 'branding'
  | 'effects'
  | 'scenes'
  | 'output'
  | 'review';

export interface WizardStep {
  id: WizardStepId;
  label: string;
  title: string;
  blurb: string;
}

export const WIZARD_STEPS: WizardStep[] = [
  {
    id: 'audio',
    label: 'Audio',
    title: 'Choose your track',
    blurb: 'The wizard analyses tempo, transients and spectrum so the visualisation follows the music.',
  },
  {
    id: 'style',
    label: 'Style',
    title: 'Pick a visual direction',
    blurb: 'A style bundles templates, palette, typography, effects and audio response into one coherent look.',
  },
  {
    id: 'template',
    label: 'Templates',
    title: 'Choose the visualisers',
    blurb: 'One main visualiser plus optional supporting layers. Incompatible stacks are filtered out.',
  },
  {
    id: 'appearance',
    label: 'Colours',
    title: 'Colour & appearance',
    blurb: 'Set the palette, then tune lighting, bloom and grade. Adjustments apply to the generated layers.',
  },
  {
    id: 'reactivity',
    label: 'Reactivity',
    title: 'Audio reactivity',
    blurb: 'Map kicks, bass, mids and highs onto real template parameters. Recommended values come from your track.',
  },
  {
    id: 'branding',
    label: 'Branding',
    title: 'Text & branding',
    blurb: 'Optional artist, title and label text. Everything becomes a normal, editable text layer.',
  },
  {
    id: 'effects',
    label: 'Effects',
    title: 'Effects & atmosphere',
    blurb: 'Scene-wide post effects. Keep the stack lean for smooth 4K playback and export.',
  },
  {
    id: 'scenes',
    label: 'Structure',
    title: 'Scenes & timeline',
    blurb: 'Build one continuous scene or cut real scenes on detected musical boundaries.',
  },
  {
    id: 'output',
    label: 'Output',
    title: 'Output settings',
    blurb: 'Frame size, rate, codec and quality are written into the project, ready for the existing exporter.',
  },
  {
    id: 'review',
    label: 'Generate',
    title: 'Review & generate',
    blurb: 'Check the composition summary, then generate a fully editable project in the main editor.',
  },
];

export type WizardSceneMode = 'single' | 'scenes' | 'beat' | 'arc' | 'custom';
export type WizardTransition = Scene['transitionIn']['type'];
export type WizardTextLayout = 'centre' | 'lower-third' | 'corner';
export type WizardLockKey =
  | 'style'
  | 'templates'
  | 'palette'
  | 'reactivity'
  | 'branding'
  | 'effects'
  | 'scenes'
  | 'output';

export type WizardLocks = Record<WizardLockKey, boolean>;

export const WIZARD_LOCK_KEYS: WizardLockKey[] = [
  'style',
  'templates',
  'palette',
  'reactivity',
  'branding',
  'effects',
  'scenes',
  'output',
];

export interface WizardReactivity {
  /** 0..1 gains for each part of the spectrum. */
  bass: number;
  kick: number;
  mid: number;
  high: number;
  /** 0..1 — how strongly cuts and pulses lock to the beat grid. */
  beatSync: number;
  /** 0..1 — how much supporting layers/particles are scaled up. */
  particle: number;
  /** 0.5..2 — global animation speed multiplier for the generated modulations. */
  speed: number;
  /** 0..1 — envelope release / smoothing. */
  smoothing: number;
  /** 0..1 — overall pulse depth. */
  pulse: number;
}

export interface WizardBranding {
  enabled: boolean;
  artist: string;
  title: string;
  album: string;
  label: string;
  releaseDate: string;
  customText: string;
  typographyId: string;
  layout: WizardTextLayout;
  /** Keep a compact artist · title on every section, not just intro/outro. */
  alwaysShowTitle: boolean;
}

export type WizardCodec = Extract<ExportSettings['codec'], 'h264' | 'h265'>;
export type WizardAudioCodec = ExportSettings['audioCodec'];
export type WizardEncoder = ExportSettings['encoder'];

export interface WizardOutput {
  presetId: string;
  width: number;
  height: number;
  fps: number;
  codec: WizardCodec;
  bitrateMbps: number;
  crf: number;
  audioCodec: WizardAudioCodec;
  audioBitrateKbps: number;
  encoder: WizardEncoder;
}

export interface WizardScenes {
  mode: WizardSceneMode;
  /** Number of middle sections used by `custom`. */
  sectionCount: number;
  introSeconds: number;
  outroSeconds: number;
  /** Bars between cuts for `beat` mode. */
  barsPerCut: number;
  transition: WizardTransition;
  transitionSeconds: number;
}

export interface WizardCreative {
  /** 0..1 — how far randomisation strays from the style's defaults. */
  creativity: number;
  /** 0..1 — layer count and visual density. */
  complexity: number;
  /** 0..2 — multiplier applied to effect parameters. */
  effectIntensity: number;
  seed: number;
  maxLayers: number;
  advanced: boolean;
}

export interface WizardAppearance {
  lighting: number;
  bloom: number;
  glow: number;
  contrast: number;
  saturation: number;
  brightness: number;
}

export interface WizardEffects {
  /** Effect type ids, in application order. */
  enabled: EffectType[];
}

export interface WizardConfig {
  version: 1;
  /** Manually corrected BPM; null uses the analysis estimate. */
  bpmOverride: number | null;
  styleId: string;
  mainTemplateId: string;
  supportingTemplateIds: string[];
  paletteId: string;
  palette: Palette;
  appearance: WizardAppearance;
  reactivityProfileId: string;
  reactivity: WizardReactivity;
  branding: WizardBranding;
  effects: WizardEffects;
  scenes: WizardScenes;
  output: WizardOutput;
  creative: WizardCreative;
  locks: WizardLocks;
  /** Wizard draft bookkeeping (not part of the generated project). */
  updatedAt?: string;
  finished?: boolean;
}

/** Everything the generator needs from the running session. */
export interface WizardContext {
  audioName: string;
  audioDuration: number;
  audioRef: import('@/types').AudioRef | null;
  track: import('@/audio/analysis').AnalysisTrack | null;
  fallbackDuration: number;
}
