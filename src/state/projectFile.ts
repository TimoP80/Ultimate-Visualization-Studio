/**
 * Project files and autosave.
 *
 * The document is plain JSON, wrapped in a small envelope that records the
 * format id, version and save time. Loading normalises every field so a
 * truncated autosave or a hand-edited file cannot crash the renderer.
 *
 * In the browser, Save uses the File System Access API when available (so the
 * same file can be overwritten) and falls back to a download. Autosave writes
 * to localStorage after edits settle and is offered as a recovery on next start.
 */

import { useEffect } from 'react';
import type {
  AudioRef,
  AssetRef,
  EffectInstance,
  ExportSettings,
  Keyframe,
  Layer,
  Marker,
  ModulationRoute,
  Palette,
  Project,
  Scene,
  Transform,
} from '@/types';
import { EFFECT_DEF_MAP, defaultEffectParams } from '@/render/effects';
import { TEXT_EFFECT_MAP } from '@/render/textEffects';
import { audioEngine } from '@/audio/AudioEngine';
import { setAnalysisTrack } from './analysisStore';
import { activeScene, createDefaultProject, defaultExportSettings, FORMAT_VERSION, uid } from './project';
import { useStudio, INITIAL_AUDIO } from './store';
import { transport } from './transport';

export const PROJECT_FILE_FORMAT = 'ultimate-visualization-studio';
const AUTOSAVE_KEY = 'uvs:autosave:v1';
const MAX_PROJECT_BYTES = 32 * 1024 * 1024;

/* ------------------------------------------------------------------ */
/* Envelope                                                            */
/* ------------------------------------------------------------------ */

export interface LoadedProject {
  project: Project;
  savedAt: string;
}

export function serializeProject(project: Project): string {
  return JSON.stringify(
    {
      format: PROJECT_FILE_FORMAT,
      formatVersion: FORMAT_VERSION,
      savedAt: new Date().toISOString(),
      project,
    },
    null,
    2,
  );
}

export function deserializeProject(text: string): LoadedProject {
  if (text.length > MAX_PROJECT_BYTES) throw new Error('Project file is too large');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('File is not valid JSON');
  }
  const envelope = record(parsed);
  const wrapped = envelope.format === PROJECT_FILE_FORMAT;
  const rawProject = wrapped ? envelope.project : parsed;
  const version = number(envelope.formatVersion, number(record(rawProject).formatVersion, FORMAT_VERSION));
  if (version > FORMAT_VERSION) {
    throw new Error(`Project format v${version} was made by a newer build (v${FORMAT_VERSION})`);
  }
  return {
    project: normalizeProject(rawProject),
    savedAt: stringValue(envelope.savedAt, new Date().toISOString()),
  };
}

export function projectFileName(project: Project): string {
  const base = project.name
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 80);
  return `${base || 'Untitled project'}.json`;
}

/* ------------------------------------------------------------------ */
/* Validation / migration                                              */
/* ------------------------------------------------------------------ */

const DEFAULT_PALETTE: Palette = {
  a: '#22d3ee',
  b: '#8b5cf6',
  c: '#f472b6',
  d: '#e8ebf0',
  background: '#07080c',
};

