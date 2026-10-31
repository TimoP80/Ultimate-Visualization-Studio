import { useEffect, useMemo, useRef, useState } from 'react';
import { audioEngine } from '@/audio/AudioEngine';
import { getAnalysisTrack, getSampler } from '@/state/analysisStore';
import { activeScene } from '@/state/project';
import { useStudio } from '@/state/store';
import { transport, formatTimecode, formatClock } from '@/state/transport';
import { useTransportDuration, useTransportPlaying, useTransportTime } from '@/state/hooks';
import { EFFECT_DEFS, EFFECT_DEF_MAP } from '@/render/effects';
import { clamp } from '@/timeline/easing';
import type { EffectInstance, EffectType, Layer } from '@/types';

const LANE_HEIGHT = 30;
const FX_LANE_HEIGHT = 24;
const BASE_PPS = 42;
const MIN_CLIP = 0.1;

export default function Timeline({ height }: { height: number }) {
  const project = useStudio((s) => s.project);
  const selectedLayerId = useStudio((s) => s.selectedLayerId);
  const selectLayer = useStudio((s) => s.selectLayer);
  const updateLayer = useStudio((s) => s.updateLayer);
  const pushHistory = useStudio((s) => s.pushHistory);
  const setSceneDuration = useStudio((s) => s.setSceneDuration);
  const addEffect = useStudio((s) => s.addEffect);
  const setRightTab = useStudio((s) => s.setRightTab);
  const audioStatus = useStudio((s) => s.audio.status);

  const time = useTransportTime();
  const playing = useTransportPlaying();
  const transportDuration = useTransportDuration();

  const scene = activeScene(project);
  const duration = Math.max(1, transportDuration || scene.duration || 180);
  const trackDuration = project.audio?.duration ?? 0;
  const [lengthDraft, setLengthDraft] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [viewportWidth, setViewportWidth] = useState(900);

  const scrollRef = useRef<HTMLDivElement>(null);
  const lanesRef = useRef<HTMLDivElement>(null);
  const waveRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{
    id: string;
    startX: number;
    start: number;
    end: number;
    moved: boolean;
  } | null>(null);

  const pps = BASE_PPS * zoom;
  const laneWidth = Math.max(600, Math.ceil(duration * pps));
  const sampler = audioStatus === 'ready' ? getSampler() : null;
  const selectedLayer = useMemo(
    () => scene.layers.find((layer) => layer.id === selectedLayerId) ?? null,
    [scene, selectedLayerId],
  );

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setViewportWidth(element.clientWidth));
    observer.observe(element);
    setViewportWidth(element.clientWidth);
    return () => observer.disconnect();
  }, []);

  // Follow the playhead while playing.
  useEffect(() => {
    if (!playing) return;
    const element = scrollRef.current;
    if (!element) return;
    const x = time * pps;
    const left = element.scrollLeft;
    const right = left + element.clientWidth;
    if (x < left + 40 || x > right - 80) {
      element.scrollLeft = Math.max(0, x - element.clientWidth * 0.35);
    }
  }, [time, playing, pps]);

  // Waveform bitmap: one vertical min/max line per CSS pixel.
  useEffect(() => {
    const canvas = waveRef.current;
    if (!canvas) return;
    const cssWidth = Math.min(16000, Math.max(1, Math.round(laneWidth)));
    const cssHeight = LANE_HEIGHT - 4;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(cssWidth * dpr);
    canvas.height = Math.floor(cssHeight * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const track = getAnalysisTrack();
    if (!track) {
      ctx.fillStyle = 'rgba(109,118,132,0.35)';
      ctx.font = '10px Inter, sans-serif';
      ctx.fillText('Import audio to see the waveform', 8, cssHeight / 2 + 3);
      return;
    }

    const pcm = track.pcm;
    const perPixel = pcm.length / cssWidth;
    ctx.fillStyle = 'rgba(34, 211, 238, 0.55)';
    for (let x = 0; x < cssWidth; x++) {
      const from = Math.floor(x * perPixel);
      const to = Math.min(pcm.length, Math.max(from + 1, Math.floor((x + 1) * perPixel)));
      let min = 1;
      let max = -1;
      const step = Math.max(1, Math.floor((to - from) / 24));
      for (let i = from; i < to; i += step) {
        const v = pcm[i];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      const y0 = (1 - max) * 0.5 * cssHeight;
      const y1 = (1 - min) * 0.5 * cssHeight;
      ctx.fillRect(x, y0, 1, Math.max(1, y1 - y0));
    }
  }, [laneWidth, duration, audioStatus]);

  const ticks = useMemo(() => {
    const candidates = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
    const step = candidates.find((s) => s * pps >= 64) ?? 600;
    const out: { time: number; label: string }[] = [];
    for (let t = 0; t <= duration + 0.001; t += step) {
      out.push({ time: t, label: formatTimecode(t, 60).slice(3, 8) });
    }
    return out;
  }, [pps, duration]);

  const beats = useMemo(() => {
    if (!sampler) return [];
    const all = sampler.beats;
    if (!all || all.length === 0) return [];
    const stride = Math.max(1, Math.ceil(4 / Math.max(1, pps / 12)));
    const list: { time: number; downbeat: boolean }[] = [];
    for (let i = 0; i < all.length; i += stride) {
      if (all[i] > duration) break;
      list.push({ time: all[i], downbeat: i % 4 === 0 });
    }
    return list;
  }, [sampler, duration, pps, audioStatus]);

  const commitLength = (): void => {
    if (lengthDraft === null) return;
    const parsed = Number(lengthDraft.replace(',', '.'));
    if (Number.isFinite(parsed) && parsed > 0) setSceneDuration(parsed);
    setLengthDraft(null);
  };

  const seekTo = (clientX: number, element: HTMLElement): void => {
    const rect = element.getBoundingClientRect();
    const x = clientX - rect.left;
    const t = Math.max(0, Math.min(duration, x / pps));
    audioEngine.seek(t);
    transport.setTime(t);
  };

  const beginClipDrag = (event: React.PointerEvent, layer: Layer): void => {
    if (layer.locked) return;
    event.stopPropagation();
    selectLayer(layer.id);
    dragRef.current = { id: layer.id, startX: event.clientX, start: layer.start, end: layer.end, moved: false };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const onClipDrag = (event: React.PointerEvent): void => {
    const drag = dragRef.current;
    if (!drag) return;
    const pixels = event.clientX - drag.startX;
    // A click selects without writing an empty undo step; the first real
    // movement snapshots the document once for the whole gesture.
    if (!drag.moved) {
      if (Math.abs(pixels) < 3) return;
      drag.moved = true;
      pushHistory();
    }
    const delta = pixels / pps;
    const span = drag.end - drag.start;
    const start = Math.max(0, Math.min(duration - span, drag.start + delta));
    updateLayer(
      drag.id,
      (layer) => {
        layer.start = start;
        layer.end = start + span;
      },
      false,
    );
  };

  const endClipDrag = (): void => {
    dragRef.current = null;
  };

  /** Trim a template clip's start or end so its duration can be set on the timeline. */
  const beginTrim = (event: React.PointerEvent, layer: Layer, edge: 'start' | 'end'): void => {
    if (layer.locked) return;
    event.stopPropagation();
    event.preventDefault();
    selectLayer(layer.id);
    pushHistory();
    const startX = event.clientX;
    const first = layer.start;
    const last = layer.end;

    const onMove = (move: PointerEvent): void => {
      const delta = (move.clientX - startX) / pps;
      updateLayer(
        layer.id,
        (l) => {
          if (edge === 'start') l.start = clamp(first + delta, 0, Math.max(0, last - MIN_CLIP));
          else l.end = clamp(last + delta, first + MIN_CLIP, duration);
        },
        false,
      );
    };
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const patchEffect = (layerId: string, effectId: string, start: number, end: number): void => {
    updateLayer(
      layerId,
      (l) => {
        const effect = l.effects.find((fx) => fx.id === effectId);
        if (effect) {
          effect.start = start;
          effect.end = end;
        }
      },
      false,
    );
  };

  /** Slide an effect clip along the timeline without leaving its layer. */
  const beginEffectMove = (event: React.PointerEvent, layer: Layer, effect: EffectInstance): void => {
    event.stopPropagation();
    event.preventDefault();
    selectLayer(layer.id);
    pushHistory();
    const startX = event.clientX;
    const first = effect.start ?? layer.start;
    const last = effect.end ?? layer.end;
    const span = Math.max(MIN_CLIP, last - first);

    const onMove = (move: PointerEvent): void => {
      const delta = (move.clientX - startX) / pps;
      const start = clamp(first + delta, layer.start, Math.max(layer.start, layer.end - span));
      patchEffect(layer.id, effect.id, start, Math.min(layer.end, start + span));
    };
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const beginEffectResize = (event: React.PointerEvent, layer: Layer, effect: EffectInstance): void => {
    event.stopPropagation();
    event.preventDefault();
    pushHistory();
    const startX = event.clientX;
    const first = effect.start ?? layer.start;
    const last = effect.end ?? layer.end;

    const onMove = (move: PointerEvent): void => {
      const delta = (move.clientX - startX) / pps;
      const end = clamp(last + delta, first + MIN_CLIP, layer.end);
      patchEffect(layer.id, effect.id, first, end);
    };
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  /** Drop an effect onto the timeline at the playhead, inside the selected layer. */
  const addTimelineEffect = (type: EffectType): void => {
    if (!selectedLayer) return;
    const span = Math.max(MIN_CLIP, selectedLayer.end - selectedLayer.start);
    const start = clamp(time, selectedLayer.start, selectedLayer.start + span - MIN_CLIP);
    const end = Math.min(selectedLayer.end, start + Math.min(4, span));
    addEffect(selectedLayer.id, type, { start, end });
  };

  return (
    <div className="timeline" style={{ height }}>
      <div className="timeline-toolbar">
        <span className="label">Timeline</span>
        <span className="sep" />
        <span className="hint mono">{formatTimecode(time)}</span>
        <span className="sep" />
        <span className="hint">
          {scene.name} · {scene.layers.length} layer{scene.layers.length === 1 ? '' : 's'}
        </span>
        <span className="sep" />
        <span className="hint">Length</span>
        <input
          className="input mono"
          type="number"
          min={0.1}
          step={0.1}
          value={lengthDraft ?? scene.duration.toFixed(2)}
          style={{ width: 68, height: 22, padding: '0 5px' }}
          onChange={(e) => setLengthDraft(e.target.value)}
          onBlur={commitLength}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') setLengthDraft(null);
          }}
          aria-label="Timeline length in seconds"
          title="Timeline length in seconds"
        />
        <span className="hint">s</span>
        <button
          className="btn sm"
          disabled={!trackDuration || Math.abs(scene.duration - trackDuration) < 0.01}
          onClick={() => setSceneDuration(trackDuration)}
          title={
            trackDuration
              ? `Set timeline to the audio track length (${formatClock(trackDuration)})`
              : 'Import audio to match its length'
          }
        >
          Match track
        </button>
        <span className="sep" />
        <select
          className="input"
          style={{ width: 128, height: 22 }}
          value=""
          disabled={!selectedLayer}
          title={
            selectedLayer
              ? `Add an effect to ${selectedLayer.name} starting at the playhead`
              : 'Select a layer to add effects on the timeline'
          }
          aria-label="Add effect to the timeline"
          onChange={(e) => {
            const value = e.target.value as EffectType;
            if (value) addTimelineEffect(value);
            e.currentTarget.value = '';
          }}
        >
          <option value="">Add effect…</option>
          {EFFECT_DEFS.map((def) => (
            <option key={def.type} value={def.type}>
              {def.label}
            </option>
          ))}
        </select>
        <span className="grow" />
        <button
          className="icon-btn sm"
          onClick={() => setZoom((z) => Math.max(0.25, +(z / 1.5).toFixed(2)))}
          title="Zoom out"
        >
          –
        </button>
        <input
          type="range"
          min={0.25}
          max={8}
          step={0.05}
          value={zoom}
          style={{ width: 110 }}
          onChange={(e) => setZoom(Number(e.target.value))}
          aria-label="Timeline zoom"
        />
        <button
          className="icon-btn sm"
          onClick={() => setZoom((z) => Math.min(8, +(z * 1.5).toFixed(2)))}
          title="Zoom in"
        >
          +
        </button>
        <button
          className="btn sm"
          onClick={() => {
            const fit = Math.max(0.25, Math.min(8, (viewportWidth - 24) / (duration * BASE_PPS)));
            setZoom(fit);
          }}
          title="Fit project to view"
        >
          Fit
        </button>
      </div>

      <div className="timeline-body">
        <div className="track-headers">
          <div className="track-headers-spacer">Tracks</div>
          <div className="track-header-list">
            <div className="track-header">
              <span className="type-dot" style={{ background: 'var(--accent)' }} />
              <span className="name">Audio</span>
              <span className="meta">{audioStatus === 'ready' ? 'AUDIO' : '—'}</span>
            </div>
            {scene.layers.map((layer) => (
              <div
                key={layer.id}
                className={`track-header ${selectedLayerId === layer.id ? 'selected' : ''}`}
                onClick={() => selectLayer(layer.id)}
              >
                <span className="type-dot" style={{ background: layer.palette.a }} />
                <span className="name">{layer.name}</span>
                <span className="meta">{layer.effects.length > 0 ? `${layer.effects.length}fx` : ''}</span>
              </div>
            ))}
            {selectedLayer ? (
              <div
                className="track-header"
                style={{ height: FX_LANE_HEIGHT, paddingLeft: 14 }}
                onClick={() => setRightTab('effects')}
              >
                <span className="type-dot" style={{ background: 'var(--violet)' }} />
                <span className="name">Effects</span>
                <span className="meta">{selectedLayer.effects.length || '—'}</span>
              </div>
            ) : null}
            <div className="track-header" style={{ opacity: 0.7, cursor: 'default' }}>
              <span className="type-dot" style={{ background: 'var(--violet)' }} />
              <span className="name">Keyframes</span>
            </div>
          </div>
        </div>

        <div className="timeline-scroll" ref={scrollRef}>
          <div
            className="timeline-inner"
            ref={lanesRef}
            style={{ width: laneWidth }}
            onPointerDown={(e) => {
              if (e.target === e.currentTarget) seekTo(e.clientX, e.currentTarget);
            }}
          >
            <div className="ruler" onPointerDown={(e) => seekTo(e.clientX, e.currentTarget)}>
              {ticks.map((tick) => (
                <div key={tick.time}>
                  <div className="ruler-tick" style={{ left: tick.time * pps }} />
                  <div className="ruler-label" style={{ left: tick.time * pps + 3 }}>
                    {tick.label}
                  </div>
                </div>
              ))}
              {beats.map((beat, index) => (
                <div
                  key={`b${index}`}
                  className={`ruler-beat ${beat.downbeat ? 'downbeat' : ''}`}
                  style={{ left: beat.time * pps }}
                />
              ))}
            </div>

            <div className="tracks">
              {beats.map((beat, index) => (
                <div
                  key={`g${index}`}
                  className={`beat-grid-line ${beat.downbeat ? 'downbeat' : ''}`}
                  style={{ left: beat.time * pps }}
                />
              ))}

              <div className="track-lane" onPointerDown={(e) => seekTo(e.clientX, e.currentTarget)}>
                <div
                  className="clip"
                  style={{
                    left: 0,
                    width: Math.max(2, duration * pps),
                    borderColor: 'rgba(34,211,238,0.45)',
                    background: 'rgba(34,211,238,0.09)',
                    color: 'var(--text-1)',
                  }}
                  onPointerDown={(e) => seekTo(e.clientX, e.currentTarget.parentElement as HTMLElement)}
                >
                  <canvas
                    ref={waveRef}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
                  />
                  <span className="clip-label" style={{ position: 'relative', paddingLeft: 4 }}>
                    {project.audio?.name ?? 'No audio loaded'}
                  </span>
                </div>
              </div>

              {scene.layers.map((layer) => (
                <div
                  className={`track-lane ${selectedLayerId === layer.id ? 'selected' : ''}`}
                  key={layer.id}
                  onPointerDown={(e) => seekTo(e.clientX, e.currentTarget)}
                >
                  <div
                    className={`clip ${selectedLayerId === layer.id ? 'selected' : ''}`}
                    style={{
                      left: layer.start * pps,
                      width: Math.max(6, (layer.end - layer.start) * pps),
                      borderColor: `${layer.palette.a}88`,
                      background: `linear-gradient(180deg, ${layer.palette.a}2e, ${layer.palette.b}1c)`,
                      color: layer.palette.a,
                      opacity: layer.visible ? 1 : 0.4,
                      cursor: layer.locked ? 'not-allowed' : 'grab',
                    }}
                    title={`${layer.name} — ${layer.start.toFixed(2)}s to ${layer.end.toFixed(2)}s (${(layer.end - layer.start).toFixed(2)}s)`}
                    onPointerDown={(e) => beginClipDrag(e, layer)}
                    onPointerMove={onClipDrag}
                    onPointerUp={endClipDrag}
                    onPointerCancel={endClipDrag}
                  >
                    <span
                      className="clip-handle l"
                      title="Trim start"
                      onPointerDown={(e) => beginTrim(e, layer, 'start')}
                    />
                    <span className="clip-label">{layer.name}</span>
                    <span
                      className="clip-handle r"
                      title="Trim end (duration)"
                      onPointerDown={(e) => beginTrim(e, layer, 'end')}
                    />
                  </div>
                </div>
              ))}

              {selectedLayer ? (
                <div className="track-lane fx-lane" style={{ height: FX_LANE_HEIGHT }}>
                  {selectedLayer.effects.map((effect) => {
                    const def = EFFECT_DEF_MAP[effect.type];
                    const start = effect.start ?? selectedLayer.start;
                    const end = effect.end ?? selectedLayer.end;
                    return (
                      <div
                        key={effect.id}
                        className={`fx-block ${effect.enabled ? '' : 'off'} ${
                          effect.start === undefined ? 'full' : ''
                        }`}
                        style={{
                          left: start * pps,
                          width: Math.max(8, (end - start) * pps),
                        }}
                        title={`${def?.label ?? effect.type} — ${start.toFixed(2)}s to ${end.toFixed(2)}s · drag to move, right edge to resize`}
                        onPointerDown={(e) => beginEffectMove(e, selectedLayer, effect)}
                        onDoubleClick={() => setRightTab('effects')}
                      >
                        <span className="fx-label">{def?.label ?? effect.type}</span>
                        <span
                          className="fx-handle"
                          title="Resize effect"
                          onPointerDown={(e) => beginEffectResize(e, selectedLayer, effect)}
                        />
                      </div>
                    );
                  })}
                  {selectedLayer.effects.length === 0 ? (
                    <span className="fx-empty">No effects — pick one from the toolbar</span>
                  ) : null}
                </div>
              ) : null}

              <div className="keyframe-lane">
                {(selectedLayerId
                  ? scene.layers.find((l) => l.id === selectedLayerId)?.keyframes ?? []
                  : []
                ).map((kf) => (
                  <div key={kf.id} className="keyframe" style={{ left: kf.time * pps }} title={`${kf.path} @ ${kf.time.toFixed(2)}s`} />
                ))}
              </div>
            </div>

            <div className="playhead" style={{ left: time * pps }} />
          </div>
        </div>
      </div>
    </div>
  );
}
