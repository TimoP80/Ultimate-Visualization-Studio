/**
 * Layer bounds and pointer hit-testing for the preview stage.
 *
 * Text layers are hit-tested against their actual glyph box; every other layer
 * type covers the full frame, so its transformed frame quad is the hit area.
 * Layers are tested top-down (the last layer in the scene draws on top), which
 * makes overlapping selection predictable.
 */

import type { Layer, Scene } from '@/types';
import { textLayerBounds } from '@/render/textRaster';
import { ASPECT, containsPoint, type Bounds, type Vec } from './geometry';

/** Default box for a text layer that has no glyphs yet, so it stays clickable. */
const EMPTY_TEXT_BOUNDS: Bounds = { x0: 0.34, y0: 0.43, x1: 0.66, y1: 0.57 };

/** Extra pointer slop around text glyphs, in CSS pixels. */
const TEXT_HIT_PAD = 5;

export function layerContentBounds(layer: Layer): Bounds {
  if (layer.type === 'text') {
    return textLayerBounds(layer) ?? EMPTY_TEXT_BOUNDS;
  }
  return { x0: 0, y0: 0, x1: 1, y1: 1 };
}

function hitPad(layer: Layer, box: { width: number; height: number }): Vec {
  if (layer.type !== 'text') return { x: 0, y: 0 };
  return {
    x: TEXT_HIT_PAD / Math.max(1, Math.abs(layer.transform.scaleX) * ASPECT * box.width),
    y: TEXT_HIT_PAD / Math.max(1, Math.abs(layer.transform.scaleY) * box.height),
  };
}

/** Is the layer drawn at `time` (mirrors the renderer's layer filter)? */
export function layerActiveAt(layer: Layer, time: number): boolean {
  return time >= layer.start - 1e-6 && time <= layer.end + 1e-6;
}

export function hitTestLayers(
  scene: Scene,
  point: Vec,
  time: number,
  box: { width: number; height: number },
): Layer | null {
  const solo = scene.layers.some((layer) => layer.solo && layer.visible);
  for (let index = scene.layers.length - 1; index >= 0; index--) {
    const layer = scene.layers[index];
    // Hidden layers and layers muted by a solo are not on screen.
    if (!layer.visible || (solo && !layer.solo)) continue;
    // Locked layers are click-through on the canvas, like a locked layer in a
    // compositing app. They stay selectable from the layer lists.
    if (layer.locked) continue;
    if (!layerActiveAt(layer, time)) continue;
    if (containsPoint(point, layerContentBounds(layer), layer.transform, hitPad(layer, box))) {
      return layer;
    }
  }
  return null;
}