const LAYER_TYPES = new Set<Layer['type']>(['template', 'text', 'image', 'video', 'shader', 'solid']);
const BLEND_MODES = new Set<string>([
  'normal',
  'add',
  'screen',
  'multiply',
  'overlay',
  'lighten',
  'difference',
]);
const EASINGS = new Set<Keyframe['easing']>(['linear', 'easeIn', 'easeOut', 'easeInOut', 'bezier']);
const MODULATION_SOURCES = new Set<string>([
  'rms',
  'peak',
  'subBass',
  'bass',
  'lowMid',
  'mid',
  'highMid',
  'treble',
  'air',
  'centroid',
  'flux',
  'beat',
  'beatPhase',
  'bar',
  'kick',
  'snare',
  'onset',
  'band',
]);
const TRANSITIONS = new Set<Scene['transitionIn']['type']>([
  'none',
  'cut',
  'crossfade',
  'fadeBlack',
  'fadeWhite',
  'wipe',
  'dissolve',
]);
const BG_MODES = new Set<Scene['bgMode']>(['solid', 'gradient', 'transparent']);
const MARKER_KINDS = new Set<Marker['kind']>(['marker', 'beat', 'section']);

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function number(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function integer(value: unknown, fallback: number, min: number, max: number): number {
  return Math.round(clamp(number(value, fallback), min, max));
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function hex(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)
    ? value
    : fallback;
}

function normalizePalette(raw: unknown, fallback: Palette = DEFAULT_PALETTE): Palette {
  const value = record(raw);
  return {
    a: hex(value.a, fallback.a),
    b: hex(value.b, fallback.b),
    c: hex(value.c, fallback.c),
    d: hex(value.d, fallback.d),
    background: hex(value.background, fallback.background),
  };
}

function normalizeTransform(raw: unknown): Transform {
  const value = record(raw);
  return {
    x: clamp(number(value.x, 0), -4, 4),
    y: clamp(number(value.y, 0), -4, 4),
    scaleX: clamp(number(value.scaleX, 1), 0.001, 20),
    scaleY: clamp(number(value.scaleY, 1), 0.001, 20),
    rotation: number(value.rotation, 0),
    opacity: clamp(number(value.opacity, 1), 0, 1),
  };
}

function normalizeParams(raw: unknown): Layer['params'] {
  const out: Layer['params'] = {};
  for (const [key, value] of Object.entries(record(raw))) {
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    else if (typeof value === 'string' || typeof value === 'boolean') out[key] = value;
  }
  return out;
}

function normalizeEffect(raw: unknown): EffectInstance | null {
  const value = record(raw);
  const type = stringValue(value.type, '');
  const def = EFFECT_DEF_MAP[type];
  if (!def) return null;
  const params: Record<string, number> = { ...defaultEffectParams(def) };
  for (const [key, param] of Object.entries(record(value.params))) {
    if (typeof param === 'number' && Number.isFinite(param)) params[key] = param;
  }
  params.intensity = clamp(number(params.intensity, 1), 0, 1);
  return {
    id: stringValue(value.id, uid('fx')),
    type: def.type,
    enabled: bool(value.enabled, true),
    params,
    ...(typeof value.start === 'number' ? { start: Math.max(0, number(value.start, 0)) } : {}),
    ...(typeof value.end === 'number' ? { end: Math.max(0, number(value.end, 0)) } : {}),
  };
}

function normalizeEffects(raw: unknown): EffectInstance[] {
  return Array.isArray(raw)
    ? raw.map(normalizeEffect).filter((effect): effect is EffectInstance => effect !== null)
    : [];
}

function normalizeKeyframe(raw: unknown): Keyframe | null {
  const value = record(raw);
  const path = stringValue(value.path, '');
  if (!path) return null;
  const bezier = Array.isArray(value.bezier) && value.bezier.length === 4
    ? (value.bezier.map((n) => number(n, 0)) as [number, number, number, number])
    : undefined;
  return {
    id: stringValue(value.id, uid('kf')),
    path,
    time: Math.max(0, number(value.time, 0)),
    value: number(value.value, 0),
    easing: pick(value.easing, [...EASINGS], 'linear'),
    ...(bezier ? { bezier } : {}),
  };
}

function normalizeKeyframes(raw: unknown): Keyframe[] {
  return Array.isArray(raw)
    ? raw.map(normalizeKeyframe).filter((keyframe): keyframe is Keyframe => keyframe !== null)
    : [];
}

function normalizeRoute(raw: unknown): ModulationRoute | null {
  const value = record(raw);
  const target = stringValue(value.target, '');
  if (!target) return null;
  return {
    id: stringValue(value.id, uid('mod')),
    enabled: bool(value.enabled, true),
    source: pick(value.source, [...MODULATION_SOURCES], 'rms') as ModulationRoute['source'],
    bandIndex: integer(value.bandIndex, 0, 0, 15),
    target,
    amount: number(value.amount, 0.1),
    attack: clamp(number(value.attack, 0.02), 0.001, 5),
    release: clamp(number(value.release, 0.2), 0.001, 10),
    sensitivity: clamp(number(value.sensitivity, 1), 0, 10),
    threshold: clamp(number(value.threshold, 0), 0, 0.99),
    invert: bool(value.invert, false),
  };
}

function normalizeRoutes(raw: unknown): ModulationRoute[] {
  return Array.isArray(raw)
    ? raw.map(normalizeRoute).filter((route): route is ModulationRoute => route !== null)
    : [];
}

function normalizeLayer(raw: unknown): Layer {
  const value = record(raw);
  const start = Math.max(0, number(value.start, 0));
  const end = Math.max(start + 0.01, number(value.end, start + 1));
  return {
    id: stringValue(value.id, uid('layer')),
    name: stringValue(value.name, 'Layer'),
    type: pick(value.type, [...LAYER_TYPES], 'template'),
    templateId: typeof value.templateId === 'string' ? value.templateId : undefined,
    visible: bool(value.visible, true),
    locked: bool(value.locked, false),
    solo: bool(value.solo, false),
    groupId: typeof value.groupId === 'string' ? value.groupId : null,
    transform: normalizeTransform(value.transform),
    blend: pick(value.blend, [...BLEND_MODES], 'normal') as Layer['blend'],
    palette: normalizePalette(value.palette),
    params: normalizeParams(value.params),
    effects: normalizeEffects(value.effects),
    modulation: normalizeRoutes(value.modulation),
    keyframes: normalizeKeyframes(value.keyframes),
    start,
    end,
    seed: number(value.seed, Math.random()),
    ...(typeof value.text === 'string' ? { text: value.text } : {}),
    ...(typeof value.textEffect === 'string' && TEXT_EFFECT_MAP[value.textEffect]
      ? { textEffect: value.textEffect }
      : {}),
    ...(typeof value.assetId === 'string' ? { assetId: value.assetId } : {}),
    ...(typeof value.shaderSource === 'string' ? { shaderSource: value.shaderSource } : {}),
  };
}

function normalizeMarker(raw: unknown): Marker | null {
  const value = record(raw);
  const time = number(value.time, NaN);
  if (!Number.isFinite(time)) return null;
  return {
    id: stringValue(value.id, uid('marker')),
    time: Math.max(0, time),
    label: stringValue(value.label, 'Marker'),
    color: hex(value.color, '#fbbf24'),
    kind: pick(value.kind, [...MARKER_KINDS], 'marker'),
  };
}

function normalizeScene(raw: unknown, index: number): Scene {
  const value = record(raw);
  const colors = Array.isArray(value.bgColors) ? value.bgColors : [];
  const transition = record(value.transitionIn);
  return {
    id: stringValue(value.id, uid('scene')),
    name: stringValue(value.name, `Scene ${String(index + 1).padStart(2, '0')}`),
    layers: Array.isArray(value.layers) ? value.layers.map(normalizeLayer) : [],
    duration: Math.max(0.1, number(value.duration, 180)),
    markers: Array.isArray(value.markers)
      ? value.markers.map(normalizeMarker).filter((m): m is Marker => m !== null)
      : [],
    transitionIn: {
      type: pick(transition.type, [...TRANSITIONS], 'none'),
      duration: Math.max(0, number(transition.duration, 0)),
    },
    bgColors: [hex(colors[0], '#07080c'), hex(colors[1], '#101625')],
    bgMode: pick(value.bgMode, [...BG_MODES], 'gradient'),
    effects: normalizeEffects(value.effects),
  };
}

function normalizeAudioRef(raw: unknown): AudioRef | null {
  if (raw === null || raw === undefined) return null;
  const value = record(raw);
  if (Object.keys(value).length === 0) return null;
  return {
    path: typeof value.path === 'string' ? value.path : null,
    name: stringValue(value.name, 'Audio'),
    duration: Math.max(0, number(value.duration, 0)),
    sampleRate: Math.max(0, number(value.sampleRate, 0)),
    channels: Math.max(1, Math.round(number(value.channels, 1))),
    ...(typeof value.bpm === 'number' ? { bpm: number(value.bpm, 0) } : {}),
    ...(typeof value.beatCount === 'number' ? { beatCount: number(value.beatCount, 0) } : {}),
  };
}

function normalizeAssets(raw: unknown): AssetRef[] {
  if (!Array.isArray(raw)) return [];
  const kinds = new Set<AssetRef['kind']>(['image', 'video', 'logo']);
  return raw
    .map((item): AssetRef | null => {
      const value = record(item);
      const path = stringValue(value.path, '');
      if (!path) return null;
      return {
        id: stringValue(value.id, uid('asset')),
        name: stringValue(value.name, 'Asset'),
        kind: pick(value.kind, [...kinds], 'image'),
        path,
      };
    })
    .filter((asset): asset is AssetRef => asset !== null);
}

function normalizeExportSettings(raw: unknown): ExportSettings {
  const defaults = defaultExportSettings();
  const value = record(raw);
  return {
    ...defaults,
    container: pick(value.container, ['mp4', 'webm', 'mov', 'png', 'gif'], defaults.container),
    codec: pick(value.codec, ['h264', 'h265', 'vp9', 'prores'], defaults.codec),
    width: integer(value.width, defaults.width, 320, 7680),
    height: integer(value.height, defaults.height, 180, 4320),
    fps: integer(value.fps, defaults.fps, 1, 240),
    bitrateMbps: clamp(number(value.bitrateMbps, defaults.bitrateMbps), 1, 200),
    crf: integer(value.crf, defaults.crf, 0, 51),
    preset: stringValue(value.preset, defaults.preset),
    audioCodec: pick(value.audioCodec, ['aac', 'mp3', 'opus', 'flac', 'pcm'], defaults.audioCodec),
    audioBitrateKbps: integer(value.audioBitrateKbps, defaults.audioBitrateKbps, 32, 512),
    sampleRate: integer(value.sampleRate, defaults.sampleRate, 8000, 192000),
    encoder: pick(value.encoder, ['auto', 'nvenc', 'amf', 'qsv', 'videotoolbox', 'software'], defaults.encoder),
    rangeStart: Math.max(0, number(value.rangeStart, 0)),
    rangeEnd: value.rangeEnd === null ? null : Math.max(0, number(value.rangeEnd, 0)),
    sceneId: typeof value.sceneId === 'string' ? value.sceneId : null,
    loopSeamless: bool(value.loopSeamless, false),
    quality: pick(value.quality, ['preview', 'balanced', 'high', 'ultra'], defaults.quality),
  };
}

function normalizeProject(raw: unknown): Project {
  const value = record(raw);
  const scenes = Array.isArray(value.scenes)
    ? value.scenes.map((scene, index) => normalizeScene(scene, index))
    : [];
  if (scenes.length === 0) throw new Error('Project contains no scenes');

  const wantedScene = stringValue(value.activeSceneId, '');
  const activeSceneId = scenes.some((scene) => scene.id === wantedScene) ? wantedScene : scenes[0].id;
  const now = new Date().toISOString();

  return {
    formatVersion: FORMAT_VERSION,
    id: stringValue(value.id, uid('project')),
    name: stringValue(value.name, 'Untitled Session'),
    audio: normalizeAudioRef(value.audio),
    assets: normalizeAssets(value.assets),
    scenes,
    activeSceneId,
    exportSettings: normalizeExportSettings(value.exportSettings),
    createdAt: stringValue(value.createdAt, now),
    modifiedAt: stringValue(value.modifiedAt, now),
  };
}

/* ------------------------------------------------------------------ */
/* File System Access                                                  */
/* ------------------------------------------------------------------ */

interface WritableStreamLike {
  write(data: string | Blob): Promise<void>;
  close(): Promise<void>;
}

interface FileHandleLike {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<WritableStreamLike>;
}

interface PickerWindow {
  showSaveFilePicker?(options: {
    suggestedName?: string;
    types?: { description: string; accept: Record<string, string[]> }[];
  }): Promise<FileHandleLike>;
  showOpenFilePicker?(options: {
    multiple?: boolean;
    types?: { description: string; accept: Record<string, string[]> }[];
  }): Promise<FileHandleLike[]>;
}

const pickerWindow = window as unknown as PickerWindow;

let currentHandle: FileHandleLike | null = null;

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'AbortError' || error.name === 'NotAllowedError');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const FILE_TYPES = [
  { description: 'Visualization project', accept: { 'application/json': ['.json'] } },
];

