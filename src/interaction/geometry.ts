/**
 * Canvas interaction geometry.
 *
 * Everything here is pure maths shared by the on-canvas selection overlay and
 * the regression tests. Coordinates are "stage space": x/y in 0..1 with y
 * pointing **up**, matching the composite shader's UV space. The overlay flips
 * y only when it draws DOM/SVG.
 *
 * The transform model is the same one `COMPOSITE_FRAG` implements:
 *
 *   suv = 0.5 + A^-1 * rot2(r) * A * scale * (luv - 0.5 + translate)
 *
 * where A stretches x by the frame aspect. Keeping the inverse in one place is
 * what makes hit-testing, handles and the rendered image agree at any zoom.
 */

export interface Vec {
  x: number;
  y: number;
}

/** Layer rectangle in its own UV space (0..1). */
export interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface TransformLike {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
}

export const ASPECT = 16 / 9;
export const MIN_SCALE = 0.05;
export const MAX_SCALE = 8;

const TAU = Math.PI * 2;
const EPSILON = 1e-6;

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function normalizeAngle(angle: number): number {
  const wrapped = ((angle + Math.PI) % TAU + TAU) % TAU;
  return wrapped - Math.PI;
}

export function boundsWidth(bounds: Bounds): number {
  return Math.max(EPSILON, bounds.x1 - bounds.x0);
}

export function boundsHeight(bounds: Bounds): number {
  return Math.max(EPSILON, bounds.y1 - bounds.y0);
}

/** Centre of a layer rectangle, in layer UV space. */
export function boundsCentre(bounds: Bounds): Vec {
  return { x: (bounds.x0 + bounds.x1) / 2, y: (bounds.y0 + bounds.y1) / 2 };
}

/** Map a layer-space point to stage space. */
export function layerToStage(point: Vec, transform: TransformLike): Vec {
  const ax = (point.x - 0.5 + transform.x) * ASPECT;
  const ay = point.y - 0.5 + transform.y;
  const sx = ax * transform.scaleX;
  const sy = ay * transform.scaleY;
  const cos = Math.cos(transform.rotation);
  const sin = Math.sin(transform.rotation);
  return {
    x: (cos * sx + sin * sy) / ASPECT + 0.5,
    y: -sin * sx + cos * sy + 0.5,
  };
}

/** Inverse of {@link layerToStage}; the same mapping the composite shader uses. */
export function stageToLayer(point: Vec, transform: TransformLike): Vec {
  const qx = (point.x - 0.5) * ASPECT;
  const qy = point.y - 0.5;
  const cos = Math.cos(transform.rotation);
  const sin = Math.sin(transform.rotation);
  const rx = cos * qx - sin * qy;
  const ry = sin * qx + cos * qy;
  return {
    x: rx / (ASPECT * transform.scaleX) + 0.5 - transform.x,
    y: ry / transform.scaleY + 0.5 - transform.y,
  };
}

/** Inverse transform applied to stage-space pixel offsets rather than points. */
export function stageDeltaToLayerDelta(transform: TransformLike, du: number, dv: number): Vec {
  const cos = Math.cos(transform.rotation);
  const sin = Math.sin(transform.rotation);
  const sx = Math.max(EPSILON, Math.abs(transform.scaleX));
  const sy = Math.max(EPSILON, Math.abs(transform.scaleY));
  return {
    x: (cos * du - (sin * dv) / ASPECT) / sx,
    y: (sin * ASPECT * du + cos * dv) / sy,
  };
}

/**
 * Translation that puts the given layer-space point at `target` in stage space.
 * Used to keep a glyph centre or the opposite resize corner exactly fixed.
 */
export function translateForLayerPoint(
  point: Vec,
  target: Vec,
  scaleX: number,
  scaleY: number,
  rotation: number,
): Vec {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const dx = (target.x - 0.5) * ASPECT;
  const dy = target.y - 0.5;
  // rot2(-rotation) followed by the aspect correction, matching the shader.
  const rx = cos * dx - sin * dy;
  const ry = sin * dx + cos * dy;
  return {
    x: rx / (ASPECT * Math.max(EPSILON, Math.abs(scaleX))) - (point.x - 0.5),
    y: ry / Math.max(EPSILON, Math.abs(scaleY)) - (point.y - 0.5),
  };
}

/** Stage-space position of the rectangle centre. */
export function boundsCentreStage(bounds: Bounds, transform: TransformLike): Vec {
  return layerToStage(boundsCentre(bounds), transform);
}

/** Four corners of a layer rectangle in stage space. */
export function quadFor(bounds: Bounds, transform: TransformLike): Vec[] {
  return [
    { x: bounds.x0, y: bounds.y0 },
    { x: bounds.x1, y: bounds.y0 },
    { x: bounds.x1, y: bounds.y1 },
    { x: bounds.x0, y: bounds.y1 },
  ].map((corner) => layerToStage(corner, transform));
}

