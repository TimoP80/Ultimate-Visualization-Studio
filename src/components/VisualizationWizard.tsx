import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStudio } from '@/state/store';
import { transport } from '@/state/transport';
import { getAnalysisTrack } from '@/state/analysisStore';
import { audioEngine } from '@/audio/AudioEngine';
import { WIZARD_STEPS, type WizardConfig, type WizardContext, type WizardStepId } from '@/wizard/types';
import {
  applyStyle,
  createDefaultConfig,
  normalizeConfig,
  titleFromFileName,
} from '@/wizard/config';
import { analyzeTrackSummary, recommendReactivity, recommendStyle, validateConfig } from '@/wizard/plan';
import { randomizeConfig } from '@/wizard/random';
import { generateProject } from '@/wizard/generator';
import {
  clearDraft,
  loadDraft,
  loadFavorites,
  loadPresets,
  persistPresets,
  saveDraft,
  toggleFavorite,
  type WizardFavorites,
  type WizardPreset,
} from '@/wizard/storage';
import { LockIcon, SparkIcon } from './Icons';
import WizardPreview from './wizard/WizardPreview';
import PresetsPanel from './wizard/PresetsPanel';
import AudioStep from './wizard/steps/AudioStep';
import StyleStep from './wizard/steps/StyleStep';
import TemplateStep from './wizard/steps/TemplateStep';
import AppearanceStep from './wizard/steps/AppearanceStep';
import ReactivityStep from './wizard/steps/ReactivityStep';
import BrandingStep from './wizard/steps/BrandingStep';
import EffectsStep from './wizard/steps/EffectsStep';
import ScenesStep from './wizard/steps/ScenesStep';
import OutputStep from './wizard/steps/OutputStep';
import ReviewStep from './wizard/steps/ReviewStep';