/* ------------------------------------------------------------------ */
/* Runtime audio reset                                                 */
/* ------------------------------------------------------------------ */

/** Clear decoded audio and analysis so a loaded document cannot play stale audio. */
export function resetAudioSession(): void {
  audioEngine.stop();
  audioEngine.unload();
  setAnalysisTrack(null);
  transport.setPlaying(false);
  transport.setLoop(false, 0, 0);
  audioEngine.setLoop(false, 0, 0);
  useStudio.getState().setAudio({ ...INITIAL_AUDIO });
}

function applyProject(
  project: Project,
  options: { handle?: FileHandleLike | null; savedAt?: number; message?: string } = {},
): void {
  resetAudioSession();
  currentHandle = options.handle ?? null;
  const store = useStudio.getState();
  store.replaceProject(project);
  transport.setDuration(activeScene(project).duration || 180);
  transport.setTime(0);
  store.setSaveStatus(options.savedAt ? 'saved' : 'idle', options.savedAt ?? null);
  if (options.message) store.setToast(options.message);
}

/* ------------------------------------------------------------------ */
/* Save / open                                                         */
/* ------------------------------------------------------------------ */

export async function saveProject(saveAs = false): Promise<boolean> {
  const store = useStudio.getState();
  const project = store.project;
  const json = serializeProject(project);
  const suggestedName = projectFileName(project);
  store.setSaveStatus('saving');

  try {
    if (!saveAs && currentHandle) {
      const writable = await currentHandle.createWritable();
      await writable.write(json);
      await writable.close();
      afterSave(currentHandle.name || suggestedName);
      return true;
    }

    const picker = pickerWindow.showSaveFilePicker;
    if (picker) {
      try {
        const handle = await picker({ suggestedName, types: FILE_TYPES });
        const writable = await handle.createWritable();
        await writable.write(json);
        await writable.close();
        currentHandle = handle;
        afterSave(handle.name || suggestedName);
        return true;
      } catch (error) {
        if (isAbort(error)) {
          store.setSaveStatus(store.lastSavedAt ? 'saved' : 'idle');
          return false;
        }
        // Picker unavailable or denied: fall through to a download.
      }
    }

    downloadProject(json, suggestedName);
    afterSave(suggestedName);
    return true;
  } catch (error) {
    store.setSaveStatus('error');
    store.setToast(`Could not save project: ${errorMessage(error)}`);
    return false;
  }
}

