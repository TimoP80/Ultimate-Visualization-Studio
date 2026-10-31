/**
 * Unified on-canvas selection overlay.
 *
 * This is the single interaction surface for the preview: pointer-down anywhere
 * on the frame hit-tests the scene (topmost layer first), selects the element
 * and starts a move; the eight handles resize, the top handle rotates and a
 * double-click on a text layer opens the inline editor. It replaces the old
 * text-only gizmo, which only existed *after* a layer had already been selected
 * from a list and therefore could never select anything itself.
 *
 * All coordinate maths lives in `interaction/geometry` and uses the same
 * transform as the composite shader, so handles land on the rendered pixels at
 * every zoom and preview resolution.
 */

import { useEffect, useRef, useState } from 'react';
import type { Layer } from '@/types';
import { activeScene } from '@/state/project';
import { useStudio } from '@/state/store';
import { transport } from '@/state/transport';
import { textLayerMetrics } from '@/render/textRaster';
import {
  HANDLES,
  boundsCentre,
  boundsCentreStage,
  clamp,
  handleCursor,
  handlePoint,
  layerToStage,
  quadFor,
  resizeFromPointer,
  rotationFromPointer,
  snapPoint,
  stageDeltaToLayerDelta,
  translateForLayerPoint,
  type Bounds,
  type HandleId,
  type Vec,
} from '@/interaction/geometry';
import { hitTestLayers, layerContentBounds } from '@/interaction/hitTest';

interface TextEditor {
  layerId: string;
  boxWidth: number;
  boxHeight: number;
}

interface TextEditorPlacement {
  left: number;
  top: number;
  width: number;
  height: number;
  fontSize: number;
  letterSpacing: number;
  rotation: number;
}

interface Guides {
  x: number | null;
  y: number | null;
}

const SNAP_CANDIDATES = [0.5, 1 / 3, 2 / 3];
const SNAP_PIXELS = 7;
const DRAG_THRESHOLD_PX = 3;
const ROTATE_OFFSET_PX = 26;

/**
 * Inline editor placement that mirrors the render. The glyph box is mapped
 * through the layer transform and the raster font size/tracking are scaled by
 * the same factors, so the edit box's type matches what the shader draws.
 */
function editorForBounds(layer: Layer, bounds: Bounds, box: { width: number; height: number }): TextEditorPlacement {
  const metrics = textLayerMetrics(layer);
  const centreX = (bounds.x0 + bounds.x1) / 2;
  const centreY = (bounds.y0 + bounds.y1) / 2;
  const toPx = (point: Vec): Vec => ({ x: point.x * box.width, y: (1 - point.y) * box.height });

  const centre = toPx(layerToStage({ x: centreX, y: centreY }, layer.transform));
  const top = toPx(layerToStage({ x: centreX, y: bounds.y1 }, layer.transform));
  const bottom = toPx(layerToStage({ x: centreX, y: bounds.y0 }, layer.transform));
  const left = toPx(layerToStage({ x: bounds.x0, y: centreY }, layer.transform));
  const right = toPx(layerToStage({ x: bounds.x1, y: centreY }, layer.transform));

  const glyphHeight = Math.hypot(top.x - bottom.x, top.y - bottom.y);
  const glyphWidth = Math.hypot(right.x - left.x, right.y - left.y);
  const rasterHeight = Math.max(1, (metrics?.ascent ?? 1) + (metrics?.descent ?? 1));
  const fontSize = Math.min(220, Math.max(8, metrics ? (metrics.size * glyphHeight) / rasterHeight : glyphHeight * 0.8));
  const letterSpacing = metrics
    ? (metrics.step * glyphWidth) / Math.max(1, metrics.inkRight - metrics.inkLeft)
    : 0;

  return {
    left: centre.x,
    top: centre.y,
    width: Math.min(box.width * 0.96, Math.max(180, glyphWidth + 32)),
    height: Math.min(220, Math.max(36, fontSize * 1.35 + 16)),
    fontSize,
    letterSpacing,
    rotation: -(layer.transform.rotation * 180) / Math.PI,
  };
}

function stagePointFromEvent(event: { clientX: number; clientY: number }, box: DOMRect): Vec {
  return {
    x: (event.clientX - box.left) / Math.max(1, box.width),
    y: 1 - (event.clientY - box.top) / Math.max(1, box.height),
  };
}