export default function VisualizationWizard() {
  const open = useStudio((s) => s.wizardOpen);
  const setWizardOpen = useStudio((s) => s.setWizardOpen);
  const projectAudio = useStudio((s) => s.project.audio);
  const audioStatus = useStudio((s) => s.audio.status);
  const audioName = useStudio((s) => s.audio.name);

  const [config, setConfig] = useState<WizardConfig>(() => createDefaultConfig());
  const [stepIndex, setStepIndex] = useState(0);
  const [resumed, setResumed] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [presets, setPresets] = useState<WizardPreset[]>([]);
  const [favorites, setFavorites] = useState<WizardFavorites>({ styles: [], templates: [] });
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openedOnce = useRef(false);

  // The analysis cache lives outside React; re-read it whenever the import status changes.
  const track = useMemo(() => getAnalysisTrack(), [audioStatus, open]);
  const summary = useMemo(() => analyzeTrackSummary(track), [track]);

  const context: WizardContext = useMemo(
    () => ({
      audioName: projectAudio?.name || audioName,
      audioDuration: projectAudio?.duration ?? 0,
      audioRef: projectAudio,
      track,
      fallbackDuration: 180,
    }),
    [projectAudio, audioName, track],
  );

  const step = WIZARD_STEPS[Math.min(stepIndex, WIZARD_STEPS.length - 1)];
  const lastStep = stepIndex >= WIZARD_STEPS.length - 1;

  /* ---------------------------------------------------------------- */
  /* Session lifecycle                                                */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!open || openedOnce.current) return;
    openedOnce.current = true;
    setPresets(loadPresets());
    setFavorites(loadFavorites());
    const draft = loadDraft();
    if (draft && !draft.config.finished) {
      setConfig(normalizeConfig(draft.config, createDefaultConfig()));
      const index = WIZARD_STEPS.findIndex((item) => item.id === draft.stepId);
      setStepIndex(index >= 0 ? index : 0);
      setResumed(true);
    } else {
      setConfig((current) => {
        const fresh = createDefaultConfig({
          audioName: projectAudio?.name || audioName,
          bpm: projectAudio?.bpm ?? null,
        });
        // Preserve a live session's choices if the user reopens the wizard.
        return current.styleId === fresh.styleId ? current : fresh;
      });
      setStepIndex(0);
    }
  }, [open, projectAudio, audioName]);

  // Fill title/artist placeholders from the file name once a track exists.
  useEffect(() => {
    if (!open || !context.audioName) return;
    setConfig((current) =>
      current.branding.title.trim().length > 0
        ? current
        : {
            ...current,
            branding: { ...current.branding, title: titleFromFileName(context.audioName) },
          },
    );
  }, [open, context.audioName]);

  // Automatic draft saving keeps an unfinished wizard resumable.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => saveDraft(config, step.id), 400);
    return () => window.clearTimeout(id);
  }, [config, step.id, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const typing = Boolean(
        target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT' ||
            target.isContentEditable),
      );
      if (event.key === 'Escape' && !presetsOpen) {
        if (typing) return;
        setWizardOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, presetsOpen, setWizardOpen]);

  const update = useCallback((recipe: (config: WizardConfig) => WizardConfig): void => {
    setConfig((current) => ({ ...recipe(current), updatedAt: new Date().toISOString() }));
  }, []);

  const jumpTo = useCallback((id: WizardStepId): void => {
    const index = WIZARD_STEPS.findIndex((item) => item.id === id);
    if (index >= 0) setStepIndex(index);
  }, []);

  const applyPreset = (preset: WizardPreset): void => {
    setConfig(normalizeConfig(preset.config, createDefaultConfig()));
    setPresetsOpen(false);
  };

  const changePresets = (next: WizardPreset[]): void => {
    setPresets(next);
    persistPresets(next);
  };

  const toggleFav = (kind: 'styles' | 'templates', id: string): void => {
    const next = toggleFavorite(favorites, kind, id);
    setFavorites(next);
  };

  const quickStart = (): void => {
    const recommendation = recommendStyle(summary);
    const base = applyStyle(createDefaultConfig({ audioName: context.audioName, bpm: context.audioRef?.bpm ?? null }), recommendation.styleId);
    const reactivity = recommendReactivity(recommendation.styleId, summary);
    setConfig({
      ...base,
      reactivityProfileId: reactivity.profileId,
      reactivity: { ...reactivity.values },
    });
    setStepIndex(WIZARD_STEPS.length - 1);
    setResumed(false);
    useStudio.getState().setToast(`Quick start prepared a ${recommendation.styleId} composition — review and generate.`);
  };

  const randomise = (): void => {
    const seed = Math.floor(Math.random() * 2 ** 31);
    update((current) => randomizeConfig(current, seed, { summary }));
  };

  const generate = (): void => {
    if (generating) return;
    const currentConfig = config;
    const validation = validateConfig(currentConfig, context);
    if (validation.errors.length > 0) {
      setError(validation.errors[0]);
      return;
    }
    setError(null);
    setGenerating(true);
    // Defer one frame so the button reflects its pressed state before the
    // generator builds every scene and layer synchronously.
    window.setTimeout(() => {
      try {
        const result = generateProject(currentConfig, context);
        const store = useStudio.getState();
        store.replaceProject(result.project);
        const first = result.project.scenes[0];
        transport.setDuration(first?.duration ?? (context.audioDuration || 180));
        transport.setTime(0);
        if (audioEngine.hasAudio) audioEngine.setLoop(transport.loop, 0, transport.duration);
        store.setToast(
          `Generated ${result.project.name} — ${result.sections.length} scene${
            result.sections.length === 1 ? '' : 's'
          }, ${result.layerCount} layers`,
        );
        if (result.warnings.length > 0) store.setToast(result.warnings[0]);
        clearDraft();
        setWizardOpen(false);
        setStepIndex(0);
        setResumed(false);
        const fresh = createDefaultConfig({ audioName: context.audioName, bpm: context.audioRef?.bpm ?? null });
        setConfig(fresh);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Generation failed.');
      } finally {
        setGenerating(false);
      }
    }, 40);
  };

  if (!open) return null;

  const stepProps = {
    config,
    context,
    summary,
    track,
    update,
    jumpTo,
  };

  return (
    <div className="wiz-shell" role="dialog" aria-modal="true" aria-label="Visualization Wizard">
      <header className="wiz-header">
        <div className="row gap-2" style={{ minWidth: 0 }}>
          <span className="wiz-mark">
            <SparkIcon size={14} />
          </span>
          <div className="col" style={{ gap: 1, minWidth: 0 }}>
            <span className="wiz-title">Visualization Wizard</span>
            <span className="hint truncate">
              {context.audioName || 'No audio yet'} · step {stepIndex + 1} of {WIZARD_STEPS.length}
            </span>
          </div>
        </div>

        <div className="wiz-header-actions">
          <button
            className="btn sm"
            onClick={() => setPresetsOpen((value) => !value)}
            title="Save, apply and manage wizard presets"
          >
            Presets
          </button>
          <button className="btn sm" onClick={quickStart} title="Recommended settings with your track">
            Quick start
          </button>
          <button
            className={`btn sm ${config.creative.advanced ? 'on' : ''}`}
            onClick={() =>
              update((current) => ({
                ...current,
                creative: { ...current.creative, advanced: !current.creative.advanced },
              }))
            }
            title="Expose creative controls, seeds and layer caps"
          >
            Advanced
          </button>
          <button
            className="btn sm"
            onClick={randomise}
            title="Randomise every unlocked section"
          >
            Randomise
          </button>
          <button className="icon-btn" onClick={() => setWizardOpen(false)} title="Close (Esc) — your draft is kept">
            ✕
          </button>
        </div>
      </header>

      <div className="wiz-body">
        <nav className="wiz-nav" aria-label="Wizard steps">
          {WIZARD_STEPS.map((item, index) => {
            const done = index < stepIndex;
            return (
              <button
                key={item.id}
                className={`wiz-nav-item ${index === stepIndex ? 'active' : ''} ${done ? 'done' : ''}`}
                onClick={() => setStepIndex(index)}
                aria-current={index === stepIndex ? 'step' : undefined}
              >
                <span className="wiz-nav-index">{done ? '✓' : String(index + 1).padStart(2, '0')}</span>
                <span className="wiz-nav-label">{item.label}</span>
              </button>
            );
          })}
          <div className="wiz-nav-foot">
            <div className="wiz-progress">
              <span style={{ width: `${((stepIndex + 1) / WIZARD_STEPS.length) * 100}%` }} />
            </div>
            <span className="hint">{Math.round(((stepIndex + 1) / WIZARD_STEPS.length) * 100)}% complete</span>
            <span className="hint">
              <LockIcon size={10} locked />
              {Object.values(config.locks).filter(Boolean).length} locked
            </span>
          </div>
        </nav>

        <main className="wiz-main">
          <div className="wiz-main-head">
            <div className="col" style={{ gap: 2 }}>
              <span className="wiz-step-eyebrow">{step.label}</span>
              <h1>{step.title}</h1>
              <p>{step.blurb}</p>
            </div>
            {resumed ? (
              <button
                className="badge-soft ok"
                onClick={() => {
                  clearDraft();
                  setResumed(false);
                  setConfig(createDefaultConfig({ audioName: context.audioName }));
                  setStepIndex(0);
                }}
                title="Discard the restored draft and start over"
              >
                Resumed draft — start over
              </button>
            ) : null}
          </div>

          <div className="wiz-main-scroll">
            {step.id === 'audio' ? (
              <AudioStep
                {...stepProps}
                onAudioImported={(name) =>
                  update((current) => ({
                    ...current,
                    branding: {
                      ...current.branding,
                      title: current.branding.title.trim() ? current.branding.title : titleFromFileName(name),
                    },
                  }))
                }
              />
            ) : null}
            {step.id === 'style' ? (
              <StyleStep {...stepProps} favorites={favorites} onToggleFavorite={toggleFav} />
            ) : null}
            {step.id === 'template' ? (
              <TemplateStep {...stepProps} favorites={favorites} onToggleFavorite={toggleFav} />
            ) : null}
            {step.id === 'appearance' ? <AppearanceStep {...stepProps} /> : null}
            {step.id === 'reactivity' ? <ReactivityStep {...stepProps} /> : null}
            {step.id === 'branding' ? <BrandingStep {...stepProps} /> : null}
            {step.id === 'effects' ? <EffectsStep {...stepProps} /> : null}
            {step.id === 'scenes' ? <ScenesStep {...stepProps} /> : null}
            {step.id === 'output' ? <OutputStep {...stepProps} /> : null}
            {step.id === 'review' ? (
              <ReviewStep
                {...stepProps}
                onGenerate={generate}
                onRandomize={randomise}
                generating={generating}
              />
            ) : null}
          </div>

          {error ? <div className="wiz-error">{error}</div> : null}

          <footer className="wiz-footer">
            <button className="btn" onClick={() => setWizardOpen(false)} title="Close and keep this draft">
              Cancel
            </button>
            <span className="hint">
              Draft saved automatically · seeded {config.creative.seed}
            </span>
            <div className="row gap-2">
              <button className="btn" disabled={stepIndex === 0} onClick={() => setStepIndex((i) => Math.max(0, i - 1))}>
                Back
              </button>
              {lastStep ? (
                <button className="btn primary" onClick={generate} disabled={generating}>
                  {generating ? 'Generating…' : 'Generate visualisation'}
                </button>
              ) : (
                <button
                  className="btn primary"
                  onClick={() => setStepIndex((i) => Math.min(WIZARD_STEPS.length - 1, i + 1))}
                >
                  Next
                </button>
              )}
            </div>
          </footer>
        </main>

        <aside className="wiz-side">
          <WizardPreview config={config} context={context} />
          <div className="wiz-side-meta">
            <div className="wiz-side-row">
              <span className="hint">Scenes</span>
              <span className="mono">
                {config.scenes.mode === 'single' ? 1 : config.scenes.mode === 'custom' ? config.scenes.sectionCount : 'auto'}
              </span>
            </div>
            <div className="wiz-side-row">
              <span className="hint">Layers / scene</span>
              <span className="mono">{config.creative.maxLayers}</span>
            </div>
            <div className="wiz-side-row">
              <span className="hint">Effects</span>
              <span className="mono">{config.effects.enabled.length}</span>
            </div>
            <div className="wiz-side-row">
              <span className="hint">Output</span>
              <span className="mono">
                {config.output.width}×{config.output.height} · {config.output.fps}
              </span>
            </div>
<div className="wiz-side-row">
              <span className="hint">Analysis</span>
              <span className={`badge-soft ${summary.analysed ? 'ok' : ''}`}>
                {summary.analysed ? `${Math.round(summary.bpm)} BPM` : 'none'}
              </span>
            </div>
          </div>
          {presetsOpen ? (
            <PresetsPanel
              presets={presets}
              config={config}
              onApply={applyPreset}
              onChange={changePresets}
              onClose={() => setPresetsOpen(false)}
            />
          ) : null}
        </aside>
      </div>
    </div>
  );
}
