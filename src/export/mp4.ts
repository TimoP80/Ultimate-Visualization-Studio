/**
 * Offline MP4 export.
 *
 * Frames are rendered with the same {@link Renderer} pipeline the preview uses,
 * at the export resolution and a fixed timestamp grid, so the encoded result is
 * deterministic and independent of preview FPS. Video is H.264 via WebCodecs
 * and muxed with `mp4-muxer`; audio is AAC produced from the decoded
 * `AudioBuffer` and muxed as a second track when the browser supports it.
 *
 * Nothing here touches the interactive renderer: the export owns its own canvas,
 * WebGL2 context and encoders, which keeps the preview running while a job is in
 * flight and makes cancellation a matter of closing the encoders.
 */

import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { Renderer } from '@/render/Renderer';
import { createAudioSample, type AnalysisSampler, type AudioSample } from '@/audio/analysis';
import type { ExportSettings, Project, Scene } from '@/types';

const AUDIO_SAMPLE_RATE = 48_000;
const AUDIO_CHUNK_FRAMES = 1024;
const VIDEO_CODEC_CANDIDATES = [
  'avc1.640033', // High 5.1
  'avc1.64002a', // High 4.2
  'avc1.640028', // High 4.0
  'avc1.4d0028', // Main 4.0
  'avc1.42e01f', // Baseline 3.1
];

export type ExportPhase = 'audio' | 'video' | 'finalize';

export interface ExportProgress {
  phase: ExportPhase;
  frame: number;
  totalFrames: number;
  /** 0..1 across the whole job. */
  ratio: number;
  message: string;
}

export interface ExportPlan {
  start: number;
  end: number;
  duration: number;
  frames: number;
  fps: number;
  width: number;
  height: number;
}

export interface Mp4ExportRequest {
  project: Project;
  scene: Scene;
  settings: ExportSettings;
  sampler: AnalysisSampler | null;
  audioBuffer: AudioBuffer | null;
  /** Encode the loaded audio into the MP4 (ignored when no audio is decoded). */
  includeAudio: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: ExportProgress) => void;
}

export interface Mp4ExportResult {
  blob: Blob;
  plan: ExportPlan;
  audioIncluded: boolean;
  warnings: string[];
}

export function isMp4ExportSupported(): boolean {
  return typeof window !== 'undefined' && typeof VideoEncoder !== 'undefined';
}

export function exportPlan(scene: Scene, settings: ExportSettings): ExportPlan {
  const fps = Math.max(1, Math.round(settings.fps));
  const sceneDuration = Math.max(0.1, scene.duration);
  const lastFrame = Math.max(0, sceneDuration - 1 / fps);
  const start = clamp(settings.rangeStart, 0, lastFrame);
  const requestedEnd = settings.rangeEnd == null ? sceneDuration : clamp(settings.rangeEnd, 0, sceneDuration);
  const end = Math.max(start + 1 / fps, requestedEnd);
  const duration = end - start;
  const frames = Math.max(1, Math.round(duration * fps));
  const width = Math.max(2, Math.round(settings.width / 2) * 2);
  const height = Math.max(2, Math.round(settings.height / 2) * 2);
  return { start, end, duration, frames, fps, width, height };
}

