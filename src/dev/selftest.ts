/**
 * Development self-test.
 *
 * Renders every registered template into a real WebGL2 context with synthetic
 * audio, reads the pixels back and reports compile/runtime failures plus a
 * coverage number. Run with the `self-test.html` page under `npm run dev`; it
 * is not part of the production bundle.
 */

import '@/templates';
import { allTemplates, getTemplateById } from '@/templates/registry';
import { Renderer } from '@/render/Renderer';
import { createAudioSample } from '@/audio/analysis';
import { createEmptyLayer, createLayerFromTemplate } from '@/state/project';
import { TEXT_EFFECTS, defaultTextEffectParams } from '@/render/textEffects';
import { EFFECT_DEFS, defaultEffectParams } from '@/render/effects';
import type { Layer, Scene } from '@/types';

interface Result {
  id: string;
  name: string;
  ok: boolean;
  coverage: number;
  error: string | null;
}

function fakeAudio() {
  const sample = createAudioSample();
  sample.rms = 0.55;
  sample.peak = 0.8;
  sample.subBass = 0.7;
  sample.bass = 0.72;
  sample.lowMid = 0.5;
  sample.mid = 0.45;
  sample.highMid = 0.4;
  sample.treble = 0.35;
  sample.air = 0.3;
  sample.centroid = 0.4;
  sample.flux = 0.5;
  sample.bpm = 150;
  sample.beat = 0.7;
  sample.beatPhase = 0.3;
  sample.bar = 0.4;
  sample.kick = 0.8;
  sample.snare = 0.5;
  sample.onset = 0.6;
  sample.energy = 0.6;
  for (let i = 0; i < sample.bands.length; i++) sample.bands[i] = 0.25 + 0.6 * (1 - i / 16);
  for (let i = 0; i < sample.spectrum.length; i++) {
    sample.spectrum[i] = Math.max(0, 0.75 - i / 512) * (0.6 + 0.4 * Math.sin(i * 0.11));
  }
  for (let i = 0; i < sample.waveform.length; i++) {
    sample.waveform[i] = Math.sin((i / sample.waveform.length) * Math.PI * 8) * 0.6;
  }
  return sample;
}

function sceneFor(layer: Layer): Scene {
  return {
    id: 'selftest',
    name: 'Self test',
    layers: [layer],
    duration: 10,
    markers: [],
    transitionIn: { type: 'none', duration: 0 },
    bgColors: ['#07080c', '#101625'],
    bgMode: 'gradient',
    effects: [],
  };
}

