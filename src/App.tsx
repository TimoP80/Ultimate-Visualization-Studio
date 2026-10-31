import { useCallback, useEffect, useState } from 'react';
import Toolbar from './components/Toolbar';
import LeftSidebar from './components/LeftSidebar';
import PreviewStage from './components/PreviewStage';
import Timeline from './components/Timeline';
import PropertiesPanel from './components/PropertiesPanel';
import StatusBar from './components/StatusBar';
import ExportDialog from './components/ExportDialog';
import VisualizationWizard from './components/VisualizationWizard';
import { audioEngine } from '@/audio/AudioEngine';
import { importAudioFile, openAudioPicker } from '@/state/audioImport';
import { activeScene, findLayer } from '@/state/project';
import { useStudio } from '@/state/store';
import { transport } from '@/state/transport';
import { seekBy, seekTo, togglePlayback } from '@/state/playback';
import {
  clearAutosave,
  createNewProject,
  openProject,
  readAutosave,
  restoreFromAutosave,
  saveProject,
  useProjectAutosave,
  type LoadedProject,
} from '@/state/projectFile';
import { clamp } from '@/timeline/easing';

type ResizeTarget = 'left' | 'right' | 'timeline';

export default function App() {
  const project = useStudio((s) => s.project);
  const selectedLayerId = useStudio((s) => s.selectedLayerId);
  const removeLayer = useStudio((s) => s.removeLayer);
  const duplicateLayer = useStudio((s) => s.duplicateLayer);
  const moveLayer = useStudio((s) => s.moveLayer);
  const undo = useStudio((s) => s.undo);
  const redo = useStudio((s) => s.redo);
  const toast = useStudio((s) => s.toast);
  const setToast = useStudio((s) => s.setToast);

  const [leftWidth, setLeftWidth] = useState(268);
  const [rightWidth, setRightWidth] = useState(312);
  const [timelineHeight, setTimelineHeight] = useState(286);
  const [draggingFile, setDraggingFile] = useState(false);
  const [recovery, setRecovery] = useState<LoadedProject | null>(null);

  useProjectAutosave();

  // Offer the previous session when the app starts, before any edit overwrites it.
  useEffect(() => {
    setRecovery(readAutosave());
  }, []);

  // Keep the transport length in sync with the active scene.
  useEffect(() => {
    const scene = activeScene(project);
    transport.setDuration(scene.duration || 180);
  }, [project]);

  // Playback reaching the end of a loaded track.
  useEffect(() => {
    audioEngine.setEvents({
      onEnded: () => {
        transport.setPlaying(false);
        transport.setTime(0);
      },
    });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(id);
  }, [toast, setToast]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const typing = Boolean(
        target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT' ||
            target.isContentEditable),
      );
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      // File shortcuts stay live while a field has focus; text editing keys do not.
      const fileCommand = mod && ['s', 'o', 'i', 'n'].includes(key);
      if (typing && !fileCommand) return;
      if (event.code === 'Space') {
        event.preventDefault();
        void togglePlayback();
      } else if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
      } else if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveProject(event.shiftKey);
      } else if (mod && event.key.toLowerCase() === 'o') {
        event.preventDefault();
        void openProject();
      } else if (mod && event.key.toLowerCase() === 'i') {
        event.preventDefault();
        openAudioPicker();
      } else if (mod && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        createNewProject();
      } else if (mod && key === 'd') {
        event.preventDefault();
        if (selectedLayerId) duplicateLayer(selectedLayerId);
      } else if (mod && (key === ']' || key === '[')) {
        // Layer order: ] raises, [ lowers.
        event.preventDefault();
        if (selectedLayerId) moveLayer(selectedLayerId, key === ']' ? 1 : -1);
      } else if (event.key === 'Escape') {
        useStudio.getState().selectLayer(null);
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selectedLayerId) {
          event.preventDefault();
          removeLayer(selectedLayerId);
        }
      } else if (event.key === 'ArrowLeft') {
        seekBy(event.shiftKey ? -1 : -1 / 30);
      } else if (event.key === 'ArrowRight') {
        seekBy(event.shiftKey ? 1 : 1 / 30);
      } else if (event.key === 'Home') {
        seekTo(0);
      } else if (!event.repeat && (event.key === 'Enter' || event.key === 'F2')) {
        // Enter / F2 edit the copy of the selected text layer in place.
        const state = useStudio.getState();
        const layer = findLayer(state.project, state.selectedLayerId);
        if (layer && layer.type === 'text' && layer.visible) {
          event.preventDefault();
          state.requestTextEdit(layer.id);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedLayerId, removeLayer, duplicateLayer, moveLayer, undo, redo]);

  const beginResize = useCallback(
    (target: ResizeTarget) => (event: React.PointerEvent) => {
      event.preventDefault();
      const startX = event.clientX;
      const startY = event.clientY;
      const startLeft = leftWidth;
      const startRight = rightWidth;
      const startTimeline = timelineHeight;

      const onMove = (move: PointerEvent): void => {
        if (target === 'left') setLeftWidth(clamp(startLeft + move.clientX - startX, 200, 460));
        else if (target === 'right') setRightWidth(clamp(startRight - (move.clientX - startX), 220, 480));
        else setTimelineHeight(clamp(startTimeline - (move.clientY - startY), 150, 560));
      };
      const onUp = (): void => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        document.body.style.cursor = '';
      };
      document.body.style.cursor = target === 'timeline' ? 'row-resize' : 'col-resize';
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [leftWidth, rightWidth, timelineHeight],
  );

  return (
    <div
      className="app"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDraggingFile(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDraggingFile(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDraggingFile(false);
        const file = e.dataTransfer.files?.[0];
        if (file) void importAudioFile(file);
      }}
    >
      <Toolbar />

      <div className="app-body">
        <aside className="sidebar sidebar--left" style={{ width: leftWidth }}>
          <LeftSidebar />
        </aside>
        <div className="resizer-v" onPointerDown={beginResize('left')} role="separator" aria-orientation="vertical" />

        <div className="center-column">
          <PreviewStage />
          <div className="resizer-h" onPointerDown={beginResize('timeline')} role="separator" aria-orientation="horizontal" />
          <Timeline height={timelineHeight} />
        </div>

        <div className="resizer-v" onPointerDown={beginResize('right')} role="separator" aria-orientation="vertical" />
        <aside className="sidebar sidebar--right" style={{ width: rightWidth }}>
          <PropertiesPanel />
        </aside>
      </div>

      <StatusBar />

      <ExportDialog />
      <VisualizationWizard />

      {recovery ? (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="recovery-title">
            <div className="modal-header">
              <h3 id="recovery-title">Recover unsaved session</h3>
            </div>
            <div className="modal-body">
              <div className="notice info">
                An autosave from {new Date(recovery.savedAt).toLocaleString()} is available.
              </div>
              <div className="col gap-2">
                <strong>{recovery.project.name}</strong>
                <span className="hint">
                  {recovery.project.scenes.length} scene
                  {recovery.project.scenes.length === 1 ? '' : 's'} ·{' '}
                  {recovery.project.scenes.reduce((count, scene) => count + scene.layers.length, 0)}{' '}
                  {recovery.project.scenes.reduce((count, scene) => count + scene.layers.length, 0) === 1
                    ? 'layer'
                    : 'layers'}
                  {recovery.project.audio ? ` · audio: ${recovery.project.audio.name}` : ''}
                </span>
                <span className="hint">
                  Restoring replaces the current project. Discarding deletes the autosave.
                </span>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn"
                onClick={() => {
                  clearAutosave();
                  useStudio.getState().setSaveStatus('idle', null);
                  setRecovery(null);
                }}
              >
                Discard
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  restoreFromAutosave(recovery);
                  setRecovery(null);
                }}
              >
                Restore session
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {draggingFile ? (
        <div className="drop-veil">
          <div className="notice info">Drop audio to import and analyse</div>
        </div>
      ) : null}

      {toast ? (
        <div className="toast-stack">
          <div className="toast">{toast}</div>
        </div>
      ) : null}
    </div>
  );
}
