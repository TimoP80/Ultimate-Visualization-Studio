/**
 * Small, dependency-free projections used by the renderer.
 *
 * Effects can live on a layer (applied before the layer is composited) or on
 * the scene (applied once every layer has been composited). Keeping the lookup
 * here means the renderer never has to know how the project is stored.
 *
 * Effects may also carry an optional timeline window (`start`/`end`). Missing
 * bounds mean the effect covers the whole host, so effects created before the
 * timeline lanes existed keep behaving exactly as they did.
 */

import type { EffectInstance, Layer, Scene } from '@/types';

export function effectActiveAt(effect: EffectInstance, time: number): boolean {
  if (effect.start !== undefined && time < effect.start) return false;
  if (effect.end !== undefined && time > effect.end) return false;
  return true;
}

export function layerEffectsOf(layer: Layer, time?: number): EffectInstance[] {
  const effects = layer.effects ?? [];
  return time === undefined ? effects : effects.filter((effect) => effectActiveAt(effect, time));
}

export function sceneEffectsOf(scene: Scene, time?: number): EffectInstance[] {
  const effects = scene.effects ?? [];
  return time === undefined ? effects : effects.filter((effect) => effectActiveAt(effect, time));
}
