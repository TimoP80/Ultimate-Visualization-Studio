import { useState } from 'react';
import {
  createPreset,
  downloadPreset,
  duplicatePreset,
  parsePreset,
  pickPresetFile,
  removePreset,
  renamePreset,
  type WizardPreset,
} from '@/wizard/storage';
import type { WizardConfig } from '@/wizard/types';
import { TrashIcon, CopyIcon, ImportIcon, ExportIcon, PlusIcon, SparkIcon } from '../Icons';
import { StepNotice } from './ui';

interface PresetsPanelProps {
  presets: WizardPreset[];
  config: WizardConfig;
  onApply(preset: WizardPreset): void;
  onChange(presets: WizardPreset[]): void;
  onClose(): void;
}

/** Save, apply, rename, duplicate, delete, import and export wizard presets. */
export default function PresetsPanel({ presets, config, onApply, onChange, onClose }: PresetsPanelProps) {
  const [name, setName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = (): void => {
    const label = name.trim() || `Preset ${presets.length + 1}`;
    const preset = createPreset(label, config);
    onChange([preset, ...presets]);
    setName('');
  };

  const importFile = async (): Promise<void> => {
    try {
      const text = await pickPresetFile();
      if (!text) return;
      const preset = parsePreset(text);
      onChange([preset, ...presets]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that preset file.');
    }
  };

  return (
    <div className="wiz-presets">
      <header className="wiz-presets-head">
        <h3>Wizard presets</h3>
        <button className="icon-btn sm" onClick={onClose} title="Close presets">
          ✕
        </button>
      </header>

      <div className="wiz-presets-save">
        <input
          className="input"
          value={name}
          placeholder="Name this configuration"
          maxLength={60}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') save();
          }}
        />
        <button className="btn primary" onClick={save}>
          <PlusIcon size={11} /> Save preset
        </button>
        <button className="btn" onClick={() => void importFile()} title="Import a .json wizard preset">
          <ImportIcon size={11} /> Import
        </button>
      </div>

      {error ? <StepNotice kind="error">{error}</StepNotice> : null}

      {presets.length === 0 ? (
        <p className="wiz-help">
          No saved presets yet. A preset stores everything except the audio file — styles, palette,
          templates, reactivity, effects, structure and output settings.
        </p>
      ) : (
        <ul className="wiz-preset-list">
          {presets.map((preset) => (
            <li key={preset.id} className="wiz-preset-item">
              {renamingId === preset.id ? (
                <input
                  className="input"
                  autoFocus
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  onBlur={() => {
                    onChange(renamePreset(presets, preset.id, renameValue.trim() || preset.name));
                    setRenamingId(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur();
                    if (event.key === 'Escape') setRenamingId(null);
                  }}
                />
              ) : (
                <button className="wiz-preset-name" onClick={() => onApply(preset)} title="Apply this preset">
                  <SparkIcon size={11} />
                  <span className="truncate">{preset.name}</span>
                  <span className="hint">{new Date(preset.createdAt).toLocaleDateString()}</span>
                </button>
              )}
              <div className="wiz-preset-actions">
                <button
                  className="icon-btn sm"
                  title="Rename"
                  onClick={() => {
                    setRenamingId(preset.id);
                    setRenameValue(preset.name);
                  }}
                >
                  ✎
                </button>
                <button
                  className="icon-btn sm"
                  title="Duplicate"
                  onClick={() => onChange(duplicatePreset(presets, preset.id))}
                >
                  <CopyIcon size={11} />
                </button>
                <button className="icon-btn sm" title="Export" onClick={() => downloadPreset(preset)}>
                  <ExportIcon size={11} />
                </button>
                <button
                  className="icon-btn sm danger"
                  title="Delete"
                  onClick={() => onChange(removePreset(presets, preset.id))}
                >
                  <TrashIcon size={11} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
