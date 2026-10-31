import { useMemo, useState } from 'react';
import type {
  BlendMode,
  EffectInstance,
  Layer,
  ModulationRoute,
  ModulationSource,
  ParamDef,
} from '@/types';
import { BLEND_MODES, clamp } from '@/timeline/easing';
import { EFFECT_DEFS, EFFECT_DEF_MAP } from '@/render/effects';
import { SCALAR_LABELS } from '@/audio/bands';
import { getTemplateById } from '@/templates/registry';
import {
  TEXT_EFFECTS,
  TEXT_EFFECT_PARAM_LABELS,
  TEXT_EFFECT_PARAM_RANGES,
  defaultTextEffectParams,
  textEffectFor,
  textEffectParamKey,
  textEffectValue,
} from '@/render/textEffects';
import { activeScene, identityTransform } from '@/state/project';
import { useStudio, type RightTab } from '@/state/store';
import { openAudioPicker } from '@/state/audioImport';
import { uid } from '@/state/project';
import { Collapsible, ColorField, EmptyHint, SelectField, SliderField, ToggleField } from './controls';
import { ImportIcon, PlusIcon, TrashIcon } from './Icons';

const TABS: { id: RightTab; label: string }[] = [
  { id: 'properties', label: 'Properties' },
  { id: 'modulation', label: 'Modulate' },
  { id: 'effects', label: 'Effects' },
  { id: 'audio', label: 'Audio' },
];

const MOD_SOURCES: ModulationSource[] = [
  'rms',
  'peak',
  'subBass',
  'bass',
  'lowMid',
  'mid',
  'highMid',
  'treble',
  'air',
  'centroid',
  'flux',
  'beat',
  'beatPhase',
  'bar',
  'kick',
  'snare',
  'onset',
  'band',
];

export default function PropertiesPanel() {
  const tab = useStudio((s) => s.rightTab);
  const setTab = useStudio((s) => s.setRightTab);
  const project = useStudio((s) => s.project);
  const selectedLayerId = useStudio((s) => s.selectedLayerId);
  const layer = useMemo(
    () =>
      project.scenes.flatMap((scene) => scene.layers).find((l) => l.id === selectedLayerId) ?? null,
    [project, selectedLayerId],
  );

  return (
    <>
      <div className="sidebar-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`sidebar-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="sidebar-content">
        {tab === 'properties' ? <PropertiesTab layer={layer} /> : null}
        {tab === 'modulation' ? <ModulationTab layer={layer} /> : null}
        {tab === 'effects' ? <EffectsTab layer={layer} /> : null}
        {tab === 'audio' ? <AudioTab /> : null}
      </div>
    </>
  );
}

function PropertiesTab({ layer }: { layer: Layer | null }) {
  if (!layer) return <SceneProperties />;
  return <LayerProperties layer={layer} />;
}

function SceneProperties() {
  const project = useStudio((s) => s.project);
  const setSceneBackground = useStudio((s) => s.setSceneBackground);
  const setSceneBackgroundMode = useStudio((s) => s.setSceneBackgroundMode);
  const scene = activeScene(project);

  return (
    <div className="section">
      <span className="label">{scene.name}</span>
      <div className="hint">
        {scene.layers.length} {scene.layers.length === 1 ? 'layer' : 'layers'} ·{' '}
        {scene.duration.toFixed(1)}s
      </div>
      <div className="divider" />
      <span className="label">Background</span>
      <ColorField label="Top" value={scene.bgColors[0]} onChange={(v) => setSceneBackground(0, v)} />
      <ColorField label="Bottom" value={scene.bgColors[1]} onChange={(v) => setSceneBackground(1, v)} />
      <SelectField
        label="Mode"
        value={scene.bgMode}
        options={[
          { label: 'Solid', value: 'solid' },
          { label: 'Gradient', value: 'gradient' },
          { label: 'Transparent', value: 'transparent' },
        ]}
        onChange={setSceneBackgroundMode}
      />
      <div className="divider" />
      <div className="hint">Select a layer to edit its transform, palette and audio mappings.</div>
    </div>
  );
}

