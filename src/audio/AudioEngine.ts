/**
 * Web Audio playback engine.
 *
 * Responsibilities:
 *  - decode any browser-supported audio file into an AudioBuffer
 *  - sample-accurate transport (play / pause / seek / loop)
 *  - expose a live analyser for metering
 *
 * Feature extraction for rendering is NOT done here: the renderer samples the
 * offline {@link AnalysisTrack} so preview and export stay identical.
 */

export interface AudioEngineEvents {
  onEnded?: () => void;
  onStateChange?: () => void;
}

export const SUPPORTED_EXTENSIONS = [
  'wav',
  'mp3',
  'flac',
  'ogg',
  'oga',
  'aac',
  'm4a',
  'aiff',
  'aif',
  'aifc',
  'mp4',
  'opus',
  'webm',
];

export function isSupportedAudioFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return SUPPORTED_EXTENSIONS.includes(ext);
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private freqData: Float32Array<ArrayBuffer> = new Float32Array(0);
  private timeData: Float32Array<ArrayBuffer> = new Float32Array(0);

  private startedAtContextTime = 0;
  private pausedAt = 0;
  private _playing = false;
  private events: AudioEngineEvents = {};

  volume = 0.85;
  loop = false;
  loopStart = 0;
  loopEnd = 0;

  setEvents(events: AudioEngineEvents): void {
    this.events = events;
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  get playing(): boolean {
    return this._playing;
  }

  get duration(): number {
    return this.buffer?.duration ?? 0;
  }

  get hasAudio(): boolean {
    return this.buffer !== null;
  }

  get decodedBuffer(): AudioBuffer | null {
    return this.buffer;
  }

  get sampleRate(): number {
    return this.buffer?.sampleRate ?? 48000;
  }

  get numberOfChannels(): number {
    return this.buffer?.numberOfChannels ?? 2;
  }

  /** Lazily create the AudioContext; must be called from a user gesture. */
  async ensureContext(): Promise<AudioContext> {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor({ latencyHint: 'interactive' });
      this.gainNode = this.ctx.createGain();
      this.gainNode.gain.value = this.volume;
      this.gainNode.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
    return this.ctx;
  }

  /** Decode an ArrayBuffer into the internal buffer (replacing any previous one). */
  async decode(data: ArrayBuffer): Promise<AudioBuffer> {
    const ctx = await this.ensureContext();
    // decodeAudioData detaches the input buffer, so hand it a copy when the
    // caller still needs the original bytes.
    const buffer = await ctx.decodeAudioData(data.slice(0));
    this.buffer = buffer;
    this.pausedAt = 0;
    this.buildAnalyser();
    this.events.onStateChange?.();
    return buffer;
  }

  private buildAnalyser(): void {
    if (!this.ctx || !this.gainNode) return;
    if (this.analyserNode) this.analyserNode.disconnect();
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 4096;
    analyser.smoothingTimeConstant = 0.6;
    analyser.minDecibels = -100;
    analyser.maxDecibels = 0;
    this.freqData = new Float32Array(analyser.frequencyBinCount);
    this.timeData = new Float32Array(analyser.fftSize);
    this.analyserNode = analyser;
  }

  get currentTime(): number {
    if (!this.ctx || !this.buffer) return 0;
    if (!this._playing) return this.pausedAt;
    let t = this.pausedAt + (this.ctx.currentTime - this.startedAtContextTime);
    if (this.loop && this.loopEnd > this.loopStart) {
      const span = this.loopEnd - this.loopStart;
      if (t > this.loopStart) {
        const wrapped = this.loopStart + ((t - this.loopStart) % span);
        t = wrapped;
      }
    }
    return Math.max(0, Math.min(this.buffer.duration, t));
  }

  async play(): Promise<void> {
    if (!this.buffer) return;
    const ctx = await this.ensureContext();
    if (this._playing) return;

    const src = ctx.createBufferSource();
    src.buffer = this.buffer;
    src.loop = this.loop;
    if (this.loop && this.loopEnd > this.loopStart) {
      src.loopStart = this.loopStart;
      src.loopEnd = this.loopEnd;
    }
    if (this.analyserNode && this.gainNode) {
      src.connect(this.analyserNode);
      this.analyserNode.connect(this.gainNode);
    } else if (this.gainNode) {
      src.connect(this.gainNode);
    }

    const offset = this.pausedAt >= this.buffer.duration ? 0 : this.pausedAt;
    if (this.pausedAt >= this.buffer.duration) this.pausedAt = 0;

    src.onended = () => {
      if (this._playing && !this.loop) {
        this._playing = false;
        this.pausedAt = 0;
        this.source = null;
        this.events.onEnded?.();
        this.events.onStateChange?.();
      }
    };

    src.start(0, offset);
    this.source = src;
    this.startedAtContextTime = ctx.currentTime;
    this._playing = true;
    this.events.onStateChange?.();
  }

  pause(): void {
    if (!this._playing || !this.ctx) return;
    const t = this.currentTime;
    this.teardownSource();
    this._playing = false;
    this.pausedAt = t;
    this.events.onStateChange?.();
  }

  async toggle(): Promise<void> {
    if (this._playing) this.pause();
    else await this.play();
  }

  stop(): void {
    this.teardownSource();
    this._playing = false;
    this.pausedAt = 0;
    this.events.onStateChange?.();
  }

  /** Release the decoded buffer so a loaded project cannot play stale audio. */
  unload(): void {
    this.teardownSource();
    this._playing = false;
    this.pausedAt = 0;
    this.buffer = null;
    this.events.onStateChange?.();
  }

  seek(time: number): void {
    if (!this.buffer) return;
    const t = Math.max(0, Math.min(this.buffer.duration, time));
    if (this._playing) {
      this.teardownSource();
      this.pausedAt = t;
      this._playing = false;
      void this.play();
    } else {
      this.pausedAt = t;
      this.events.onStateChange?.();
    }
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.gainNode && this.ctx) {
      this.gainNode.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.01);
    }
  }

  setLoop(enabled: boolean, start?: number, end?: number): void {
    this.loop = enabled;
    if (start !== undefined) this.loopStart = start;
    if (end !== undefined) this.loopEnd = end;
    if (this.source) {
      this.source.loop = enabled;
      if (enabled && this.loopEnd > this.loopStart) {
        this.source.loopStart = this.loopStart;
        this.source.loopEnd = this.loopEnd;
      }
    }
  }

  private teardownSource(): void {
    if (!this.source) return;
    this.source.onended = null;
    try {
      this.source.stop();
    } catch {
      /* already stopped */
    }
    this.source.disconnect();
    this.source = null;
  }

  /** Live FFT magnitudes in dB (for meters); empty when no audio is loaded. */
  getFrequencyData(): Float32Array<ArrayBuffer> {
    if (!this.analyserNode) return this.freqData;
    this.analyserNode.getFloatFrequencyData(this.freqData);
    return this.freqData;
  }

  getTimeDomainData(): Float32Array<ArrayBuffer> {
    if (!this.analyserNode) return this.timeData;
    this.analyserNode.getFloatTimeDomainData(this.timeData);
    return this.timeData;
  }

  dispose(): void {
    this.teardownSource();
    this.analyserNode?.disconnect();
    this.gainNode?.disconnect();
    void this.ctx?.close();
    this.ctx = null;
    this.buffer = null;
  }
}

export const audioEngine = new AudioEngine();