export function exportFilename(projectName: string, extension = 'mp4'): string {
  const base = projectName
    .trim()
    .replace(/[^\w\-. ]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '') || 'visualization';
  return `${base}_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${extension}`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function exportMp4(request: Mp4ExportRequest): Promise<Mp4ExportResult> {
  if (!isMp4ExportSupported()) {
    throw new Error('MP4 export requires WebCodecs (VideoEncoder), available in current Chromium-based browsers.');
  }

  const { scene, settings, sampler, audioBuffer, includeAudio, signal } = request;
  const plan = exportPlan(scene, settings);
  const warnings: string[] = [];
  const totalFrames = plan.frames;

  throwIfAborted(signal);

  /* ---- Audio: encode first so a failed track never leaves a broken mux ---- */
  let audioTracks: { chunk: EncodedAudioChunk; meta?: EncodedAudioChunkMetadata }[] = [];
  let audioIncluded = false;
  if (includeAudio && audioBuffer) {
    request.onProgress?.({
      phase: 'audio',
      frame: 0,
      totalFrames,
      ratio: 0.005,
      message: 'Encoding audio',
    });
    try {
      audioTracks = await encodeAudio(audioBuffer, plan, settings, signal);
      audioIncluded = audioTracks.length > 0;
      if (!audioIncluded) warnings.push('AAC audio encoding produced no chunks; exported video only.');
    } catch (err) {
      if (isAbort(err)) throw err;
      warnings.push(`Audio track skipped: ${errorText(err)}`);
      audioTracks = [];
      audioIncluded = false;
    }
  } else if (includeAudio) {
    warnings.push('No decoded audio loaded; exported video only.');
  }

  throwIfAborted(signal);

  /* ---- Video encoder ----------------------------------------------------- */
  const videoConfig = await pickVideoConfig(
    plan.width,
    plan.height,
    plan.fps,
    Math.max(1, Math.round(settings.bitrateMbps * 1_000_000)),
  );
  throwIfAborted(signal);

  const canvas = document.createElement('canvas');
  canvas.width = plan.width;
  canvas.height = plan.height;
  const renderer = new Renderer(canvas);

  let encoderError: Error | null = null;
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width: plan.width, height: plan.height, frameRate: plan.fps },
    audio: audioIncluded
      ? { codec: 'aac', numberOfChannels: audioChannels(audioBuffer!), sampleRate: AUDIO_SAMPLE_RATE }
      : undefined,
    fastStart: 'in-memory',
    firstTimestampBehavior: 'strict',
  });

  for (const track of audioTracks) muxer.addAudioChunk(track.chunk, track.meta);

  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (err) => {
      encoderError = err instanceof Error ? err : new Error(String(err));
    },
  });

  const sample: AudioSample = createAudioSample();
  const frameDurationUs = Math.round(1_000_000 / plan.fps);

  try {
    encoder.configure(videoConfig);
    renderer.resetFeedback();

    for (let frame = 0; frame < totalFrames; frame++) {
      throwIfAborted(signal);
      if (encoderError) throw encoderError;
      if (encoder.state === 'closed') throw new Error('Video encoder closed unexpectedly.');

      const time = plan.start + frame / plan.fps;
      if (sampler) sampler.sampleInto(sample, time);
      else silenceSample(sample);

      renderer.renderFrame({
        scene,
        time,
        frame,
        audio: sample,
        width: plan.width,
        height: plan.height,
        audioActive: Boolean(sampler),
        dt: 1 / plan.fps,
      });
      renderer.presentToCanvas();

      if (renderer.lastRenderError && warnings.length < 6) {
        const message = `Shader error: ${renderer.lastRenderError.split('\n')[0]}`;
        if (!warnings.includes(message)) warnings.push(message);
      }

      const videoFrame = new VideoFrame(canvas, {
        timestamp: Math.round((frame * 1_000_000) / plan.fps),
        duration: frameDurationUs,
      });
      const keyFrame = frame % Math.max(1, Math.round(plan.fps * 2)) === 0;
      encoder.encode(videoFrame, { keyFrame });
      videoFrame.close();

      await drain(encoder, signal);

      if (frame % 2 === 0 || frame === totalFrames - 1) {
        const ratio = 0.01 + 0.94 * ((frame + 1) / totalFrames);
        request.onProgress?.({
          phase: 'video',
          frame: frame + 1,
          totalFrames,
          ratio,
          message: `Rendering frame ${frame + 1} / ${totalFrames}`,
        });
        await yieldToUi();
      }
    }

    request.onProgress?.({
      phase: 'finalize',
      frame: totalFrames,
      totalFrames,
      ratio: 0.98,
      message: 'Writing MP4',
    });
    await encoder.flush();
    if (encoderError) throw encoderError;

    muxer.finalize();
    const buffer = (muxer.target as ArrayBufferTarget).buffer;
    const blob = new Blob([buffer], { type: 'video/mp4' });

    request.onProgress?.({
      phase: 'finalize',
      frame: totalFrames,
      totalFrames,
      ratio: 1,
      message: 'Done',
    });

    return { blob, plan, audioIncluded, warnings };
  } finally {
    try {
      if (encoder.state !== 'closed') encoder.close();
    } catch {
      /* already closed */
    }
    renderer.dispose();
    canvas.width = 0;
    canvas.height = 0;
  }
}

/* ------------------------------------------------------------------ */
/* Audio                                                               */
/* ------------------------------------------------------------------ */