function afterSave(name: string): void {
  clearAutosave();
  const store = useStudio.getState();
  store.setSaveStatus('saved', Date.now());
  store.setToast(`Saved ${name}`);
}

function downloadProject(json: string, fileName: string): void {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function openProject(): Promise<boolean> {
  const store = useStudio.getState();
  let text: string | null = null;
  let handle: FileHandleLike | null = null;

  const picker = pickerWindow.showOpenFilePicker;
  if (picker) {
    try {
      const [picked] = await picker({ multiple: false, types: FILE_TYPES });
      handle = picked;
      text = await (await picked.getFile()).text();
    } catch (error) {
      if (isAbort(error)) return false;
      text = null;
    }
  }

  if (text === null) text = await readTextViaInput();
  if (text === null) return false;

  try {
    const { project } = deserializeProject(text);
    const relink = project.audio?.name;
    applyProject(project, {
      handle,
      message: relink
        ? `Opened “${project.name}”. Re-import “${relink}” to relink audio.`
        : `Opened “${project.name}”.`,
    });
    clearAutosave();
    return true;
  } catch (error) {
    store.setToast(`Could not open project: ${errorMessage(error)}`);
    return false;
  }
}

function readTextViaInput(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    let settled = false;
    const finish = (value: string | null): void => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return finish(null);
      try {
        finish(await file.text());
      } catch {
        finish(null);
      }
    };
    input.addEventListener('cancel', () => finish(null));
    // Fallback for browsers that fire neither `change` nor `cancel` on dismiss.
    window.addEventListener(
      'focus',
      () =>
        window.setTimeout(() => {
          if (!input.files || input.files.length === 0) finish(null);
        }, 900),
      { once: true },
    );
    input.click();
  });
}