/**
 * Is a stage-space point inside the layer rectangle? Uses the inverse transform
 * instead of a polygon test so it stays exact when the overlay is resized.
 */
export function containsPoint(
  point: Vec,
  bounds: Bounds,
  transform: TransformLike,
  pad: Vec = { x: 0, y: 0 },
): boolean {
  const local = stageToLayer(point, transform);
  return (
    local.x >= bounds.x0 - pad.x &&
    local.x <= bounds.x1 + pad.x &&
    local.y >= bounds.y0 - pad.y &&
    local.y <= bounds.y1 + pad.y
  );
}

/* ------------------------------------------------------------------ */
/* Handles                                                             */
/* ------------------------------------------------------------------ */

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export interface HandleDef {
  id: HandleId;
  /** 0 = left/bottom edge, 1 = right/top edge, 0.5 = middle. */
  u: number;
  v: number;
  label: string;
}

export const HANDLES: readonly HandleDef[] = [
  { id: 'nw', u: 0, v: 1, label: 'Resize top-left' },
  { id: 'n', u: 0.5, v: 1, label: 'Resize top edge' },
  { id: 'ne', u: 1, v: 1, label: 'Resize top-right' },
  { id: 'e', u: 1, v: 0.5, label: 'Resize right edge' },
  { id: 'se', u: 1, v: 0, label: 'Resize bottom-right' },
  { id: 's', u: 0.5, v: 0, label: 'Resize bottom edge' },
  { id: 'sw', u: 0, v: 0, label: 'Resize bottom-left' },
  { id: 'w', u: 0, v: 0.5, label: 'Resize left edge' },
];

const HANDLE_MAP: Record<HandleId, HandleDef> = HANDLES.reduce(
  (map, handle) => {
    map[handle.id] = handle;
    return map;
  },
  {} as Record<HandleId, HandleDef>,
);

export function handleDef(id: HandleId): HandleDef {
  return HANDLE_MAP[id];
}

/** Stage-space position of a resize handle. */
export function handlePoint(bounds: Bounds, transform: TransformLike, id: HandleId): Vec {
  const handle = handleDef(id);
  return layerToStage(
    {
      x: bounds.x0 + boundsWidth(bounds) * handle.u,
      y: bounds.y0 + boundsHeight(bounds) * handle.v,
    },
    transform,
  );
}

/** A CSS cursor that follows the layer's rotation for each handle. */
export function handleCursor(id: HandleId, rotation: number): string {
  const def = handleDef(id);
  // Screen angle of the outward normal, y down. Rotation in stage space maps to
  // the opposite screen angle; 45° buckets are close enough for a cursor.
  const stageAngle = Math.atan2(def.v - 0.5, def.u - 0.5);
  const screen = (rotation - stageAngle) * (180 / Math.PI);
  const bucket = ((Math.round(screen / 45) % 4) + 4) % 4;
  return ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'][bucket];
}

/* ------------------------------------------------------------------ */
/* Resize                                                              */
/* ------------------------------------------------------------------ */

export interface ResizeInput {
  bounds: Bounds;
  /** Transform at the start of the drag; never mutated. */
  transform: TransformLike;
  handle: HandleId;
  /** Pointer in stage space (0..1, y up). */
  pointer: Vec;
  /** Shift: preserve the rectangle's aspect ratio. */
  uniform: boolean;
  /** Alt: resize around the centre instead of the opposite edge. */
  fromCentre: boolean;
}

export interface ResizeResult {
  scaleX: number;
  scaleY: number;
  /** Stage-space position of the rectangle centre after the resize. */
  centre: Vec;
}

function aspectPoint(point: Vec): Vec {
  return { x: (point.x - 0.5) * ASPECT, y: point.y - 0.5 };
}

function stagePointFromAspect(point: Vec): Vec {
  return { x: point.x / ASPECT + 0.5, y: point.y + 0.5 };
}

/**
 * Resize a layer rectangle from a handle.
 *
 * The rectangle is treated as an oriented box in aspect space, where the
 * composite transform is a pure rotation. The opposite corner (or the centre
 * with Alt) is the fixed anchor, so the layer never "walks" while being sized.
 */
