/**
 * Text layer rasterisation.
 *
 * Text layers are drawn with the Canvas 2D API and uploaded as a texture, which
 * keeps glyph shaping, kerning and font fallbacks in the browser where they are
 * well supported, while the GPU still does the compositing, blending and
 * audio-reactive distortion.
 *
 * The same layout maths also feeds {@link textLayerBounds}, which the preview
 * gizmo uses to draw move/scale handles around the actual glyphs.
 */

import type { Layer } from '@/types';

const FONT_STACK =
  "Inter, 'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif";

const RASTER_WIDTH = 2048;
const RASTER_HEIGHT = 1024;
const RASTER_PADDING = 96;

/** Glyph box in normalised raster space (0..1). */
export interface TextBounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Raster layout of a text layer, in raster pixels. */
export interface TextMetrics {
  /** Font size the copy is rasterised at. */
  size: number;
  /** Advance width including tracking. */
  width: number;
  /** Ink height above the baseline. */
  ascent: number;
  /** Ink depth below the baseline. */
  descent: number;
  /** Extra advance added after each glyph for tracked text. */
  step: number;
  /** Ink left edge relative to the pen origin (positive when glyphs overhang). */
  inkLeft: number;
  /** Ink right edge relative to the pen origin. */
  inkRight: number;
}

/** Tracking below this many pixels is drawn as one shaped string. */
const TRACK_EPSILON = 0.01;

interface InkMetrics {
  width: number;
  ascent: number;
  descent: number;
  inkLeft: number;
  inkRight: number;
}

/**
 * Measure the exact ink box the raster will paint.
 *
 * The text is always painted from the pen origin on the alphabetic baseline
 * (`textAlign: left`, `textBaseline: alphabetic`), so the measurement uses the
 * same origin. Canvas reports `actualBoundingBox*` relative to the alignment
 * point and baseline, which is what the gizmo needs to match the pixels rather
 * than the font's em box.
 */
function measureInk(
  ctx: CanvasRenderingContext2D,
  text: string,
  step: number,
  size: number,
): InkMetrics {
  const fallbackAscent = size * 0.74;
  const fallbackDescent = size * 0.26;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  if (step <= TRACK_EPSILON) {
    const metrics = ctx.measureText(text);
    const ascent = metrics.actualBoundingBoxAscent;
    const descent = metrics.actualBoundingBoxDescent;
    const inkLeft = -metrics.actualBoundingBoxLeft;
    const inkRight = metrics.actualBoundingBoxRight;
    const hasInk =
      inkRight > inkLeft || ascent > 0 || descent > 0 || metrics.actualBoundingBoxLeft > 0;
    if (!hasInk) {
      // Whitespace-only copy has no ink box; fall back to the advance width.
      return {
        width: metrics.width,
        ascent: fallbackAscent,
        descent: fallbackDescent,
        inkLeft: 0,
        inkRight: metrics.width,
      };
    }
    return {
      width: metrics.width,
      ascent,
      descent,
      inkLeft,
      inkRight,
    };
  }

  let pen = 0;
  let width = 0;
  let inkLeft = Infinity;
  let inkRight = -Infinity;
  let ascent = 0;
  let descent = 0;
  for (const glyph of text) {
    const metrics = ctx.measureText(glyph);
    const left = pen - metrics.actualBoundingBoxLeft;
    const right = pen + metrics.actualBoundingBoxRight;
    if (
      metrics.actualBoundingBoxRight > 0 ||
      metrics.actualBoundingBoxLeft > 0 ||
      metrics.actualBoundingBoxAscent > 0 ||
      metrics.actualBoundingBoxDescent > 0
    ) {
      inkLeft = Math.min(inkLeft, left);
      inkRight = Math.max(inkRight, right);
      ascent = Math.max(ascent, metrics.actualBoundingBoxAscent);
      descent = Math.max(descent, metrics.actualBoundingBoxDescent);
    }
    width = pen + metrics.width;
    pen = width + step;
  }

  if (!Number.isFinite(inkLeft) || !Number.isFinite(inkRight)) {
    return {
      width: Math.max(0, width),
      ascent: fallbackAscent,
      descent: fallbackDescent,
      inkLeft: 0,
      inkRight: Math.max(0, width),
    };
  }
  return {
    width: Math.max(0, width),
    ascent,
    descent,
    inkLeft,
    inkRight,
  };
}

interface CachedText {
  key: string;
  canvas: HTMLCanvasElement;
}

const cache = new Map<string, CachedText>();

let measureCanvas: HTMLCanvasElement | null = null;

function textKey(layer: Layer): string {
  return [
    layer.text ?? '',
    layer.palette.a,
    layer.palette.b,
    layer.params.fontSize ?? 1,
    layer.params.letterSpacing ?? 0,
    layer.params.weight ?? 800,
  ].join('|');
}

