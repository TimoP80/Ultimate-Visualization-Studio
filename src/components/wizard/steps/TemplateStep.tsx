import { useMemo } from 'react';
import { allTemplates } from '@/templates/registry';
import { stylePreset } from '@/wizard/presets';
import { mulberry32 } from '@/wizard/random';
import type { TemplateDef } from '@/types';
import { HelpText, PaletteStrip, SelectCard, StepHeading, StepNotice, TemplateThumb } from '../ui';
import type { WizardStepProps } from '../shared';

interface TemplateStepProps extends WizardStepProps {
  favorites: { templates: string[] };
  onToggleFavorite(kind: 'styles' | 'templates', id: string): void;
}

const CATEGORY_LABEL: Record<string, string> = {
  classic: 'Spectrum',
  electronic: 'Electronic',
  hardcore: 'Hardcore',
  misc: 'Generative',
  abstract: 'Abstract',
};

/** A supporting template may not repeat the main category or itself. */
export function isCompatible(main: TemplateDef | null, candidate: TemplateDef): boolean {
  if (!main) return true;
  if (main.id === candidate.id) return false;
  return main.category !== candidate.category;
}

/** Pick a main + up to two supporting templates that read as one look. */
export function surpriseMe(
  templates: TemplateDef[],
  styleId: string,
  seed: number,
): { main: string; support: string[] } {
  if (templates.length === 0) return { main: '', support: [] };
  const rng = mulberry32(seed);
  const style = stylePreset(styleId);
  const preferred = templates.filter((def) => style.templates.includes(def.id));
  const pool = preferred.length > 0 ? preferred : templates;
  const main = pool[Math.floor(rng() * pool.length)];
  const supportPool = templates.filter((def) => isCompatible(main, def));
  const support: string[] = [];
  while (support.length < 2 && supportPool.length > 0) {
    const index = Math.floor(rng() * supportPool.length);
    const picked = supportPool.splice(index, 1)[0];
    // Keep support categories distinct so layers do not fight for the frame.
    if (support.some((id) => templates.find((def) => def.id === id)?.category === picked.category)) continue;
    support.push(picked.id);
  }
  return { main: main.id, support };
}

export default function TemplateStep({
  config,
  update,
  favorites,
  onToggleFavorite,
}: TemplateStepProps) {
  const templates = useMemo(() => allTemplates(), []);
  const main = templates.find((def) => def.id === config.mainTemplateId) ?? null;
  const recommended = stylePreset(config.styleId).templates;

  const setMain = (def: TemplateDef): void => {
    update((current) => ({
      ...current,
      mainTemplateId: def.id,
      supportingTemplateIds: current.supportingTemplateIds.filter((id) => {
        const candidate = templates.find((item) => item.id === id);
        return candidate ? isCompatible(def, candidate) : false;
      }),
    }));
  };

  const toggleSupport = (def: TemplateDef): void => {
    update((current) => {
      const active = current.supportingTemplateIds.includes(def.id);
      if (active) {
        return {
          ...current,
          supportingTemplateIds: current.supportingTemplateIds.filter((id) => id !== def.id),
        };
      }
      if (current.supportingTemplateIds.length >= 3) return current;
      return { ...current, supportingTemplateIds: [...current.supportingTemplateIds, def.id] };
    });
  };

  const randomize = (): void => {
    const pick = surpriseMe(templates, config.styleId, Math.floor(Math.random() * 100000));
    update((current) => ({
      ...current,
      mainTemplateId: pick.main,
      supportingTemplateIds: pick.support,
      creative: { ...current.creative, seed: Math.floor(Math.random() * 100000) },
    }));
  };

  return (
    <div className="wiz-step-body">
      <StepHeading
        title="Visualisers"
        blurb="One main visualiser carries the frame. Supporting layers add depth; keep the stack to three for 4K."
        actions={
          <>
            <button className="btn sm" onClick={randomize} title="Pick a compatible combination">
              Surprise me
            </button>
            <button
              className="btn sm"
              onClick={() =>
                update((current) => ({
                  ...current,
                  mainTemplateId: recommended[0],
                  supportingTemplateIds: recommended.slice(1),
                }))
              }
              title="Restore the templates this style recommends"
            >
              Style defaults
            </button>
          </>
        }
      />

      <StepNotice kind="info">
        Style <strong>{stylePreset(config.styleId).name}</strong> recommends{' '}
        {recommended
          .map((id) => templates.find((def) => def.id === id)?.name ?? id)
          .join(' · ')}
        .
      </StepNotice>

      <div className="wiz-template-grid">
        {templates.map((def, index) => {
          const isMain = def.id === config.mainTemplateId;
          const isSupport = config.supportingTemplateIds.includes(def.id);
          const compatible = isMain || isCompatible(main, def);
          const favourite = favorites.templates.includes(def.id);
          return (
            <div className="wiz-card-wrap" key={def.id}>
              <SelectCard
                selected={isMain || isSupport}
                disabled={!compatible}
                onSelect={() => (isMain ? setMain(def) : isSupport ? toggleSupport(def) : setMain(def))}
                className={`wiz-template-card ${isSupport ? 'is-support' : ''}`}
                title={compatible ? def.description : `${def.name} conflicts with the main visualiser`}
              >
                <TemplateThumb palette={config.palette} seed={index} />
                <span className="wiz-card-body">
                  <span className="wiz-card-title">
                    {def.name}
                    {isMain ? <em className="wiz-rec">Main</em> : null}
                    {isSupport ? <em className="wiz-rec sup">+Layer</em> : null}
                  </span>
                  <span className="wiz-card-sub">{CATEGORY_LABEL[def.category] ?? def.category}</span>
                  <span className="wiz-card-desc">{def.description}</span>
                  <PaletteStrip palette={config.palette} />
                </span>
              </SelectCard>
              <div className="wiz-template-actions">
                <button
                  type="button"
                  className={`wiz-star ${favourite ? 'on' : ''}`}
                  aria-pressed={favourite}
                  title={favourite ? 'Remove from favourites' : 'Add to favourites'}
                  onClick={() => onToggleFavorite('templates', def.id)}
                >
                  {favourite ? '★' : '☆'}
                </button>
                <button
                  type="button"
                  className={`wiz-chip ${isSupport ? 'on' : ''}`}
                  disabled={!compatible && !isSupport}
                  onClick={() => toggleSupport(def)}
                  title="Add as a supporting layer"
                >
                  {isSupport ? 'Remove' : 'Add layer'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <HelpText>
        Selecting a card makes it the main visualiser; “Add layer” stacks it behind or above. Reactivity
        for each layer is generated in the next steps — no template is duplicated in the renderer.
      </HelpText>
    </div>
  );
}
