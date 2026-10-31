import { SliderField } from '../../controls';
import { REACTIVITY_PROFILES } from '@/wizard/presets';
import { recommendReactivity } from '@/wizard/plan';
import { LockButton, SelectCard, StepHeading, StepNotice } from '../ui';
import type { WizardStepProps } from '../shared';
import type { WizardReactivity } from '@/wizard/types';

type ReactivityKey = keyof WizardReactivity;

const CONTROLS: { key: ReactivityKey; label: string; min: number; max: number; hint: string }[] = [
  { key: 'bass', label: 'Bass response', min: 0, max: 1, hint: 'Sub and bass band drive scale and colour.' },
  { key: 'kick', label: 'Kick response', min: 0, max: 1, hint: 'Transient punch — flashes, cuts and shake.' },
  { key: 'mid', label: 'Mid response', min: 0, max: 1, hint: 'Melodic and vocal movement.' },
  { key: 'high', label: 'High response', min: 0, max: 1, hint: 'Hats and percussion detail, particle sparkle.' },
  { key: 'beatSync', label: 'Beat sync', min: 0, max: 1, hint: 'Locks pulses and cuts to the detected beat grid.' },
  { key: 'particle', label: 'Particle intensity', min: 0, max: 1, hint: 'Density of generated particle and support layers.' },
  { key: 'speed', label: 'Animation speed', min: 0.4, max: 2, hint: 'Global multiplier for generated animation.' },
  { key: 'smoothing', label: 'Smoothing', min: 0, max: 1, hint: 'Envelope release. Higher is calmer, less jittery.' },
  { key: 'pulse', label: 'Pulse strength', min: 0, max: 1, hint: 'Depth of beat-driven scale and brightness pulses.' },
];

export default function ReactivityStep({ config, summary, update }: WizardStepProps) {
  const locked = config.locks.reactivity;
  const recommendation = recommendReactivity(config.styleId, summary);

  const applyProfile = (profileId: string): void => {
    const profile = REACTIVITY_PROFILES.find((item) => item.id === profileId);
    if (!profile) return;
    update((current) => ({
      ...current,
      reactivityProfileId: profile.id,
      reactivity: { ...profile.values },
    }));
  };

  return (
    <div className="wiz-step-body">
      <StepHeading
        title="Audio reactivity"
        blurb="These values are written into the generated modulation routes. They change real template parameters, not just overall brightness."
        actions={
          <>
            <button
              className="btn sm"
              onClick={() =>
                update((current) => ({
                  ...current,
                  reactivityProfileId: recommendation.profileId,
                  reactivity: { ...recommendation.values },
                }))
              }
              disabled={locked}
              title="Use the values recommended for this track"
            >
              Use recommendation
            </button>
            <LockButton
              locked={locked}
              onToggle={() =>
                update((current) => ({
                  ...current,
                  locks: { ...current.locks, reactivity: !current.locks.reactivity },
                }))
              }
              label="Reactivity"
            />
          </>
        }
      />

      <StepNotice kind="info">
        {summary.analysed ? (
          <>
            <strong>{recommendation.reason}</strong> Measured kick density{' '}
            {Math.round(summary.kick * 100)}%, bass {Math.round(summary.bass * 100)}%, tempo{' '}
            {Math.round(summary.bpm)} BPM.
          </>
        ) : (
          'Import a track to unlock measured recommendations. Profiles still work without analysis.'
        )}
      </StepNotice>

      <div className="wiz-profile-row">
        {REACTIVITY_PROFILES.map((profile) => (
          <SelectCard
            key={profile.id}
            selected={config.reactivityProfileId === profile.id}
            onSelect={() => applyProfile(profile.id)}
            disabled={locked}
            className="wiz-profile-card"
            title={profile.description}
          >
            <span className="wiz-card-title">{profile.name}</span>
            <span className="wiz-card-desc">{profile.description}</span>
          </SelectCard>
        ))}
      </div>

      <section className="wiz-panel">
        <div className="wiz-panel-head">
          <h3>Response curve</h3>
          <span className={`badge-soft ${config.reactivityProfileId === recommendation.profileId ? 'ok' : ''}`}>
            {config.reactivityProfileId === 'custom'
              ? 'Custom'
              : REACTIVITY_PROFILES.find((profile) => profile.id === config.reactivityProfileId)?.name ?? 'Custom'}
          </span>
        </div>
        {CONTROLS.map((control) => (
          <SliderField
            key={control.key}
            label={control.label}
            value={config.reactivity[control.key]}
            min={control.min}
            max={control.max}
            step={0.01}
            disabled={locked}
            format={(value) =>
              control.key === 'speed' ? `${value.toFixed(2)}×` : `${Math.round(value * 100)}%`
            }
            onChange={(value) =>
              update((current) => ({
                ...current,
                reactivityProfileId: 'custom',
                reactivity: { ...current.reactivity, [control.key]: value },
              }))
            }
          />
        ))}
        <p className="wiz-help">
          {CONTROLS.map((control) => `${control.label}: ${control.hint}`).join(' · ')}
        </p>
      </section>

      <section className="wiz-panel">
        <div className="wiz-panel-head">
          <h3>Automation</h3>
        </div>
        <div className="wiz-route-list">
          {[
            ['Kick', 'Scale, bloom threshold, flash'],
            ['Bass', 'Displacement, glow radius, camera pull'],
            ['Mid', 'Hue rotation, line thickness'],
            ['High', 'Particle spread, scanline jitter'],
            ['RMS', 'Background brightness and trails'],
          ].map(([source, target]) => (
            <div className="wiz-route" key={source}>
              <span className="wiz-route-source">{source}</span>
              <span className="wiz-route-arrow">→</span>
              <span className="hint">{target}</span>
            </div>
          ))}
        </div>
        <p className="wiz-help">
          Routes are created per layer by the generator and remain editable in the inspector's
          Modulation tab after generation.
        </p>
      </section>
    </div>
  );
}
