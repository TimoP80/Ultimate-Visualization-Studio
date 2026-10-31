/**
 * Regression tests for the canvas selection geometry.
 *
 * These cover the maths that the intermittent selection bug depended on:
 * stage <-> layer coordinate conversion, hit-testing rotated elements, the
 * fixed-corner resize solver and rotation anchoring. Run with `npm test`.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ASPECT,
  HANDLES,
  MAX_SCALE,
  MIN_SCALE,
  boundsCentre,
  boundsCentreStage,
  containsPoint,
  handlePoint,
  layerToStage,
  normalizeAngle,
  quadFor,
  resizeFromPointer,
  rotationFromPointer,
  snapPoint,
  stageToLayer,
  translateForLayerPoint,
  type Bounds,
  type TransformLike,
} from '../src/interaction/geometry.ts';

const identity: TransformLike = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 };
const glyphBounds: Bounds = { x0: 0.4, y0: 0.45, x1: 0.6, y1: 0.55 };
const frameBounds: Bounds = { x0: 0, y0: 0, x1: 1, y1: 1 };

const near = (actual: number, expected: number, tolerance = 1e-9): void => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
};

const nearPoint = (
  actual: { x: number; y: number },
  expected: { x: number; y: number },
  tolerance = 1e-7,
): void => {
  near(actual.x, expected.x, tolerance);
  near(actual.y, expected.y, tolerance);
};

const transforms: TransformLike[] = [
  identity,
  { x: 0.12, y: -0.07, scaleX: 1.35, scaleY: 0.72, rotation: 0.63 },
  { x: -0.21, y: 0.18, scaleX: 0.48, scaleY: 1.9, rotation: -1.12 },
  { x: 0, y: 0, scaleX: 2.4, scaleY: 2.4, rotation: Math.PI / 2 },
];

test('stage and layer coordinates round-trip for every transform', () => {
  const points = [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
    { x: 0.5, y: 0.5 },
    { x: 0.2, y: 0.8 },
    { x: 0.73, y: 0.11 },
  ];
  for (const transform of transforms) {
    for (const point of points) {
      const stage = layerToStage(point, transform);
      const local = stageToLayer(stage, transform);
      nearPoint(local, point);
    }
  }
});

test('a point inside the transformed glyph box is hit at any rotation and scale', () => {
  for (const transform of transforms) {
    const centre = layerToStage({ x: 0.5, y: 0.5 }, transform);
    assert.equal(containsPoint(centre, glyphBounds, transform), true);
    // Every corner of the transformed quad must be on the edge of the box.
    for (const corner of quadFor(glyphBounds, transform)) {
      const local = stageToLayer(corner, transform);
      assert.ok(local.x >= glyphBounds.x0 - 1e-9 && local.x <= glyphBounds.x1 + 1e-9);
      assert.ok(local.y >= glyphBounds.y0 - 1e-9 && local.y <= glyphBounds.y1 + 1e-9);
    }
  }
});

test('clicks outside a rotated glyph box do not select it', () => {
  const transform: TransformLike = { ...identity, rotation: 0.7 };
  const inside = layerToStage({ x: 0.5, y: 0.5 }, transform);
  const outside = layerToStage({ x: 0.9, y: 0.9 }, transform);
  assert.equal(containsPoint(inside, glyphBounds, transform), true);
  assert.equal(containsPoint(outside, glyphBounds, transform), false);
  // The same stage point in a different layer's quad is rejected too.
  assert.equal(containsPoint({ x: 0.02, y: 0.02 }, glyphBounds, identity), false);
});

test('text hit padding widens thin glyphs without changing the outline', () => {
  const outsideNear = layerToStage({ x: 0.61, y: 0.5 }, identity);
  assert.equal(containsPoint(outsideNear, glyphBounds, identity), false);
  assert.equal(containsPoint(outsideNear, glyphBounds, identity, { x: 0.02, y: 0 }), true);
});

test('hit-testing a full-frame layer uses its transformed quad', () => {
  const scaled: TransformLike = { x: 0, y: 0, scaleX: 0.5, scaleY: 0.5, rotation: 0 };
  assert.equal(containsPoint({ x: 0.5, y: 0.5 }, frameBounds, scaled), true);
  assert.equal(containsPoint({ x: 0.05, y: 0.5 }, frameBounds, scaled), false);
  const moved: TransformLike = { ...identity, x: 0.2 };
  assert.equal(containsPoint({ x: 0.68, y: 0.5 }, frameBounds, moved), true);
  assert.equal(containsPoint({ x: 0.1, y: 0.5 }, frameBounds, moved), false);
});

test('rotation preserves the transform centre exactly', () => {
  const transform: TransformLike = { x: 0.13, y: -0.04, scaleX: 1.2, scaleY: 0.8, rotation: 0.4 };
  const centre = boundsCentreStage(frameBounds, transform);
  const translate = translateForLayerPoint(boundsCentre(frameBounds), centre, transform.scaleX, transform.scaleY, transform.rotation);
  near(translate.x, transform.x);
  near(translate.y, transform.y);
});

test('corner resize keeps the opposite corner fixed', () => {
  const base: TransformLike = { x: 0.08, y: -0.12, scaleX: 1.1, scaleY: 0.9, rotation: 0.35 };
  const anchor = boundsCentre(frameBounds);
  const pointer = layerToStage({ x: 1.3, y: -0.4 }, base);
  const result = resizeFromPointer({
    bounds: frameBounds,
    transform: base,
    handle: 'se',
    pointer,
    uniform: false,
    fromCentre: false,
  });
  const translate = translateForLayerPoint(anchor, result.centre, result.scaleX, result.scaleY, base.rotation);
  const next: TransformLike = { ...base, ...translate, scaleX: result.scaleX, scaleY: result.scaleY };
  nearPoint(layerToStage({ x: 0, y: 1 }, next), layerToStage({ x: 0, y: 1 }, base));
  nearPoint(layerToStage({ x: 1, y: 0 }, next), pointer);
});

test('edge resize changes one axis and keeps the opposite edge fixed', () => {
  const base: TransformLike = { ...identity, rotation: -0.2 };
  const pointer = layerToStage({ x: 1.25, y: 0.5 }, base);
  const result = resizeFromPointer({
    bounds: frameBounds,
    transform: base,
    handle: 'e',
    pointer,
    uniform: false,
    fromCentre: false,
  });
  near(result.scaleY, base.scaleY);
  const anchor = boundsCentre(frameBounds);
  const translate = translateForLayerPoint(anchor, result.centre, result.scaleX, result.scaleY, base.rotation);
  const next: TransformLike = { ...base, ...translate, scaleX: result.scaleX, scaleY: result.scaleY };
  // The left edge midpoint is the anchor for an east-handle resize.
  nearPoint(layerToStage({ x: 0, y: 0.5 }, next), layerToStage({ x: 0, y: 0.5 }, base));
});

test('shift resizing preserves the aspect ratio', () => {
  const base: TransformLike = { ...identity, scaleX: 1.3, scaleY: 0.8 };
  const result = resizeFromPointer({
    bounds: frameBounds,
    transform: base,
    handle: 'se',
    pointer: layerToStage({ x: 1.4, y: 0.15 }, base),
    uniform: true,
    fromCentre: false,
  });
  near(result.scaleX / base.scaleX, result.scaleY / base.scaleY, 1e-9);
});

test('alt resizing grows around a fixed centre', () => {
  const base: TransformLike = { ...identity, rotation: 0.9, scaleX: 0.7, scaleY: 0.7 };
  const centre = boundsCentreStage(frameBounds, base);
  const result = resizeFromPointer({
    bounds: frameBounds,
    transform: base,
    handle: 'nw',
    pointer: layerToStage({ x: 0.1, y: 0.9 }, base),
    uniform: false,
    fromCentre: true,
  });
  nearPoint(result.centre, centre);
});

test('resize clamps to the supported scale range', () => {
  const tiny = resizeFromPointer({
    bounds: frameBounds,
    transform: identity,
    handle: 'se',
    pointer: { x: 0.50001, y: 0.50001 },
    uniform: false,
    fromCentre: false,
  });
  assert.ok(tiny.scaleX >= MIN_SCALE && tiny.scaleY >= MIN_SCALE);

  const huge = resizeFromPointer({
    bounds: frameBounds,
    transform: identity,
    handle: 'se',
    pointer: { x: 12, y: -12 },
    uniform: false,
    fromCentre: false,
  });
  assert.ok(huge.scaleX <= MAX_SCALE && huge.scaleY <= MAX_SCALE);
});

test('every handle produces a usable scale', () => {
  for (const handle of HANDLES) {
    const point = handlePoint(glyphBounds, identity, handle.id);
    const outward = {
      x: point.x + (point.x - 0.5) * 0.4,
      y: point.y + (point.y - 0.5) * 0.4,
    };
    const result = resizeFromPointer({
      bounds: glyphBounds,
      transform: identity,
      handle: handle.id,
      pointer: outward,
      uniform: false,
      fromCentre: false,
    });
    assert.ok(Number.isFinite(result.scaleX) && result.scaleX > 0, `${handle.id} scaleX`);
    assert.ok(Number.isFinite(result.scaleY) && result.scaleY > 0, `${handle.id} scaleY`);
  }
});

test('rotation follows the pointer around the centre', () => {
  const centre = { x: 0.5, y: 0.5 };
  const rotation = rotationFromPointer({
    centre,
    rotation: 0,
    startPointer: { x: 0.5, y: 0.6 },
    pointer: { x: 0.6, y: 0.5 },
    snap: false,
  });
  near(rotation, Math.PI / 2, 1e-9);
});

test('shift rotation snaps to 15 degree increments', () => {
  const rotation = rotationFromPointer({
    centre: { x: 0.5, y: 0.5 },
    rotation: 0.1,
    startPointer: { x: 0.5, y: 0.6 },
    pointer: { x: 0.6, y: 0.5 },
    snap: true,
  });
  near(rotation, Math.PI / 2, 1e-9);
});

test('angles normalise into [-PI, PI)', () => {
  near(normalizeAngle(3 * Math.PI), -Math.PI, 1e-12);
  near(normalizeAngle(-3 * Math.PI), -Math.PI, 1e-12);
  near(normalizeAngle(Math.PI / 3), Math.PI / 3);
});

test('centre snapping reports the guide it used', () => {
  const snapped = snapPoint({ x: 0.505, y: 0.66 }, [0.5, 1 / 3, 2 / 3], [0.5, 1 / 3], 0.01);
  assert.equal(snapped.point.x, 0.5);
  assert.equal(snapped.guideX, 0.5);
  assert.equal(snapped.point.y, 0.66);
  assert.equal(snapped.guideY, null);

  const free = snapPoint({ x: 0.2, y: 0.2 }, [0.5], [0.5], 0.01);
  nearPoint(free.point, { x: 0.2, y: 0.2 });
  assert.equal(free.guideX, null);
});

test('aspect correction keeps the overlay aligned with the composite shader', () => {
  // A quarter turn maps a horizontal layer step onto screen y, stretched by the
  // frame aspect exactly like the composite shader does.
  const rotated: TransformLike = { ...identity, rotation: Math.PI / 2 };
  const origin = layerToStage({ x: 0.5, y: 0.5 }, rotated);
  const alongX = layerToStage({ x: 0.6, y: 0.5 }, rotated);
  near(alongX.x - origin.x, 0, 1e-12);
  near(Math.abs(alongX.y - origin.y), 0.1 * ASPECT);
});
