/**
 * Radix-2 iterative Cooley–Tukey FFT.
 *
 * Used by the offline analyser so that the same feature pipeline can run
 * deterministically at any point in a track (which is what keeps the live
 * preview and the exported video visually identical).
 */

export class FFT {
  readonly size: number;
  private readonly levels: number;
  private readonly cosTable: Float32Array;
  private readonly sinTable: Float32Array;
  private readonly reverse: Uint32Array;

  constructor(size: number) {
    if (size < 2 || (size & (size - 1)) !== 0) {
      throw new Error(`FFT size must be a power of two, received ${size}`);
    }
    this.size = size;
    this.levels = Math.log2(size) | 0;

    this.cosTable = new Float32Array(size / 2);
    this.sinTable = new Float32Array(size / 2);
    for (let i = 0; i < size / 2; i++) {
      this.cosTable[i] = Math.cos((-2 * Math.PI * i) / size);
      this.sinTable[i] = Math.sin((-2 * Math.PI * i) / size);
    }

    // Bit-reversal permutation table.
    this.reverse = new Uint32Array(size);
    for (let i = 0; i < size; i++) {
      let x = i;
      let r = 0;
      for (let j = 0; j < this.levels; j++) {
        r = (r << 1) | (x & 1);
        x >>>= 1;
      }
      this.reverse[i] = r;
    }
  }

  /**
   * In-place forward transform.
   * `re` and `im` must both be `size` long; `im` is zeroed on entry.
   */
  forward(re: Float32Array, im: Float32Array): void {
    const n = this.size;
    const rev = this.reverse;

    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) {
        let t = re[i];
        re[i] = re[j];
        re[j] = t;
        t = im[i];
        im[i] = im[j];
        im[j] = t;
      }
    }

    const cos = this.cosTable;
    const sin = this.sinTable;

    for (let span = 2; span <= n; span <<= 1) {
      const half = span >> 1;
      const step = n / span;
      for (let i = 0; i < n; i += span) {
        for (let j = i, k = 0; j < i + half; j++, k += step) {
          const l = j + half;
          const tre = re[l] * cos[k] - im[l] * sin[k];
          const tim = re[l] * sin[k] + im[l] * cos[k];
          re[l] = re[j] - tre;
          im[l] = im[j] - tim;
          re[j] += tre;
          im[j] += tim;
        }
      }
    }
  }
}

/** Hann window with periodic definition, matching the usual STFT convention. */
export function hannWindow(size: number): Float32Array {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size);
  }
  return w;
}

/** Coherent gain of a window (sum / size). Used to normalise magnitudes. */
export function coherentGain(window: Float32Array): number {
  let s = 0;
  for (let i = 0; i < window.length; i++) s += window[i];
  return s / window.length;
}

export const DB_FLOOR = -100;

/** Linear magnitude → normalised 0..1 value on a dB scale. */
export function magnitudeToUnit(magnitude: number): number {
  const db = 20 * Math.log10(magnitude + 1e-12);
  const v = (db - DB_FLOOR) / -DB_FLOOR;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Normalised 0..1 value → dB (inverse of {@link magnitudeToUnit}). */
export function unitToDb(unit: number): number {
  return DB_FLOOR + unit * -DB_FLOOR;
}
