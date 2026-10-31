import type { Palette } from '@/types';
import { PALETTE_PRESETS, STYLE_PRESETS, type StylePreset } from '@/wizard/presets';
import { applyStyle } from '@/wizard/config';
import { recommendStyle } from '@/wizard/plan';
import type { WizardFavorites } from '@/wizard/storage';
import { PaletteStrip, SelectCard, StepHeading, StepNotice, StyleThumb } from '../ui';
import type { WizardStepProps } from '../shared';

interface StyleStepProps extends WizardStepProps {
  favorites: WizardFavorites;
  onToggleFavorite(kind: 'styles' | 'templates', id: string): void;
}

function chooseRandomStyle(current: string): string {
  const options = STYLE_PRESETS.filter((preset) => preset.id !== current);
  if (options.length === 0) return current;
  return options[Math.floor(Math.random() * options.length)].id;
}

export default function StyleStep({ config, summary, update, favorites, onToggleFavorite }: StyleStepProps) {
  const recommendation = recommendStyle(summary);
  const customSelected = !STYLE_PRESETS.some((preset) => preset.id === config.styleId);

  const select = (style: StylePreset): void => {
    update((current) => applyStyle(current, style.id));
  };

  return (
    <div className="wiz-step-body">
      <StepHeading
        title="Visual direction"
        blurb="Each style defines templates, palette, type, effects and the audio response. Locked sections stay untouched."
        actions={
          <button
            className="btn sm"
            onClick={() => {
              const pick = chooseRandomStyle(config.styleId);
              update((current) => applyStyle(current, pick));
            }}
            title="Pick another art direction"
          >
            Random style
          </button>
        }
      />

      <StepNotice kind="info">
        <strong>Recommended: {STYLE_PRESETS.find((preset) => preset.id === recommendation.styleId)?.name}</strong>{' '}
        — {recommendation.reason}
      </StepNotice>

      <div className="wiz-style-grid">
        {STYLE_PRESETS.map((style, index) => {
          const selected = config.styleId === style.id;
          const favourite = favorites.styles.includes(style.id);
          return (
            <div className="wiz-card-wrap" key={style.id}>
              <SelectCard
                selected={selected}
                onSelect={() => select(style)}
                className="wiz-style-card"
                title={style.description}
              >
                <StyleThumb palette={stylePalette(style)} variant={index} />
                <span className="wiz-card-body">
                  <span className="wiz-card-title">
                    {style.name}
                    {recommendation.styleId === style.id ? <em className="wiz-rec">For this track</em> : null}
                  </span>
                  <span className="wiz-card-sub">{style.family}</span>
                  <span className="wiz-card-desc">{style.description}</span>
                  <PaletteStrip palette={stylePalette(style)} />
                </span>
              </SelectCard>
              <button
                type="button"
                className={`wiz-star ${favourite ? 'on' : ''}`}
                aria-pressed={favourite}
                title={favourite ? 'Remove from favourites' : 'Add to favourites'}
                onClick={() => onToggleFavorite('styles', style.id)}
              >
                {favourite ? '★' : '☆'}
              </button>
            </div>
          );
        })}

        <SelectCard
          selected={customSelected}
          onSelect={() => update((current) => ({ ...current, styleId: 'custom' }))}
          className="wiz-style-card wiz-style-custom"
          title="Keep the current palette, templates and effects and edit them yourself"
        >
          <StyleThumb palette={config.palette} variant={7} />
          <span className="wiz-card-body">
            <span className="wiz-card-title">Custom art direction</span>
            <span className="wiz-card-sub">Manual</span>
            <span className="wiz-card-desc">
              Keep everything as configured and fine-tune palette, templates and effects in the next
              steps.
            </span>
            <PaletteStrip palette={config.palette} />
          </span>
        </SelectCard>
      </div>
    </div>
  );
}

function stylePalette(style: StylePreset): Palette {
  return (
    PALETTE_PRESETS.find((preset) => preset.id === style.paletteId)?.palette ?? {
      a: '#22d3ee',
      b: '#8b5cf6',
      c: '#f472b6',
      d: '#e8ebf0',
      background: '#07080c',
    }
  );
}
