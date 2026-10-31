/**
 * Studio state.
 *
 * The project document is the single source of truth. Mutations go through
 * `update`/`updateLayer`, which snapshot the previous document for undo and
 * produce a fresh clone so React and the renderer never observe partial edits.
 */

import { create } from 'zustand';
import type {
  AudioRef,
  EffectInstance,
  EffectType,
  ExportSettings,
  Layer,
  PreviewSettings,
  Project,
  Scene,
  TemplateDef,
} from '@/types';
import { EFFECT_DEF_MAP, defaultEffectParams } from '@/render/effects';
import { defaultTextEffectParams, textEffectFor } from '@/render/textEffects';
import { clamp } from '@/timeline/easing';
import { transport } from './transport';
import {
  activeScene,
  cloneProject,
  createDefaultProject,
  createLayerFromTemplate,
  findLayer,
  identityTransform,
  uid,
} from './project';

export type LeftTab = 'templates' | 'elements' | 'effects' | 'shaders' | 'assets';
export type RightTab = 'properties' | 'modulation' | 'effects' | 'audio';
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface AudioStatus {
  name: string;
  status: 'idle' | 'decoding' | 'analyzing' | 'ready' | 'error';
  progress: number;
  bpm: number;
  duration: number;
  error: string | null;
}

export interface StudioState {
  project: Project;
  selectedLayerId: string | null;
  preview: PreviewSettings;
  exportOpen: boolean;
  /** Full-screen Visualisation Wizard. The project is untouched until Finish. */
  wizardOpen: boolean;
  leftTab: LeftTab;
  rightTab: RightTab;
  audio: AudioStatus;
  history: Project[];
  future: Project[];
  toast: string | null;
  saveStatus: SaveStatus;
  lastSavedAt: number | null;
  /** Set by the Enter/F2 shortcut to open a text layer's inline editor. */
  textEditRequest: { layerId: string; nonce: number } | null;

  selectLayer(id: string | null): void;
  setLeftTab(tab: LeftTab): void;
  setRightTab(tab: RightTab): void;
  setPreview(patch: Partial<PreviewSettings>): void;
  setExportOpen(open: boolean): void;
  setWizardOpen(open: boolean): void;
  setExport(patch: Partial<ExportSettings>): void;
  setAudio(patch: Partial<AudioStatus>): void;
  setToast(message: string | null): void;
  setSaveStatus(status: SaveStatus, at?: number | null): void;
  requestTextEdit(layerId: string): void;

  addTemplateLayer(def: TemplateDef): void;
  addSolidLayer(): void;
  addTextLayer(effectId?: string): void;
  removeLayer(id: string): void;
  duplicateLayer(id: string): void;
  moveLayer(id: string, delta: number): void;
  updateLayer(id: string, recipe: (layer: Layer) => void, history?: boolean): void;
  setSceneBackground(index: 0 | 1, color: string): void;
  setSceneBackgroundMode(mode: Scene['bgMode']): void;
  setProjectAudio(ref: AudioRef | null, duration: number): void;
  setSceneDuration(seconds: number): void;

  addEffect(layerId: string, type: EffectType, range?: { start: number; end: number }): void;
  updateEffect(layerId: string, effectId: string, recipe: (effect: EffectInstance) => void): void;
  removeEffect(layerId: string, effectId: string): void;
  moveEffect(layerId: string, effectId: string, delta: number): void;

  pushHistory(): void;
  undo(): void;
  redo(): void;
  replaceProject(project: Project): void;
  renameProject(name: string): void;
}

export const INITIAL_AUDIO: AudioStatus = {
  name: '',
  status: 'idle',
  progress: 0,
  bpm: 0,
  duration: 0,
  error: null,
};

const MAX_HISTORY = 60;
/** Consecutive edits to the same layer inside this window share one undo step. */
const HISTORY_COALESCE_MS = 700;
let textEditNonce = 0;
export const MIN_SCENE_DURATION = 0.1;
export const MAX_SCENE_DURATION = 3600;