function LayerProperties({ layer }: { layer: Layer }) {
  const updateLayer = useStudio((s) => s.updateLayer);
  const template = layer.templateId ? getTemplateById(layer.templateId) : null;

  const setTransform = (key: keyof Layer['transform'], value: number): void => {
    updateLayer(layer.id, (l) => {
      l.transform[key] = value;
    });
  };

  return (
    <div style={{ paddingBottom: 16 }}>
      <div className="section">
        <div className="row">
          <input
            className="input"
            value={layer.name}
            onChange={(e) =>
              updateLayer(layer.id, (l) => {
                l.name = e.target.value;
              })
            }
          />
        </div>
        <div className="row gap-4">
          <span className="hint grow">{template ? template.name : layer.type}</span>
          <span className="chip" style={{ fontSize: 9, padding: '2px 6px' }}>
            {layer.type}
          </span>
        </div>
        {template ? <div className="hint">{template.description}</div> : null}
      </div>

      <Collapsible
        title="Transform"
        actions={
          <button
            className="icon-btn sm"
            title="Reset position, scale, rotation and opacity"
            disabled={layer.locked}
            onClick={() =>
              updateLayer(layer.id, (l) => {
                l.transform = { ...identityTransform(), opacity: l.transform.opacity };
              })
            }
          >
            ↺
          </button>
        }
      >
        {layer.locked ? (
          <span className="hint">Layer is locked — unlock it in the Elements list to transform it.</span>
        ) : null}
        <fieldset className="plain-fieldset" disabled={layer.locked}>
          <SliderField label="X" value={layer.transform.x} min={-0.5} max={0.5} step={0.001} onChange={(v) => setTransform('x', v)} format={(v) => v.toFixed(3)} />
          <SliderField label="Y" value={layer.transform.y} min={-0.5} max={0.5} step={0.001} onChange={(v) => setTransform('y', v)} format={(v) => v.toFixed(3)} />
          <SliderField label="Scale X" value={layer.transform.scaleX} min={0.05} max={8} step={0.01} onChange={(v) => setTransform('scaleX', v)} />
          <SliderField label="Scale Y" value={layer.transform.scaleY} min={0.05} max={8} step={0.01} onChange={(v) => setTransform('scaleY', v)} />
          <SliderField label="Rotation" value={layer.transform.rotation} min={-Math.PI} max={Math.PI} step={0.001} onChange={(v) => setTransform('rotation', v)} format={(v) => `${((v * 180) / Math.PI).toFixed(1)}°`} />
          <SliderField label="Opacity" value={layer.transform.opacity} min={0} max={1} step={0.01} onChange={(v) => setTransform('opacity', v)} />
          <SelectField
            label="Blend"
            value={layer.blend}
            options={BLEND_MODES.map((m) => ({ label: m, value: m as BlendMode }))}
            onChange={(v) =>
              updateLayer(layer.id, (l) => {
                l.blend = v;
              })
            }
          />
        </fieldset>
      </Collapsible>

      <TimingSection layer={layer} />

      <Collapsible title="Palette">
        <ColorField label="A" value={layer.palette.a} onChange={(v) => setPalette(layer.id, 'a', v)} />
        <ColorField label="B" value={layer.palette.b} onChange={(v) => setPalette(layer.id, 'b', v)} />
        <ColorField label="C" value={layer.palette.c} onChange={(v) => setPalette(layer.id, 'c', v)} />
        <ColorField label="D" value={layer.palette.d} onChange={(v) => setPalette(layer.id, 'd', v)} />
        <ColorField label="Backdrop" value={layer.palette.background} onChange={(v) => setPalette(layer.id, 'background', v)} />
      </Collapsible>

      {template && template.params.length > 0 ? (
        <TemplateParams layer={layer} params={template.params} />
      ) : null}

      {layer.type === 'text' ? <TextLayerParams layer={layer} /> : null}
    </div>
  );
}

