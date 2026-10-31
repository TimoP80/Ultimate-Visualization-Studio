/**
 * Core domain model for Ultimate Visualization Studio.
 *
 * These types are the contract shared by the audio engine, the renderer,
 * the UI and the project (de)serializer. Keep them serializable.
 */

export type TemplateCategory =
  | 'classic'
  | 'electronic'
  | 'hardcore'
  | 'abstract'
  | 'threeD'
  | 'cinematic'
  | 'misc';

export const TEMPLATE_CATEGORIES: { id: TemplateCategory; label: string }[] = [
  { id: 'classic', label: 'Classic' },
  { id: 'electronic', label: 'Electronic / Cyberpunk' },
  { id: 'hardcore', label: 'Hardcore / Rave / Industrial' },
  { id: 'abstract', label: 'Abstract / Generative' },
  { id: 'threeD', label: '3D Visualizations' },
  { id: 'cinematic', label: 'Cinematic / Artistic' },
  { id: 'misc', label: 'Miscellaneous' },
];

/* ------------------------------------------------------------------ */
/* Template definition                                                 */
/* ------------------------------------------------------------------ */

export type ParamType = 'float' | 'int' | 'bool' | 'select' | 'color';

export interface ParamDef {
  /** Stable key; also the key inside Layer.params. */
  key: string;
  label: string;
  type: ParamType;
  default: number | boolean | string;
  min?: number;
  max?: number;
  step?: number;
  options?: { label: string; value: string }[];
  /** Grouping in the properties panel. */
  group?: string;
}

/** Palette slots exposed to every template as uColorA..uColorD + uBackground. */
export interface Palette {
  a: string;
  b: string;
  c: string;
  d: string;
  background: string;
}

export interface TemplateDef {
  id: string;
  name: string;
  category: TemplateCategory;
  description: string;
  tags: string[];
  /**
   * GLSL ES 3.00 fragment body. Must define:
   *   void mainImage(out vec4 fragColor, in vec2 fragCoord)
   * and may define extra helper functions. The renderer prepends a shared
   * prelude (uniforms + math helpers) and appends the entry point.
   */
  frag: string;
  params: ParamDef[];
  palette: Palette;
  /** Blend of the layer onto the scene. */
  composite: 'normal' | 'add' | 'screen';
  /** True when the template samples uPrev (enables feedback ping-pong). */
  usesFeedback?: boolean;
}

/* ------------------------------------------------------------------ */
/* Effects                                                             */
/* ------------------------------------------------------------------ */

export type EffectType =
  | 'bloom'
  | 'glow'
  | 'neon'
  | 'lensFlare'
  | 'lightRays'
  | 'volumetric'
  | 'rgbSplit'
  | 'glitch'
  | 'displacement'
  | 'vhs'
  | 'pixelSort'
  | 'waveWarp'
  | 'datamosh'
  | 'blur'
  | 'sharpen'
  | 'edgeDetect'
  | 'colorGrade'
  | 'lut'
  | 'vignette'
  | 'filmGrain'
  | 'scanlines'
  | 'halftone'
  | 'motionBlur'
  | 'cameraShake'
  | 'zoomPulse'
  | 'feedback'
  | 'echo'
  | 'kaleidoscope'
  | 'mirror';

export interface EffectInstance {
  id: string;
  type: EffectType;
  enabled: boolean;
  params: Record<string, number>;
  /**
   * Optional timeline window, seconds. Missing bounds mean "for the whole
   * host": the layer clip for layer effects, the scene for scene effects.
   */
  start?: number;
  end?: number;
}

/* ------------------------------------------------------------------ */
/* Modulation                                                          */
/* ------------------------------------------------------------------ */

export type ModulationSource =
  | 'rms'
  | 'peak'
  | 'subBass'
  | 'bass'
  | 'lowMid'
  | 'mid'
  | 'highMid'
  | 'treble'
  | 'air'
  | 'centroid'
  | 'flux'
  | 'beat'
  | 'beatPhase'
  | 'bar'
  | 'kick'
  | 'snare'
  | 'onset'
  | 'band';

export interface ModulationRoute {
  id: string;
  enabled: boolean;
  source: ModulationSource;
  /** Only used when source === 'band'. 0..15 */
  bandIndex?: number;
  /** Param key on the host layer that this route drives. */
  target: string;
  /** Signed amount added to the parameter, in parameter units. */
  amount: number;
  /** Envelope follower settings (seconds). */
  attack: number;
  release: number;
  /** Per-source gain so quiet signals can be boosted. */
  sensitivity: number;
  /** Gate: ignore input below this level. */
  threshold: number;
  invert: boolean;
}

/* ------------------------------------------------------------------ */
/* Layers / scenes                                                     */
/* ------------------------------------------------------------------ */

export type LayerType = 'template' | 'text' | 'image' | 'video' | 'shader' | 'solid';
export type BlendMode =
  | 'normal'
  | 'add'
  | 'screen'
  | 'multiply'
  | 'overlay'
  | 'lighten'
  | 'difference';