export function createNewProject(): void {
  const store = useStudio.getState();
  const hasWork =
    store.history.length > 0 || store.project.scenes.some((scene) => scene.layers.length > 0);
  if (hasWork && !window.confirm('Start a new project? Unsaved changes will be lost.')) return;
  currentHandle = null;
  applyProject(createDefaultProject(), { message: 'New project created' });
  clearAutosave();
}

/* ------------------------------------------------------------------ */
/* Autosave                                                            */
/* ------------------------------------------------------------------ */

export function writeAutosave(project: Project): boolean {
  try {
    localStorage.setItem(
      AUTOSAVE_KEY,
      JSON.stringify({
        format: PROJECT_FILE_FORMAT,
        formatVersion: FORMAT_VERSION,
        savedAt: new Date().toISOString(),
        project,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export function readAutosave(): LoadedProject | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    return deserializeProject(raw);
  } catch {
    return null;
  }
}

export function clearAutosave(): void {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    // Storage may be blocked; autosave is best-effort.
  }
}

export function restoreFromAutosave(loaded: LoadedProject): void {
  currentHandle = null;
  const relink = loaded.project.audio?.name;
  applyProject(loaded.project, {
    savedAt: Date.now(),
    message: relink
      ? `Recovered “${loaded.project.name}” from autosave. Re-import “${relink}” to relink audio.`
      : `Recovered “${loaded.project.name}” from autosave.`,
  });
}

const AUTOSAVE_DEBOUNCE_MS = 700;

/**
 * Debounced autosave. Mounted once by the workspace; writes after edits settle
 * and flushes synchronously when the page is hidden or closed.
 */
export function useProjectAutosave(): void {
  useEffect(() => {
    let timer: number | null = null;

    const flush = (): void => {
      if (timer === null) return;
      window.clearTimeout(timer);
      timer = null;
      const ok = writeAutosave(useStudio.getState().project);
      useStudio.getState().setSaveStatus(ok ? 'saved' : 'error', ok ? Date.now() : null);
    };

    const unsubscribe = useStudio.subscribe((state, previous) => {
      if (state.project === previous.project) return;
      useStudio.getState().setSaveStatus('saving');
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        const ok = writeAutosave(useStudio.getState().project);
        useStudio.getState().setSaveStatus(ok ? 'saved' : 'error', ok ? Date.now() : null);
      }, AUTOSAVE_DEBOUNCE_MS);
    });

    const onHide = (): void => flush();
    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', onHide);

    return () => {
      unsubscribe();
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onHide);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);
}