/**
 * Resize a scene's timeline. Layers that ran to the end of the old timeline are
 * carried to the new end, so widening the timeline to fit a track does not leave
 * a visual stopping early.
 */
function fitScene(scene: Scene, duration: number): void {
  const previous = scene.duration;
  scene.duration = duration;
  for (const layer of scene.layers) {
    if (layer.end >= previous - 1e-3) layer.end = duration;
    else if (layer.end > duration) layer.end = duration;
    if (layer.start > duration - MIN_SCENE_DURATION) {
      layer.start = Math.max(0, duration - MIN_SCENE_DURATION);
    }
    if (layer.end <= layer.start) layer.end = duration;
  }
}

function freshEffect(type: EffectType): EffectInstance {
  const def = EFFECT_DEF_MAP[type];
  return {
    id: uid('fx'),
    type,
    enabled: true,
    params: { ...defaultEffectParams(def), intensity: 1 },
  };
}

function moveItem<T>(items: T[], from: number, to: number): void {
  if (to < 0 || to >= items.length || from === to) return;
  const [item] = items.splice(from, 1);
  items.splice(to, 0, item);
}

export const useStudio = create<StudioState>()((set, get) => {
  // History coalescing state: a slider drag or a burst of typing should become
  // one undo step, not one per pointer event.
  let coalesceKey: string | null = null;
  let lastHistoryAt = 0;

  const resetCoalescing = (): void => {
    coalesceKey = null;
    lastHistoryAt = 0;
  };

  /** Clone the active document, apply a recipe and record undo history. */
  const update = (
    recipe: (project: Project) => void,
    history = true,
    historyKey?: string,
  ): void => {
    const state = get();
    const project = cloneProject(state.project);
    recipe(project);
    project.modifiedAt = new Date().toISOString();

    let historyNext = state.history;
    let futureNext = state.future;
    if (history) {
      const now = Date.now();
      const coalesce =
        historyKey !== undefined &&
        state.history.length > 0 &&
        coalesceKey === historyKey &&
        now - lastHistoryAt < HISTORY_COALESCE_MS;
      if (!coalesce) {
        historyNext = [...state.history, state.project].slice(-MAX_HISTORY);
        futureNext = [];
      }
      coalesceKey = coalesce && historyKey !== undefined ? historyKey : null;
      lastHistoryAt = now;
    }

    set({ project, history: historyNext, future: futureNext });
  };

  const updateLayer = (id: string, recipe: (layer: Layer) => void, history = true): void => {
    update(
      (project) => {
        const layer = findLayer(project, id);
        if (layer) recipe(layer);
      },
      history,
      id,
    );
  };

  /** Undo/redo must not keep a layer id that no longer exists in the document. */
  const selectionAfterRestore = (project: Project): string | null => {
    const selected = get().selectedLayerId;
    return selected && findLayer(project, selected) ? selected : null;
  };

  return {
    project: createDefaultProject(),
    selectedLayerId: null,
    preview: { quality: 'balanced', scale: 1, maxFps: 60, showFps: true },
    exportOpen: false,
    wizardOpen: false,
    leftTab: 'templates',
    rightTab: 'properties',
    audio: INITIAL_AUDIO,
    history: [],
    future: [],
    toast: null,
    saveStatus: 'idle',
    lastSavedAt: null,
    textEditRequest: null,

    selectLayer: (id) => set({ selectedLayerId: id }),
    setLeftTab: (leftTab) => set({ leftTab }),
    setRightTab: (rightTab) => set({ rightTab }),
    setPreview: (patch) => set((s) => ({ preview: { ...s.preview, ...patch } })),
    setExportOpen: (exportOpen) => set({ exportOpen }),
    setWizardOpen: (wizardOpen) => set({ wizardOpen }),
    setExport: (patch) =>
      update((project) => {
        project.exportSettings = { ...project.exportSettings, ...patch };
      }, false),
    setAudio: (patch) => set((s) => ({ audio: { ...s.audio, ...patch } })),
    setToast: (toast) => set({ toast }),
    setSaveStatus: (saveStatus, at) =>
      set((s) => ({
        saveStatus,
        lastSavedAt: at === undefined ? s.lastSavedAt : at,
      })),
    requestTextEdit: (layerId) =>
      set({ textEditRequest: { layerId, nonce: ++textEditNonce } }),

    addTemplateLayer: (def) => {
      const state = get();
      const scene = activeScene(state.project);
      const layer = createLayerFromTemplate(
        def,
        state.audio.duration ? 0 : 0,
        scene.duration,
      );
      update((project) => {
        const target = activeScene(project);
        target.layers.push(layer);
      });
      set({ selectedLayerId: layer.id, rightTab: 'properties' });
    },

    addSolidLayer: () => {
      const state = get();
      const scene = activeScene(state.project);
      const layer: Layer = {
        id: uid('layer'),
        name: 'Solid',
        type: 'solid',
        visible: true,
        locked: false,
        solo: false,
        groupId: null,
        transform: { ...identityTransform(), opacity: 0.35 },
        blend: 'normal',
        palette: { ...(scene.layers[0]?.palette ?? { a: '#22d3ee', b: '#8b5cf6', c: '#f472b6', d: '#e8ebf0', background: '#07080c' }) },
        params: {},
        effects: [],
        modulation: [],
        keyframes: [],
        start: 0,
        end: scene.duration,
        seed: Math.random(),
      };
      update((project) => {
        activeScene(project).layers.push(layer);
      });
      set({ selectedLayerId: layer.id });
    },

    addTextLayer: (effectId) => {
      const state = get();
      const scene = activeScene(state.project);
      const effect = textEffectFor(effectId);
      const layer: Layer = {
        id: uid('layer'),
        name: effect.id === 'plain' ? 'Title' : `${effect.label} Title`,
        type: 'text',
        visible: true,
        locked: false,
        solo: false,
        groupId: null,
        transform: identityTransform(),
        blend: 'screen',
        palette: {
          a: effect.palette.a,
          b: effect.palette.b,
          c: effect.palette.c,
          d: '#e8ebf0',
          background: '#07080c',
        },
        params: {
          fontSize: 1,
          weight: 800,
          letterSpacing: 0,
          ...defaultTextEffectParams(effect),
        },
        effects: [],
        modulation: [],
        keyframes: [],
        start: 0,
        end: scene.duration,
        seed: Math.random(),
        text: 'ULTIMATE',
        textEffect: effect.id,
      };
      update((project) => {
        activeScene(project).layers.push(layer);
      });
      set({ selectedLayerId: layer.id });
    },

    removeLayer: (id) => {
      const target = findLayer(get().project, id);
      if (target?.locked) {
        set({ toast: 'Layer is locked — unlock it before deleting.' });
        return;
      }
      update((project) => {
        const scene = activeScene(project);
        scene.layers = scene.layers.filter((l) => l.id !== id);
      });
      if (get().selectedLayerId === id) set({ selectedLayerId: null });
    },

    duplicateLayer: (id) => {
      const state = get();
      const scene = activeScene(state.project);
      const index = scene.layers.findIndex((l) => l.id === id);
      if (index < 0) return;
      const copy: Layer = structuredClone(scene.layers[index]);
      copy.id = uid('layer');
      copy.name = `${copy.name} copy`;
      copy.transform.x += 0.02;
      copy.transform.y += 0.02;
      update((project) => {
        activeScene(project).layers.splice(index + 1, 0, copy);
      });
      set({ selectedLayerId: copy.id });
    },

    moveLayer: (id, delta) =>
      update((project) => {
        const layers = activeScene(project).layers;
        const index = layers.findIndex((l) => l.id === id);
        if (index < 0) return;
        moveItem(layers, index, index + delta);
      }),

    updateLayer,

    setSceneBackground: (index, color) =>
      update(
        (project) => {
          const scene = activeScene(project);
          scene.bgColors = index === 0 ? [color, scene.bgColors[1]] : [scene.bgColors[0], color];
        },
        true,
        `scene:bg:${index}`,
      ),

    setSceneBackgroundMode: (mode) =>
      update(
        (project) => {
          activeScene(project).bgMode = mode;
        },
        true,
        'scene:bg-mode',
      ),

    setProjectAudio: (ref, duration) =>
      update((project) => {
        project.audio = ref;
        for (const scene of project.scenes) fitScene(scene, duration);
        project.exportSettings.rangeEnd = null;
      }),

    setSceneDuration: (seconds) => {
      const duration = clamp(
        Number.isFinite(seconds) ? seconds : MIN_SCENE_DURATION,
        MIN_SCENE_DURATION,
        MAX_SCENE_DURATION,
      );
      update(
        (project) => {
          fitScene(activeScene(project), duration);
          if (project.exportSettings.rangeEnd != null && project.exportSettings.rangeEnd > duration) {
            project.exportSettings.rangeEnd = null;
          }
          project.exportSettings.rangeStart = Math.min(project.exportSettings.rangeStart, duration);
        },
        true,
        'scene:duration',
      );
      transport.setDuration(duration);
      if (transport.time > duration) transport.setTime(duration);
    },

    addEffect: (layerId, type, range) => {
      updateLayer(layerId, (layer) => {
        const effect = freshEffect(type);
        if (range) {
          const start = Math.max(0, Math.min(range.start, range.end - MIN_SCENE_DURATION));
          effect.start = start;
          effect.end = Math.max(start + MIN_SCENE_DURATION, range.end);
        }
        layer.effects.push(effect);
      });
      set({ rightTab: 'effects' });
    },

    updateEffect: (layerId, effectId, recipe) =>
      updateLayer(
        layerId,
        (layer) => {
          const effect = layer.effects.find((e) => e.id === effectId);
          if (effect) recipe(effect);
        },
        false,
      ),

    removeEffect: (layerId, effectId) =>
      updateLayer(layerId, (layer) => {
        layer.effects = layer.effects.filter((e) => e.id !== effectId);
      }),

    moveEffect: (layerId, effectId, delta) =>
      updateLayer(layerId, (layer) => {
        const index = layer.effects.findIndex((e) => e.id === effectId);
        if (index >= 0) moveItem(layer.effects, index, index + delta);
      }),

    pushHistory: () => {
      resetCoalescing();
      set((s) => ({
        history: [...s.history, s.project].slice(-MAX_HISTORY),
        future: [],
      }));
    },

    undo: () => {
      const { history, project, future } = get();
      if (history.length === 0) return;
      const previous = history[history.length - 1];
      resetCoalescing();
      set({
        project: previous,
        selectedLayerId: selectionAfterRestore(previous),
        history: history.slice(0, -1),
        future: [project, ...future].slice(0, MAX_HISTORY),
      });
    },

    redo: () => {
      const { future, project, history } = get();
      if (future.length === 0) return;
      const next = future[0];
      resetCoalescing();
      set({
        project: next,
        selectedLayerId: selectionAfterRestore(next),
        future: future.slice(1),
        history: [...history, project].slice(-MAX_HISTORY),
      });
    },

    replaceProject: (project) => {
      resetCoalescing();
      set({
        project,
        selectedLayerId: null,
        history: [],
        future: [],
      });
    },

    renameProject: (name) =>
      update(
        (project) => {
          project.name = name || 'Untitled Session';
        },
        true,
        'project:name',
      ),
  };
});

/** Convenience selectors kept out of the component tree. */
export function selectActiveScene(state: StudioState): Scene {
  return activeScene(state.project);
}

export function selectSelectedLayer(state: StudioState): Layer | null {
  return findLayer(state.project, state.selectedLayerId);
}
