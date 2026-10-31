import { allTemplates } from '@/templates/registry';
import { stylePreset, palettePreset, typographyPreset, effectEntry, OUTPUT_PRESETS } from '@/wizard/presets';
import { estimateLayerCount, formatSeconds, planSections, validateConfig } from '@/wizard/plan';
import { PaletteStrip, StepHeading, StepNotice, StyleThumb } from '../ui';
import type { WizardStepProps } from '../shared';
import type { WizardStepId } from '@/wizard/types';

interface ReviewStepProps extends WizardStepProps {
  onGenerate(): void;
  onRandomize(): void;
  generating: boolean;
}

interface Row {
  label: string;
  value: string;
  hint?: string;
  step: WizardStepId;
}

export default function ReviewStep({
  config,
  context,
  summary,
  track,
  jumpTo,
  update,
  onGenerate,
  onRandomize,
  generating,
}: ReviewStepProps) {
  const validation = validateConfig(config, context);
  const style = stylePreset(config.styleId);
  const scheme = palettePreset(config.paletteId);
  const type = typographyPreset(config.branding.typographyId);
  const templates = allTemplates();
  const nameOf = (id: string): string => templates.find((def) => def.id === id)?.name ?? id;
  const duration = Math.max(1, summary.duration || context.audioDuration || context.fallbackDuration);
  const { sections } = planSections(config, duration, track, config.bpmOverride ?? summary.bpm ?? 120);
  const outPreset = OUTPUT_PRESETS.find((preset) => preset.id === config.output.presetId);
  const layers = estimateLayerCount(config, sections.length);

  const rows: Row[] = [
    {
      label: 'Audio',
      value: context.audioName || config.branding.title || 'No track',
      hint: summary.analysed
        ? `${formatSeconds(duration)} · ${Math.round(summary.bpm)} BPM · ${summary.beatCount} beats`
        : 'No analysis — reactivity falls back to the tempo grid',
      step: 'audio',
    },
    {
      label: 'Style',
      value: style.name,
      hint: style.family,
      step: 'style',
    },
    {
      label: 'Visualisers',
      value: [nameOf(config.mainTemplateId), ...config.supportingTemplateIds.map(nameOf)].join(' · '),
      hint: `Max ${config.creative.maxLayers} layers per scene`,
      step: 'template',
    },
    {
      label: 'Palette',
      value: config.paletteId === 'custom' ? 'Custom palette' : scheme.name,
      step: 'appearance',
    },
    {
      label: 'Reactivity',
      value:
        config.reactivityProfileId === 'custom'
          ? 'Custom curve'
          : `${config.reactivityProfileId.charAt(0).toUpperCase()}${config.reactivityProfileId.slice(1)}`,
      hint: `Kick ${Math.round(config.reactivity.kick * 100)}% · Bass ${Math.round(
        config.reactivity.bass * 100,
      )}% · Smoothing ${Math.round(config.reactivity.smoothing * 100)}%`,
      step: 'reactivity',
    },
    {
      label: 'Text',
      value: config.branding.enabled
        ? [config.branding.artist, config.branding.title, config.branding.album, config.branding.label]
            .filter((value) => value.trim().length > 0)
            .join(' · ') || `${type.name} (no copy yet)`
        : 'Disabled',
      hint: `${type.name} · ${config.branding.layout.replace('-', ' ')}`,
      step: 'branding',
    },
    {
      label: 'Effects',
      value:
        config.effects.enabled.map((effect) => effectEntry(effect)?.label ?? effect).join(', ') || 'None',
      hint: `${config.effects.enabled.length} passes · intensity ${config.creative.effectIntensity.toFixed(2)}×`,
      step: 'effects',
    },
    {
      label: 'Structure',
      value: `${sections.length} scene${sections.length === 1 ? '' : 's'}`,
      hint: sections.map((section) => section.label).join(' · '),
      step: 'scenes',
    },
    {
      label: 'Output',
      value: `${config.output.width} × ${config.output.height} · ${config.output.fps} fps`,
      hint: `${config.output.codec.toUpperCase()} · ${config.output.bitrateMbps} Mb/s · ${
        outPreset?.name ?? 'Custom'
      } · ${config.output.encoder}`,
      step: 'output',
    },
  ];

  return (
    <div className="wiz-step-body">
      <StepHeading
        title="Review & generate"
        blurb="Generation creates a normal project and opens it in the editor. Nothing is exported automatically."
        actions={
          <>
            <button className="btn sm" onClick={onRandomize} title="Randomise everything that is not locked">
              Randomise
            </button>
            <button className="btn primary" onClick={onGenerate} disabled={generating || validation.errors.length > 0}>
              {generating ? 'Generating…' : 'Generate visualisation'}
            </button>
          </>
        }
      />

      {validation.errors.length > 0 ? (
        <StepNotice kind="error">
          {validation.errors.map((error) => (
            <div key={error}>{error}</div>
          ))}
        </StepNotice>
      ) : null}
      {validation.warnings.map((warning) => (
        <StepNotice kind="warn" key={warning}>
          {warning}
        </StepNotice>
      ))}

      <div className="wiz-summary">
        <div className="wiz-summary-art">
          <StyleThumb palette={config.palette} variant={3} />
          <PaletteStrip palette={config.palette} />
          <div className="wiz-summary-stats">
            <div>
              <span className="wiz-stat-label">Scenes</span>
              <span className="wiz-stat-value">{sections.length}</span>
            </div>
            <div>
              <span className="wiz-stat-label">Layers ≈</span>
              <span className="wiz-stat-value">{layers}</span>
            </div>
            <div>
              <span className="wiz-stat-label">Length</span>
              <span className="wiz-stat-value">{formatSeconds(duration)}</span>
            </div>
            <div>
              <span className="wiz-stat-label">Seed</span>
              <span className="wiz-stat-value mono">{config.creative.seed}</span>
            </div>
          </div>
        </div>

        <div className="wiz-summary-rows">
          {rows.map((row) => (
            <button
              key={row.label}
              className="wiz-summary-row"
              onClick={() => jumpTo(row.step)}
              title={`Edit ${row.label.toLowerCase()}`}
            >
              <span className="wiz-summary-label">{row.label}</span>
              <span className="wiz-summary-value">
                <span className="wiz-summary-main truncate">{row.value}</span>
                {row.hint ? <span className="wiz-summary-hint truncate">{row.hint}</span> : null}
              </span>
              <span className="wiz-summary-edit">Edit</span>
            </button>
          ))}
        </div>
      </div>

      <section className="wiz-panel">
        <div className="wiz-panel-head">
          <h3>Creative controls</h3>
          <span className="hint">Applied on the next randomise</span>
        </div>
        <div className="wiz-two-col">
          <label className="wiz-text-field">
            <span className="label">Seed</span>
            <input
              className="input mono"
              type="number"
              value={config.creative.seed}
              onChange={(event) => {
                const seed = Math.round(Number(event.target.value));
                update((current) => ({
                  ...current,
                  creative: { ...current.creative, seed: Number.isFinite(seed) ? seed : current.creative.seed },
                }));
              }}
            />
          </label>
          <label className="wiz-text-field">
            <span className="label">Creativity</span>
            <input
              className="input"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={config.creative.creativity}
              onChange={(event) =>
                update((current) => ({
                  ...current,
                  creative: { ...current.creative, creativity: Number(event.target.value) },
                }))
              }
            />
          </label>
        </div>
        <p className="wiz-help">
          Locked sections are preserved by randomisation: {Object.entries(config.locks)
            .filter(([, locked]) => locked)
            .map(([key]) => key)
            .join(', ') || 'nothing is locked yet'}.
        </p>
      </section>

      <StepNotice kind="info">
        After generation the project replaces the current document (undo history starts fresh). Save
        first if you want to keep what is open now.
      </StepNotice>
    </div>
  );
}
