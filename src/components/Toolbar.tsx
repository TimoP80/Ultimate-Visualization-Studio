import { useEffect, useRef, useState } from 'react';
import { useStudio } from '@/state/store';
import { openAudioPicker } from '@/state/audioImport';
import { createNewProject, openProject, saveProject } from '@/state/projectFile';
import { togglePlayback } from '@/state/playback';
import { useTransportPlaying } from '@/state/hooks';
import {
  ExportIcon,
  ImportIcon,
  PauseIcon,
  PlayIcon,
  RedoIcon,
  SparkIcon,
  UndoIcon,
} from './Icons';

export default function Toolbar() {
  const project = useStudio((s) => s.project);
  const renameProject = useStudio((s) => s.renameProject);
  const undo = useStudio((s) => s.undo);
  const redo = useStudio((s) => s.redo);
  const history = useStudio((s) => s.history.length);
  const future = useStudio((s) => s.future.length);
  const audio = useStudio((s) => s.audio);
  const setExportOpen = useStudio((s) => s.setExportOpen);
  const setWizardOpen = useStudio((s) => s.setWizardOpen);
  const playing = useTransportPlaying();

  return (
    <header className="toolbar">
      <div className="toolbar-brand">
        <BrandMark />
        <div className="col" style={{ gap: 0 }}>
          <span className="toolbar-brand-text">Ultimate Visualization Studio</span>
          <span className="toolbar-brand-sub">Audio · Motion · Video</span>
        </div>
      </div>

      <div className="toolbar-group">
        <FileMenu />
        <input
          className="input"
          style={{ width: 168, background: 'transparent', borderColor: 'transparent', fontWeight: 600 }}
          value={project.name}
          onChange={(e) => renameProject(e.target.value)}
          aria-label="Project name"
          spellCheck={false}
        />
      </div>

      <div className="toolbar-group">
        <button className="btn primary" onClick={openAudioPicker} title="Import audio file">
          <ImportIcon size={12} />
          Import Audio
        </button>
        <button
          className="icon-btn"
          onClick={() => void togglePlayback()}
          title={playing ? 'Pause' : 'Play'}
        >
          {playing ? <PauseIcon size={13} /> : <PlayIcon size={13} />}
        </button>
      </div>

      <div className="toolbar-group">
        <button className="icon-btn" onClick={undo} disabled={history === 0} title="Undo (Ctrl+Z)">
          <UndoIcon size={14} />
        </button>
        <button className="icon-btn" onClick={redo} disabled={future === 0} title="Redo (Ctrl+Shift+Z)">
          <RedoIcon size={14} />
        </button>
      </div>

      <div className="toolbar-spacer" />

      {audio.status === 'ready' ? (
        <span className="hint truncate" style={{ maxWidth: 220, marginRight: 8 }} title={audio.name}>
          {audio.name}
        </span>
      ) : null}

      <button
        className="btn"
        onClick={() => setWizardOpen(true)}
        title="Guided visualisation setup — pick music, style, colours, text and output, then generate a project"
      >
        <SparkIcon size={12} /> Wizard
      </button>
      <button className="btn primary" onClick={() => setExportOpen(true)} title="Export MP4 video (H.264 / AAC)">
        <ExportIcon size={12} /> Export
      </button>
    </header>
  );
}

function FileMenu() {
  const [open, setOpen] = useState(false);
  const setWizardOpen = useStudio((s) => s.setWizardOpen);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent): void => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const run = (action: () => void | Promise<unknown>) => (): void => {
    setOpen(false);
    void action();
  };

  return (
    <div className="toolbar-menu-wrap" ref={wrapRef}>
      <button
        className={`btn ${open ? 'on' : ''}`}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        File
      </button>
      {open ? (
        <div className="menu" role="menu">
          <button className="menu-item" role="menuitem" onClick={run(createNewProject)}>
            New Project <span className="shortcut">Ctrl+N</span>
          </button>
          <button className="menu-item" role="menuitem" onClick={run(openProject)}>
            Open Project… <span className="shortcut">Ctrl+O</span>
          </button>
          <div className="menu-sep" />
          <button className="menu-item" role="menuitem" onClick={run(() => saveProject(false))}>
            Save <span className="shortcut">Ctrl+S</span>
          </button>
          <button className="menu-item" role="menuitem" onClick={run(() => saveProject(true))}>
            Save As… <span className="shortcut">Ctrl+Shift+S</span>
          </button>
          <div className="menu-sep" />
          <button className="menu-item" role="menuitem" onClick={run(openAudioPicker)}>
            Import Audio… <span className="shortcut">Ctrl+I</span>
          </button>
          <div className="menu-sep" />
          <button className="menu-item" role="menuitem" onClick={run(() => setWizardOpen(true))}>
            Visualization Wizard…
          </button>
        </div>
      ) : null}
    </div>
  );
}

function BrandMark() {
  return (
    <svg className="toolbar-brand-mark" viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="brandGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="13.5" fill="none" stroke="url(#brandGrad)" strokeWidth="1.4" />
      <circle cx="16" cy="16" r="7.5" fill="none" stroke="#8b5cf6" strokeWidth="1.1" opacity="0.7" />
      <path d="M16 6.5v19M8.2 11.2l15.6 9.6M8.2 20.8l15.6-9.6" stroke="url(#brandGrad)" strokeWidth="1" opacity="0.55" />
      <circle cx="16" cy="16" r="2.4" fill="#22d3ee" />
    </svg>
  );
}