export default function SelectionOverlay() {
  const overlayRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const consumedRequest = useRef(0);
  const originalText = useRef('');
  const pushedTextHistory = useRef(false);

  const [editor, setEditor] = useState<TextEditor | null>(null);
  const [guides, setGuides] = useState<Guides>({ x: null, y: null });
  const [boxSize, setBoxSize] = useState({ width: 1, height: 1 });

  // Rotation handles are offset by a constant number of CSS pixels, so the
  // overlay needs its own measured size (not the render resolution).
  useEffect(() => {
    const element = overlayRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      setBoxSize({
        width: Math.max(1, element.clientWidth),
        height: Math.max(1, element.clientHeight),
      });
    });
    observer.observe(element);
    setBoxSize({ width: Math.max(1, element.clientWidth), height: Math.max(1, element.clientHeight) });
    return () => observer.disconnect();
  }, []);

  const layer = useStudio((s) => {
    const scene = activeScene(s.project);
    return scene.layers.find((l) => l.id === s.selectedLayerId) ?? null;
  });
  const selectLayer = useStudio((s) => s.selectLayer);
  const editRequest = useStudio((s) => s.textEditRequest);
  const layerId = layer?.id ?? null;

  // Switching layers closes the editor instead of retargeting it. Opening the
  // editor in the same event as a selection change keeps it (same layer id).
  useEffect(() => {
    setEditor((current) => (current && current.layerId !== layerId ? null : current));
  }, [layerId]);

  const openEditor = (target: Layer, box: { width: number; height: number }): void => {
    if (target.type !== 'text' || target.locked) return;
    selectLayer(target.id);
    originalText.current = target.text ?? '';
    pushedTextHistory.current = false;
    setEditor({ layerId: target.id, boxWidth: box.width, boxHeight: box.height });
  };

  // Enter / F2 asks for the editor through the store so shortcuts stay out of
  // the component tree.
  useEffect(() => {
    if (!editRequest || !layer || editRequest.layerId !== layer.id) return;
    if (editRequest.nonce === consumedRequest.current) return;
    const box = overlayRef.current?.getBoundingClientRect();
    if (!box) return;
    consumedRequest.current = editRequest.nonce;
    openEditor(layer, box);
    // openEditor only depends on stable store actions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editRequest, layer]);

  const rect = (): DOMRect | null => overlayRef.current?.getBoundingClientRect() ?? null;

  const beginMove = (event: React.PointerEvent, target: Layer, box: DOMRect, start: Vec): void => {
    if (target.locked) return;
    const base = { ...target.transform };
    const bounds = layerContentBounds(target);
    const startAnchor = boundsCentreStage(bounds, base);
    const scene = activeScene(useStudio.getState().project);
    const solo = scene.layers.some((other) => other.solo && other.visible);
    const candidatesX = [...SNAP_CANDIDATES];
    const candidatesY = [...SNAP_CANDIDATES];
    for (const other of scene.layers) {
      if (other.id === target.id || !other.visible || (solo && !other.solo)) continue;
      const anchor = boundsCentreStage(layerContentBounds(other), other.transform);
      candidatesX.push(anchor.x);
      candidatesY.push(anchor.y);
    }

    const startX = event.clientX;
    const startY = event.clientY;
    let dragging = false;

    const onMove = (move: PointerEvent): void => {
      if (!dragging) {
        if (Math.hypot(move.clientX - startX, move.clientY - startY) < DRAG_THRESHOLD_PX) return;
        dragging = true;
        // One undo entry per gesture, recorded before the first mutation.
        useStudio.getState().pushHistory();
      }

      const stage = stagePointFromEvent(move, box);
      let targetCentre = {
        x: startAnchor.x + (stage.x - start.x),
        y: startAnchor.y + (stage.y - start.y),
      };
      let guideX: number | null = null;
      let guideY: number | null = null;
      if (!move.altKey) {
        const snapped = snapPoint(
          targetCentre,
          candidatesX,
          candidatesY,
          Math.max(SNAP_PIXELS / Math.max(1, box.width), 0.001),
        );
        targetCentre = snapped.point;
        guideX = snapped.guideX;
        guideY = snapped.guideY;
      }
      setGuides((current) =>
        current.x === guideX && current.y === guideY ? current : { x: guideX, y: guideY },
      );

      const delta = {
        x: targetCentre.x - startAnchor.x,
        y: targetCentre.y - startAnchor.y,
      };
      const translate = stageDeltaToLayerDelta(base, delta.x, delta.y);
      useStudio.getState().updateLayer(
        target.id,
        (l) => {
          l.transform.x = base.x + translate.x;
          l.transform.y = base.y + translate.y;
        },
        false,
      );
    };

    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      setGuides({ x: null, y: null });
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const handleOverlayPointerDown = (event: React.PointerEvent): void => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('.text-inline-editor')) return;
    const box = rect();
    if (!box) return;
    const point = stagePointFromEvent(event, box);
    const state = useStudio.getState();
    const scene = activeScene(state.project);
    const hit = hitTestLayers(scene, point, transport.time, box);

    if (!hit) {
      // Clicking the empty part of the frame clears the selection; previously
      // the selection could only be changed from the sidebars.
      if (state.selectedLayerId) state.selectLayer(null);
      return;
    }

    event.preventDefault();
    state.selectLayer(hit.id);
    beginMove(event, hit, box, point);
  };

  const handleDoubleClick = (event: React.MouseEvent): void => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('.text-inline-editor') || target?.closest('.sel-handle')) return;
    const box = rect();
    if (!box) return;
    const point = stagePointFromEvent(event, box);
    const scene = activeScene(useStudio.getState().project);
    const hit = hitTestLayers(scene, point, transport.time, box);
    if (hit?.type === 'text') openEditor(hit, box);
  };

  const beginResize = (event: React.PointerEvent, handle: HandleId): void => {
    if (!layer || layer.locked) return;
    const box = rect();
    if (!box) return;
    event.preventDefault();
    event.stopPropagation();
    const base = { ...layer.transform };
    const bounds = layerContentBounds(layer);
    const anchorLocal = boundsCentre(bounds);
    const startX = event.clientX;
    const startY = event.clientY;
    let resizing = false;

    const onMove = (move: PointerEvent): void => {
      if (!resizing) {
        if (Math.hypot(move.clientX - startX, move.clientY - startY) < DRAG_THRESHOLD_PX) return;
        resizing = true;
        useStudio.getState().pushHistory();
      }
      const point = stagePointFromEvent(move, box);
      const result = resizeFromPointer({
        bounds,
        transform: base,
        handle,
        pointer: point,
        uniform: move.shiftKey,
        fromCentre: move.altKey,
      });
      const translate = translateForLayerPoint(anchorLocal, result.centre, result.scaleX, result.scaleY, base.rotation);
      useStudio.getState().updateLayer(
        layer.id,
        (l) => {
          l.transform.scaleX = result.scaleX;
          l.transform.scaleY = result.scaleY;
          l.transform.x = translate.x;
          l.transform.y = translate.y;
        },
        false,
      );
    };
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const beginRotate = (event: React.PointerEvent): void => {
    if (!layer || layer.locked) return;
    const box = rect();
    if (!box) return;
    event.preventDefault();
    event.stopPropagation();
    const base = { ...layer.transform };
    const bounds = layerContentBounds(layer);
    const anchorLocal = boundsCentre(bounds);
    const centre = boundsCentreStage(bounds, base);
    const startPointer = stagePointFromEvent(event, box);
    const startX = event.clientX;
    const startY = event.clientY;
    let rotating = false;

    const onMove = (move: PointerEvent): void => {
      if (!rotating) {
        if (Math.hypot(move.clientX - startX, move.clientY - startY) < DRAG_THRESHOLD_PX) return;
        rotating = true;
        useStudio.getState().pushHistory();
      }
      const rotation = rotationFromPointer({
        centre,
        rotation: base.rotation,
        startPointer,
        pointer: stagePointFromEvent(move, box),
        snap: move.shiftKey,
      });
      const translate = translateForLayerPoint(anchorLocal, centre, base.scaleX, base.scaleY, rotation);
      useStudio.getState().updateLayer(
        layer.id,
        (l) => {
          l.transform.rotation = rotation;
          l.transform.x = translate.x;
          l.transform.y = translate.y;
        },
        false,
      );
    };
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const commitText = (): void => setEditor(null);

  const closeEditor = (): void => {
    if (!editor) return;
    setEditor(null);
    textareaRef.current?.blur();
  };

  const bounds = layer ? layerContentBounds(layer) : null;
  const quad = layer && bounds ? quadFor(bounds, layer.transform).map((point) => ({ ...point })) : null;
  const selectedVisible = Boolean(layer && layer.visible);

  const points = quad
    ? quad.map((point) => `${(point.x * 100).toFixed(3)},${((1 - point.y) * 100).toFixed(3)}`).join(' ')
    : '';

  const editing = Boolean(editor && layer && editor.layerId === layer.id);
  const placement =
    editor && layer && bounds && editor.layerId === layer.id
      ? editorForBounds(layer, bounds, { width: editor.boxWidth, height: editor.boxHeight })
      : null;

  let rotatePoint: Vec | null = null;
  if (layer && bounds) {
    const outside = bounds.y1 < 0.98;
    const offsetLocal = ROTATE_OFFSET_PX / Math.max(1, Math.abs(layer.transform.scaleY) * boxSize.height);
    rotatePoint = layerToStage(
      {
        x: (bounds.x0 + bounds.x1) / 2,
        y: outside ? bounds.y1 + offsetLocal : bounds.y1 - offsetLocal,
      },
      layer.transform,
    );
  }

  const badge = quad
    ? {
        left: clamp(Math.min(...quad.map((point) => point.x)) * 100, 2, 62),
        top: clamp((1 - Math.max(...quad.map((point) => point.y))) * 100 - 22, 2, 88),
      }
    : null;

  return (
    <div
      className="sel-overlay"
      ref={overlayRef}
      onPointerDown={handleOverlayPointerDown}
      onDoubleClick={handleDoubleClick}
    >
      {selectedVisible && points ? (
        <svg className="sel-shape" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polygon
            className={`sel-outline ${layer?.locked ? 'locked' : ''}`}
            points={points}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      ) : null}

      {guides.x !== null ? <div className="sel-guide vertical" style={{ left: `${guides.x * 100}%` }} /> : null}
      {guides.y !== null ? <div className="sel-guide horizontal" style={{ top: `${(1 - guides.y) * 100}%` }} /> : null}

      {selectedVisible && layer && bounds && !editing && !layer.locked
        ? HANDLES.map((handle) => {
            const point = handlePoint(bounds, layer.transform, handle.id);
            return (
              <div
                key={handle.id}
                className={`sel-handle sel-handle--${handle.id}`}
                style={{
                  left: `${point.x * 100}%`,
                  top: `${(1 - point.y) * 100}%`,
                  cursor: handleCursor(handle.id, layer.transform.rotation),
                }}
                onPointerDown={(event) => beginResize(event, handle.id)}
                title={`${handle.label} · Shift keeps ratio · Alt resizes from centre`}
                role="presentation"
              />
            );
          })
        : null}

      {selectedVisible && layer && rotatePoint && !editing && !layer.locked ? (
        <div
          className="sel-handle sel-rotate"
          style={{
            left: `${rotatePoint.x * 100}%`,
            top: `${(1 - rotatePoint.y) * 100}%`,
            cursor: 'grab',
          }}
          onPointerDown={beginRotate}
          title="Drag to rotate · Shift snaps to 15°"
          role="presentation"
        />
      ) : null}

      {selectedVisible && badge && layer ? (
        <div className="sel-badge" style={{ left: `${badge.left}%`, top: `${badge.top}%` }}>
          <span className="name">{layer.name}</span>
          {layer.locked ? <span className="lock">LOCKED</span> : null}
        </div>
      ) : null}

      {placement && layer ? (
        <textarea
          ref={textareaRef}
          className="text-inline-editor"
          aria-label="Text layer content"
          value={layer.text ?? ''}
          autoFocus
          spellCheck={false}
          rows={1}
          style={{
            left: placement.left,
            top: placement.top,
            width: placement.width,
            height: placement.height,
            fontSize: placement.fontSize,
            lineHeight: 1.15,
            letterSpacing: `${placement.letterSpacing.toFixed(2)}px`,
            fontWeight: typeof layer.params.weight === 'number' ? layer.params.weight : 800,
            transform: `translate(-50%, -50%) rotate(${placement.rotation}deg)`,
          }}
          onFocus={(e) => e.currentTarget.select()}
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            const text = e.target.value;
            if (!pushedTextHistory.current) {
              useStudio.getState().pushHistory();
              pushedTextHistory.current = true;
            }
            useStudio.getState().updateLayer(
              layer.id,
              (l) => {
                l.text = text;
              },
              false,
            );
          }}
          onBlur={commitText}
          onKeyDown={(e) => {
            // The raster is single-line, so Enter commits instead of inserting a
            // line break that the preview could not draw faithfully.
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              if (pushedTextHistory.current) {
                const previous = originalText.current;
                useStudio.getState().updateLayer(
                  layer.id,
                  (l) => {
                    l.text = previous;
                  },
                  false,
                );
              }
              closeEditor();
            } else if (e.key === 'Enter') {
              e.preventDefault();
              commitText();
            }
          }}
        />
      ) : null}

      {selectedVisible && layer && !editing ? (
        <div className="tx-hint" aria-hidden="true">
          {layer.type === 'text' ? (
            <>
              <kbd>Double-click</kbd>
              <span>or</span>
              <kbd>Enter</kbd>
              <span>to edit</span>
            </>
          ) : (
            <>
              <kbd>Drag</kbd>
              <span>to move</span>
              <span>·</span>
              <kbd>Shift</kbd>
              <span>keep ratio</span>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
