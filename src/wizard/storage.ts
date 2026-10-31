/**
 * Wizard persistence: the in-progress draft, reusable presets and favourites.
 *
 * These live in localStorage next to the project autosave. Every read is
 * validated through `normalizeConfig`, so a build that changes the schema can
 * still open older drafts and presets.
 */

import type { WizardConfig, WizardStepId } from './types';
import { WIZARD_STEPS } from './types';
import { createDefaultConfig, normalizeConfig } from './config';

const DRAFT_KEY = 'uvs:wizard:draft:v1';
const PRESETS_KEY = 'uvs:wizard:presets:v1';
const FAVORITES_KEY = 'uvs:wizard:favorites:v1';
const PRESET_FORMAT = 'ultimate-visualization-studio-wizard';

export interface WizardDraft {
  config: WizardConfig;
  stepId: WizardStepId;
  savedAt: string;
}

export interface WizardPreset {
  id: string;
  name: string;
  createdAt: string;
  config: WizardConfig;
}

export interface WizardFavorites {
  styles: string[];
  templates: string[];
}

function safeRead(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWrite(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage can be unavailable in private windows; drafts simply stop saving.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validStep(value: unknown): WizardStepId {
  if (typeof value === 'string' && WIZARD_STEPS.some((step) => step.id === value)) {
    return value as WizardStepId;
  }
  return 'audio';
}

function newId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${random}`;
}

/* ------------------------------------------------------------------ */
/* Draft                                                               */
/* ------------------------------------------------------------------ */

export function loadDraft(): WizardDraft | null {
  const raw = safeRead(DRAFT_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || !isRecord(parsed.config)) return null;
    const fallback = createDefaultConfig();
    return {
      config: normalizeConfig(parsed.config, fallback),
      stepId: validStep(parsed.stepId),
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function saveDraft(config: WizardConfig, stepId: WizardStepId): boolean {
  return safeWrite(
    DRAFT_KEY,
    JSON.stringify({
      format: PRESET_FORMAT,
      version: 1,
      savedAt: new Date().toISOString(),
      stepId,
      config,
    }),
  );
}

export function clearDraft(): void {
  safeRemove(DRAFT_KEY);
}

/* ------------------------------------------------------------------ */
/* Presets                                                             */
/* ------------------------------------------------------------------ */

export function loadPresets(): WizardPreset[] {
  const raw = safeRead(PRESETS_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const fallback = createDefaultConfig();
    return parsed
      .filter((entry): entry is Record<string, unknown> => isRecord(entry) && isRecord(entry.config))
      .map((entry) => ({
        id: typeof entry.id === 'string' ? entry.id : newId('preset'),
        name: typeof entry.name === 'string' && entry.name.trim() ? entry.name.slice(0, 80) : 'Wizard preset',
        createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : new Date().toISOString(),
        config: normalizeConfig(entry.config, fallback),
      }))
      .slice(0, 100);
  } catch {
    return [];
  }
}

export function persistPresets(presets: WizardPreset[]): boolean {
  return safeWrite(PRESETS_KEY, JSON.stringify(presets.slice(0, 100)));
}

export function createPreset(name: string, config: WizardConfig): WizardPreset {
  return {
    id: newId('preset'),
    name: name.trim().slice(0, 80) || 'Wizard preset',
    createdAt: new Date().toISOString(),
    config: { ...config, finished: true },
  };
}

export function renamePreset(presets: WizardPreset[], id: string, name: string): WizardPreset[] {
  return presets.map((preset) =>
    preset.id === id ? { ...preset, name: name.trim().slice(0, 80) || preset.name } : preset,
  );
}

export function duplicatePreset(presets: WizardPreset[], id: string): WizardPreset[] {
  const source = presets.find((preset) => preset.id === id);
  if (!source) return presets;
  const copy: WizardPreset = {
    ...source,
    id: newId('preset'),
    name: `${source.name} copy`.slice(0, 80),
    createdAt: new Date().toISOString(),
    config: structuredClone(source.config),
  };
  return [...presets, copy];
}

export function removePreset(presets: WizardPreset[], id: string): WizardPreset[] {
  return presets.filter((preset) => preset.id !== id);
}

export function serializePreset(preset: WizardPreset): string {
  return JSON.stringify(
    {
      format: PRESET_FORMAT,
      version: 1,
      name: preset.name,
      createdAt: preset.createdAt,
      config: preset.config,
    },
    null,
    2,
  );
}

export function parsePreset(text: string): WizardPreset {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Preset file is not valid JSON');
  }
  if (!isRecord(parsed) || !isRecord(parsed.config)) {
    throw new Error('Preset file does not contain a wizard configuration');
  }
  return {
    id: newId('preset'),
    name:
      typeof parsed.name === 'string' && parsed.name.trim()
        ? parsed.name.slice(0, 80)
        : 'Imported wizard preset',
    createdAt: new Date().toISOString(),
    config: normalizeConfig(parsed.config, createDefaultConfig()),
  };
}

export function downloadPreset(preset: WizardPreset): void {
  const blob = new Blob([serializePreset(preset)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${preset.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').trim() || 'wizard-preset'}.wizard.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** File-picker helper for importing a preset; resolves null on cancel. */
export function pickPresetFile(): Promise<string | null> {
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
    input.click();
  });
}

/* ------------------------------------------------------------------ */
/* Favourites                                                          */
/* ------------------------------------------------------------------ */

const EMPTY_FAVORITES: WizardFavorites = { styles: [], templates: [] };

export function loadFavorites(): WizardFavorites {
  const raw = safeRead(FAVORITES_KEY);
  if (!raw) return { ...EMPTY_FAVORITES };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return { ...EMPTY_FAVORITES };
    const list = (value: unknown): string[] =>
      Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, 200) : [];
    return { styles: list(parsed.styles), templates: list(parsed.templates) };
  } catch {
    return { ...EMPTY_FAVORITES };
  }
}

export function toggleFavorite(
  favorites: WizardFavorites,
  kind: 'styles' | 'templates',
  id: string,
): WizardFavorites {
  const current = favorites[kind];
  const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
  const updated: WizardFavorites = { ...favorites, [kind]: next };
  safeWrite(FAVORITES_KEY, JSON.stringify(updated));
  return updated;
}
