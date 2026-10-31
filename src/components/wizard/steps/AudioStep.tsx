import { useEffect, useRef, useState } from 'react';
import { importAudioFile } from '@/state/audioImport';
import { useStudio } from '@/state/store';
import { getAnalysisTrack } from '@/state/analysisStore';
import { formatSeconds } from '@/wizard/plan';
import { HelpText, MiniStat, StepNotice } from '../ui';
import type { WizardStepProps } from '../shared';
import type { WizardBranding } from '@/wizard/types';
import { ImportIcon } from '../../Icons';

interface AudioStepProps extends WizardStepProps {
  onAudioImported(name: string): void;
}

function WaveformStrip() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const status = useStudio((s) => s.audio.status);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const wrap = canvas.parentElement;
    if (!wrap) return;
    const draw = (): void => {
      const cssWidth = Math.max(120, Math.floor(wrap.clientWidth));
      const cssHeight = 76;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(cssWidth * dpr);
      canvas.height = Math.floor(cssHeight * dpr);
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssWidth, cssHeight);

      const track = getAnalysisTrack();
      if (!track) {
        ctx.strokeStyle = 'rgba(109,118,132,0.35)';
        ctx.beginPath();
        ctx.moveTo(0, cssHeight / 2);
        ctx.lineTo(cssWidth, cssHeight / 2);
        ctx.stroke();
        return;
      }
      const pcm = track.pcm;
      const perPixel = pcm.length / cssWidth;
      const centre = cssHeight / 2;
      const gradient = ctx.createLinearGradient(0, 0, 0, cssHeight);
      gradient.addColorStop(0, 'rgba(34,211,238,0.95)');
      gradient.addColorStop(0.5, 'rgba(139,92,246,0.8)');
      gradient.addColorStop(1, 'rgba(244,114,182,0.9)');
      ctx.fillStyle = gradient;
      for (let x = 0; x < cssWidth; x++) {
        const from = Math.floor(x * perPixel);
        const to = Math.min(pcm.length, Math.max(from + 1, Math.floor((x + 1) * perPixel)));
        let min = 1;
        let max = -1;
        const step = Math.max(1, Math.floor((to - from) / 32));
        for (let i = from; i < to; i += step) {
          const value = pcm[i];
          if (value < min) min = value;
          if (value > max) max = value;
        }
        const top = centre - max * centre * 0.92;
        const bottom = centre - min * centre * 0.92;
        ctx.fillRect(x, top, 1, Math.max(1, bottom - top));
      }
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [status]);

  return (
    <div className="wiz-waveform">
      <canvas ref={canvasRef} aria-hidden="true" />
    </div>
  );
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export default function AudioStep({ config, context, summary, update, onAudioImported }: AudioStepProps) {
  const audio = useStudio((s) => s.audio);
  const projectAudio = useStudio((s) => s.project.audio);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const busy = audio.status === 'decoding' || audio.status === 'analyzing';
  const analysed = Boolean(context.track) || summary.analysed;
  const detectedBpm = summary.bpm || audio.bpm || projectAudio?.bpm || 0;
  const branding = config.branding;
  const brandingLocked = config.locks.branding;

  const setBranding = (patch: Partial<WizardBranding>): void => {
    update((current) => ({ ...current, branding: { ...current.branding, ...patch } }));
  };

  const importFile = async (file: File): Promise<void> => {
    setImporting(true);
    const ok = await importAudioFile(file);
    setImporting(false);
    if (ok) onAudioImported(file.name);
  };

  const pickFile = (): void => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*,.wav,.mp3,.flac,.ogg,.aac,.m4a,.aiff,.aif';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) void importFile(file);
    };
    input.click();
  };

  return (
    <div className="wiz-step-body">
      <section className="wiz-panel">
        <div
          className={`wiz-audio-drop ${dragOver ? 'over' : ''}`}
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes('Files')) {
              event.preventDefault();
              setDragOver(true);
            }
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            const file = event.dataTransfer.files?.[0];
            if (file) void importFile(file);
          }}
        >
          <div className="row gap-3" style={{ alignItems: 'center' }}>
            <span className="wiz-audio-icon">
              <ImportIcon size={16} />
            </span>
            <div className="col grow" style={{ gap: 2, minWidth: 0 }}>
              <span className="wiz-audio-name truncate" title={audio.name || projectAudio?.name}>
                {audio.name || projectAudio?.name || 'No track selected'}
              </span>
              <span className="hint">
                {audio.status === 'decoding'
                  ? 'Decoding audio…'
                  : audio.status === 'analyzing'
                    ? `Analysing spectrum and tempo… ${Math.round(audio.progress * 100)}%`
                    : projectAudio
                      ? `${formatSeconds(projectAudio.duration)} · ${projectAudio.sampleRate.toLocaleString()} Hz · ${projectAudio.channels === 1 ? 'mono' : 'stereo'}`
                      : 'Drop a WAV, MP3, FLAC or OGG file here.'}
              </span>
            </div>
            <button className="btn primary" onClick={pickFile} disabled={busy || importing}>
              {projectAudio ? 'Replace audio' : 'Import audio'}
            </button>
          </div>

          {busy ? (
            <div className="progress-track" style={{ marginTop: 10 }}>
              <div
                className="progress-fill"
                style={{
                  width: `${Math.round((audio.status === 'decoding' ? 0.05 : audio.progress) * 100)}%`,
                }}
              />
            </div>
          ) : null}

          {audio.status === 'error' ? (
            <StepNotice kind="error">Could not decode this file: {audio.error ?? 'unknown error'}</StepNotice>
          ) : null}

          {!busy ? <WaveformStrip /> : null}
        </div>

        <HelpText>
          The wizard reuses the studio's analysis pipeline. The same cached feature track drives the
          preview and the MP4 export, so what you see here is what you render.
        </HelpText>
      </section>

      <section className="wiz-panel">
        <div className="wiz-panel-head">
          <h3>Track details</h3>
          <span className="hint">Written into the generated visualisation</span>
        </div>
        <div className="wiz-field-grid">
          <label className="wiz-text-field">
            <span className="label">Artist</span>
            <input
              className="input"
              value={branding.artist}
              maxLength={80}
              placeholder="Artist or project name"
              disabled={brandingLocked}
              spellCheck={false}
              onChange={(event) => setBranding({ artist: event.target.value })}
            />
          </label>
          <label className="wiz-text-field">
            <span className="label">Track title</span>
            <input
              className="input"
              value={branding.title}
              maxLength={120}
              placeholder="Track title"
              disabled={brandingLocked}
              spellCheck={false}
              onChange={(event) => setBranding({ title: event.target.value })}
            />
          </label>
        </div>
        {!branding.enabled ? (
          <StepNotice kind="warn">
            Text layers are disabled, so these credits will not appear in the render. Turn them back
            on in the Branding step.
          </StepNotice>
        ) : (
          <HelpText>
            These become editable Artist and Track Title text layers. Album, label, release date and
            typography live in the Branding step.
          </HelpText>
        )}
      </section>

      <section className="wiz-panel">
        <div className="wiz-panel-head">
          <h3>Tempo</h3>
          <span className={`badge-soft ${analysed ? 'ok' : ''}`}>
            {analysed ? 'Analysed' : 'Not analysed'}
          </span>
        </div>
        <div className="row gap-3 wrap">
          <label className="wiz-inline-field">
            <span className="label">Detected BPM</span>
            <span className="wiz-bpm">{detectedBpm > 0 ? Math.round(detectedBpm) : '—'}</span>
          </label>
          <label className="wiz-inline-field">
            <span className="label">Your correction</span>
            <input
              className="input mono"
              type="number"
              min={40}
              max={260}
              step={0.1}
              placeholder={detectedBpm > 0 ? String(Math.round(detectedBpm)) : '—'}
              value={config.bpmOverride ?? ''}
              onChange={(event) => {
                const raw = event.target.value.trim();
                const parsed = raw.length === 0 ? null : Number(raw);
                update((current) => ({
                  ...current,
                  bpmOverride:
                    parsed !== null && Number.isFinite(parsed)
                      ? Math.max(40, Math.min(260, parsed))
                      : null,
                }));
              }}
              style={{ width: 96 }}
              aria-label="Manual BPM override"
            />
          </label>
          <button
            className="btn sm"
            disabled={config.bpmOverride === null}
            onClick={() => update((current) => ({ ...current, bpmOverride: null }))}
          >
            Use detected
          </button>
        </div>
        <HelpText>
          BPM is used for beat-grid fallbacks when the track has no detectable transients. The
          analysis beat grid is preferred whenever it exists.
        </HelpText>
      </section>

      <section className="wiz-panel">
        <div className="wiz-panel-head">
          <h3>Musical characteristics</h3>
          <span className="hint">Used to recommend a style and response curve</span>
        </div>
        <div className="wiz-stat-grid">
          <MiniStat label="Duration" value={formatSeconds(summary.duration || context.audioDuration)} />
          <MiniStat label="Beats" value={summary.beatCount ? String(summary.beatCount) : '—'} />
          <MiniStat label="Bars" value={summary.downbeatCount ? String(summary.downbeatCount) : '—'} />
          <MiniStat label="Kick density" value={analysed ? percent(summary.kick) : '—'} hint="Average kick transient energy" />
          <MiniStat label="Bass weight" value={analysed ? percent(summary.bass) : '—'} />
          <MiniStat label="Mid energy" value={analysed ? percent(summary.mid) : '—'} />
          <MiniStat label="High energy" value={analysed ? percent(summary.high) : '—'} />
          <MiniStat label="Brightness" value={analysed ? percent(summary.brightness) : '—'} hint="Spectral centroid" />
          <MiniStat label="Dynamics" value={analysed ? percent(summary.dynamicRange) : '—'} />
        </div>
        {!analysed && !busy ? (
          <StepNotice kind="warn">
            No analysis yet. You can keep building the composition — reactivity will activate as soon
            as a track is imported.
          </StepNotice>
        ) : null}
        {audio.status === 'ready' && !context.track ? (
          <StepNotice kind="warn">
            Audio is loaded but the analysis cache is missing. Re-import the file to restore the beat
            grid and reactivity.
          </StepNotice>
        ) : null}
      </section>
    </div>
  );
}
