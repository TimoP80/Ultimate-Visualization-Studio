import { useEffect, useRef, useState } from 'react';
import { audioEngine } from '@/audio/AudioEngine';
import { createAudioSample, type AudioSample } from '@/audio/analysis';
import { Renderer } from '@/render/Renderer';
import { activeScene } from '@/state/project';
import { getSampler } from '@/state/analysisStore';
import { useStudio } from '@/state/store';
import { transport, formatTimecode } from '@/state/transport';
import { seekTo, stopPlayback, togglePlayback } from '@/state/playback';
import SelectionOverlay from './SelectionOverlay';
import { useTransportDuration, useTransportPlaying, useTransportTime } from '@/state/hooks';
import type { PreviewQuality } from '@/types';
import {
  FullscreenIcon,
  LoopIcon,
  PauseIcon,
  PlayIcon,
  StopIcon,
} from './Icons';

const QUALITY_SCALE: Record<PreviewQuality, number> = {
  performance: 0.45,
  balanced: 0.7,
  high: 1,
  ultra: 1.35,
};

const MAX_RENDER_WIDTH = 3840;
const MAX_RENDER_HEIGHT = 2160;

export default function PreviewStage() {
  const stageRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [fps, setFps] = useState(0);
  const [renderSize, setRenderSize] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [shaderError, setShaderError] = useState<string | null>(null);
  const [showGuides, setShowGuides] = useState(false);

  const preview = useStudio((s) => s.preview);
  const setPreview = useStudio((s) => s.setPreview);
  const audio = useStudio((s) => s.audio);

  // The render loop reads configuration through a ref so it never restarts.
  const configRef = useRef({ preview, zoom });
  configRef.current = { preview, zoom };

  useEffect(() => {
    const canvas = canvasRef.current;
    const viewport = viewportRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !viewport || !wrap) return;

    let renderer: Renderer;
    try {
      renderer = new Renderer(canvas);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }
    rendererRef.current = renderer;
    transport.setDuration(useStudio.getState().project.scenes[0]?.duration ?? 180);

    const sample: AudioSample = createAudioSample();
    let raf = 0;
    let previous = performance.now();
    let lastNotify = 0;
    let lastFpsUpdate = performance.now();
    let renderedFrames = 0;
    let frameCounter = 0;
    let wrapW = 0;
    let wrapH = 0;
    let sizeW = 0;
    let sizeH = 0;
    let sceneId = '';
    let hadShaderError = false;

    const fitCanvas = (quality: PreviewQuality, scale: number): void => {
      const pad = 30;
      const availW = Math.max(160, viewport.clientWidth - pad);
      const availH = Math.max(90, viewport.clientHeight - pad);
      const aspect = 16 / 9;
      let w = availW;
      let h = w / aspect;
      if (h > availH) {
        h = availH;
        w = h * aspect;
      }
      const zoomValue = configRef.current.zoom;
      const cssW = Math.max(80, Math.round(w * zoomValue));
      const cssH = Math.max(45, Math.round(h * zoomValue));
      if (Math.abs(cssW - wrapW) > 0.5 || Math.abs(cssH - wrapH) > 0.5) {
        wrapW = cssW;
        wrapH = cssH;
        wrap.style.width = `${cssW}px`;
        wrap.style.height = `${cssH}px`;
      }

      const factor = QUALITY_SCALE[quality] * scale;
      const rw = Math.min(MAX_RENDER_WIDTH, Math.max(160, Math.round((cssW * factor) / 2) * 2));
      const rh = Math.min(MAX_RENDER_HEIGHT, Math.max(90, Math.round((cssH * factor) / 2) * 2));
      if (rw !== sizeW || rh !== sizeH) {
        sizeW = rw;
        sizeH = rh;
        renderer.resize(rw, rh);
        setRenderSize({ w: rw, h: rh });
      }
    };

    const loop = (now: number): void => {
      raf = requestAnimationFrame(loop);
      const state = useStudio.getState();
      const config = configRef.current;
      const frameBudget = 1000 / Math.max(15, config.preview.maxFps);
      const elapsed = now - previous;
      if (elapsed < frameBudget - 1.5) return;
      previous = now;

      fitCanvas(config.preview.quality, config.preview.scale);

      const scene = activeScene(state.project);
      if (scene.id !== sceneId) {
        sceneId = scene.id;
        renderer.resetFeedback();
      }

      const dt = Math.min(0.25, elapsed / 1000);
      let time: number;
      if (audioEngine.hasAudio && audioEngine.playing) {
        time = audioEngine.currentTime;
        transport.setTime(time, true);
      } else if (!audioEngine.hasAudio && transport.playing) {
        const duration = transport.duration || scene.duration || 180;
        time = transport.time + dt;
        if (time >= duration) {
          if (transport.loop) time %= duration;
          else {
            time = duration;
            transport.setPlaying(false);
          }
        }
        transport.setTime(time, true);
      } else {
        time = transport.time;
      }

      const sampler = getSampler();
      if (sampler) sampler.sampleInto(sample, time);
      else silenceSample(sample);

      try {
        renderer.renderFrame({
          scene,
          time,
          frame: frameCounter++,
          audio: sample,
          width: sizeW,
          height: sizeH,
          audioActive: Boolean(sampler) && state.audio.status === 'ready',
          dt,
        });
        renderer.presentToCanvas();
        if (renderer.lastRenderError) {
          setShaderError(renderer.lastRenderError);
          hadShaderError = true;
        } else if (hadShaderError) {
          setShaderError(null);
          hadShaderError = false;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        cancelAnimationFrame(raf);
        return;
      }

      renderedFrames++;
      if (now - lastFpsUpdate > 600) {
        setFps(Math.round((renderedFrames * 1000) / (now - lastFpsUpdate)));
        renderedFrames = 0;
        lastFpsUpdate = now;
      }
      if (now - lastNotify > 33) {
        transport.emitTime();
        lastNotify = now;
      }
    };

    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      renderer.dispose();
      rendererRef.current = null;
    };
    // Intentionally mount-only: configuration is read via configRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleFullscreen = (): void => {
    const element = stageRef.current;
    if (!element) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void element.requestFullscreen().catch(() => undefined);
  };

  return (
    <div className="stage-area" ref={stageRef}>
      <div className="stage-toolbar">
        <span className="label" style={{ marginRight: 4 }}>
          Program
        </span>
        <span className="badge-live">
          <span className="dot" />
          {audio.status === 'ready' ? 'AUDIO LINKED' : 'SILENT'}
        </span>
        <span className="sep" />
        <span className="hint">
          {renderSize.w}×{renderSize.h}
        </span>
        <span className="sep" />
        <select
          className="input"
          style={{ width: 108, height: 22 }}
          value={preview.quality}
          onChange={(e) => setPreview({ quality: e.target.value as PreviewQuality })}
        >
          <option value="performance">Performance</option>
          <option value="balanced">Balanced</option>
          <option value="high">High Quality</option>
          <option value="ultra">Ultra</option>
        </select>
        <span className="sep" />
        <button
          className="icon-btn sm"
          onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))}
          title="Zoom out"
        >
          –
        </button>
        <span className="hint mono" style={{ width: 34, textAlign: 'center' }}>
          {Math.round(zoom * 100)}%
        </span>
        <button
          className="icon-btn sm"
          onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)))}
          title="Zoom in"
        >
          +
        </button>
        <button className="icon-btn sm" onClick={() => setZoom(1)} title="Fit">
          ⤢
        </button>
        <button
          className={`icon-btn sm ${showGuides ? 'active' : ''}`}
          onClick={() => setShowGuides((value) => !value)}
          title="Toggle thirds and title-safe guides"
          aria-pressed={showGuides}
        >
          ⊞
        </button>
        <span className="grow" />
        {preview.showFps ? (
          <span className="hint mono" style={{ color: fps >= 50 ? 'var(--ok)' : fps >= 28 ? 'var(--warn)' : 'var(--danger)' }}>
            {fps} FPS
          </span>
        ) : null}
        <button className="icon-btn sm" onClick={toggleFullscreen} title="Fullscreen preview">
          <FullscreenIcon size={13} />
        </button>
      </div>

      <div
        className="stage-viewport"
        ref={viewportRef}
        onPointerDown={(event) => {
          if (!wrapRef.current?.contains(event.target as Node)) {
            useStudio.getState().selectLayer(null);
          }
        }}
      >
        <div className="stage-canvas-wrap" ref={wrapRef}>
          <canvas ref={canvasRef} />
          {showGuides ? (
            <div className="safe-guides" aria-hidden="true">
              <span className="safe-guide v" style={{ left: '33.333%' }} />
              <span className="safe-guide v" style={{ left: '66.666%' }} />
              <span className="safe-guide h" style={{ top: '33.333%' }} />
              <span className="safe-guide h" style={{ top: '66.666%' }} />
              <span className="safe-guide centre-v" />
              <span className="safe-guide centre-h" />
              <span className="safe-guide title-safe" />
              <span className="safe-guide action-safe" />
            </div>
          ) : null}
          <SelectionOverlay />
        </div>

        {audio.status === 'analyzing' || audio.status === 'decoding' ? (
          <div className="stage-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="modal" style={{ minWidth: 300, padding: 16, pointerEvents: 'auto' }}>
              <div className="col gap-8">
                <span style={{ fontSize: 'var(--fs-md)', fontWeight: 600 }}>
                  {audio.status === 'decoding' ? 'Decoding audio…' : 'Analysing audio…'}
                </span>
                <span className="hint truncate">{audio.name}</span>
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{ width: `${Math.round((audio.status === 'decoding' ? 0.04 : audio.progress) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="stage-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto' }}>
            <div className="notice error" style={{ maxWidth: 520 }}>
              <strong>Renderer unavailable</strong>
              <div>{error}</div>
            </div>
          </div>
        ) : null}

        {shaderError && !error ? (
          <div className="stage-overlay" style={{ display: 'flex', alignItems: 'flex-end', padding: 10 }}>
            <div className="notice error" style={{ maxWidth: '100%', pointerEvents: 'auto' }}>
              <strong>Shader compile error</strong>
              <pre>{shaderError}</pre>
            </div>
          </div>
        ) : null}
      </div>

      <TransportBar />
    </div>
  );
}

function silenceSample(sample: AudioSample): void {
  sample.rms = 0;
  sample.peak = 0;
  sample.subBass = 0;
  sample.bass = 0;
  sample.lowMid = 0;
  sample.mid = 0;
  sample.highMid = 0;
  sample.treble = 0;
  sample.air = 0;
  sample.centroid = 0;
  sample.flux = 0;
  sample.kick = 0;
  sample.snare = 0;
  sample.onset = 0;
  sample.silence = 1;
  sample.energy = 0;
  sample.beat = 0;
  sample.beatPhase = 0;
  sample.bar = 0;
  sample.bands.fill(0);
  sample.spectrum.fill(0);
  sample.waveform.fill(0);
}

function TransportBar() {
  const time = useTransportTime();
  const playing = useTransportPlaying();
  const duration = useTransportDuration();
  const audio = useStudio((s) => s.audio);
  const [loop, setLoop] = useState(transport.loop);
  const [volume, setVolume] = useState(audioEngine.volume);

  const toggleLoop = (): void => {
    const next = !loop;
    setLoop(next);
    transport.setLoop(next, 0, duration || 0);
    audioEngine.setLoop(next, 0, duration || 0);
  };

  return (
    <div className="transport">
      <button
        className="icon-btn"
        style={{ width: 32, height: 26 }}
        onClick={() => void togglePlayback()}
        title={playing ? 'Pause (Space)' : 'Play (Space)'}
      >
        {playing ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
      </button>
      <button className="icon-btn" onClick={stopPlayback} title="Stop">
        <StopIcon size={12} />
      </button>
      <button
        className={`icon-btn ${loop ? 'active' : ''}`}
        onClick={toggleLoop}
        title="Loop playback"
        disabled={!audio.status || audio.status === 'idle'}
      >
        <LoopIcon size={13} />
      </button>

      <span className="transport-time">
        {formatTimecode(time)}{' '}
        <span className="dim">/ {formatTimecode(duration || 0)}</span>
      </span>

      <div className="transport-scrub">
        <input
          type="range"
          min={0}
          max={Math.max(0.1, duration || 0.1)}
          step={0.01}
          value={Math.min(time, duration || 0.1)}
          onChange={(e) => seekTo(Number(e.target.value))}
          aria-label="Playhead"
        />
      </div>

      {audio.bpm > 0 ? (
        <span className="hint mono" title="Detected tempo">
          {Math.round(audio.bpm)} BPM
        </span>
      ) : null}

      <span className="hint">Vol</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={volume}
        style={{ width: 74 }}
        onChange={(e) => {
          const v = Number(e.target.value);
          setVolume(v);
          audioEngine.setVolume(v);
        }}
        aria-label="Volume"
      />
    </div>
  );
}

