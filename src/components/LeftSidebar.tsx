import { EFFECT_CATEGORIES, EFFECT_DEFS } from '@/render/effects';
import { TEXT_EFFECTS } from '@/render/textEffects';
import { activeScene } from '@/state/project';
import { useStudio, type LeftTab } from '@/state/store';
import { openAudioPicker } from '@/state/audioImport';
import {
  CopyIcon,
  EyeIcon,
  ImportIcon,
  LayersIcon,
  LockIcon,
  PlusIcon,
  SparkIcon,
  TrashIcon,
} from './Icons';
import TemplateBrowser from './TemplateBrowser';

const TABS: { id: LeftTab; label: string }[] = [
  { id: 'templates', label: 'Templates' },
  { id: 'elements', label: 'Elements' },
  { id: 'effects', label: 'Effects' },
];

export default function LeftSidebar() {
  const tab = useStudio((s) => s.leftTab);
  const setTab = useStudio((s) => s.setLeftTab);

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
        {tab === 'templates' ? <TemplateBrowser /> : null}
        {tab === 'elements' ? <ElementsTab /> : null}
        {tab === 'effects' ? <EffectsTab /> : null}
      </div>
    </>
  );
}

function ElementsTab() {
  const project = useStudio((s) => s.project);
  const selectedLayerId = useStudio((s) => s.selectedLayerId);
  const selectLayer = useStudio((s) => s.selectLayer);
  const addSolidLayer = useStudio((s) => s.addSolidLayer);
  const addTextLayer = useStudio((s) => s.addTextLayer);
  const updateLayer = useStudio((s) => s.updateLayer);
  const removeLayer = useStudio((s) => s.removeLayer);
  const duplicateLayer = useStudio((s) => s.duplicateLayer);
  const scene = activeScene(project);

  return (
    <div className="section">
      <div className="row gap-4">
        <button className="btn sm" onClick={() => addTextLayer()}>
          <PlusIcon size={11} /> Text
        </button>
        <button className="btn sm" onClick={addSolidLayer}>
          <PlusIcon size={11} /> Solid
        </button>
        <button className="btn sm" onClick={openAudioPicker}>
          <ImportIcon size={11} /> Audio
        </button>
      </div>

      <div className="divider" />
      <span className="label">Text effects</span>
      <div className="col" style={{ gap: 3 }}>
        {TEXT_EFFECTS.filter((effect) => effect.id !== 'plain').map((effect) => (
          <button
            key={effect.id}
            className="list-item"
            style={{ border: '1px solid transparent', background: 'transparent' }}
            onClick={() => addTextLayer(effect.id)}
            title={effect.description}
          >
            <span className="grow" style={{ color: 'var(--text-1)' }}>
              {effect.label}
            </span>
            <PlusIcon size={11} />
          </button>
        ))}
      </div>
      <span className="hint">
        Adds a text layer with that effect. Pick a layer to change its preset or tune it in Properties.
      </span>

      <div className="divider" />
      <span className="label">Layers ({scene.layers.length})</span>

      {scene.layers.length === 0 ? (
        <div className="hint">No layers in this scene. Add a template from the Templates tab.</div>
      ) : (
        <div className="list" style={{ padding: 0 }}>
          {[...scene.layers].reverse().map((layer) => (
            <div
              key={layer.id}
              className={`list-item ${selectedLayerId === layer.id ? 'active' : ''}`}
              onClick={() => selectLayer(layer.id)}
            >
              <span
                className="type-dot"
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 2,
                  background: layer.palette.a,
                  flexShrink: 0,
                }}
              />
              <span className="grow truncate">{layer.name}</span>
              <button
                className="icon-btn sm"
                title={layer.visible ? 'Hide layer' : 'Show layer'}
                onClick={(e) => {
                  e.stopPropagation();
                  updateLayer(layer.id, (l) => {
                    l.visible = !l.visible;
                  });
                }}
              >
                <EyeIcon size={11} open={layer.visible} />
              </button>
              <button
                className="icon-btn sm"
                title={layer.locked ? 'Unlock layer' : 'Lock layer'}
                onClick={(e) => {
                  e.stopPropagation();
                  updateLayer(layer.id, (l) => {
                    l.locked = !l.locked;
                  });
                }}
              >
                <LockIcon size={11} locked={layer.locked} />
              </button>
              <button
                className="icon-btn sm"
                title="Duplicate layer"
                onClick={(e) => {
                  e.stopPropagation();
                  duplicateLayer(layer.id);
                }}
              >
                <CopyIcon size={11} />
              </button>
              <button
                className="icon-btn sm"
                title="Delete layer"
                onClick={(e) => {
                  e.stopPropagation();
                  removeLayer(layer.id);
                }}
              >
                <TrashIcon size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="divider" />
      <span className="label">Scene</span>
      <div className="row gap-4">
        <span className="hint grow">{scene.name}</span>
        <span className="badge-live">
          <span className="dot" />
          LIVE
        </span>
      </div>
      <div className="hint">
        <LayersIcon size={11} /> Layers composite bottom-up. Select a clip in the timeline to edit it.
      </div>
    </div>
  );
}

function EffectsTab() {
  const selectedLayerId = useStudio((s) => s.selectedLayerId);
  const addEffect = useStudio((s) => s.addEffect);
  const setToast = useStudio((s) => s.setToast);

  const add = (type: (typeof EFFECT_DEFS)[number]['type']) => {
    if (!selectedLayerId) {
      setToast('Select a layer before adding an effect.');
      return;
    }
    addEffect(selectedLayerId, type);
  };

  return (
    <div className="section" style={{ gap: 12 }}>
      {EFFECT_CATEGORIES.map((category) => (
        <div key={category} className="col" style={{ gap: 3 }}>
          <span className="label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <SparkIcon size={10} /> {category}
          </span>
          {EFFECT_DEFS.filter((d) => d.category === category).map((def) => (
            <button
              key={def.type}
              className="list-item"
              style={{ border: '1px solid transparent', background: 'transparent' }}
              onClick={() => add(def.type)}
              title={def.description}
            >
              <span className="grow" style={{ color: 'var(--text-1)' }}>
                {def.label}
              </span>
              <PlusIcon size={11} />
            </button>
          ))}
        </div>
      ))}
      <div className="hint">
        Effects are GPU passes applied to the selected layer before compositing. Stack order matters.
      </div>
    </div>
  );
}
