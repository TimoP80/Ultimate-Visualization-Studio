import { useMemo } from 'react';
import { activeScene } from '@/state/project';
import { useStudio } from '@/state/store';

export default function StatusBar() {
  const project = useStudio((s) => s.project);
  const audio = useStudio((s) => s.audio);
  const preview = useStudio((s) => s.preview);
  const saveStatus = useStudio((s) => s.saveStatus);
  const lastSavedAt = useStudio((s) => s.lastSavedAt);
  const scene = activeScene(project);

  const webgl2 = useMemo(() => {
    try {
      return Boolean(document.createElement('canvas').getContext('webgl2'));
    } catch {
      return false;
    }
  }, []);

  const audioLabel =
    audio.status === 'ready'
      ? `${audio.name}`
      : audio.status === 'analyzing'
        ? `Analysing ${Math.round(audio.progress * 100)}%`
        : audio.status === 'decoding'
          ? 'Decoding audio…'
          : audio.status === 'error'
            ? 'Audio error'
            : 'No audio';

  return (
    <footer className="statusbar">
      <span className="statusbar-item">
        <span className={`statusbar-dot ${webgl2 ? 'ok' : 'err'}`} />
        {webgl2 ? 'WebGL2 ready' : 'WebGL2 unavailable'}
      </span>
      <span className="statusbar-item">
        <span className={`statusbar-dot ${audio.status === 'ready' ? 'ok' : audio.status === 'error' ? 'err' : 'warn'}`} />
        <span className="value truncate" style={{ maxWidth: 260 }}>
          {audioLabel}
        </span>
      </span>
      {audio.bpm > 0 ? (
        <span className="statusbar-item">
          Tempo <span className="value">{Math.round(audio.bpm)} BPM</span>
        </span>
      ) : null}
      <span className="statusbar-item">
        Layers <span className="value">{scene.layers.length}</span>
      </span>
      <span className="statusbar-item">
        Preview <span className="value">{preview.quality}</span>
      </span>
      <span className="statusbar-item" title="Project autosave">
        <span
          className={`statusbar-dot ${saveStatus === 'error' ? 'err' : saveStatus === 'saving' ? 'warn' : saveStatus === 'saved' ? 'ok' : ''}`}
        />
        <span className="value">
          {saveStatus === 'saving'
            ? 'Saving…'
            : saveStatus === 'error'
              ? 'Autosave failed'
              : lastSavedAt
                ? `Autosaved ${new Date(lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : 'Autosave on'}
        </span>
      </span>
      <span className="statusbar-item" style={{ marginLeft: 'auto' }}>
        Export target{' '}
        <span className="value">
          {project.exportSettings.width}×{project.exportSettings.height} · {project.exportSettings.fps}fps
        </span>
      </span>
    </footer>
  );
}
