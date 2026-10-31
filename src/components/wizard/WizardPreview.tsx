import { useEffect, useMemo, useRef, useState } from 'react';
import { audioEngine } from '@/audio/AudioEngine';
import { createAudioSample, type AudioSample } from '@/audio/analysis';
import { Renderer } from '@/render/Renderer';
import { getSampler } from '@/state/analysisStore';
import { useStudio } from '@/state/store';
import { togglePlayback } from '@/state/playback';
import { formatSeconds } from '@/wizard/plan';
import { buildPreviewScene, previewSignature } from '@/wizard/generator';
import type { Scene } from '@/types';
import type { WizardConfig, WizardContext } from '@/wizard/types';
import { PauseIcon, PlayIcon } from '../Icons';

interface WizardPreviewProps {
  config: WizardConfig;
  context: WizardContext;
  /** Shown under the canvas; the compact panel hides it. */
  showCaption?: boolean;
}

const MAX_PREVIEW_WIDTH = 960;

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

/**
 * Live preview of the wizard configuration.
 *
 * It renders a compact single-scene project through the *same* Renderer and
 * analysis sampler as the editor, so palette, effects, modulation and text
 * choices are previewed exactly as they will be generated.
 */
export default function WizardPreview({ config, context, showCaption = true }: WizardPreviewProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const fitRef = useRef<(() => void) | null>(null);
  const errorRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(audioEngine.playing);
  const [time, setTime] = useState(0);

  const signature = previewSignature(config);
  const aspect = config.output.width / Math.max(1, config.output.height);
  const aspectRef = useRef(aspect);
  aspectRef.current = aspect;

  const scene = useMemo(
    () => buildPreviewScene(config, context),
    // The signature covers everything the preview depends on; context carries
    // the audio duration and analysis track.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signature, context.audioDuration, context.track, context.fallbackDuration],
  );
  sceneRef.current = scene;

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    let renderer: Renderer;
    try {
      renderer = new Renderer(canvas);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      return;
    }
    rendererRef.current = renderer;
    renderer.resetFeedback();

    const sample = createAudioSample();
    let raf = 0;
    let frame = 0;
    let previous = performance.now();
    let lastUi = 0;
    let disposed = false;

    const fit = (): void => {
      const width = Math.max(120, Math.floor(wrap.clientWidth));
      const ratio = aspectRef.current;
      const targetW = Math.min(
        MAX_PREVIEW_WIDTH,
        Math.floor(width * Math.min(2, window.devicePixelRatio || 1)),
      );
      const targetH = Math.max(64, Math.round(targetW / ratio / 2) * 2);
      if (renderer.width === targetW && renderer.height === targetH) return;
      renderer.resize(targetW, targetH);
    };
    fitRef.current = fit;
    fit();

    const loop = (now: number): void => {
      if (disposed) return;
      raf = requestAnimationFrame(loop);
      const elapsed = now - previous;
      if (elapsed < 1000 / 30 - 1) return;
      previous = now;
      fit();

      const current = sceneRef.current;
      if (!current) return;

      const activeSampler = getSampler();
      let renderTime: number;
      if (audioEngine.hasAudio && audioEngine.playing) {
        renderTime = audioEngine.currentTime;
      } else {
        const loopLength = Math.max(4, current.duration);
        renderTime = (now / 1000) % loopLength;
      }
      if (activeSampler) activeSampler.sampleInto(sample, renderTime);
      else silenceSample(sample);

      try {
        renderer.renderFrame({
          scene: current,
          time: renderTime,
          frame: frame++,
          audio: sample,
          width: renderer.width,
          height: renderer.height,
          audioActive: Boolean(activeSampler) && useStudio.getState().audio.status === 'ready',
          dt: Math.min(0.2, elapsed / 1000),
        });
        renderer.presentToCanvas();
        if (renderer.lastRenderError) {
          if (errorRef.current !== renderer.lastRenderError) {
            errorRef.current = renderer.lastRenderError;
            setError(renderer.lastRenderError);
          }
        } else if (errorRef.current) {
          errorRef.current = null;
          setError(null);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        cancelAnimationFrame(raf);
        return;
      }

      if (now - lastUi > 250) {
        lastUi = now;
        setTime(renderTime);
        setPlaying(audioEngine.playing);
      }
    };

    raf = requestAnimationFrame(loop);
    const observer = new ResizeObserver(fit);
    observer.observe(wrap);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      renderer.dispose();
      rendererRef.current = null;
      fitRef.current = null;
    };
  }, []);

  // Resizing the output aspect should not recreate the WebGL context.
  useEffect(() => {
    fitRef.current?.();
  }, [aspect]);

  useEffect(() => {
    rendererRef.current?.resetFeedback();
  }, [signature]);

  return (
    <div className="wiz-preview">
      <div
        className="wiz-preview-frame"
        ref={wrapRef}
        style={{ aspectRatio: `${config.output.width} / ${config.output.height}` }}
      >
        <canvas ref={canvasRef} aria-label="Wizard preview" />
        <div className="wiz-preview-badge">
          <span className="dot" />
          {context.track ? 'LIVE AUDIO' : 'SILENT PREVIEW'}
        </div>
        {error ? (
          <div className="wiz-preview-error">
            <strong>Preview unavailable</strong>
            <span>{error}</span>
          </div>
        ) : null}
      </div>
      <div className="wiz-preview-controls">
        <button
          className="icon-btn sm"
          onClick={() => {
            void togglePlayback();
            window.setTimeout(() => setPlaying(audioEngine.playing), 60);
          }}
          title={playing ? 'Pause audio' : 'Play audio (Space)'}
          disabled={!audioEngine.hasAudio}
        >
          {playing ? <PauseIcon size={12} /> : <PlayIcon size={12} />}
        </button>
        <span className="hint mono">{formatSeconds(time)}</span>
        <span className="grow" />
        <span className="hint mono">
          {config.output.width}×{config.output.height}
        </span>
        {showCaption ? <span className="badge-soft">{scene.name}</span> : null}
      </div>
    </div>
  );
}
