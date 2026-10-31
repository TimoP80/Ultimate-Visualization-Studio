import { SelectField, SliderField } from '../../controls';
import { ASPECT_PRESETS, FPS_OPTIONS, OUTPUT_PRESETS } from '@/wizard/presets';
import { applyOutputPreset, aspectIdFor } from '@/wizard/config';
import { formatSeconds } from '@/wizard/plan';
import { LockButton, SelectCard, StepHeading, StepNotice } from '../ui';
import type { WizardStepProps } from '../shared';
import type { WizardOutput } from '@/wizard/types';
import { useEffect } from 'react';

const AUDIO_CODECS: { label: string; value: WizardOutput['audioCodec'] }[] = [
  { label: 'AAC (broadcast)', value: 'aac' },
  { label: 'MP3', value: 'mp3' },
  { label: 'Opus', value: 'opus' },
  { label: 'FLAC (lossless)', value: 'flac' },
  { label: 'PCM (uncompressed)', value: 'pcm' },
];

const ENCODERS: { label: string; value: WizardOutput['encoder'] }[] = [
  { label: 'Automatic', value: 'auto' },
  { label: 'Software (x264/x265)', value: 'software' },
  { label: 'NVIDIA NVENC', value: 'nvenc' },
  { label: 'AMD AMF', value: 'amf' },
  { label: 'Intel QuickSync', value: 'qsv' },
  { label: 'Apple VideoToolbox', value: 'videotoolbox' },
];

const RESOLUTIONS = [
  { label: '1280 × 720', width: 1280, height: 720 },
  { label: '1920 × 1080', width: 1920, height: 1080 },
  { label: '2560 × 1440', width: 2560, height: 1440 },
  { label: '3840 × 2160', width: 3840, height: 2160 },
];

function withDimensions(config: WizardPropsConfig, width: number, height: number): WizardPropsConfig {
  return { ...config, output: { ...config.output, width, height } };
}

type WizardPropsConfig = WizardStepProps['config'];