function TimingSection({ layer }: { layer: Layer }) {
  const scene = useStudio((s) => activeScene(s.project));
  const updateLayer = useStudio((s) => s.updateLayer);
  const [draft, setDraft] = useState<{ field: 'start' | 'end' | 'duration'; text: string } | null>(null);

  const minimum = 0.1;

  const commit = (): void => {
    if (!draft) return;
    const value = Number(draft.text.replace(',', '.'));
    setDraft(null);
    if (!Number.isFinite(value)) return;
    updateLayer(layer.id, (l) => {
      const maxEnd = Math.max(l.start + minimum, scene.duration);
      if (draft.field === 'start') {
        l.start = clamp(value, 0, Math.max(0, l.end - minimum));
      } else if (draft.field === 'end') {
        l.end = clamp(value, l.start + minimum, maxEnd);
      } else {
        l.end = clamp(l.start + Math.max(minimum, value), l.start + minimum, maxEnd);
      }
    });
  };

  const field = (label: string, key: 'start' | 'end' | 'duration', value: number) => (
    <div className="field" key={key}>
      <span className="field-label">{label}</span>
      <div className="field-control">
        <input
          className="input mono"
          type="number"
          step={0.01}
          min={0}
          value={draft?.field === key ? draft.text : value.toFixed(2)}
          onChange={(e) => setDraft({ field: key, text: e.target.value })}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') setDraft(null);
          }}
        />
        <span className="hint">s</span>
      </div>
    </div>
  );

  return (
    <Collapsible title="Timing">
      {field('Start', 'start', layer.start)}
      {field('End', 'end', layer.end)}
      {field('Duration', 'duration', Math.max(0, layer.end - layer.start))}
      <span className="hint">Drag the clip edges on the timeline, or type exact seconds here.</span>
    </Collapsible>
  );
}

function setPalette(layerId: string, key: keyof Layer['palette'], value: string): void {
  useStudio.getState().updateLayer(layerId, (l) => {
    l.palette = { ...l.palette, [key]: value };
  });
}

function TemplateParams({ layer, params }: { layer: Layer; params: ParamDef[] }) {
  const updateLayer = useStudio((s) => s.updateLayer);
  const groups = useMemo(() => {
    const map = new Map<string, ParamDef[]>();
    for (const p of params) {
      const group = p.group ?? 'Parameters';
      const list = map.get(group) ?? [];
      list.push(p);
      map.set(group, list);
    }
    return [...map.entries()];
  }, [params]);

  const setParam = (key: string, value: number | boolean | string): void => {
    updateLayer(layer.id, (l) => {
      l.params = { ...l.params, [key]: value };
    });
  };

  return (
    <>
      {groups.map(([group, list]) => (
        <Collapsible key={group} title={group}>
          {list.map((p) => {
            const value = layer.params[p.key] ?? p.default;
            if (p.type === 'bool') {
              return (
                <ToggleField
                  key={p.key}
                  label={p.label}
                  checked={Boolean(value)}
                  onChange={(v) => setParam(p.key, v)}
                />
              );
            }
            if (p.type === 'select') {
              return (
                <SelectField
                  key={p.key}
                  label={p.label}
                  value={String(value)}
                  options={p.options ?? []}
                  onChange={(v) => setParam(p.key, v)}
                />
              );
            }
            const numeric = typeof value === 'number' ? value : Number(value) || 0;
            const step = p.type === 'int' ? 1 : (p.step ?? 0.01);
            return (
              <SliderField
                key={p.key}
                label={p.label}
                value={numeric}
                min={p.min ?? 0}
                max={p.max ?? 1}
                step={step}
                onChange={(v) => setParam(p.key, v)}
                format={(v) => (step >= 1 ? v.toFixed(0) : v.toFixed(2))}
              />
            );
          })}
        </Collapsible>
      ))}
    </>
  );
}

