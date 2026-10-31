/**
 * Playhead transport.
 *
 * Kept outside React so the render loop can advance time at display rate
 * without re-rendering the workspace. UI widgets subscribe for the values they
 * display; everything else reads `transport.time` on demand.
 */

type Listener = () => void;

class Transport {
  time = 0;
  duration = 0;
  playing = false;
  loop = false;
  loopStart = 0;
  loopEnd = 0;

  private listeners = new Set<Listener>();
  private stateListeners = new Set<Listener>();

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  subscribeState = (listener: Listener): (() => void) => {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  };

  getTime = (): number => this.time;
  getPlaying = (): boolean => this.playing;
  getDuration = (): number => this.duration;

  setTime(time: number, silent = false): void {
    const clamped = Math.max(0, Math.min(this.duration || Infinity, time));
    if (Math.abs(clamped - this.time) < 1e-6) return;
    this.time = clamped;
    if (!silent) this.emitTime();
  }

  setDuration(duration: number): void {
    this.duration = Math.max(0, duration);
    if (this.loopEnd <= 0 || this.loopEnd > this.duration) this.loopEnd = this.duration;
    this.emitState();
  }

  setPlaying(playing: boolean): void {
    if (this.playing === playing) return;
    this.playing = playing;
    this.emitState();
  }

  setLoop(enabled: boolean, start?: number, end?: number): void {
    this.loop = enabled;
    if (start !== undefined) this.loopStart = start;
    if (end !== undefined) this.loopEnd = end;
    this.emitState();
  }

  emitTime(): void {
    for (const fn of this.listeners) fn();
  }

  private emitState(): void {
    for (const fn of this.stateListeners) fn();
  }
}

export const transport = new Transport();

export function formatTimecode(seconds: number, fps = 60): string {
  const safe = Math.max(0, seconds);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = Math.floor(safe % 60);
  const f = Math.floor((safe * fps) % fps);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}:${pad(f)}`;
}

export function formatClock(seconds: number): string {
  const safe = Math.max(0, seconds);
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
