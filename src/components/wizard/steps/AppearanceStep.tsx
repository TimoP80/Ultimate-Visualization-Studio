import { SliderField, ColorField, ToggleField } from '../../controls';
import { PALETTE_PRESETS } from '@/wizard/presets';
import { gradePalette, mixHex } from '@/wizard/color';
import { randomPalette } from '@/wizard/random';
import { mulberry32 } from '@/wizard/random';
import { LockButton, PaletteStrip, SelectCard, StepHeading, StepNotice, StyleThumb } from '../ui';
import type { WizardStepProps } from '../shared';

const COLOR_KEYS: { key: keyof WizardPaletteKeys; label: string; hint: string }[] = [
  { key: 'a', label: 'Primary', hint: 'Main visualiser energy and accent glow.' },
  { key: 'b', label: 'Secondary', hint: 'Supporting layers and gradient partner.' },
  { key: 'c', label: 'Accent', hint: 'Highlights, outlines and text emphasis.' },
  { key: 'd', label: 'Light', hint: 'Text and bright transient flashes.' },
  { key: 'background', label: 'Background', hint: 'Scene backdrop base colour.' },
];

type WizardPaletteKeys = WizardStepProps['config']['palette'];

export default function AppearanceStep({ config, update, summary }: WizardStepProps) {
  const locked = config.locks.palette;
  const graded = gradePalette(config.palette, {
    saturation: config.appearance.saturation,
    brightness: config.appearance.brightness,
    contrast: config.appearance.contrast,
  });

  const patchPalette = (patch: Partial<WizardPaletteKeys>): void => {
    update((current) => ({
      ...current,
      paletteId: 'custom',
      palette: { ...current.palette, ...patch },
    }));
  };

  const applyPreset = (id: string): void => {
    const preset = PALETTE_PRESETS.find((item) => item.id === id);
    if (!preset) return;
    update((current) => ({ ...current, paletteId: preset.id, palette: { ...preset.palette } }));
  };

  const randomise = (): void => {
    const seed = Math.floor(Math.random() * 100000);
    const palette = randomPalette(mulberry32(seed));
    update((current) => ({ ...current, paletteId: 'custom', palette }));
  };

  return (
    <div className="wiz-step-body">
      <StepHeading
        title="Colour & appearance"
        blurb="The palette drives every generated layer, its background and its text. Grade controls are applied when the project is generated and previewed here immediately."
        actions={
          <>
            <button className="btn sm" onClick={randomise} disabled={locked} title="Randomise the palette">
              Random palette
            </button>
            <LockButton
              locked={locked}
              onToggle={() =>
                update((current) => ({
                  ...current,
                  locks: { ...current.locks, palette: !current.locks.palette },
                }))
              }
              label="Palette"
            />
          </>
        }
      />

      <section className="wiz-panel">
        <div className="wiz-panel-head">
          <h3>Scheme</h3>
          <span className="hint">Applied to visualisers, background and text</span>
        </div>
        <div className="wiz-palette-grid">
          {PALETTE_PRESETS.map((preset) => (
            <SelectCard
              key={preset.id}
              selected={config.paletteId === preset.id}
              onSelect={() => applyPreset(preset.id)}
              disabled={locked}
              className="wiz-palette-card"
              title={preset.name}
            >
              <StyleThumb palette={preset.palette} variant={preset.name.length} />
              <span className="wiz-card-body">
                <span className="wiz-card-title">{preset.name}</span>
                <PaletteStrip palette={preset.palette} />
              </span>
            </SelectCard>
          ))}
        </div>
        {config.paletteId === 'custom' ? (
          <StepNotice kind="info">Custom palette — colour pickers below are unlocked.</StepNotice>
        ) : null}
      </section>

      <section className="wiz-panel">
        <div className="wiz-panel-head">
          <h3>Colours</h3>
          <span className="hint mono">{config.paletteId === 'custom' ? 'manual' : 'preset'}</span>
        </div>
        <div className="wiz-color-grid">
          {COLOR_KEYS.map((entry) => (
            <div key={entry.key} title={entry.hint}>
              <ColorField
                label={entry.label}
                value={config.palette[entry.key]}
                onChange={(value) => patchPalette({ [entry.key]: value })}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="wiz-panel">
        <div className="wiz-panel-head">
          <h3>Lighting & grade</h3>
          <button
            className="btn sm"
            onClick={() =>
              update((current) => ({
                ...current,
                appearance: { lighting: 0.6, bloom: 0.55, glow: 0.45, contrast: 1, saturation: 1, brightness: 1 },
              }))
            }
          >
            Reset
          </button>
        </div>
        <SliderField
          label="Lighting"
          value={config.appearance.lighting}
          min={0}
          max={1}
          step={0.01}
          format={(value) => `${Math.round(value * 100)}%`}
          onChange={(lighting) =>
            update((current) => ({ ...current, appearance: { ...current.appearance, lighting } }))
          }
        />
        <SliderField
          label="Bloom"
          value={config.appearance.bloom}
          min={0}
          max={1}
          step={0.01}
          format={(value) => `${Math.round(value * 100)}%`}
          onChange={(bloom) =>
            update((current) => ({ ...current, appearance: { ...current.appearance, bloom } }))
          }
        />
        <SliderField
          label="Glow"
          value={config.appearance.glow}
          min={0}
          max={1}
          step={0.01}
          format={(value) => `${Math.round(value * 100)}%`}
          onChange={(glow) =>
            update((current) => ({ ...current, appearance: { ...current.appearance, glow } }))
          }
        />
        <SliderField
          label="Contrast"
          value={config.appearance.contrast}
          min={0.5}
          max={1.8}
          step={0.01}
          format={(value) => `${value.toFixed(2)}×`}
          onChange={(contrast) =>
            update((current) => ({ ...current, appearance: { ...current.appearance, contrast } }))
          }
        />
        <SliderField
          label="Saturation"
          value={config.appearance.saturation}
          min={0}
          max={2}
          step={0.01}
          format={(value) => `${value.toFixed(2)}×`}
          onChange={(saturation) =>
            update((current) => ({ ...current, appearance: { ...current.appearance, saturation } }))
          }
        />
        <SliderField
          label="Brightness"
          value={config.appearance.brightness}
          min={0.5}
          max={1.6}
          step={0.01}
          format={(value) => `${value.toFixed(2)}×`}
          onChange={(brightness) =>
            update((current) => ({ ...current, appearance: { ...current.appearance, brightness } }))
          }
        />
        <div className="wiz-grade-preview">
          <span className="hint">Graded output</span>
          <PaletteStrip palette={graded} />
          <span className="hint mono">{graded.a}</span>
        </div>
      </section>

      <section className="wiz-panel">
        <div className="wiz-panel-head">
          <h3>Background</h3>
        </div>
        <div className="wiz-bg-row">
          <span className="wiz-bg-sample" style={{ background: `linear-gradient(135deg, ${config.palette.background}, ${mixHex(config.palette.background, config.palette.b, 0.2)})` }} />
          <div className="col" style={{ gap: 2 }}>
            <span className="hint">
              Gradients are generated per section from the palette, with a darker base on intro and
              outro.
            </span>
            <span className="hint mono">
              {config.palette.background} → {mixHex(config.palette.background, config.palette.b, 0.2)}
            </span>
          </div>
        </div>
        <ToggleField
          label={`Add bloom effect automatically (${config.appearance.bloom > 0.5 ? 'on' : 'off'})`}
          checked={config.appearance.bloom > 0.5}
          onChange={(on) =>
            update((current) => ({
              ...current,
              appearance: { ...current.appearance, bloom: on ? 0.6 : 0.3 },
            }))
          }
        />
      </section>

      <StepNotice kind="info">
        Track brightness is {summary.analysed ? `${Math.round(summary.brightness * 100)}%` : 'not measured'}.{' '}
        {summary.analysed && summary.brightness > 0.55
          ? 'A slightly lower saturation keeps bright material from clipping.'
          : 'A little extra contrast helps a dark mix read on video.'}
      </StepNotice>
    </div>
  );
}