function TextLayerParams({ layer }: { layer: Layer }) {
  const updateLayer = useStudio((s) => s.updateLayer);
  const setParam = (key: string, value: number): void =>
    updateLayer(layer.id, (l) => {
      l.params = { ...l.params, [key]: value };
    });

  const effect = textEffectFor(layer.textEffect);

  const setEffect = (id: string): void => {
    updateLayer(layer.id, (l) => {
      const next = textEffectFor(id);
      l.textEffect = next.id;
      // Keep tuned values, fill in defaults for parameters the preset adds.
      l.params = { ...defaultTextEffectParams(next), ...l.params };
    });
  };

  return (
    <>
      <Collapsible title="Text">
        <textarea
          className="input"
          style={{ height: 48, padding: 6, resize: 'vertical', userSelect: 'text' }}
          value={layer.text ?? ''}
          onChange={(e) =>
            updateLayer(layer.id, (l) => {
              l.text = e.target.value;
            })
          }
        />
        <span className="hint">
          Double-click the text on the preview, or press Enter / F2 with the layer
          selected, to edit it in place. Enter commits, Escape reverts.
        </span>
        <button
          className="btn sm"
          disabled={layer.locked || !layer.visible}
          onClick={() => useStudio.getState().requestTextEdit(layer.id)}
        >
          Edit on canvas
        </button>
        <SliderField label="Size" value={Number(layer.params.fontSize ?? 1)} min={0.2} max={2} step={0.01} onChange={(v) => setParam('fontSize', v)} />
        <SliderField label="Weight" value={Number(layer.params.weight ?? 800)} min={300} max={900} step={100} onChange={(v) => setParam('weight', v)} format={(v) => v.toFixed(0)} />
        <SliderField label="Tracking" value={Number(layer.params.letterSpacing ?? 0)} min={-0.05} max={0.4} step={0.001} onChange={(v) => setParam('letterSpacing', v)} format={(v) => v.toFixed(3)} />
      </Collapsible>

      <Collapsible title="Text effect">
        <SelectField
          label="Preset"
          value={effect.id}
          options={TEXT_EFFECTS.map((e) => ({ label: e.label, value: e.id }))}
          onChange={setEffect}
        />
        <span className="hint">{effect.description}</span>
        {effect.params.map((key) => {
          const range = TEXT_EFFECT_PARAM_RANGES[key];
          return (
            <SliderField
              key={key}
              label={TEXT_EFFECT_PARAM_LABELS[key]}
              value={textEffectValue(layer, key)}
              min={range.min}
              max={range.max}
              step={range.step}
              onChange={(v) => setParam(textEffectParamKey(key), v)}
              format={(v) => v.toFixed(2)}
            />
          );
        })}
        {effect.id === 'typewriter' ? (
          <span className="hint">Reveal is timed from the clip start, so it also plays correctly in the MP4 export.</span>
        ) : null}
      </Collapsible>
    </>
  );
}

