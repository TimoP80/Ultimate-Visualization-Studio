import { useEffect, useRef, useState } from 'react';
import { audioEngine } from '@/audio/AudioEngine';
import { getSampler } from '@/state/analysisStore';
import { activeScene } from '@/state/project';
import { useStudio } from '@/state/store';
import { formatTimecode } from '@/state/transport';
import {
  downloadBlob,
  exportFilename,
  exportMp4,
  exportPlan,
  isMp4ExportSupported,
  type ExportProgress,
} from '@/export/mp4';

const RESOLUTIONS = [
  { label: '1920 × 1080 · 16:9', width: 1920, height: 1080 },
  { label: '1280 × 720 · 16:9', width: 1280, height: 720 },
  { label: '2560 × 1440 · 16:9', width: 2560, height: 1440 },
  { label: '3840 × 2160 · 16:9', width: 3840, height: 2160 },
  { label: '1080 × 1920 · 9:16', width: 1080, height: 1920 },
  { label: '1080 × 1080 · 1:1', width: 1080, height: 1080 },
];

export default function ExportDialog() {
  const open = useStudio((s) => s.exportOpen);
  const setExportOpen = useStudio((s) => s.setExportOpen);
  const project = useStudio((s) => s.project);
  const settings = useStudio((s) => s.project.exportSettings);
  const setExport = useStudio((s) => s.setExport);
  const setToast = useStudio((s) => s.setToast);

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ bytes: number; frames: number; audio: boolean; warnings: string[] } | null>(null);
  const [includeAudio, setIncludeAudio] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  const supported = isMp4ExportSupported();
  const scene = activeScene(project);
  const plan = exportPlan(scene, settings);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setResult(null);
    setProgress(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !running) setExportOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, running, setExportOpen]);

  useEffect(() => () => abortRef.current?.abort(), []);

  if (!open) return null;

  const runExport = async (): Promise<void> => {
    if (running) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      // Snapshot everything the job needs so live edits cannot leak into the file.
      const state = useStudio.getState();
      const exported = await exportMp4({
        project: state.project,
        scene: activeScene(state.project),
        settings: state.project.exportSettings,
        sampler: getSampler(),
        audioBuffer: audioEngine.decodedBuffer,
        includeAudio,
        signal: controller.signal,
        onProgress: setProgress,
      });
      downloadBlob(exported.blob, exportFilename(state.project.name));
      setResult({
        bytes: exported.blob.size,
        frames: exported.plan.frames,
        audio: exported.audioIncluded,
        warnings: exported.warnings,
      });
      setToast(`Exported ${exported.plan.frames} frames · ${formatBytes(exported.blob.size)}`);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') setToast('Export cancelled');
      else setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const presetValue = `${settings.width}x${settings.height}`;
  const presets = RESOLUTIONS.some((r) => `${r.width}x${r.height}` === presetValue)
    ? RESOLUTIONS
    : [{ label: `${settings.width} × ${settings.height} · custom`, width: settings.width, height: settings.height }, ...RESOLUTIONS];
  const fpsOptions = [24, 30, 60].includes(settings.fps) ? [24, 30, 60] : [settings.fps, 24, 30, 60];

  return (
    <div className="modal-backdrop" onPointerDown={(e) => {
      if (e.target === e.currentTarget && !running) setExportOpen(false);
    }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="export-title" style={{ width: 470 }}>
        <div className="modal-header">
          <h3 id="export-title">Export MP4</h3>
          <span className="hint">H.264 · AAC</span>
        </div>

        <div className="modal-body">
          {!supported ? (
            <div className="notice error">
              This browser does not expose <strong>VideoEncoder</strong>. MP4 export needs WebCodecs
              (current Chromium-based browsers).
            </div>
          ) : null}

          <div className="field">
            <span className="field-label">Resolution</span>
            <div className="field-control">
              <select
                className="input"
                value={presetValue}
                disabled={running}
                onChange={(e) => {
                  const [w, h] = e.target.value.split('x').map(Number);
                  setExport({ width: w, height: h });
                }}
              >
                {presets.map((r) => (
                  <option key={`${r.width}x${r.height}`} value={`${r.width}x${r.height}`}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <span className="field-label">Frame rate</span>
            <div className="field-control">
              <select
                className="input"
                value={settings.fps}
                disabled={running}
                onChange={(e) => setExport({ fps: Number(e.target.value) })}
              >
                {fpsOptions.map((fps) => (
                  <option key={fps} value={fps}>
                    {fps} fps
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <span className="field-label">Bitrate</span>
            <div className="field-control">
              <input
                type="range"
                min={4}
                max={80}
                step={1}
                value={settings.bitrateMbps}
                disabled={running}
                onChange={(e) => setExport({ bitrateMbps: Number(e.target.value) })}
              />
              <span className="field-value">{settings.bitrateMbps} Mbps</span>
            </div>
          </div>

          <div className="field">
            <span className="field-label">Range</span>
            <div className="field-control">
              <input
                className="input mono"
                type="number"
                min={0}
                max={scene.duration}
                step={0.1}
                value={Number(settings.rangeStart.toFixed(2))}
                disabled={running}
                onChange={(e) => setExport({ rangeStart: Math.max(0, Number(e.target.value)) })}
                aria-label="Range start in seconds"
              />
              <span className="hint">to</span>
              <input
                className="input mono"
                type="number"
                min={0}
                max={scene.duration}
                step={0.1}
                value={settings.rangeEnd == null ? Number(scene.duration.toFixed(2)) : Number(settings.rangeEnd.toFixed(2))}
                disabled={running}
                onChange={(e) => {
                  const value = Math.max(0, Number(e.target.value));
                  setExport({ rangeEnd: value >= scene.duration - 1e-6 ? null : value });
                }}
                aria-label="Range end in seconds"
              />
            </div>
          </div>

          <div className="field">
            <span className="field-label">Audio</span>
            <div className="field-control">
              <label className="row gap-2" style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-2)' }}>
                <input
                  type="checkbox"
                  checked={includeAudio && audioEngine.hasAudio}
                  disabled={running || !audioEngine.hasAudio}
                  onChange={(e) => setIncludeAudio(e.target.checked)}
                />
                {audioEngine.hasAudio
                  ? `Mux ${Math.min(2, audioEngine.numberOfChannels)}ch AAC at ${settings.audioBitrateKbps} kbps`
                  : 'No audio loaded — video only'}
              </label>
            </div>
          </div>

          <div className="notice info">
            <strong>
              {plan.frames} frames · {formatTimecode(plan.duration)}
            </strong>
            <div>
              {plan.width}×{plan.height} @ {plan.fps} fps · ~
              {formatBytes((settings.bitrateMbps * 1_000_000 * plan.duration) / 8)}
            </div>
          </div>

          {running ? (
            <div className="col gap-4">
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${Math.round((progress?.ratio ?? 0) * 100)}%` }} />
              </div>
              <span className="hint">
                {progress?.message ?? 'Preparing…'}
                {progress && progress.phase === 'video'
                  ? ` · ${Math.round((progress.ratio) * 100)}%`
                  : ''}
              </span>
            </div>
          ) : null}

          {error ? <div className="notice error">{error}</div> : null}

          {result ? (
            <div className="notice ok">
              <strong>
                Saved {formatBytes(result.bytes)} · {result.frames} frames
                {result.audio ? ' · audio muxed' : ' · no audio track'}
              </strong>
              {result.warnings.slice(0, 3).map((warning) => (
                <div key={warning} className="hint">{warning}</div>
              ))}
            </div>
          ) : null}

          <span className="hint">
            The export renders on its own WebGL context at the target resolution; the preview stays
            interactive. Large ranges at 4K take a while and use CPU/GPU continuously.
          </span>
        </div>

        <div className="modal-footer">
          {running ? (
            <button className="btn danger" onClick={() => abortRef.current?.abort()}>
              Cancel
            </button>
          ) : (
            <button className="btn" onClick={() => setExportOpen(false)}>
              Close
            </button>
          )}
          <button className="btn primary" onClick={() => void runExport()} disabled={running || !supported}>
            {running ? 'Exporting…' : 'Export MP4'}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
