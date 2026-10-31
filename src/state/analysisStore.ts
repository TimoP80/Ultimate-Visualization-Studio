/**
 * Non-serialisable audio analysis state.
 *
 * The decoded `AudioBuffer` and the flattened `AnalysisTrack` are large typed
 * arrays; they live outside the project document and outside React. The store
 * keeps only a small status object for the UI.
 */

import { AnalysisSampler, type AnalysisTrack } from '@/audio/analysis';

let track: AnalysisTrack | null = null;
let sampler: AnalysisSampler | null = null;

export function setAnalysisTrack(next: AnalysisTrack | null): void {
  track = next;
  sampler = next ? new AnalysisSampler(next) : null;
}

export function getAnalysisTrack(): AnalysisTrack | null {
  return track;
}

export function getSampler(): AnalysisSampler | null {
  return sampler;
}

export function clearAnalysis(): void {
  track = null;
  sampler = null;
}
