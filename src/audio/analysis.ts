/**
 * Offline audio analysis.
 *
 * The whole track is analysed once into a flattened, frame-indexed feature
 * track. Both the live preview and the video exporter sample that same track,
 * which is what guarantees "what you see is what you export".
 *
 * Envelope smoothing is computed statelessly from a bounded look-back window,
 * so sampling is deterministic and safe under random seeks.
 */

import { FFT, hannWindow, coherentGain, magnitudeToUnit } from './fft';
import {
  BAND_COUNT,
  SPECTRUM_BINS,
  SC,
  NUM_SCALARS,
  buildLogBandEdges,
  buildLogBinFrequencies,
  FREQ_RANGES,
  type NamedBand,
} from './bands';

export interface AnalysisSettings {
  /** Overall input gain applied before feature extraction. 0.1 .. 8 */
  sensitivity: number;
  /** Envelope attack, seconds. */
  attack: number;
  /** Envelope release, seconds. */
  release: number;
  /** Extra smoothing of the low/high band separations. 0..1 */
  smoothing: number;
  /** Multiplies the flux/onset sensitivity. */
  transientSensitivity: number;
}

export const DEFAULT_ANALYSIS_SETTINGS: AnalysisSettings = {
  sensitivity: 1,
  attack: 0.012,
  release: 0.14,
  smoothing: 0.18,
  transientSensitivity: 1,
};

export interface AnalysisTrack {
  duration: number;
  sampleRate: number;
  fftSize: number;
  hopSize: number;
  frameRate: number;
  frameCount: number;
  /** frameCount * SPECTRUM_BINS, unit magnitudes. */
  spectrum: Float32Array;
  /** frameCount * BAND_COUNT, unit magnitudes. */
  bands: Float32Array;
  /** frameCount * NUM_SCALARS. */
  scalars: Float32Array;
  /** Mono mix-down used for waveform display. */
  pcm: Float32Array;
  bpm: number;
  beats: Float32Array;
  downbeats: Float32Array;
  /** Strength (0..1) aligned with `beats`. */
  beatStrength: Float32Array;
  settings: AnalysisSettings;
}

export interface AudioSample {
  rms: number;
  peak: number;
  subBass: number;
  bass: number;
  lowMid: number;
  mid: number;
  highMid: number;
  treble: number;
  air: number;
  centroid: number;
  flux: number;
  bpm: number;
  beat: number;
  beatPhase: number;
  bar: number;
  kick: number;
  snare: number;
  onset: number;
  silence: number;
  energy: number;
  bands: Float32Array;
  spectrum: Float32Array;
  waveform: Float32Array;
}

export function createAudioSample(): AudioSample {
  return {
    rms: 0,
    peak: 0,
    subBass: 0,
    bass: 0,
    lowMid: 0,
    mid: 0,
    highMid: 0,
    treble: 0,
    air: 0,
    centroid: 0,
    flux: 0,
    bpm: 120,
    beat: 0,
    beatPhase: 0,
    bar: 0,
    kick: 0,
    snare: 0,
    onset: 0,
    silence: 0,
    energy: 0,
    bands: new Float32Array(BAND_COUNT),
    spectrum: new Float32Array(SPECTRUM_BINS),
    waveform: new Float32Array(1024),
  };
}

/* ------------------------------------------------------------------ */
/* Analysis                                                            */
/* ------------------------------------------------------------------ */

const FFT_SIZE = 2048;
const HOP_SIZE = 1024;
const ENV_LOOKBACK = 96;
const SPECTRUM_SMOOTH_LOOKBACK = 6;

/** Linear gain applied to a dB-normalised value so quiet passages still move. */
function mixToMono(buffer: AudioBuffer): Float32Array {
  const n = buffer.length;
  const out = new Float32Array(n);
  const channels = buffer.numberOfChannels;
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < n; i++) out[i] += data[i];
  }
  if (channels > 1) {
    const inv = 1 / channels;
    for (let i = 0; i < n; i++) out[i] *= inv;
  }
  return out;
}

