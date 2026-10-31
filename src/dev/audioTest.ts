/**
 * Development test for the real audio path: synthesise a WAV, run it through
 * decode -> offline analysis -> sampler and check that the rhythmic features
 * and the rendered frame respond to the beat.
 */

import '@/templates';
import { importAudioFile } from '@/state/audioImport';
import { getSampler } from '@/state/analysisStore';
import { useStudio } from '@/state/store';
import { createAudioSample } from '@/audio/analysis';
import { Renderer } from '@/render/Renderer';
import { createLayerFromTemplate } from '@/state/project';
import { getTemplateById } from '@/templates/registry';
import type { Scene } from '@/types';

function makeWav(seconds = 6, sampleRate = 44100): ArrayBuffer {
  const count = Math.floor(seconds * sampleRate);
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const t = i / sampleRate;
    const beat = t % 0.5;
    // 120 BPM kick.
    samples[i] += 0.85 * Math.sin(Math.PI * 2 * 55 * beat) * Math.exp(-beat * 26);
    // Sustained bass.
    samples[i] += 0.16 * Math.sin(Math.PI * 2 * 110 * t);
    // Off-beat hats.
    const hat = (t + 0.25) % 0.5;
    samples[i] += (Math.random() * 2 - 1) * 0.1 * Math.exp(-hat * 70);
  }

  const bytes = new ArrayBuffer(44 + count * 2);
  const view = new DataView(bytes);
  const writeString = (offset: number, value: string): void => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + count * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  return bytes;
}

async function run(): Promise<void> {
  const output = document.getElementById('result');
  const report: Record<string, unknown> = {};
  const stage = (text: string): void => {
    if (output) output.textContent = text;
  };
  window.addEventListener('error', (event) => {
    stage(`error: ${event.message}`);
    document.title = 'AUDIO FAIL';
  });
  window.addEventListener('unhandledrejection', (event) => {
    stage(`rejection: ${String(event.reason)}`);
    document.title = 'AUDIO FAIL';
  });
  const watchdog = window.setTimeout(() => {
    if (document.title !== 'AUDIO PASS' && document.title !== 'AUDIO FAIL') {
      stage(`timeout; last status=${useStudio.getState().audio.status}`);
      document.title = 'AUDIO FAIL';
    }
  }, 20000);

  try {
  stage('generating wav');
  const file = new File([makeWav()], 'test-120bpm.wav', { type: 'audio/wav' });
  stage('importing');
  const imported = await importAudioFile(file);
  stage('imported');
  report.imported = imported;

  const state = useStudio.getState();
  report.status = state.audio.status;
  report.error = state.audio.error;
  report.bpm = Math.round(state.audio.bpm);
  report.duration = Number(state.audio.duration.toFixed(2));
  report.sceneDuration = Number(state.project.scenes[0].duration.toFixed(2));

  const sampler = getSampler();
  report.sampler = Boolean(sampler);
  if (sampler) {
    const onBeat = createAudioSample();
    const offBeat = createAudioSample();
    sampler.sampleInto(onBeat, 1.0);
    sampler.sampleInto(offBeat, 1.24);
    report.onBeat = {
      bass: Number(onBeat.bass.toFixed(3)),
      kick: Number(onBeat.kick.toFixed(3)),
      beat: Number(onBeat.beat.toFixed(3)),
      rms: Number(onBeat.rms.toFixed(3)),
    };
    report.offBeat = {
      bass: Number(offBeat.bass.toFixed(3)),
      kick: Number(offBeat.kick.toFixed(3)),
      beat: Number(offBeat.beat.toFixed(3)),
      rms: Number(offBeat.rms.toFixed(3)),
    };
    report.movesWithBeat = onBeat.bass > offBeat.bass && onBeat.beat > offBeat.beat;

    // Render one frame with real analysis and confirm it differs from silence.
    const probe = getTemplateById('classic.circularSpectrum');
    if (probe) {
      const canvas = document.createElement('canvas');
      document.body.appendChild(canvas);
      const renderer = new Renderer(canvas);
      const layer = createLayerFromTemplate(probe, 0, 10);
      const scene: Scene = {
        id: 'audio-test',
        name: 'audio',
        layers: [layer],
        duration: 6,
        markers: [],
        transitionIn: { type: 'none', duration: 0 },
        bgColors: ['#07080c', '#101625'],
        bgMode: 'gradient',
        effects: [],
      };
      const quiet = createAudioSample();
      renderer.renderFrame({ scene: { ...scene, layers: [] }, time: 1.0, frame: 0, audio: quiet, width: 320, height: 180, audioActive: false, dt: 1 / 60 });
      renderer.presentToCanvas();
      const silentPixels = renderer.readCanvas().slice();
      renderer.renderFrame({ scene, time: 1.0, frame: 1, audio: onBeat, width: 320, height: 180, audioActive: true, dt: 1 / 60 });
      renderer.presentToCanvas();
      const beatPixels = renderer.readCanvas();
      let diff = 0;
      for (let i = 0; i < beatPixels.length; i += 4) {
        const d = Math.abs(beatPixels[i] - silentPixels[i]) + Math.abs(beatPixels[i + 1] - silentPixels[i + 1]);
        if (d > 12) diff++;
      }
      report.renderDiffRatio = Number((diff / (320 * 180)).toFixed(4));
      report.renderReacts = diff / (320 * 180) > 0.005;
      renderer.dispose();
    }
  }

  const bpm = Number(report.bpm);
  const ok =
    report.imported === true &&
    report.status === 'ready' &&
    bpm >= 110 &&
    bpm <= 130 &&
    report.movesWithBeat === true &&
    report.renderReacts === true;
  report.ok = ok;

  if (output) output.textContent = JSON.stringify(report, null, 2);
  document.title = ok ? 'AUDIO PASS' : 'AUDIO FAIL';
  } catch (err) {
    stage(`threw: ${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}`);
    document.title = 'AUDIO FAIL';
  } finally {
    window.clearTimeout(watchdog);
  }
}

void run();