export interface Transform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
}

export interface Keyframe {
  id: string;
  /** Parameter path, e.g. "transform.opacity" or "params.speed". */
  path: string;
  time: number;
  value: number;
  easing: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'bezier';
  /** Control points for 'bezier' easing. */
  bezier?: [number, number, number, number];
}

export interface Layer {
  id: string;
  name: string;
  type: LayerType;
  templateId?: string;
  visible: boolean;
  locked: boolean;
  solo: boolean;
  groupId: string | null;
  transform: Transform;
  blend: BlendMode;
  palette: Palette;
  params: Record<string, number | boolean | string>;
  effects: EffectInstance[];
  modulation: ModulationRoute[];
  keyframes: Keyframe[];
  /** Timeline placement, seconds. */
  start: number;
  end: number;
  seed: number;
  /** Text layer content. */
  text?: string;
  /** Text effect preset id (see render/textEffects.ts); missing = plain. */
  textEffect?: string;
  /** Asset reference (image/video/logo) resolved through the asset store. */
  assetId?: string;
  /** Raw shader source for 'shader' layers. */
  shaderSource?: string;
}

export interface Marker {
  id: string;
  time: number;
  label: string;
  color: string;
  kind: 'marker' | 'beat' | 'section';
}

export interface TransitionDef {
  type: 'none' | 'cut' | 'crossfade' | 'fadeBlack' | 'fadeWhite' | 'wipe' | 'dissolve';
  duration: number;
}

export interface Scene {
  id: string;
  name: string;
  layers: Layer[];
  duration: number;
  markers: Marker[];
  transitionIn: TransitionDef;
  bgColors: [string, string];
  bgMode: 'solid' | 'gradient' | 'transparent';
  /** Scene-wide effect stack, applied after all layers are composited. */
  effects: EffectInstance[];
}

/* ------------------------------------------------------------------ */
/* Audio analysis result                                               */
/* ------------------------------------------------------------------ */

export interface AudioFeatures {
  time: number;
  rms: number;
  peak: number;
  subBass: number;
  bass: number;
  lowMid: number;
  mid: number;
  highMid: number;
  treble: number;
  air: number;
  centroid: number;
  flux: number;
  bpm: number;
  /** Impulse envelope, 1 on the beat then decaying. */
  beat: number;
  beatPhase: number;
  bar: number;
  kick: number;
  snare: number;
  onset: number;
  silence: number;
  /** 16 log-spaced band energies, 0..1. */
  bands: Float32Array;
  /** Smoothed magnitude spectrum in bin units (0..1 per bin). */
  spectrum: Float32Array;
  /** Latest time-domain samples, -1..1. */
  waveform: Float32Array;
}

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

export type Container = 'mp4' | 'webm' | 'mov' | 'png' | 'gif';
export type VideoCodec = 'h264' | 'h265' | 'vp9' | 'prores';
export type EncoderKind = 'nvenc' | 'amf' | 'qsv' | 'videotoolbox' | 'software';

export interface ExportSettings {
  container: Container;
  codec: VideoCodec;
  width: number;
  height: number;
  fps: number;
  bitrateMbps: number;
  /** 0..51 for x264/x265 (lower = better). */
  crf: number;
  preset: string;
  audioCodec: 'aac' | 'mp3' | 'opus' | 'flac' | 'pcm';
  audioBitrateKbps: number;
  sampleRate: number;
  encoder: EncoderKind | 'auto';
  /** Rendering range in seconds; null end means "to end of timeline". */
  rangeStart: number;
  rangeEnd: number | null;
  sceneId: string | null;
  loopSeamless: boolean;
  quality: 'preview' | 'balanced' | 'high' | 'ultra';
}

export interface EncoderInfo {
  kind: EncoderKind;
  name: string;
  codecs: VideoCodec[];
  available: boolean;
}

/* ------------------------------------------------------------------ */
/* Project                                                             */
/* ------------------------------------------------------------------ */

export interface AudioRef {
  path: string | null;
  name: string;
  duration: number;
  sampleRate: number;
  channels: number;
  /** Embedded analysis cache (optional, speeds up reopening). */
  bpm?: number;
  beatCount?: number;
}

export interface AssetRef {
  id: string;
  name: string;
  kind: 'image' | 'video' | 'logo';
  /** Relative path inside the project bundle, or absolute path. */
  path: string;
}

export interface Project {
  formatVersion: number;
  id: string;
  name: string;
  audio: AudioRef | null;
  assets: AssetRef[];
  scenes: Scene[];
  activeSceneId: string;
  exportSettings: ExportSettings;
  createdAt: string;
  modifiedAt: string;
}

/* ------------------------------------------------------------------ */
/* Preview / performance                                               */
/* ------------------------------------------------------------------ */

export type PreviewQuality = 'performance' | 'balanced' | 'high' | 'ultra';

export interface PreviewSettings {
  quality: PreviewQuality;
  /** Render scale relative to the preview widget size. */
  scale: number;
  maxFps: number;
  showFps: boolean;
}
