import { audioEngine } from '@/audio/AudioEngine';
import { transport } from './transport';

export async function togglePlayback(): Promise<void> {
  if (audioEngine.hasAudio) {
    if (audioEngine.playing) {
      audioEngine.pause();
      transport.setPlaying(false);
    } else {
      await audioEngine.play();
      transport.setPlaying(true);
    }
    return;
  }
  transport.setPlaying(!transport.playing);
}

export function stopPlayback(): void {
  audioEngine.stop();
  transport.setPlaying(false);
  transport.setTime(0);
}

export function seekTo(time: number): void {
  const clamped = Math.max(0, Math.min(transport.duration || Infinity, time));
  audioEngine.seek(clamped);
  transport.setTime(clamped);
}

export function seekBy(delta: number): void {
  seekTo(transport.time + delta);
}