function ModulationTab({ layer }: { layer: Layer | null }) {
  const updateLayer = useStudio((s) => s.updateLayer);
  if (!layer) return <div className="section"><EmptyHint>Select a layer to map audio features onto its parameters.</EmptyHint></div>;

  const template = layer.templateId ? getTemplateById(layer.templateId) : null;
  const targets = template ? template.params.map((p) => p.key) : Object.keys(layer.params);

  const addRoute = (): void => {
    const route: ModulationRoute = {
      id: uid('mod'),
      enabled: true,
      source: 'bass',
      target: targets[0] ?? 'radius',
      amount: 0.2,
      attack: 0.02,
      release: 0.18,
      sensitivity: 1,
      threshold: 0,
      invert: false,
    };
    updateLayer(layer.id, (l) => {
      l.modulation = [...l.modulation, route];
    });
  };

  const patchRoute = (routeId: string, patch: Partial<ModulationRoute>, history = false): void => {
    updateLayer(
      layer.id,
      (l) => {
        l.modulation = l.modulation.map((r) => (r.id === routeId ? { ...r, ...patch } : r));
      },
      history,
    );
  };

  return (
    <div className="section">
      <div className="row">
        <span className="label grow">Audio mappings</span>
        <button className="btn sm" onClick={addRoute}>
          <PlusIcon size={11} /> Route
        </button>
      </div>
      {layer.modulation.length === 0 ? (
        <EmptyHint>
          No routes yet. A route adds an audio feature (enveloped with its own attack and release)
          onto any template parameter.
        </EmptyHint>
      ) : null}
      {layer.modulation.map((route) => (
        <div key={route.id} className="panel" style={{ border: '1px solid var(--border)', borderRadius: 6 }}>
          <div className="panel-body" style={{ gap: 5 }}>
            <div className="row gap-4">
              <input
                type="checkbox"
                checked={route.enabled}
                onChange={(e) => patchRoute(route.id, { enabled: e.target.checked })}
                aria-label="Enable route"
                style={{ accentColor: 'var(--accent)' }}
              />
              <select
                className="input"
                style={{ flex: 1 }}
                value={route.source}
                onChange={(e) => patchRoute(route.id, { source: e.target.value as ModulationSource }, true)}
              >
                {MOD_SOURCES.map((source) => (
                  <option key={source} value={source}>
                    {SCALAR_LABELS[source] ?? source}
                  </option>
                ))}
              </select>
              <select
                className="input"
                style={{ flex: 1 }}
                value={route.target}
                onChange={(e) => patchRoute(route.id, { target: e.target.value }, true)}
              >
                {targets.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <button
                className="icon-btn sm"
                title="Remove route"
                onClick={() =>
                  updateLayer(layer.id, (l) => {
                    l.modulation = l.modulation.filter((r) => r.id !== route.id);
                  })
                }
              >
                <TrashIcon size={11} />
              </button>
            </div>
            <SliderField label="Amount" value={route.amount} min={-2} max={2} step={0.01} onChange={(v) => patchRoute(route.id, { amount: v })} />
            <SliderField label="Sensitivity" value={route.sensitivity} min={0.1} max={6} step={0.01} onChange={(v) => patchRoute(route.id, { sensitivity: v })} />
            <SliderField label="Threshold" value={route.threshold} min={0} max={0.95} step={0.01} onChange={(v) => patchRoute(route.id, { threshold: v })} />
            <SliderField label="Attack" value={route.attack} min={0.001} max={1} step={0.001} onChange={(v) => patchRoute(route.id, { attack: v })} format={(v) => `${(v * 1000).toFixed(0)}ms`} />
            <SliderField label="Release" value={route.release} min={0.001} max={2} step={0.001} onChange={(v) => patchRoute(route.id, { release: v })} format={(v) => `${(v * 1000).toFixed(0)}ms`} />
            <ToggleField label="Invert" checked={route.invert} onChange={(v) => patchRoute(route.id, { invert: v })} />
          </div>
        </div>
      ))}
    </div>
  );
}

function EffectsTab({ layer }: { layer: Layer | null }) {
  const updateEffect = useStudio((s) => s.updateEffect);
  const removeEffect = useStudio((s) => s.removeEffect);
  const moveEffect = useStudio((s) => s.moveEffect);
  const addEffect = useStudio((s) => s.addEffect);

  if (!layer) return <div className="section"><EmptyHint>Select a layer to stack GPU effects on it.</EmptyHint></div>;

  return (
    <div className="section">
      <span className="label">Layer effect stack</span>
      {layer.effects.length === 0 ? <EmptyHint>No effects. Add one below, or from the Effects tab.</EmptyHint> : null}
      {layer.effects.map((effect, index) => {
        const def = EFFECT_DEF_MAP[effect.type];
        return (
          <div key={effect.id} className="panel" style={{ border: '1px solid var(--border)', borderRadius: 6 }}>
            <div className="panel-header" style={{ position: 'static', cursor: 'default' }}>
              <input
                type="checkbox"
                checked={effect.enabled}
                onChange={(e) => updateEffect(layer.id, effect.id, (fx) => { fx.enabled = e.target.checked; })}
                aria-label="Enable effect"
                style={{ accentColor: 'var(--accent)' }}
              />
              <span className="panel-title">{def.label}</span>
              <button className="icon-btn sm" title="Move up" disabled={index === 0} onClick={() => moveEffect(layer.id, effect.id, -1)}>
                ↑
              </button>
              <button className="icon-btn sm" title="Move down" disabled={index === layer.effects.length - 1} onClick={() => moveEffect(layer.id, effect.id, 1)}>
                ↓
              </button>
              <button className="icon-btn sm" title="Remove effect" onClick={() => removeEffect(layer.id, effect.id)}>
                <TrashIcon size={11} />
              </button>
            </div>
            <div className="panel-body" style={{ gap: 5 }}>
              <SliderField
                label="Intensity"
                value={effect.params.intensity ?? 1}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => updateEffect(layer.id, effect.id, (fx) => { fx.params.intensity = v; })}
              />
              {def.params.map((param) => (
                <SliderField
                  key={param.key}
                  label={param.label}
                  value={effect.params[param.key] ?? param.default}
                  min={param.min}
                  max={param.max}
                  step={param.step}
                  onChange={(v) =>
                    updateEffect(layer.id, effect.id, (fx) => {
                      fx.params = { ...fx.params, [param.key]: v };
                    })
                  }
                  format={(v) => (param.step >= 1 ? v.toFixed(0) : v.toFixed(2))}
                />
              ))}
            </div>
          </div>
        );
      })}
      <div className="divider" />
      <div className="row">
        <select
          className="input grow"
          defaultValue=""
          onChange={(e) => {
            const value = e.target.value as EffectInstance['type'];
            if (value) addEffect(layer.id, value);
            e.currentTarget.value = '';
          }}
        >
          <option value="">Add effect…</option>
          {EFFECT_DEFS.map((def) => (
            <option key={def.type} value={def.type}>
              {def.category} · {def.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function AudioTab() {
  const audio = useStudio((s) => s.audio);
  const projectAudio = useStudio((s) => s.project.audio);
  const setPreview = useStudio((s) => s.setPreview);
  const preview = useStudio((s) => s.preview);

  return (
    <div className="section">
      <div className="row">
        <span className="label grow">Track</span>
        <button className="btn sm" onClick={openAudioPicker}>
          <ImportIcon size={11} /> Import
        </button>
      </div>
      {!projectAudio ? (
        <EmptyHint>
          Import a WAV, MP3, FLAC, OGG, AAC, M4A or AIFF file. It is decoded and analysed once;
          the renderer then samples that analysis for both preview and export.
        </EmptyHint>
      ) : (
        <>
          <div className="col gap-2">
            <span className="truncate" style={{ color: 'var(--text-0)' }}>{projectAudio.name}</span>
            <span className="hint">
              {projectAudio.duration.toFixed(2)}s · {projectAudio.sampleRate.toLocaleString()} Hz ·{' '}
              {projectAudio.channels} ch
            </span>
            <span className="hint">
              {Math.round(audio.bpm || projectAudio.bpm || 0)} BPM · {projectAudio.beatCount ?? 0} beats
            </span>
          </div>
          <div className="divider" />
          <div className="progress-track">
            <div className="progress-fill" style={{ width: audio.status === 'ready' ? '100%' : `${audio.progress * 100}%` }} />
          </div>
          <span className="hint">
            {audio.status === 'ready'
              ? 'Analysis cached. Seeking is immediate and deterministic.'
              : audio.status === 'error'
                ? audio.error
                : 'Analysing…'}
          </span>
        </>
      )}
      <div className="divider" />
      <span className="label">Preview</span>
      <ToggleField label="Show FPS" checked={preview.showFps} onChange={(v) => setPreview({ showFps: v })} />
      <SliderField label="Max FPS" value={preview.maxFps} min={24} max={144} step={1} onChange={(v) => setPreview({ maxFps: v })} format={(v) => v.toFixed(0)} />
      <span className="hint">Preview quality never affects export quality.</span>
    </div>
  );
}
