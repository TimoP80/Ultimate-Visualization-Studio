/**
 * Frequency band layout shared by the analyser, the modulation system and
 * every template's uniform block.
 */

export const BAND_COUNT = 16;
export const SPECTRUM_BINS = 512;

/** Named perceptual ranges (Hz). */
export const FREQ_RANGES = {
  subBass: [20, 60],
  bass: [60, 250],
  lowMid: [250, 500],
  mid: [500, 2000],
  highMid: [2000, 4000],
  treble: [4000, 6000],
  air: [6000, 20000],
} as const;

export type NamedBand = keyof typeof FREQ_RANGES;

/** Log-spaced band edges from 30 Hz to 16 kHz. */
export function buildLogBandEdges(count = BAND_COUNT, min = 30, max = 16000): number[] {
  const edges: number[] = [];
  const ratio = Math.pow(max / min, 1 / count);
  for (let i = 0; i <= count; i++) edges.push(min * Math.pow(ratio, i));
  return edges;
}

/** Log-spaced spectrum bin frequencies from 20 Hz to 20 kHz. */
export function buildLogBinFrequencies(bins = SPECTRUM_BINS, min = 20, max = 20000): Float32Array {
  const out = new Float32Array(bins);
  const ratio = Math.pow(max / min, 1 / (bins - 1));
  for (let i = 0; i < bins; i++) out[i] = min * Math.pow(ratio, i);
  return out;
}

/** Scalar feature layout inside the flattened analysis track. */
export const SC = {
  rms: 0,
  peak: 1,
  subBass: 2,
  bass: 3,
  lowMid: 4,
  mid: 5,
  highMid: 6,
  treble: 7,
  air: 8,
  centroid: 9,
  flux: 10,
  kick: 11,
  snare: 12,
  onset: 13,
  silence: 14,
  energy: 15,
} as const;

export const NUM_SCALARS = 16;

export const SCALAR_KEYS: (keyof typeof SC)[] = [
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
];

/** Human labels used by the modulation UI. */
export const SCALAR_LABELS: Record<string, string> = {
  rms: 'RMS Level',
  peak: 'Peak',
  subBass: 'Sub Bass',
  bass: 'Bass',
  lowMid: 'Low Mid',
  mid: 'Mid',
  highMid: 'High Mid',
  treble: 'Treble',
  air: 'Air',
  centroid: 'Spectral Centroid',
  flux: 'Spectral Flux',
  kick: 'Kick',
  snare: 'Snare',
  onset: 'Onset',
  silence: 'Silence',
  energy: 'Energy',
  beat: 'Beat',
  beatPhase: 'Beat Phase',
  bar: 'Bar',
  band: 'Band',
};