function bandIndex(freq: number, binHz: number): number {
  const idx = Math.round(freq / binHz);
  return idx < 1 ? 1 : idx;
}

function averageRange(
  mag: Float32Array,
  from: number,
  to: number,
): number {
  let sum = 0;
  let count = 0;
  for (let i = from; i <= to && i < mag.length; i++) {
    sum += mag[i];
    count++;
  }
  return count > 0 ? sum / count : 0;
}

/**
 * Analyse a decoded buffer into an {@link AnalysisTrack}.
 * Yields to the event loop periodically so the UI can show progress.
 */
export async function analyzeBuffer(
  buffer: AudioBuffer,
  settings: AnalysisSettings = DEFAULT_ANALYSIS_SETTINGS,
  onProgress?: (ratio: number) => void,
  signal?: AbortSignal,
): Promise<AnalysisTrack> {
  const sampleRate = buffer.sampleRate;
  const pcm = mixToMono(buffer);
  const total = pcm.length;

  const fft = new FFT(FFT_SIZE);
  const window = hannWindow(FFT_SIZE);
  const cg = coherentGain(window);
  const magScale = 2 / (FFT_SIZE * cg);

  const re = new Float32Array(FFT_SIZE);
  const im = new Float32Array(FFT_SIZE);
  const mag = new Float32Array(FFT_SIZE / 2);
  const prevMag = new Float32Array(FFT_SIZE / 2);

  const binHz = sampleRate / FFT_SIZE;
  const halfBins = FFT_SIZE / 2;
  const nyquistBin = halfBins - 1;

  const logBins = buildLogBinFrequencies(SPECTRUM_BINS, 20, Math.min(20000, sampleRate / 2 - binHz));
  // Pre-compute the FFT-bin span covered by each log bin.
  const logFrom = new Int32Array(SPECTRUM_BINS);
  const logTo = new Int32Array(SPECTRUM_BINS);
  for (let i = 0; i < SPECTRUM_BINS; i++) {
    const lower = i === 0 ? 20 : Math.sqrt(logBins[i - 1] * logBins[i]);
    const upper = i === SPECTRUM_BINS - 1 ? logBins[i] * 1.12 : Math.sqrt(logBins[i] * logBins[i + 1]);
    let a = bandIndex(lower, binHz);
    let b = bandIndex(upper, binHz);
    if (b <= a) b = a;
    logFrom[i] = Math.min(a, nyquistBin);
    logTo[i] = Math.min(b, nyquistBin);
  }

  const bandEdges = buildLogBandEdges(BAND_COUNT, 30, Math.min(16000, sampleRate / 2 - binHz));
  const bandFrom = new Int32Array(BAND_COUNT);
  const bandTo = new Int32Array(BAND_COUNT);
  for (let b = 0; b < BAND_COUNT; b++) {
    bandFrom[b] = Math.min(bandIndex(bandEdges[b], binHz), nyquistBin);
    bandTo[b] = Math.min(bandIndex(bandEdges[b + 1], binHz), nyquistBin);
  }

  const namedFrom: Record<NamedBand, number> = {} as never;
  const namedTo: Record<NamedBand, number> = {} as never;
  for (const key of Object.keys(FREQ_RANGES) as NamedBand[]) {
    const [lo, hi] = FREQ_RANGES[key];
    namedFrom[key] = Math.min(bandIndex(lo, binHz), nyquistBin);
    namedTo[key] = Math.min(bandIndex(hi, binHz), nyquistBin);
  }

  const frameCount = Math.max(1, Math.floor((total - FFT_SIZE) / HOP_SIZE) + 1);

  const spectrum = new Float32Array(frameCount * SPECTRUM_BINS);
  const bands = new Float32Array(frameCount * BAND_COUNT);
  const scalars = new Float32Array(frameCount * NUM_SCALARS);

  const fluxEnv = new Float32Array(frameCount);
  const lowEnergy = new Float32Array(frameCount);

  const sens = settings.sensitivity;
  let silenceRun = 0;
  const silenceFrames = Math.round(0.25 * (sampleRate / HOP_SIZE));

  // Adaptive noise floor for transient detection.
  let kickFloor = 0.02;
  let snareFloor = 0.02;

  for (let f = 0; f < frameCount; f++) {
    const offset = f * HOP_SIZE;

    let sumSq = 0;
    let peak = 0;
    for (let i = 0; i < FFT_SIZE; i++) {
      const s = offset + i < total ? pcm[offset + i] : 0;
      const a = s < 0 ? -s : s;
      if (a > peak) peak = a;
      sumSq += s * s;
      re[i] = s * window[i];
    }
    const rms = Math.sqrt(sumSq / FFT_SIZE) * sens;

    im.fill(0);
    fft.forward(re, im);

    let centroidNum = 0;
    let centroidDen = 0;
    for (let k = 1; k < halfBins; k++) {
      const m = Math.sqrt(re[k] * re[k] + im[k] * im[k]) * magScale * sens;
      mag[k] = m;
    }

    // Log-spaced spectrum (max-pooled) + centroid + flux.
    let fluxSum = 0;
    for (let i = 0; i < SPECTRUM_BINS; i++) {
      const a = logFrom[i];
      const b = logTo[i];
      let best = 0;
      for (let k = a; k <= b; k++) {
        if (mag[k] > best) best = mag[k];
      }
      const unit = magnitudeToUnit(best);
      spectrum[f * SPECTRUM_BINS + i] = unit;

      const freq = logBins[i];
      centroidNum += freq * unit;
      centroidDen += unit;
    }
    for (let k = 1; k < halfBins; k++) {
      const d = mag[k] - prevMag[k];
      if (d > 0) fluxSum += d;
      prevMag[k] = mag[k];
    }
    const flux = Math.min(1, (fluxSum / halfBins) * 24 * settings.transientSensitivity);

    // 16 log bands.
    let bandEnergySum = 0;
    for (let b = 0; b < BAND_COUNT; b++) {
      const v = magnitudeToUnit(averageRange(mag, bandFrom[b], bandTo[b]));
      bands[f * BAND_COUNT + b] = v;
      bandEnergySum += v;
    }
    const energy = Math.min(1, bandEnergySum / BAND_COUNT);

    const named = (key: NamedBand) => magnitudeToUnit(averageRange(mag, namedFrom[key], namedTo[key]));

    // Centroid on a log scale, 20 Hz .. 16 kHz.
    const centroidHz = centroidDen > 0 ? centroidNum / centroidDen : 0;
    const centroid =
      centroidHz <= 20
        ? 0
        : Math.min(1, Math.log2(centroidHz / 20) / Math.log2(16000 / 20));

    // Transient detection with adaptive floors and a refractory period.
    const lowBands = (bands[f * BAND_COUNT + 0] + bands[f * BAND_COUNT + 1] + bands[f * BAND_COUNT + 2]) / 3;
    lowEnergy[f] = lowBands;
    kickFloor = kickFloor * 0.995 + lowBands * 0.005;
    snareFloor = snareFloor * 0.995 + named('highMid') * 0.005;

    const kickHit = lowBands > kickFloor * 1.45 + 0.012 ? Math.min(1, (lowBands - kickFloor) * 3.2) : 0;
    const snareHit =
      named('highMid') > snareFloor * 1.5 + 0.01 && named('mid') > 0.06
        ? Math.min(1, (named('highMid') - snareFloor) * 3)
        : 0;

    fluxEnv[f] = flux;

    const s = f * NUM_SCALARS;
    scalars[s + SC.rms] = Math.min(1, rms);
    scalars[s + SC.peak] = Math.min(1, peak * sens);
    scalars[s + SC.subBass] = named('subBass');
    scalars[s + SC.bass] = named('bass');
    scalars[s + SC.lowMid] = named('lowMid');
    scalars[s + SC.mid] = named('mid');
    scalars[s + SC.highMid] = named('highMid');
    scalars[s + SC.treble] = named('treble');
    scalars[s + SC.air] = named('air');
    scalars[s + SC.centroid] = centroid;
    scalars[s + SC.flux] = flux;
    scalars[s + SC.kick] = kickHit;
    scalars[s + SC.snare] = snareHit;
    scalars[s + SC.onset] = flux;
    if (rms < 0.0025 && peak < 0.02) {
      silenceRun++;
    } else {
      silenceRun = 0;
    }
    scalars[s + SC.silence] = silenceRun > silenceFrames ? 1 : 0;
    scalars[s + SC.energy] = energy;

    if ((f & 511) === 0) {
      if (signal?.aborted) throw new DOMException('Analysis aborted', 'AbortError');
      onProgress?.((f + 1) / frameCount);
      await yieldToEventLoop();
    }
  }

  const beats = detectBeats(fluxEnv, lowEnergy, HOP_SIZE / sampleRate, frameCount);

  onProgress?.(1);

  return {
    duration: buffer.duration,
    sampleRate,
    fftSize: FFT_SIZE,
    hopSize: HOP_SIZE,
    frameRate: sampleRate / HOP_SIZE,
    frameCount,
    spectrum,
    bands,
    scalars,
    pcm,
    bpm: beats.bpm,
    beats: beats.beats,
    downbeats: beats.downbeats,
    beatStrength: beats.strengths,
    settings,
  };
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/* ------------------------------------------------------------------ */
/* Tempo & beat tracking                                               */
/* ------------------------------------------------------------------ */

interface BeatResult {
  bpm: number;
  beats: Float32Array;
  downbeats: Float32Array;
  strengths: Float32Array;
}

/**
 * Tempo estimation by autocorrelation of the onset envelope, followed by
 * grid-phase fitting. Handles the usual octave ambiguity by folding the
 * estimate into a musically plausible range.
 */
function detectBeats(
  flux: Float32Array,
  lowEnergy: Float32Array,
  frameSeconds: number,
  frameCount: number,
): BeatResult {
  if (frameCount < 8) {
    return {
      bpm: 120,
      beats: new Float32Array(0),
      downbeats: new Float32Array(0),
      strengths: new Float32Array(0),
    };
  }

  // Normalise the onset envelope: subtract a local mean, half-wave rectify.
  const env = new Float32Array(frameCount);
  const meanWindow = Math.max(4, Math.round(1.0 / frameSeconds));
  let running = 0;
  for (let i = 0; i < frameCount; i++) {
    running += flux[i];
    if (i >= meanWindow) running -= flux[i - meanWindow];
    const localMean = running / Math.min(i + 1, meanWindow);
    const v = flux[i] - localMean;
    env[i] = v > 0 ? v : 0;
  }
  let envPeak = 0;
  for (let i = 0; i < frameCount; i++) if (env[i] > envPeak) envPeak = env[i];
  if (envPeak <= 1e-5) {
    return {
      bpm: 120,
      beats: new Float32Array(0),
      downbeats: new Float32Array(0),
      strengths: new Float32Array(0),
    };
  }
  const invPeak = 1 / envPeak;
  for (let i = 0; i < frameCount; i++) env[i] *= invPeak;

  const minBpm = 60;
  const maxBpm = 200;
  const lagMin = Math.max(2, Math.round((60 / maxBpm) / frameSeconds));
  const lagMax = Math.min(Math.floor(frameCount / 2), Math.round((60 / minBpm) / frameSeconds));

  let bestLag = 0;
  let bestScore = -1;
  const scores = new Float32Array(lagMax + 2);
  for (let lag = lagMin; lag <= lagMax; lag++) {
    let sum = 0;
    const limit = frameCount - lag;
    for (let i = 0; i < limit; i++) sum += env[i] * env[i + lag];
    const score = sum / limit;
    scores[lag] = score;
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }

  if (bestLag < 2 || bestScore <= 0) {
    return {
      bpm: 120,
      beats: new Float32Array(0),
      downbeats: new Float32Array(0),
      strengths: new Float32Array(0),
    };
  }

  // Prefer the harmonic that lands in a comfortable tempo window, provided it
  // still explains a decent share of the autocorrelation energy.
  const candidates = [bestLag, Math.round(bestLag / 2), bestLag * 2, Math.round(bestLag / 3), bestLag * 3];
  let chosenLag = bestLag;
  for (const c of candidates) {
    if (c < lagMin || c > lagMax || c >= scores.length) continue;
    const bpm = 60 / (c * frameSeconds);
    if (bpm >= 80 && bpm <= 175 && scores[c] > bestScore * 0.55) {
      chosenLag = c;
      bestScore = scores[c];
      break;
    }
  }

  // The autocorrelation peak only resolves the period to an integer; refine it
  // with a parabolic fit over the neighbouring lags.
  let period = chosenLag;
  if (chosenLag > lagMin && chosenLag < lagMax) {
    const y0 = scores[chosenLag - 1];
    const y1 = scores[chosenLag];
    const y2 = scores[chosenLag + 1];
    const denom = y0 - 2 * y1 + y2;
    if (Math.abs(denom) > 1e-9) {
      period = chosenLag - (0.5 * (y2 - y0)) / denom;
    }
  }
  if (period < 2) period = chosenLag;

  // Fit the grid phase.
  let bestPhase = 0;
  let bestPhaseScore = -1;
  const phaseSteps = Math.max(1, Math.round(period));
  for (let p = 0; p < phaseSteps; p++) {
    let sum = 0;
    let count = 0;
    for (let t = p; t < frameCount; t += period) {
      const idx = Math.round(t);
      if (idx >= 0 && idx < frameCount) {
        sum += env[idx];
        count++;
      }
    }
    if (count === 0) continue;
    const s = sum / count;
    if (s > bestPhaseScore) {
      bestPhaseScore = s;
      bestPhase = p;
    }
  }

  const beatFrames: number[] = [];
  const strengths: number[] = [];
  for (let t = bestPhase; t < frameCount; t += period) {
    const idx = Math.round(t);
    if (idx < 0 || idx >= frameCount) continue;
    beatFrames.push(idx);
    strengths.push(env[idx]);
  }

  const frameSecondsActual = frameSeconds;
  const beatTimes = beatFrames.map((f) => f * frameSecondsActual);

  // Downbeats: pick the beat offset (0..3) whose beats carry the most low energy.
  let bestOffset = 0;
  let bestLow = -1;
  for (let o = 0; o < 4; o++) {
    let sum = 0;
    let count = 0;
    for (let i = o; i < beatTimes.length; i += 4) {
      const frame = Math.round(beatTimes[i] / frameSecondsActual);
      if (frame >= 0 && frame < frameCount) {
        sum += lowEnergy[frame];
        count++;
      }
    }
    if (count > 0 && sum / count > bestLow) {
      bestLow = sum / count;
      bestOffset = o;
    }
  }

  const downbeats: number[] = [];
  for (let i = bestOffset; i < beatTimes.length; i += 4) downbeats.push(beatTimes[i]);

  let bpm = 60 / (period * frameSecondsActual);
  // Fold implausible results into the standard range.
  while (bpm < 70) bpm *= 2;
  while (bpm > 190) bpm /= 2;

  return {
    bpm,
    beats: Float32Array.from(beatTimes),
    downbeats: Float32Array.from(downbeats),
    strengths: Float32Array.from(strengths),
  };
}

/* ------------------------------------------------------------------ */
/* Sampling                                                            */
/* ------------------------------------------------------------------ */

const SCALAR_SAMPLE_ORDER = [
  SC.rms,
  SC.peak,
  SC.subBass,
  SC.bass,
  SC.lowMid,
  SC.mid,
  SC.highMid,
  SC.treble,
  SC.air,
  SC.centroid,
  SC.flux,
  SC.kick,
  SC.snare,
  SC.onset,
  SC.silence,
  SC.energy,
];

const SCALAR_FIELDS = [
  'rms',
  'peak',
  'subBass',
  'bass',
  'lowMid',
  'mid',
  'highMid',
  'treble',
  'air',
  'centroid',
  'flux',
  'kick',
  'snare',
  'onset',
  'silence',
  'energy',
] as const;

/**
 * Samples an {@link AnalysisTrack} at arbitrary times.
 *
 * Envelope smoothing is recomputed over a bounded look-back window on every
 * call, so the result depends only on `time` and the analysis settings —
 * never on playback history. That property is what makes preview and export
 * pixel-consistent.
 */
export class AnalysisSampler {
  private track: AnalysisTrack;
  private settings: AnalysisSettings;
  private aCoef: number;
  private rCoef: number;

  constructor(track: AnalysisTrack, settings: AnalysisSettings = track.settings) {
    this.track = track;
    this.settings = settings;
    this.aCoef = 1;
    this.rCoef = 1;
    this.recomputeCoefs();
  }

  setSettings(settings: AnalysisSettings): void {
    this.settings = settings;
    this.recomputeCoefs();
  }

  getSettings(): AnalysisSettings {
    return this.settings;
  }

  private recomputeCoefs(): void {
    const fps = this.track.frameRate;
    // `smoothing` makes the follower lazier without adding hidden state: it
    // simply stretches both time constants.
    const smooth = Math.max(0, Math.min(1, this.settings.smoothing));
    const attack = Math.max(1e-4, this.settings.attack * (1 + smooth * 2));
    const release = Math.max(1e-4, this.settings.release * (1 + smooth * 4));
    this.aCoef = 1 - Math.exp(-1 / (attack * fps));
    this.rCoef = 1 - Math.exp(-1 / (release * fps));
  }

  get duration(): number {
    return this.track.duration;
  }

  get sampleRate(): number {
    return this.track.sampleRate;
  }

  get bpm(): number {
    return this.track.bpm;
  }

  get beats(): Float32Array {
    return this.track.beats;
  }

  get trackRef(): AnalysisTrack {
    return this.track;
  }

  /** Fill `out` with the audio state at `time` (seconds). */
  sampleInto(out: AudioSample, time: number): AudioSample {
    const t = this.track;
    const pos = time * t.frameRate;
    const clamped = Math.max(0, Math.min(t.frameCount - 1.001, pos));
    const i0 = Math.floor(clamped);
    const frac = clamped - i0;
    const i1 = Math.min(t.frameCount - 1, i0 + 1);

    // ---- Scalar envelope over a bounded look-back window -----------------
    const start = Math.max(0, i0 - ENV_LOOKBACK);
    const envState = ENV_SCRATCH;
    envState.fill(0);
    for (let f = start; f <= i0; f++) {
      const base = f * NUM_SCALARS;
      for (let k = 0; k < SCALAR_SAMPLE_ORDER.length; k++) {
        const x = t.scalars[base + SCALAR_SAMPLE_ORDER[k]];
        const cur = envState[k];
        envState[k] = cur + (x - cur) * (x > cur ? this.aCoef : this.rCoef);
      }
    }
    // One more step towards the interpolated next frame for sub-frame accuracy.
    if (frac > 0) {
      const base = i1 * NUM_SCALARS;
      for (let k = 0; k < SCALAR_SAMPLE_ORDER.length; k++) {
        const x = t.scalars[base + SCALAR_SAMPLE_ORDER[k]];
        const cur = envState[k];
        const next = cur + (x - cur) * (x > cur ? this.aCoef : this.rCoef);
        envState[k] = cur + (next - cur) * frac;
      }
    }
    for (let k = 0; k < SCALAR_FIELDS.length; k++) {
      (out as unknown as Record<string, number>)[SCALAR_FIELDS[k]] = envState[k];
    }

    // ---- Bands ------------------------------------------------------------
    const bs = i0 * BAND_COUNT;
    const bs1 = i1 * BAND_COUNT;
    for (let b = 0; b < BAND_COUNT; b++) {
      const a = t.bands[bs + b];
      const c = t.bands[bs1 + b];
      out.bands[b] = a + (c - a) * frac;
    }

    // ---- Spectrum ---------------------------------------------------------
    const ss = i0 * SPECTRUM_BINS;
    const ss1 = i1 * SPECTRUM_BINS;
    const specSmooth = SPECTRUM_SMOOTH_SCRATCH;
    const specStart = Math.max(0, i0 - SPECTRUM_SMOOTH_LOOKBACK);
    specSmooth.fill(0);
    const maxBin = Math.max(1, Math.min(SPECTRUM_BINS, SPEC_WINDOW));
    for (let f = specStart; f <= i0; f++) {
      const base = f * SPECTRUM_BINS;
      for (let k = 0; k < maxBin; k++) {
        const x = t.spectrum[base + k];
        const cur = specSmooth[k];
        specSmooth[k] = cur + (x - cur) * (x > cur ? this.aCoef : this.rCoef);
      }
    }
    for (let k = 0; k < SPECTRUM_BINS; k++) {
      const a = k < maxBin ? specSmooth[k] : t.spectrum[ss + k];
      const c = t.spectrum[ss1 + k];
      out.spectrum[k] = a + (c - a) * frac;
    }

    // ---- Rhythm -----------------------------------------------------------
    out.bpm = t.bpm;
    const beatInfo = this.beatAt(time);
    out.beat = beatInfo.impulse;
    out.beatPhase = beatInfo.phase;
    out.bar = beatInfo.bar;

    // ---- Waveform ---------------------------------------------------------
    this.waveformInto(out.waveform, time);

    return out;
  }

  /** Linear-interpolated raw PCM window centred on `time`. */
  waveformInto(out: Float32Array, time: number): void {
    const pcm = this.track.pcm;
    const n = out.length;
    const centre = Math.floor(time * this.track.sampleRate);
    const step = Math.max(1, Math.floor(pcm.length / (n * 4096)) || 1);
    const start = centre - Math.floor((n * step) / 2);
    for (let i = 0; i < n; i++) {
      const idx = start + i * step;
      out[i] = idx >= 0 && idx < pcm.length ? pcm[idx] : 0;
    }
  }

  /** Raw (unsmoothed) samples over an absolute sample range, for the timeline. */
  rawWaveform(startSample: number, count: number, out: Float32Array): void {
    const pcm = this.track.pcm;
    for (let i = 0; i < count; i++) {
      const a = startSample + i;
      out[i] = a >= 0 && a < pcm.length ? pcm[a] : 0;
    }
  }

  private beatAt(time: number): { impulse: number; phase: number; bar: number } {
    const beats = this.track.beats;
    if (beats.length === 0) {
      const bpm = this.track.bpm || 120;
      const beatDur = 60 / bpm;
      const phase = (time % beatDur) / beatDur;
      const fall = Math.exp(-phase * 7);
      return { impulse: fall, phase, bar: (time / (beatDur * 4)) % 1 };
    }

    // Binary search for the last beat at or before `time`.
    let lo = 0;
    let hi = beats.length - 1;
    let idx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (beats[mid] <= time) {
        idx = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    const nextIdx = Math.min(beats.length - 1, idx + 1);
    const prevTime = idx >= 0 ? beats[idx] : -(60 / (this.track.bpm || 120));
    const nextTime = nextIdx >= 0 ? beats[nextIdx] : prevTime + 60 / (this.track.bpm || 120);
    const span = Math.max(1e-4, nextTime - prevTime);
    const phase = Math.max(0, Math.min(1, (time - prevTime) / span));

    const strength = idx >= 0 && idx < this.track.beatStrength.length ? this.track.beatStrength[idx] : 0.7;
    const impulse = Math.exp(-phase * 6) * (0.45 + 0.55 * Math.min(1, strength * 1.6));

    // Bar position: 4 beats per bar.
    const beatCount = Math.max(0, idx);
    const bar = ((beatCount % 4) + phase) / 4;

    return { impulse, phase, bar };
  }
}

const ENV_SCRATCH = new Float32Array(NUM_SCALARS);
const SPECTRUM_SMOOTH_SCRATCH = new Float32Array(SPECTRUM_BINS);
/** Smoothing the whole 512-bin spectrum every frame is wasteful; the first
 *  SPEC_WINDOW bins carry nearly all musical information for visual purposes. */
const SPEC_WINDOW = 256;
