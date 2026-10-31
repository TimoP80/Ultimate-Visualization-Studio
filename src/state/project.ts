/**
 * Project factory and small projection helpers.
 *
 * A project is plain JSON so it can be written straight to disk. Everything
 * that the renderer needs is derived from these structures — there is no hidden
 * runtime state in the document.
 */

import type {
  ExportSettings,
  Layer,
  Palette,
  Project,
  Scene,
  TemplateDef,
  Transform,
} from '@/types';
import { getTemplateById, allTemplates } from '@/templates/registry';

export const FORMAT_VERSION = 1;

export function uid(prefix = 'id'): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rand}`;
}

export function identityTransform(): Transform {
  return { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 };
}

export function defaultExportSettings(): ExportSettings {
  return {
    container: 'mp4',
    codec: 'h264',
    width: 1920,
    height: 1080,
    fps: 60,
    bitrateMbps: 24,
    crf: 18,
    preset: 'medium',
    audioCodec: 'aac',
    audioBitrateKbps: 256,
    sampleRate: 48000,
    encoder: 'auto',
    rangeStart: 0,
    rangeEnd: null,
    sceneId: null,
    loopSeamless: false,
    quality: 'high',
  };
}

export function createLayerFromTemplate(def: TemplateDef, start = 0, end = 180): Layer {
  const params: Layer['params'] = {};
  for (const p of def.params) params[p.key] = p.default;
  return {
    id: uid('layer'),
    name: def.name,
    type: 'template',
    templateId: def.id,
    visible: true,
    locked: false,
    solo: false,
    groupId: null,
    transform: identityTransform(),
    blend: 'normal',
    palette: { ...def.palette },
    params,
    effects: [],
    modulation: [],
    keyframes: [],
    start,
    end,
    seed: Math.random(),
  };
}

export function createEmptyLayer(name = 'New Layer'): Layer {
  return {
    id: uid('layer'),
    name,
    type: 'solid',
    visible: true,
    locked: false,
    solo: false,
    groupId: null,
    transform: identityTransform(),
    blend: 'normal',
    palette: {
      a: '#22d3ee',
      b: '#8b5cf6',
      c: '#f472b6',
      d: '#e8ebf0',
      background: '#07080c',
    },
    params: {},
    effects: [],
    modulation: [],
    keyframes: [],
    start: 0,
    end: 180,
    seed: Math.random(),
  };
}

function starterScene(): Scene {
  const starter = getTemplateById('classic.circularSpectrum') ?? allTemplates()[0];
  const layers = starter ? [createLayerFromTemplate(starter)] : [];
  return {
    id: uid('scene'),
    name: 'Scene 01',
    layers,
    duration: 180,
    markers: [],
    transitionIn: { type: 'none', duration: 0 },
    bgColors: ['#07080c', '#101625'],
    bgMode: 'gradient',
    effects: [],
  };
}

export function createDefaultProject(): Project {
  const scene = starterScene();
  const now = new Date().toISOString();
  return {
    formatVersion: FORMAT_VERSION,
    id: uid('project'),
    name: 'Untitled Session',
    audio: null,
    assets: [],
    scenes: [scene],
    activeSceneId: scene.id,
    exportSettings: defaultExportSettings(),
    createdAt: now,
    modifiedAt: now,
  };
}

/* ------------------------------------------------------------------ */
/* Projections                                                         */
/* ------------------------------------------------------------------ */

export function activeScene(project: Project): Scene {
  return project.scenes.find((s) => s.id === project.activeSceneId) ?? project.scenes[0];
}

export function findLayer(project: Project, layerId: string | null): Layer | null {
  if (!layerId) return null;
  for (const scene of project.scenes) {
    const layer = scene.layers.find((l) => l.id === layerId);
    if (layer) return layer;
  }
  return null;
}

export function layerDuration(scene: Scene): number {
  return Math.max(0.1, scene.duration);
}

export function withPalette(layer: Layer, patch: Partial<Palette>): void {
  layer.palette = { ...layer.palette, ...patch };
}

/** Deep clone helper that keeps project documents independent of the store. */
export function cloneProject(project: Project): Project {
  return structuredClone(project);
}

export function defaultSceneName(index: number): string {
  return `Scene ${String(index + 1).padStart(2, '0')}`;
}