/** Fit the copy to the raster and measure it without touching the GPU texture. */
function textLayout(layer: Layer, text: string): TextMetrics | null {
  if (!measureCanvas) measureCanvas = document.createElement('canvas');
  const ctx = measureCanvas.getContext('2d');
  if (!ctx) return null;

  const weight = typeof layer.params.weight === 'number' ? layer.params.weight : 800;
  const sizeParam = typeof layer.params.fontSize === 'number' ? layer.params.fontSize : 1;
  const tracking = typeof layer.params.letterSpacing === 'number' ? layer.params.letterSpacing : 0;

  // Binary-search the largest size that still fits inside the padding box.
  const maxWidth = RASTER_WIDTH - RASTER_PADDING * 2;
  const maxHeight = RASTER_HEIGHT - RASTER_PADDING * 2;
  let size = 240 * sizeParam;
  ctx.font = `${weight} ${size}px ${FONT_STACK}`;
  const measured = ctx.measureText(text);
  const widthAtSize = measured.width + tracking * size * Math.max(0, text.length - 1);
  if (widthAtSize > maxWidth && widthAtSize > 0) {
    size = Math.max(12, size * (maxWidth / widthAtSize));
  }
  if (size > maxHeight) size = maxHeight;

  ctx.font = `${weight} ${size}px ${FONT_STACK}`;
  const step = tracking * size;
  const ink = measureInk(ctx, text, step, size);

  return {
    size,
    width: ink.width,
    ascent: ink.ascent,
    descent: ink.descent,
    step,
    inkLeft: ink.inkLeft,
    inkRight: ink.inkRight,
  };
}

/**
 * Raster layout of the layer's trimmed copy. The preview's inline text editor
 * uses it so its type matches what {@link rasterizeTextLayer} draws.
 */
export function textLayerMetrics(layer: Layer): TextMetrics | null {
  const text = (layer.text ?? '').trim();
  if (!text) return null;
  return textLayout(layer, text);
}

/** Glyph box of the layer's text, normalised to the raster. */
export function textLayerBounds(layer: Layer): TextBounds | null {
  const text = (layer.text ?? '').trim();
  if (!text) return null;
  const layout = textLayout(layer, text);
  if (!layout) return null;

  // The raster centres the *ink* box, not the advance box: the pen origin is
  // shifted so the leftmost and rightmost ink sit either side of centre, and
  // the baseline is placed so the ink is vertically centred.
  const originX = RASTER_WIDTH * 0.5 - (layout.inkLeft + layout.inkRight) * 0.5;
  const left = originX + layout.inkLeft;
  const top = RASTER_HEIGHT * 0.5 - (layout.ascent + layout.descent) * 0.5;
  const bottom = top + layout.ascent + layout.descent;
  // Textures are uploaded with UNPACK_FLIP_Y_WEBGL, so layer v runs opposite to
  // canvas y: the ink that starts at `top` on the canvas ends at `1 - top` in v.
  return {
    x0: Math.max(0, left / RASTER_WIDTH),
    y0: Math.max(0, 1 - bottom / RASTER_HEIGHT),
    x1: Math.min(1, (originX + layout.inkRight) / RASTER_WIDTH),
    y1: Math.min(1, 1 - top / RASTER_HEIGHT),
  };
}

/**
 * Render a text layer into a transparent canvas, auto-fitting the copy to the
 * raster width. Returns null when the layer has no text.
 */
export function rasterizeTextLayer(layer: Layer): HTMLCanvasElement | null {
  const text = (layer.text ?? '').trim();
  if (!text) return null;
  const layout = textLayout(layer, text);
  if (!layout) return null;

  const key = textKey(layer);
  const cached = cache.get(layer.id);
  if (cached && cached.key === key) return cached.canvas;

  const canvas = cached?.canvas ?? document.createElement('canvas');
  canvas.width = RASTER_WIDTH;
  canvas.height = RASTER_HEIGHT;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.clearRect(0, 0, RASTER_WIDTH, RASTER_HEIGHT);

  const { size, step, inkLeft, inkRight, ascent, descent } = layout;
  ctx.font = `${typeof layer.params.weight === 'number' ? layer.params.weight : 800} ${size}px ${FONT_STACK}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // Place the pen so the measured ink box lands exactly where
  // {@link textLayerBounds} says it does.
  const x = RASTER_WIDTH * 0.5 - (inkLeft + inkRight) * 0.5;
  const y = RASTER_HEIGHT * 0.5 + (ascent - descent) * 0.5;

  // Paint the glyphs in white; the shader tints them with the palette.
  const gradient = ctx.createLinearGradient(0, y - size * 0.5, 0, y + size * 0.5);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(1, '#cfd4e0');
  ctx.fillStyle = gradient;

  if (step > TRACK_EPSILON) {
    let pen = x;
    for (const ch of text) {
      const advance = ctx.measureText(ch).width;
      ctx.fillText(ch, pen, y);
      pen += advance + step;
    }
  } else {
    ctx.fillText(text, x, y);
  }

  cache.set(layer.id, { key, canvas });
  return canvas;
}

export function clearTextCache(layerId?: string): void {
  if (layerId) cache.delete(layerId);
  else cache.clear();
}
