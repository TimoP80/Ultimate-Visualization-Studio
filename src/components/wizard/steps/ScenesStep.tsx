import { SliderField, SelectField } from '../../controls';
import { TRANSITION_OPTIONS } from '@/wizard/presets';
import { planSections, formatSeconds } from '@/wizard/plan';
import { LockButton, Segmented, StepHeading, StepNotice } from '../ui';
import type { WizardStepProps } from '../shared';
import type { WizardSceneMode } from '@/wizard/types';

const MODES: { value: WizardSceneMode; label: string; title: string }[] = [
  { value: 'single', label: 'One scene', title: 'A single continuous scene for the whole track.' },
  { value: 'arc', label: 'Intro / main / outro', title: 'Narrative arc with title cards.' },
  { value: 'scenes', label: 'Sections', title: 'Automatically sized sections snapped to downbeats.' },
  { value: 'beat', label: 'Bar cuts', title: 'A new scene every N bars on the detected grid.' },
  { value: 'custom', label: 'Custom', title: 'Choose how many middle sections to create.' },
];

export default function ScenesStep({ config, context, track, summary, update }: WizardStepProps) {
  const locked = config.locks.scenes;
  const bpm = config.bpmOverride ?? summary.bpm ?? 120;
  const duration = Math.max(1, summary.duration || context.audioDuration || context.fallbackDuration);
  const { sections, notes } = planSections(config, duration, track, bpm);

  const patchScenes = (patch: Partial<typeof config.scenes>): void => {
    update((current) => ({ ...current, scenes: { ...current.scenes, ...patch } }));
  };

  return (
    <div className="wiz-step-body">
      <StepHeading
        title="Scenes & timeline"
        blurb="Structure is derived from the detected grid. When no boundaries exist the wizard says so instead of inventing a drop."
        actions={
          <LockButton
            locked={locked}
            onToggle={() =>
              update((current) => ({
                ...current,
                locks: { ...current.locks, scenes: !current.locks.scenes },
              }))
            }
            label="Structure"
          />
        }
      />

      <Segmented
        ariaLabel="Scene structure"
        value={config.scenes.mode}
        onChange={(mode) => patchScenes({ mode })}
        options={MODES.map((mode) => ({ value: mode.value, label: mode.label, title: mode.title }))}
      />

      <section className="wiz-panel">
        <div className="wiz-panel-head">
          <h3>Timeline</h3>
          <span className="hint">
            {sections.length} scene{sections.length === 1 ? '' : 's'} · {formatSeconds(duration)}
          </span>
        </div>
        <div className="wiz-section-strip">
          {sections.map((section) => (
            <span
              key={`${section.index}-${section.start}`}
              className={`wiz-section ${section.role}`}
              style={{ flexGrow: Math.max(1, section.duration) }}
              title={`${section.label} · ${formatSeconds(section.start)}–${formatSeconds(section.end)}`}
            >
              <span className="wiz-section-label">{section.label}</span>
              <span className="wiz-section-time">{formatSeconds(section.duration)}</span>
            </span>
          ))}
        </div>
        <div className="wiz-section-legend">
          {[...new Set(sections.map((section) => section.role))].map((role) => (
            <span key={role} className="hint">
              <i className={`wiz-dot ${role}`} /> {role}
            </span>
          ))}
        </div>
        {notes.map((note) => (
          <StepNotice kind="warn" key={note}>
            {note}
          </StepNotice>
        ))}
        {!track ? (
          <StepNotice kind="warn">
            No beat grid available — structure uses the tempo grid until a track is analysed.
          </StepNotice>
        ) : null}
      </section>

      <section className="wiz-panel">
        <div className="wiz-panel-head">
          <h3>Section timing</h3>
        </div>
        <div className="wiz-two-col">
          <SliderField
            label="Intro length"
            value={config.scenes.introSeconds}
            min={0}
            max={30}
            step={0.5}
            disabled={locked || config.scenes.mode === 'single' || config.scenes.mode === 'beat'}
            format={(value) => `${value.toFixed(1)}s`}
            onChange={(introSeconds) => patchScenes({ introSeconds })}
          />
          <SliderField
            label="Outro length"
            value={config.scenes.outroSeconds}
            min={0}
            max={30}
            step={0.5}
            disabled={locked || config.scenes.mode === 'single' || config.scenes.mode === 'beat'}
            format={(value) => `${value.toFixed(1)}s`}
            onChange={(outroSeconds) => patchScenes({ outroSeconds })}
          />
          <SliderField
            label="Bars per cut"
            value={config.scenes.barsPerCut}
            min={1}
            max={64}
            step={1}
            disabled={locked || config.scenes.mode !== 'beat'}
            format={(value) => `${Math.round(value)}`}
            onChange={(barsPerCut) => patchScenes({ barsPerCut: Math.round(barsPerCut) })}
          />
          <SliderField
            label="Middle sections"
            value={config.scenes.sectionCount}
            min={1}
            max={8}
            step={1}
            disabled={locked || config.scenes.mode !== 'custom'}
            format={(value) => `${Math.round(value)}`}
            onChange={(sectionCount) => patchScenes({ sectionCount: Math.round(sectionCount) })}
          />
        </div>
        <SelectField
          label="Scene transition"
          value={config.scenes.transition}
          onChange={(transition) =>
            patchScenes({
              transition,
              transitionSeconds: transition === 'cut' || transition === 'none' ? 0 : Math.max(0.2, config.scenes.transitionSeconds || 0.6),
            })
          }
          options={TRANSITION_OPTIONS.map((option) => ({ label: option.label, value: option.id }))}
        />
        <SliderField
          label="Transition length"
          value={config.scenes.transitionSeconds}
          min={0}
          max={3}
          step={0.05}
          disabled={locked || config.scenes.transition === 'cut' || config.scenes.transition === 'none'}
          format={(value) => `${value.toFixed(2)}s`}
          onChange={(transitionSeconds) => patchScenes({ transitionSeconds })}
        />
      </section>

      <section className="wiz-panel">
        <div className="wiz-panel-head">
          <h3>Advanced composition</h3>
        </div>
        <SliderField
          label="Visual complexity"
          value={config.creative.complexity}
          min={0}
          max={1}
          step={0.01}
          format={(value) => `${Math.round(value * 100)}%`}
          onChange={(complexity) =>
            update((current) => ({ ...current, creative: { ...current.creative, complexity } }))
          }
        />
        <SliderField
          label="Maximum layers per scene"
          value={config.creative.maxLayers}
          min={1}
          max={8}
          step={1}
          format={(value) => `${Math.round(value)}`}
          onChange={(maxLayers) =>
            update((current) => ({
              ...current,
              creative: { ...current.creative, maxLayers: Math.round(maxLayers) },
            }))
          }
        />
        <p className="wiz-help">
          Complexity controls how many sections are generated and how strong the supporting layers are.
          Layer caps apply per scene, so 4 scenes × 3 layers produces 12 layers total.
        </p>
      </section>
    </div>
  );
}
