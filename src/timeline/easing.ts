/**
 * Easing curves and Bezier evaluation used by keyframes and transitions.
 */

export type EasingName = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'bezier';

export type BezierPoints = [number, number, number, number];

export const EASING_PRESETS: { id: EasingName; label: string; points?: BezierPoints }[] = [
  { id: 'linear', label: 'Linear' },
  { id: 'easeIn', label: 'Ease In' },
  { id: 'easeOut', label: 'Ease Out' },
  { id: 'easeInOut', label: 'Ease In-Out' },
  { id: 'bezier', label: 'Bezier', points: [0.34, 0, 0.16, 1] },
];

/** Cubic bezier with fixed endpoints at (0,0) and (1,1). */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const sampleDx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    // Newton–Raphson with a bisection fallback for pathological curves.
    let t = x;
    for (let i = 0; i < 6; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-6) return sampleY(t);
      const d = sampleDx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 20; i++) {
      const v = sampleX(t);
      if (Math.abs(v - x) < 1e-6) break;
      if (v < x) lo = t;
      else hi = t;
      t = (lo + hi) * 0.5;
    }
    return sampleY(t);
  };
}

const BEZIER_CACHE = new Map<string, (t: number) => number>();

function cachedBezier(points: BezierPoints): (t: number) => number {
  const key = points.join(',');
  let fn = BEZIER_CACHE.get(key);
  if (!fn) {
    fn = cubicBezier(points[0], points[1], points[2], points[3]);
    BEZIER_CACHE.set(key, fn);
  }
  return fn;
}

export function applyEasing(t: number, easing: EasingName, points?: BezierPoints): number {
  const x = Math.max(0, Math.min(1, t));
  switch (easing) {
    case 'linear':
      return x;
    case 'easeIn':
      return x * x * x;
    case 'easeOut':
      return 1 - Math.pow(1 - x, 3);
    case 'easeInOut':
      return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    case 'bezier':
      return cachedBezier(points ?? [0.34, 0, 0.16, 1])(x);
    default:
      return x;
  }
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0 || 1)));
  return t * t * (3 - 2 * t);
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, min: number, max: number) => (v < min ? min : v > max ? max : v);
export const clamp01 = (v: number) => clamp(v, 0, 1);

/** Blend modes in the same order as the composite shader's uBlend switch. */
export const BLEND_MODES = [
  'normal',
  'add',
  'screen',
  'multiply',
  'overlay',
  'lighten',
  'difference',
] as const;

export function blendModeIndex(mode: string): number {
  const i = (BLEND_MODES as readonly string[]).indexOf(mode);
  return i < 0 ? 0 : i;
}