export function resizeFromPointer(input: ResizeInput): ResizeResult {
  const { bounds, transform, handle, pointer, uniform, fromCentre } = input;
  const def = handleDef(handle);
  const su = def.u === 0 ? -1 : def.u === 1 ? 1 : 0;
  const sv = def.v === 0 ? -1 : def.v === 1 ? 1 : 0;

  const width0 = boundsWidth(bounds);
  const height0 = boundsHeight(bounds);
  // Aspect space stretches x by ASPECT, so a local unit width spans
  // `ASPECT * scaleX` there while a local unit height spans `scaleY`.
  const baseWidth = width0 * transform.scaleX * ASPECT;
  const baseHeight = height0 * transform.scaleY;

  const centre = aspectPoint(boundsCentreStage(bounds, transform));
  const cos = Math.cos(transform.rotation);
  const sin = Math.sin(transform.rotation);
  const u = { x: cos, y: -sin };
  const v = { x: sin, y: cos };
  const p = aspectPoint(pointer);

  // Anchor: opposite corner for a corner handle, opposite edge midpoint for an
  // edge handle and the centre when resizing from the centre.
  const anchor = fromCentre
    ? centre
    : {
        x: centre.x - u.x * su * (baseWidth / 2) - v.x * sv * (baseHeight / 2),
        y: centre.y - u.y * su * (baseWidth / 2) - v.y * sv * (baseHeight / 2),
      };

  const offset = { x: p.x - anchor.x, y: p.y - anchor.y };
  const alongU = offset.x * u.x + offset.y * u.y;
  const alongV = offset.x * v.x + offset.y * v.y;

  let width = baseWidth;
  let height = baseHeight;
  if (fromCentre) {
    // Mirror the pointer across the centre.
    if (su !== 0) width = Math.max(EPSILON, Math.abs(alongU) * 2);
    if (sv !== 0) height = Math.max(EPSILON, Math.abs(alongV) * 2);
  } else {
    if (su !== 0) width = Math.max(EPSILON, alongU * su);
    if (sv !== 0) height = Math.max(EPSILON, alongV * sv);
  }

  if (uniform) {
    let factor: number | null = null;
    if (su !== 0) factor = width / Math.max(EPSILON, baseWidth);
    if (sv !== 0) {
      const fy = height / Math.max(EPSILON, baseHeight);
      if (factor === null || Math.abs(fy - 1) > Math.abs(factor - 1)) factor = fy;
    }
    if (factor === null) factor = 1;
    width = baseWidth * factor;
    height = baseHeight * factor;
  }

  const scaleX = clamp(width / (width0 * ASPECT), MIN_SCALE, MAX_SCALE);
  const scaleY = clamp(height / height0, MIN_SCALE, MAX_SCALE);
  const finalWidth = width0 * scaleX * ASPECT;
  const finalHeight = height0 * scaleY;

  const newCentre = fromCentre
    ? centre
    : {
        x: anchor.x + u.x * su * (finalWidth / 2) + v.x * sv * (finalHeight / 2),
        y: anchor.y + u.y * su * (finalWidth / 2) + v.y * sv * (finalHeight / 2),
      };

  return { scaleX, scaleY, centre: stagePointFromAspect(newCentre) };
}

/* ------------------------------------------------------------------ */
/* Rotation                                                            */
/* ------------------------------------------------------------------ */

export interface RotationInput {
  /** Stage-space point the layer rotates around (the rectangle centre). */
  centre: Vec;
  rotation: number;
  /** Pointer position when the drag started. */
  startPointer: Vec;
  pointer: Vec;
  /** Shift: snap to 15° increments. */
  snap: boolean;
}

/** Angle of a stage point around a centre, measured in aspect space. */
export function angleAround(centre: Vec, point: Vec): number {
  const c = aspectPoint(centre);
  const p = aspectPoint(point);
  return Math.atan2(p.y - c.y, p.x - c.x);
}

/**
 * Rotation for a pointer drag around the rotation handle. The handle sits on
 * the layer's +v axis, so rotating follows the pointer exactly at any aspect
 * ratio.
 */
export function rotationFromPointer(input: RotationInput): number {
  const { centre, rotation, startPointer, pointer, snap } = input;
  const startAngle = angleAround(centre, startPointer);
  const currentAngle = angleAround(centre, pointer);
  let next = rotation + (startAngle - currentAngle);
  if (snap) next = Math.round(next / (Math.PI / 12)) * (Math.PI / 12);
  return normalizeAngle(next);
}

/* ------------------------------------------------------------------ */
/* Alignment guides                                                    */
/* ------------------------------------------------------------------ */

export interface SnapResult {
  point: Vec;
  guideX: number | null;
  guideY: number | null;
}

export function snapPoint(
  point: Vec,
  candidatesX: readonly number[],
  candidatesY: readonly number[],
  threshold: number,
): SnapResult {
  let bestX: number | null = null;
  let bestXDistance = threshold;
  for (const candidate of candidatesX) {
    const distance = Math.abs(candidate - point.x);
    if (distance <= bestXDistance) {
      bestXDistance = distance;
      bestX = candidate;
    }
  }

  let bestY: number | null = null;
  let bestYDistance = threshold;
  for (const candidate of candidatesY) {
    const distance = Math.abs(candidate - point.y);
    if (distance <= bestYDistance) {
      bestYDistance = distance;
      bestY = candidate;
    }
  }

  return {
    point: { x: bestX ?? point.x, y: bestY ?? point.y },
    guideX: bestX,
    guideY: bestY,
  };
}

/** Inset composition guides (thirds + centre + title-safe box). */
export const GUIDE_THIRDS = [1 / 3, 2 / 3] as const;
export const SAFE_AREA = 0.05;
