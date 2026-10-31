import { ToggleField } from '../../controls';
import { TYPOGRAPHY_PRESETS } from '@/wizard/presets';
import { LockButton, SelectCard, Segmented, StepHeading, StepNotice } from '../ui';
import type { WizardStepProps } from '../shared';
import type { WizardBranding } from '@/wizard/types';

const FIELDS: { key: keyof WizardBranding; label: string; placeholder: string; maxLength: number }[] = [
  { key: 'artist', label: 'Artist', placeholder: 'Artist or project name', maxLength: 80 },
  { key: 'title', label: 'Track title', placeholder: 'Track title', maxLength: 120 },
  { key: 'album', label: 'Album / EP', placeholder: 'Optional', maxLength: 120 },
  { key: 'label', label: 'Label', placeholder: 'Optional', maxLength: 80 },
  { key: 'releaseDate', label: 'Release date', placeholder: '2026', maxLength: 40 },
  { key: 'customText', label: 'Custom line', placeholder: 'Optional credit or message', maxLength: 160 },
];

export default function BrandingStep({ config, summary, update }: WizardStepProps) {
  const branding = config.branding;
  const locked = config.locks.branding;
  const preset = TYPOGRAPHY_PRESETS.find((item) => item.id === branding.typographyId) ?? TYPOGRAPHY_PRESETS[0];

  const patch = (next: Partial<WizardBranding>): void => {
    update((current) => ({ ...current, branding: { ...current.branding, ...next } }));
  };

  return (
    <div className="wiz-step-body">
      <StepHeading
        title="Text & branding"
        blurb="Every line becomes a normal text layer with the studio's inline editor, so copy, position and timing stay editable."
        actions={
          <LockButton
            locked={locked}
            onToggle={() =>
              update((current) => ({
                ...current,
                locks: { ...current.locks, branding: !current.locks.branding },
              }))
            }
            label="Branding"
          />
        }
      />

      <section className="wiz-panel">
        <div className="wiz-panel-head">
          <h3>Credits</h3>
          <ToggleField
            label="Include text layers"
            checked={branding.enabled}
            onChange={(enabled) => patch({ enabled })}
          />
        </div>
        <div className="wiz-field-grid">
          {FIELDS.map((field) => (
            <label className="wiz-text-field" key={field.key}>
              <span className="label">{field.label}</span>
              <input
                className="input"
                value={String(branding[field.key] ?? '')}
                maxLength={field.maxLength}
                placeholder={field.placeholder}
                disabled={locked || !branding.enabled}
                spellCheck={false}
                onChange={(event) =>
                  patch({ [field.key]: event.target.value } as Partial<WizardBranding>)
                }
              />
            </label>
          ))}
        </div>
        {!branding.enabled ? (
          <StepNotice kind="warn">No text layers will be created for this composition.</StepNotice>
        ) : null}
      </section>

      <section className="wiz-panel">
        <div className="wiz-panel-head">
          <h3>Typography</h3>
          <span className="hint">{preset.description}</span>
        </div>
        <div className="wiz-type-grid">
          {TYPOGRAPHY_PRESETS.map((item) => (
            <SelectCard
              key={item.id}
              selected={branding.typographyId === item.id}
              onSelect={() => patch({ typographyId: item.id })}
              disabled={locked || !branding.enabled}
              className="wiz-type-card"
              title={item.description}
            >
              <span
                className="wiz-type-sample"
                style={{
                  fontWeight: item.weight,
                  letterSpacing: `${item.tracking}em`,
                  textTransform: item.uppercase ? 'uppercase' : 'none',
                }}
              >
                {branding.artist.trim() || branding.title.trim() || 'Visualiser'}
              </span>
              <span className="wiz-card-sub">{item.name}</span>
            </SelectCard>
          ))}
        </div>
        <div className="wiz-field-grid">
          <div className="wiz-text-field">
            <span className="label">Layout</span>
            <Segmented
              ariaLabel="Text layout"
              value={branding.layout}
              onChange={(layout) => patch({ layout })}
              options={[
                { value: 'centre', label: 'Centre', title: 'Large centred title' },
                { value: 'lower-third', label: 'Lower third', title: 'Broadcast lower third' },
                { value: 'corner', label: 'Corner', title: 'Compact corner credit' },
              ]}
            />
          </div>
          <div className="wiz-text-field">
            <span className="label">Title on every section</span>
            <ToggleField
              label="Keep a compact credit visible"
              checked={branding.alwaysShowTitle}
              onChange={(alwaysShowTitle) => patch({ alwaysShowTitle })}
            />
          </div>
        </div>
        <p className="wiz-help">
          Text size and tracking come from the typography preset ({Math.round(preset.fontSize * 100)}%)
          and are scaled to the output resolution, so a 9:16 export keeps readable titles.
        </p>
      </section>

      <section className="wiz-panel">
        <div className="wiz-panel-head">
          <h3>Preview text</h3>
        </div>
        <div className="wiz-branding-preview" style={{ background: config.palette.background }}>
          <span
            className="wiz-branding-title"
            style={{
              color: config.palette.d,
              fontWeight: preset.weight,
              letterSpacing: `${preset.tracking}em`,
              textTransform: preset.uppercase ? 'uppercase' : 'none',
              textShadow: `0 0 18px ${config.palette.a}99`,
            }}
          >
            {branding.artist.trim() || 'Artist'}
          </span>
          <span className="wiz-branding-sub" style={{ color: config.palette.a }}>
            {branding.title.trim() || 'Track title'}
          </span>
          {branding.label.trim() ? (
            <span className="wiz-branding-meta" style={{ color: config.palette.c }}>
              {branding.label}
              {branding.releaseDate ? ` · ${branding.releaseDate}` : ''}
            </span>
          ) : null}
        </div>
        {summary.analysed ? (
          <p className="wiz-help">
            Text appears on the intro, each section boundary and the outro — bars with detected
            downbeats when the analysis has them.
          </p>
        ) : null}
      </section>
    </div>
  );
}
