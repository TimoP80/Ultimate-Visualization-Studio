/**
 * Audio import pipeline.
 *
 * decode -> offline analysis -> project update. Analysis runs once per file;
 * after that the renderer samples the flattened feature track, so seeking is
 * instant and preview matches export exactly.
 */

import { audioEngine, isSupportedAudioFile } from '@/audio/AudioEngine';
import { DEFAULT_ANALYSIS_SETTINGS, analyzeBuffer } from '@/audio/analysis';
import { useStudio } from './store';
import { setAnalysisTrack } from './analysisStore';
import { transport } from './transport';

let currentJob: AbortController | null = null;

export function cancelAudioImport(): void {
  currentJob?.abort();
  currentJob = null;
}

export async function importAudioFile(file: File): Promise<boolean> {
  const store = useStudio.getState();
  if (!isSupportedAudioFile(file.name)) {
    store.setAudio({ name: file.name, status: 'error', error: 'Unsupported audio format' });
    store.setToast(`Unsupported audio format: ${file.name.split('.').pop() ?? file.name}`);
    return false;
  }

  cancelAudioImport();
  const abort = new AbortController();
  currentJob = abort;

  store.setAudio({
    name: file.name,
    status: 'decoding',
    progress: 0,
    bpm: 0,
    duration: 0,
    error: null,
  });

  try {
    const bytes = await file.arrayBuffer();
    const buffer = await audioEngine.decode(bytes);
    if (abort.signal.aborted) return false;

    store.setAudio({ status: 'analyzing', duration: buffer.duration });
    const track = await analyzeBuffer(
      buffer,
      DEFAULT_ANALYSIS_SETTINGS,
      (ratio) => useStudio.getState().setAudio({ progress: ratio }),
      abort.signal,
    );
    if (abort.signal.aborted) return false;

    setAnalysisTrack(track);
    useStudio.getState().setProjectAudio(
      {
        path: null,
        name: file.name,
        duration: buffer.duration,
        sampleRate: buffer.sampleRate,
        channels: buffer.numberOfChannels,
        bpm: track.bpm,
        beatCount: track.beats.length,
      },
      buffer.duration,
    );
    useStudio.getState().setAudio({
      status: 'ready',
      progress: 1,
      bpm: track.bpm,
      duration: buffer.duration,
    });

    transport.setDuration(buffer.duration);
    transport.setTime(0);
    audioEngine.setLoop(transport.loop, 0, buffer.duration);
    useStudio.getState().setToast(
      `Loaded ${file.name} — ${buffer.duration.toFixed(1)}s, ${Math.round(track.bpm)} BPM`,
    );
    return true;
  } catch (err) {
    if ((err as Error).name === 'AbortError') return false;
    const message = err instanceof Error ? err.message : String(err);
    useStudio.getState().setAudio({ status: 'error', error: message });
    useStudio.getState().setToast(`Could not decode audio: ${message}`);
    return false;
  } finally {
    if (currentJob === abort) currentJob = null;
  }
}

/** File-picker helper used by the toolbar and the drop zone. */
export function openAudioPicker(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'audio/*,.wav,.mp3,.flac,.ogg,.aac,.m4a,.aiff,.aif';
  input.onchange = () => {
    const file = input.files?.[0];
    if (file) void importAudioFile(file);
  };
  input.click();
}