async function run(): Promise<void> {
  const output = document.getElementById('result');
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 180;
  document.body.appendChild(canvas);

  const results: Result[] = [];
  let renderer: Renderer;
  try {
    renderer = new Renderer(canvas);
  } catch (err) {
    write(output, { fatal: String(err) });
    return;
  }

  const audio = fakeAudio();
  const pixelBuffer = new Uint8Array(320 * 180 * 4);
  const baselineBuffer = new Uint8Array(320 * 180 * 4);

  for (const def of allTemplates()) {
    renderer.resetFeedback();
    const layer = createLayerFromTemplate(def, 0, 10);
    const scene = sceneFor(layer);
    const emptyScene = { ...scene, layers: [] };
    let error: string | null = null;
    let coverage = 0;
    try {
      for (let frame = 0; frame < 3; frame++) {
        const time = 2 + frame / 60;
        // Render the same frame without layers to isolate what the template adds.
        renderer.renderFrame({ scene: emptyScene, time, frame, audio, width: 320, height: 180, audioActive: true, dt: 1 / 60 });
        renderer.presentToCanvas();
        const baseline = renderer.readCanvas(baselineBuffer).slice();

        renderer.renderFrame({ scene, time, frame, audio, width: 320, height: 180, audioActive: true, dt: 1 / 60 });
        renderer.presentToCanvas();
        const pixels = renderer.readCanvas(pixelBuffer);
        let lit = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          const diff = Math.abs(pixels[i] - baseline[i]) + Math.abs(pixels[i + 1] - baseline[i + 1]) + Math.abs(pixels[i + 2] - baseline[i + 2]);
          if (diff > 18) lit++;
        }
        coverage = Math.max(coverage, lit / (320 * 180));
      }
      error = renderer.lastRenderError;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    results.push({
      id: def.id,
      name: def.name,
      ok: !error && coverage > 0.005,
      coverage: Number(coverage.toFixed(4)),
      error,
    });
  }

  // Exercise every post-processing effect on a known-good layer.
  const fxTemplate = getTemplateById('classic.circularSpectrum');
  if (fxTemplate) {
    for (const def of EFFECT_DEFS) {
      const layer = createLayerFromTemplate(fxTemplate, 0, 10);
      layer.effects = [
        {
          id: `fx_${def.type}`,
          type: def.type,
          enabled: true,
          params: { ...defaultEffectParams(def), intensity: 1 },
        },
      ];
      const scene = sceneFor(layer);
      const emptyScene = { ...scene, layers: [] };
      let error: string | null = null;
      let coverage = 0;
      renderer.resetFeedback();
      try {
        renderer.renderFrame({ scene: emptyScene, time: 2, frame: 0, audio, width: 320, height: 180, audioActive: true, dt: 1 / 60 });
        renderer.presentToCanvas();
        const baseline = renderer.readCanvas(baselineBuffer).slice();
        renderer.renderFrame({ scene, time: 2, frame: 1, audio, width: 320, height: 180, audioActive: true, dt: 1 / 60 });
        renderer.presentToCanvas();
        const pixels = renderer.readCanvas(pixelBuffer);
        let lit = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          const diff = Math.abs(pixels[i] - baseline[i]) + Math.abs(pixels[i + 1] - baseline[i + 1]) + Math.abs(pixels[i + 2] - baseline[i + 2]);
          if (diff > 18) lit++;
        }
        coverage = lit / (320 * 180);
        error = renderer.lastRenderError;
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
      results.push({
        id: `fx.${def.type}`,
        name: `FX ${def.label}`,
        ok: !error && coverage > 0.001,
        coverage: Number(coverage.toFixed(4)),
        error,
      });
    }
  }

  // Exercise every text effect preset on a real text layer (browser glyph raster).
  const textPalette = createEmptyLayer().palette;
  for (const def of TEXT_EFFECTS) {
    const layer: Layer = {
      ...createEmptyLayer(`${def.label} Title`),
      type: 'text',
      text: 'ULTIMATE',
      textEffect: def.id,
      blend: 'normal',
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
      palette: { ...textPalette, ...def.palette },
      params: { fontSize: 1, weight: 800, letterSpacing: 0, ...defaultTextEffectParams(def) },
    };
    const scene = sceneFor(layer);
    const emptyScene = { ...scene, layers: [] };
    let error: string | null = null;
    let coverage = 0;
    renderer.resetFeedback();
    try {
      renderer.renderFrame({ scene: emptyScene, time: 2, frame: 0, audio, width: 320, height: 180, audioActive: true, dt: 1 / 60 });
      renderer.presentToCanvas();
      const baseline = renderer.readCanvas(baselineBuffer).slice();
      renderer.renderFrame({ scene, time: 2, frame: 1, audio, width: 320, height: 180, audioActive: true, dt: 1 / 60 });
      renderer.presentToCanvas();
      const pixels = renderer.readCanvas(pixelBuffer);
      let lit = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const diff = Math.abs(pixels[i] - baseline[i]) + Math.abs(pixels[i + 1] - baseline[i + 1]) + Math.abs(pixels[i + 2] - baseline[i + 2]);
        if (diff > 18) lit++;
      }
      coverage = lit / (320 * 180);
      error = renderer.lastRenderError;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    results.push({
      id: `text.${def.id}`,
      name: `Text ${def.label}`,
      ok: !error && coverage > 0.002,
      coverage: Number(coverage.toFixed(4)),
      error,
    });
  }

  renderer.dispose();

  // Sanity-check the registry lookup path used by the renderer.
  const missing = results.filter((r) => !getTemplateById(r.id));
  const summary = {
    total: results.length,
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok),
    registryMissing: missing.map((r) => r.id),
    results,
  };
  write(output, summary);
  document.title = `SELFTEST ${summary.passed}/${summary.total}`;
}

function write(element: HTMLElement | null, data: unknown): void {
  if (!element) return;
  element.textContent = JSON.stringify(data, null, 2);
}

void run();