async function encodeAudio(
  buffer: AudioBuffer,
  plan: ExportPlan,
  settings: ExportSettings,
  signal?: AbortSignal,
): Promise<{ chunk: EncodedAudioChunk; meta?: EncodedAudioChunkMetadata }[]> {
  if (typeof AudioEncoder === 'undefined') throw new Error('AudioEncoder is not available');

  const channels = audioChannels(buffer);
  // Platform AAC encoders cap the bitrate they accept; step down until one is supported.
  const requestedBitrate = Math.max(32, Math.round(settings.audioBitrateKbps)) * 1000;
  const bitrateCandidates = [...new Set([requestedBitrate, 192_000, 160_000, 128_000, 96_000, 64_000])];
  let config: AudioEncoderConfig | null = null;
  for (const bitrate of bitrateCandidates) {
    const candidate: AudioEncoderConfig = {
      codec: 'mp4a.40.2',
      sampleRate: AUDIO_SAMPLE_RATE,
      numberOfChannels: channels,
      bitrate,
    };
    try {
      const support = await AudioEncoder.isConfigSupported(candidate);
      if (support.supported) {
        config = support.config ?? candidate;
        break;
      }
    } catch {
      /* try the next bitrate */
    }
  }
  if (!config) throw new Error('AAC encoding is not supported by this browser');

  const chunks: { chunk: EncodedAudioChunk; meta?: EncodedAudioChunkMetadata }[] = [];
  let failure: Error | null = null;
  const encoder = new AudioEncoder({
    output: (chunk, meta) => chunks.push({ chunk, meta }),
    error: (err) => {
      failure = err instanceof Error ? err : new Error(String(err));
    },
  });

  try {
    encoder.configure(config);

    const totalSamples = Math.max(1, Math.round(plan.duration * AUDIO_SAMPLE_RATE));
    const sourceChannels: Float32Array[] = [];
    for (let c = 0; c < channels; c++) {
      sourceChannels.push(buffer.getChannelData(Math.min(c, buffer.numberOfChannels - 1)));
    }
    const sourceRate = buffer.sampleRate;
    const sourceStart = plan.start * sourceRate;

    for (let offset = 0; offset < totalSamples; offset += AUDIO_CHUNK_FRAMES) {
      throwIfAborted(signal);
      if (failure) throw failure;

      const count = Math.min(AUDIO_CHUNK_FRAMES, totalSamples - offset);
      const planar = new Float32Array(count * channels);
      for (let c = 0; c < channels; c++) {
        const source = sourceChannels[c];
        for (let i = 0; i < count; i++) {
          // Linear resampling from the decoded rate to the AAC rate.
          const sourcePosition = sourceStart + ((offset + i) * sourceRate) / AUDIO_SAMPLE_RATE;
          const i0 = Math.floor(sourcePosition);
          const frac = sourcePosition - i0;
          const a = i0 >= 0 && i0 < source.length ? source[i0] : 0;
          const b = i0 + 1 >= 0 && i0 + 1 < source.length ? source[i0 + 1] : 0;
          planar[c * count + i] = a + (b - a) * frac;
        }
      }

      const audioData = new AudioData({
        format: 'f32-planar',
        sampleRate: AUDIO_SAMPLE_RATE,
        numberOfFrames: count,
        numberOfChannels: channels,
        timestamp: Math.round((offset / AUDIO_SAMPLE_RATE) * 1_000_000),
        data: planar,
      });
      encoder.encode(audioData);
      audioData.close();

      await drain(encoder, signal);
    }

    await encoder.flush();
    if (failure) throw failure;
    return chunks;
  } finally {
    try {
      if (encoder.state !== 'closed') encoder.close();
    } catch {
      /* already closed */
    }
  }
}

function audioChannels(buffer: AudioBuffer): number {
  return Math.max(1, Math.min(2, buffer.numberOfChannels));
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

async function pickVideoConfig(
  width: number,
  height: number,
  fps: number,
  bitrate: number,
): Promise<VideoEncoderConfig> {
  let lastError = '';
  for (const codec of VIDEO_CODEC_CANDIDATES) {
    const config: VideoEncoderConfig = {
      codec,
      width,
      height,
      bitrate,
      framerate: fps,
      latencyMode: 'quality',
    };
    try {
      const support = await VideoEncoder.isConfigSupported(config);
      if (support.supported) return support.config ?? config;
    } catch (err) {
      lastError = errorText(err);
    }
  }
  throw new Error(
    `No supported H.264 encoder for ${width}×${height} at ${fps} fps.${lastError ? ` ${lastError}` : ''}`,
  );
}

/** Keep the encoder queue bounded while letting the UI breathe. */
async function drain(encoder: VideoEncoder | AudioEncoder, signal?: AbortSignal): Promise<void> {
  while (encoder.encodeQueueSize > 12) {
    throwIfAborted(signal);
    await sleep(4);
  }
}

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const error = new Error('Export cancelled');
    error.name = 'AbortError';
    throw error;
  }
}

function isAbort(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function silenceSample(sample: AudioSample): void {
  sample.rms = 0;
  sample.peak = 0;
  sample.subBass = 0;
  sample.bass = 0;
  sample.lowMid = 0;
  sample.mid = 0;
  sample.highMid = 0;
  sample.treble = 0;
  sample.air = 0;
  sample.centroid = 0;
  sample.flux = 0;
  sample.kick = 0;
  sample.snare = 0;
  sample.onset = 0;
  sample.silence = 1;
  sample.energy = 0;
  sample.beat = 0;
  sample.beatPhase = 0;
  sample.bar = 0;
  sample.bands.fill(0);
  sample.spectrum.fill(0);
  sample.waveform.fill(0);
}
