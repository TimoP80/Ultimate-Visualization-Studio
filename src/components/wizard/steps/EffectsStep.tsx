import { SliderField } from '../../controls';
import { EFFECT_CATALOG, EFFECT_GROUPS, EFFECT_INTENSITY_PRESETS, stylePreset } from '@/wizard/presets';
import { LockButton, SelectCard, StepHeading, StepNotice } from '../ui';
import type { WizardStepProps } from '../shared';
import type { EffectType } from '@/types';

const MAX_EFFECTS = 6;

function toggleEffect(list: EffectType[], type: EffectType): EffectType[] {
  if (list.includes(type)) return list.filter((item) => item !== type);
  if (list.length >= MAX_EFFECTS) return list;
  return [...list, type];
}

export default function EffectsStep({ config, summary, update }: WizardStepProps) {
  const style = stylePreset(config.styleId);
  const enabled = config.effects.enabled;
  const locked = config.locks.effects;
  const heavy = enabled.filter((type) =>
    ['feedback', 'pixelSort', 'glitch', 'displacement', 'volumetric'].includes(type),
  ).length;

  const recommend = (): void => {
    update((current) => ({
      ...current,
      effects: { enabled: [...style.effects] },
      creative: { ...current.creative, effectIntensity: 1 },
    }));
  };

  return (
    <div className="wiz-step-body">
      <StepHeading
        title="Effects & atmosphere"
        blurb="Scene-wide post effects applied after the visualisers. Each one adds a full-frame pass, so the stack length is capped."
        actions={
          <>
            <button className="btn sm" onClick={recommend} disabled={locked} title={`Recommended for ${style.name}`}>
              Style recommendation
            </button>
            <LockButton
              locked={locked}
              onToggle={() =>
                update((current) => ({
                  ...current,
                  locks: { ...current.locks, effects: !current.locks.effects },
                }))
              }
              label="Effects"
            />
          </>
        }
      />

      <div className="wiz-intensity-row">
        {EFFECT_INTENSITY_PRESETS.map((preset) => (
          <SelectCard
            key={preset.id}
            selected={
              enabled.length === preset.effects.length && preset.effects.every((type) => enabled.includes(type))
            }
            onSelect={() =>
              update((current) => ({
                ...current,
                effects: { enabled: [...preset.effects] },
                creative: { ...current.creative, effectIntensity: preset.intensity },
              }))
            }
            disabled={locked}
            className="wiz-intensity-card"
            title={preset.description}
          >
            <span className="wiz-card-title">{preset.name}</span>
            <span className="wiz-card-desc">{preset.description}</span>
          </SelectCard>
        ))}
      </div>

      {EFFECT_GROUPS.map((group) => {
        const entries = EFFECT_CATALOG.filter((entry) => entry.group === group);
        return (
          <section className="wiz-panel" key={group}>
            <div className="wiz-panel-head">
              <h3>{group}</h3>
              <span className="hint">{entries.filter((entry) => enabled.includes(entry.type)).length} on</span>
            </div>
            <div className="wiz-effect-grid">
              {entries.map((entry) => {
                const on = enabled.includes(entry.type);
                const full = enabled.length >= MAX_EFFECTS && !on;
                return (
                  <button
                    key={entry.type}
                    type="button"
                    className={`wiz-effect ${on ? 'on' : ''}`}
                    aria-pressed={on}
                    disabled={locked || full}
                    title={full ? `Maximum ${MAX_EFFECTS} effects` : entry.description}
                    onClick={() =>
                      update((current) => ({
                        ...current,
                        effects: { enabled: toggleEffect(current.effects.enabled, entry.type) },
                      }))
                    }
                  >
                    <span className="wiz-effect-name">{entry.label}</span>
                    <span className="wiz-effect-desc">{entry.description}</span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}

      <section className="wiz-panel">
        <div className="wiz-panel-head">
          <h3>Intensity</h3>
          <span className="hint mono">{config.creative.effectIntensity.toFixed(2)}×</span>
        </div>
        <SliderField
          label="Effect intensity"
          value={config.creative.effectIntensity}
          min={0.2}
          max={2}
          step={0.01}
          disabled={locked}
          format={(value) => `${value.toFixed(2)}×`}
          onChange={(effectIntensity) =>
            update((current) => ({
              ...current,
              creative: { ...current.creative, effectIntensity },
            }))
          }
        />
        <p className="wiz-help">
          Bloom and glow are added automatically when the appearance panel asks for them. Effects are
          applied in catalogue order, brightest last.
        </p>
      </section>

      {enabled.length >= MAX_EFFECTS ? (
        <StepNotice kind="warn">
          {MAX_EFFECTS} effects selected — the maximum. Disable one to enable another.
        </StepNotice>
      ) : null}
      {heavy >= 3 ? (
        <StepNotice kind="warn">
          Several heavy distortion passes are enabled. Preview at 1080p before exporting 4K.
        </StepNotice>
      ) : null}
      {summary.analysed && style.energy > 0.7 && heavy === 0 ? (
        <StepNotice kind="info">
          {style.name} usually reads better with at least one distortion or motion pass at{' '}
          {Math.round(summary.bpm)} BPM.
        </StepNotice>
      ) : null}
    </div>
  );
}