export default function OutputStep({ config, context, summary, update }: WizardStepProps) {
  const output = config.output;
  const locked = config.locks.output;
  const duration = Math.max(1, summary.duration || context.audioDuration || context.fallbackDuration);
  const frames = Math.ceil(duration * output.fps);
  const bytes = (output.bitrateMbps * 1_000_000 * duration) / 8;

  // Older drafts may carry dimensions that match no preset; label them honestly.
  const activePreset = OUTPUT_PRESETS.find(
    (preset) =>
      preset.width === output.width && preset.height === output.height && preset.fps === output.fps,
  );

  // Keep `presetId` truthful when the user tweaks dimensions.
  useEffect(() => {
    if (locked) return;
    if (activePreset && activePreset.id !== output.presetId) {
      update((current) => ({ ...current, output: { ...current.output, presetId: activePreset.id } }));
    } else if (!activePreset && output.presetId !== 'custom') {
      update((current) => ({ ...current, output: { ...current.output, presetId: 'custom' } }));
    }
  }, [activePreset, output.presetId, locked, update]);

  const patch = (next: Partial<WizardOutput>): void => {
    update((current) => ({ ...current, output: { ...current.output, ...next } }));
  };

  const aspect = aspectIdFor(output.width, output.height);
  const gradeWarning = output.width * output.height >= 3840 * 2160 || output.fps >= 50;

  return (
    <div className="wiz-step-body">
      <StepHeading
        title="Output settings"
        blurb="Written into the project's export settings. The existing MP4 exporter picks them up unchanged — the wizard does not start a render."
        actions={
          <LockButton
            locked={locked}
            onToggle={() =>
              update((current) => ({
                ...current,
                locks: { ...current.locks, output: !current.locks.output },
              }))
            }
            label="Output"
          />
        }
      />

      <div className="wiz-preset-row">
        {OUTPUT_PRESETS.map((preset) => (
          <SelectCard
            key={preset.id}
            selected={output.presetId === preset.id}
            onSelect={() => update((current) => applyOutputPreset(current, preset.id))}
            disabled={locked}
            className="wiz-output-card"
            title={preset.description}
          >
            <span className="wiz-card-title">{preset.name}</span>
            <span className="wiz-card-desc">{preset.description}</span>
            <span className="wiz-card-sub mono">
              {preset.width}×{preset.height} · {preset.fps} fps
            </span>
          </SelectCard>
        ))}
      </div>

      <section className="wiz-panel">
        <div className="wiz-panel-head">
          <h3>Frame</h3>
          <span className="hint mono">
            {aspect} · {(output.width / Math.max(1, output.height)).toFixed(3)}
          </span>
        </div>
        <div className="wiz-aspect-row">
          {ASPECT_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`wiz-aspect ${aspect === preset.id ? 'on' : ''}`}
              disabled={locked}
              title={`${preset.ratio} — ${preset.width} × ${preset.height}`}
              onClick={() => patch({ width: preset.width, height: preset.height })}
            >
              <span className="wiz-aspect-box" style={{ aspectRatio: `${preset.width} / ${preset.height}` }} />
              <span className="wiz-aspect-label">{preset.ratio}</span>
            </button>
          ))}
        </div>
        <div className="wiz-two-col">
          <SelectField
            label="Resolution"
            value={`${output.width}x${output.height}`}
            onChange={(value) => {
              const [width, height] = value.split('x').map(Number);
              update((current) => withDimensions(current, width, height));
            }}
            options={[
              ...RESOLUTIONS.map((item) => ({ label: item.label, value: `${item.width}x${item.height}` })),
              ...(RESOLUTIONS.some((item) => item.width === output.width && item.height === output.height)
                ? []
                : [{ label: `${output.width} × ${output.height} (custom)`, value: `${output.width}x${output.height}` }]),
            ]}
          />
          <SelectField
            label="Frame rate"
            value={String(output.fps)}
            onChange={(value) => patch({ fps: Number(value) })}
            options={FPS_OPTIONS.map((fps) => ({
              label: `${fps} fps${fps === 30 ? ' (standard)' : fps === 60 ? ' (smooth)' : ''}`,
              value: String(fps),
            }))}
          />
          <label className="wiz-text-field">
            <span className="label">Width</span>
            <input
              className="input mono"
              type="number"
              min={160}
              max={7680}
              value={output.width}
              disabled={locked}
              onChange={(event) => {
                const width = Math.round(Number(event.target.value));
                if (Number.isFinite(width)) update((current) => withDimensions(current, Math.max(160, Math.min(7680, width)), current.output.height));
              }}
            />
          </label>
          <label className="wiz-text-field">
            <span className="label">Height</span>
            <input
              className="input mono"
              type="number"
              min={90}
              max={4320}
              value={output.height}
              disabled={locked}
              onChange={(event) => {
                const height = Math.round(Number(event.target.value));
                if (Number.isFinite(height)) update((current) => withDimensions(current, current.output.width, Math.max(90, Math.min(4320, height))));
              }}
            />
          </label>
        </div>
      </section>

      <section className="wiz-panel">
        <div className="wiz-panel-head">
          <h3>Encoding</h3>
        </div>
        <div className="wiz-two-col">
          <SelectField
            label="Video codec"
            value={output.codec}
            onChange={(codec) => patch({ codec })}
            options={[
              { label: 'H.264 (widest support)', value: 'h264' },
              { label: 'H.265 / HEVC (smaller files)', value: 'h265' },
            ]}
          />
          <SelectField
            label="Encoder"
            value={output.encoder}
            onChange={(encoder) => patch({ encoder })}
            options={ENCODERS}
          />
          <SelectField
            label="Audio codec"
            value={output.audioCodec}
            onChange={(audioCodec) => patch({ audioCodec })}
            options={AUDIO_CODECS}
          />
          <SelectField
            label="Audio bitrate"
            value={String(output.audioBitrateKbps)}
            onChange={(value) => patch({ audioBitrateKbps: Number(value) })}
            options={[128, 192, 256, 320].map((kbps) => ({ label: `${kbps} kbps`, value: String(kbps) }))}
          />
        </div>
        <SliderField
          label="Video bitrate"
          value={output.bitrateMbps}
          min={2}
          max={120}
          step={1}
          disabled={locked}
          format={(value) => `${Math.round(value)} Mb/s`}
          onChange={(bitrateMbps) => patch({ bitrateMbps })}
        />
        <SliderField
          label="Quality (CRF, lower is better)"
          value={output.crf}
          min={12}
          max={32}
          step={1}
          disabled={locked}
          format={(value) => `${Math.round(value)}`}
          onChange={(crf) => patch({ crf: Math.round(crf) })}
        />
        <p className="wiz-help">
          CRF drives quality in constant-quality mode; the bitrate is a ceiling used by hardware
          encoders. H.265 halves the file size but is slower to encode.
        </p>
      </section>

      <section className="wiz-panel">
        <div className="wiz-panel-head">
          <h3>Render estimate</h3>
          <span className="hint">{activePreset?.name ?? 'Custom'}</span>
        </div>
        <div className="wiz-stat-grid">
          <div className="wiz-stat">
            <span className="wiz-stat-label">Duration</span>
            <span className="wiz-stat-value">{formatSeconds(duration)}</span>
          </div>
          <div className="wiz-stat">
            <span className="wiz-stat-label">Frames</span>
            <span className="wiz-stat-value">{frames.toLocaleString()}</span>
          </div>
          <div className="wiz-stat">
            <span className="wiz-stat-label">Approx. size</span>
            <span className="wiz-stat-value">{(bytes / 1_000_000_000).toFixed(2)} GB</span>
          </div>
          <div className="wiz-stat">
            <span className="wiz-stat-label">Pixels / frame</span>
            <span className="wiz-stat-value">{(output.width * output.height / 1_000_000).toFixed(1)} MP</span>
          </div>
        </div>
        {gradeWarning ? (
          <StepNotice kind="warn">
            {output.width}×{output.height} at {output.fps} fps is a heavy encode. The size estimate
            assumes constant bitrate; CRF output is usually smaller.
          </StepNotice>
        ) : null}
        <p className="wiz-help">
          Sizes are estimates from the selected bitrate — the exporter reports the real size when it
          finishes. Generous keyframe spacing keeps seeking responsive in editors.
        </p>
      </section>
    </div>
  );
}
