/**
 * Classic visualization templates.
 *
 * These are the reference implementations: spectrum rings, radial bars,
 * equalisers, oscilloscopes and Lissajous figures. Every one of them reads the
 * shared audio uniforms directly, so they react to the analysed track without
 * any per-template plumbing.
 */

import { registerTemplates } from './registry';
import { f, i, palette } from './helpers';
import type { TemplateDef } from '@/types';

const circularSpectrum: TemplateDef = {
  id: 'classic.circularSpectrum',
  name: 'Circular Spectrum',
  category: 'classic',
  description: 'The full spectrum wrapped around a pulsing ring, with a radial comb and bass-driven halo.',
  tags: ['spectrum', 'circular', 'ring', 'iconic'],
  palette: palette('cyanViolet'),
  composite: 'normal',
  params: [
    f('radius', 'Radius', 0.46, 0.15, 0.9, 0.01),
    f('amplitude', 'Spectrum Amplitude', 0.22, 0, 0.6, 0.01),
    f('rotation', 'Rotation', 0, 0, 1, 0.001, 'Motion'),
    f('thickness', 'Ring Thickness', 0.012, 0.002, 0.08, 0.001),
    f('hue', 'Hue Shift', 0, 0, 1, 0.001, 'Color'),
    f('comb', 'Radial Comb', 160, 8, 400, 1, 'Style'),
    f('spin', 'Spin Speed', 0.015, -0.4, 0.4, 0.001, 'Motion'),
    f('glow', 'Halo', 1, 0, 2.5, 0.01, 'Style'),
  ],
  frag: /* glsl */ `
void mainImage(out vec4 fragColor, in vec2 fragCoord){
  vec2 p = uvAspect(fragCoord);
  float r = length(p);
  float a = atan(p.y, p.x) / TAU + 0.5;

  float aa = fract(a + uP[2] + uTime * uP[6]);
  float s = spectrumAt(aa) * 0.6 + spectrumAt(fract(aa - 0.005)) * 0.2 + spectrumAt(fract(aa + 0.005)) * 0.2;
  float env = pow(clamp(s, 0.0, 1.0), 0.85);

  float R = uP[0] + env * uP[1] + uBass * 0.08 + uBeat * 0.02;
  float thick = uP[3] * (0.7 + env * 1.8);
  float ring = smoothstep(thick, 0.0, abs(r - R));
  float comb = 0.72 + 0.28 * sin(aa * TAU * uP[5]);
  float glow = exp(-abs(r - R) * 9.0) * (0.25 + env) * uP[7];
  float inner = smoothstep(R, 0.0, r) * 0.12 * (0.3 + uRms);

  vec3 col = paletteRgb(uP[4] + aa * 0.5 + env * 0.25);
  col *= ring * comb * 1.5 + glow;
  col += paletteRgb(uP[4] + 0.45) * inner;

  float core = exp(-r * 14.0) * (0.35 + uKick * 0.9);
  col += vec3(1.0, 0.98, 0.95) * core * 0.6;

  float alpha = clamp(ring * comb + glow * 0.8 + inner + core, 0.0, 1.0);
  fragColor = vec4(tonemap(col), alpha);
}`,
};

const radialBars: TemplateDef = {
  id: 'classic.radialBars',
  name: 'Radial Frequency Bars',
  category: 'classic',
  description: 'Discrete spectral spokes radiating outwards, each capped with a bright peak marker.',
  tags: ['spectrum', 'bars', 'radial', 'minimal'],
  palette: palette('emerald'),
  composite: 'normal',
  params: [
    f('inner', 'Inner Radius', 0.18, 0.02, 0.7, 0.01),
    i('barCount', 'Bar Count', 72, 16, 192),
    f('length', 'Bar Length', 0.72, 0.05, 1.4, 0.01),
    f('gap', 'Bar Gap', 0.28, 0, 0.7, 0.01, 'Shape'),
    f('hue', 'Hue Shift', 0, 0, 1, 0.001, 'Color'),
    f('minHeight', 'Minimum Height', 0.02, 0, 0.2, 0.001),
    f('capGlow', 'Cap Glow', 1, 0, 3, 0.01, 'Style'),
    f('rotation', 'Rotation', 0.02, -0.5, 0.5, 0.001, 'Motion'),
  ],
  frag: /* glsl */ `
void mainImage(out vec4 fragColor, in vec2 fragCoord){
  vec2 p = uvAspect(fragCoord);
  float r = length(p);
  float a = fract(atan(p.y, p.x) / TAU + 0.5 + uTime * uP[7]);

  float n = max(4.0, uP[1]);
  float cell = a * n;
  float idx = floor(cell);
  float frac = fract(cell);
  float v = pow(clamp(spectrumAt((idx + 0.5) / n), 0.0, 1.0), 0.9);
  float len = uP[5] + v * uP[2] * (0.65 + uRms * 0.7);

  float halfSpan = 0.5 - uP[3] * 0.5;
  float inFrac = step(0.5 - halfSpan, frac) * step(frac, 0.5 + halfSpan);
  float body = step(uP[0], r) * step(r, uP[0] + len) * inFrac;
  float cap = smoothstep(0.008, 0.0, abs(r - (uP[0] + len))) * inFrac;

  vec3 base = paletteRgb(uP[4] + idx / n * 0.7);
  vec3 col = base * body * (0.55 + 0.9 * v);
  col += mix(base, vec3(1.0), 0.7) * cap * uP[6] * 1.6;

  float innerRing = smoothstep(0.006, 0.0, abs(r - uP[0])) * 0.7;
  col += base * innerRing;
  float core = exp(-r * 9.0) * (0.25 + uBass * 0.9);
  col += paletteRgb(uP[4] + 0.5) * core;

  float alpha = clamp(body * (0.6 + v) + cap * uP[6] + innerRing + core, 0.0, 1.0);
  fragColor = vec4(tonemap(col), alpha);
}`,
};

const verticalEq: TemplateDef = {
  id: 'classic.verticalEq',
  name: 'Vertical Equalizer',
  category: 'classic',
  description: 'A segmented LED equaliser with a mirrored floor reflection and peak caps.',
  tags: ['spectrum', 'equalizer', 'led', 'classic'],
  palette: palette('acid'),
  composite: 'normal',
  params: [
    i('barCount', 'Bar Count', 64, 8, 160, 'Layout'),
    f('height', 'Height', 0.62, 0.05, 1, 0.01),
    f('baseline', 'Baseline', 0.16, 0.02, 0.5, 0.01, 'Layout'),
    f('segments', 'LED Segments', 26, 4, 80, 1, 'Style'),
    f('mirror', 'Floor Reflection', 0.45, 0, 1, 0.01, 'Style'),
    f('hue', 'Hue Shift', 0, 0, 1, 0.001, 'Color'),
    f('capGlow', 'Peak Caps', 1, 0, 2, 0.01, 'Style'),
    f('widthFill', 'Bar Width', 0.8, 0.2, 1, 0.01, 'Layout'),
  ],
  frag: /* glsl */ `
void mainImage(out vec4 fragColor, in vec2 fragCoord){
  vec2 uv = uv01(fragCoord);
  float n = max(4.0, uP[0]);
  float cell = uv.x * n;
  float idx = floor(cell);
  float frac = fract(cell);
  float halfSpan = uP[7] * 0.5;
  float inBar = step(0.5 - halfSpan, frac) * step(frac, 0.5 + halfSpan);

  float v = pow(clamp(spectrumAt((idx + 0.5) / n), 0.0, 1.0), 0.92);
  float v2 = pow(clamp(bandSmooth((idx + 0.5) / n), 0.0, 1.0), 0.9);
  float level = mix(v, v2, 0.35) * (0.82 + uBass * 0.35);
  float h = uP[1] * (0.035 + level);

  float y = uv.y - uP[2];
  float above = step(0.0, y) * step(y, h);
  float seg = fract(y * uP[3]);
  float lit = smoothstep(0.06, 0.22, seg) * smoothstep(0.0, 0.14, 1.0 - seg);
  float bar = above * inBar * lit;

  vec3 c = mix(uColorA.rgb, uColorB.rgb, clamp(level * 1.35, 0.0, 1.0));
  c = mix(c, uColorD.rgb, smoothstep(0.65, 1.0, level) * 0.5);
  vec3 col = c * bar * 1.6;

  float cap = smoothstep(0.006, 0.0, abs(y - h)) * inBar * uP[6];
  col += mix(c, vec3(1.0), 0.6) * cap;

  // Floor reflection, dimmed and slightly blurred by a cosine falloff.
  float ry = uP[2] - uv.y;
  float refl = step(0.0, ry) * step(ry, h * 0.8) * inBar;
  float fade = exp(-ry * 9.0);
  col += c * refl * lit * fade * uP[4] * 0.9;

  float floorLine = smoothstep(0.0025, 0.0, abs(uv.y - uP[2])) * 0.35;
  col += uColorD.rgb * floorLine;

  float alpha = clamp(bar + cap + refl * fade * uP[4] + floorLine, 0.0, 1.0);
  fragColor = vec4(tonemap(col), alpha);
}`,
};

const mirroredSpectrum: TemplateDef = {
  id: 'classic.mirroredSpectrum',
  name: 'Mirrored Spectrum',
  category: 'classic',
  description: 'A spectrum reflected across the horizon, blending a solid gradient fill with a crisp contour.',
  tags: ['spectrum', 'mirror', 'symmetric', 'gradient'],
  palette: palette('ice'),
  composite: 'normal',
  params: [
    i('barCount', 'Bar Count', 96, 16, 256, 'Layout'),
    f('height', 'Height', 0.44, 0.05, 0.95, 0.01),
    f('gap', 'Bar Gap', 0.12, 0, 0.6, 0.01, 'Layout'),
    f('smoothing', 'Smoothing', 0.35, 0, 1, 0.01, 'Shape'),
    f('hue', 'Hue Shift', 0, 0, 1, 0.001, 'Color'),
    f('lineWidth', 'Contour Width', 0.006, 0.001, 0.03, 0.001, 'Style'),
    f('symmetry', 'Mirror Amount', 0.65, 0, 1, 0.01, 'Style'),
    f('reactivity', 'Reactivity', 1, 0, 2, 0.01, 'Style'),
  ],
  frag: /* glsl */ `
void mainImage(out vec4 fragColor, in vec2 fragCoord){
  vec2 uv = uv01(fragCoord);
  float n = max(4.0, uP[0]);
  float cell = uv.x * n;
  float idx = floor(cell);
  float frac = fract(cell);
  float halfSpan = 0.5 - uP[2] * 0.5;
  float inBar = step(0.5 - halfSpan, frac) * step(frac, 0.5 + halfSpan);

  float x = (idx + 0.5) / n;
  float v = spectrumAt(x);
  float smoothV = mix(v, spectrumAt(fract(x - 0.012)) * 0.5 + spectrumAt(fract(x + 0.012)) * 0.5, uP[3]);
  float h = uP[1] * (0.02 + smoothV * uP[7]) * (0.85 + uBass * 0.25);

  float d = abs(uv.y - 0.5);
  float fill = step(d, h) * inBar;
  float gradient = 1.0 - d / max(h, 0.001);
  vec3 c = mix(uColorB.rgb, uColorA.rgb, clamp(gradient + smoothV * 0.25, 0.0, 1.0));
  c = mix(c, uColorC.rgb, smoothstep(0.5, 1.2, smoothV) * 0.5);
  vec3 col = c * fill * (0.5 + gradient * 1.1);

  float contour = smoothstep(uP[5], 0.0, abs(d - h)) * inBar;
  col += mix(c, vec3(1.0), 0.65) * contour * 1.4;

  // Central horizon line and its soft bloom.
  float axis = exp(-d * 220.0) * 0.5;
  float bloom = exp(-d * 26.0) * 0.18 * (0.3 + uRms);
  col += mix(uColorD.rgb, uColorA.rgb, uP[6]) * (axis + bloom);

  float alpha = clamp(fill + contour + axis + bloom, 0.0, 1.0);
  fragColor = vec4(tonemap(col), alpha);
}`,
};

const horizontalSpectrum: TemplateDef = {
  id: 'classic.horizontalSpectrum',
  name: 'Horizontal Spectrum',
  category: 'classic',
  description: 'Frequency bins stacked vertically and drawn as left-anchored meters with glowing leading edges.',
  tags: ['spectrum', 'histogram', 'horizontal', 'meters'],
  palette: palette('sunset'),
  composite: 'normal',
  params: [
    i('rows', 'Row Count', 56, 12, 160, 'Layout'),
    f('extent', 'Extent', 0.86, 0.1, 1, 0.01),
    f('gap', 'Row Gap', 0.22, 0, 0.8, 0.01, 'Layout'),
    f('curve', 'Response Curve', 0.9, 0.2, 2.5, 0.01, 'Shape'),
    f('hue', 'Hue Shift', 0, 0, 1, 0.001, 'Color'),
    f('edgeGlow', 'Edge Glow', 1, 0, 3, 0.01, 'Style'),
    f('anchor', 'Anchor', 0.08, 0, 0.8, 0.01, 'Layout'),
    f('reactivity', 'Reactivity', 1, 0, 2, 0.01, 'Style'),
  ],
  frag: /* glsl */ `
void mainImage(out vec4 fragColor, in vec2 fragCoord){
  vec2 uv = uv01(fragCoord);
  float rows = max(4.0, uP[0]);
  float cy = uv.y * rows;
  float row = floor(cy);
  float fy = fract(cy);
  float inRow = step(0.5 - (0.5 - uP[2] * 0.5), fy) * step(fy, 0.5 + (0.5 - uP[2] * 0.5));

  // Low frequencies sit at the bottom of the stack.
  float x = 1.0 - (row + 0.5) / rows;
  float v = pow(clamp(spectrumAt(x), 0.0, 1.0), uP[3]);
  float len = uP[1] * (0.015 + v * uP[7]);

  float body = step(uP[6], uv.x) * step(uv.x, uP[6] + len) * inRow;
  vec3 c = paletteRgb(uP[4] + row / rows * 0.8);
  float across = (uv.x - uP[6]) / max(len, 0.001);
  vec3 col = c * body * (0.45 + across * 1.2);

  float edge = smoothstep(0.004, 0.0, abs(uv.x - (uP[6] + len))) * inRow * uP[5];
  col += mix(c, vec3(1.0), 0.7) * edge * 1.8;

  float rail = smoothstep(0.002, 0.0, abs(uv.x - uP[6])) * 0.25;
  col += uColorD.rgb * rail;

  float alpha = clamp(body + edge + rail, 0.0, 1.0);
  fragColor = vec4(tonemap(col), alpha);
}`,
};

const stereoSpectrum: TemplateDef = {
  id: 'classic.stereoSpectrum',
  name: 'Stereo Spectrum',
  category: 'classic',
  description: 'Two opposing channel meters around a centre divide, with independent palettes and beat flare.',
  tags: ['spectrum', 'stereo', 'meters', 'dual'],
  palette: palette('ultraviolet'),
  composite: 'normal',
  params: [
    i('barCount', 'Bars per Side', 40, 8, 96, 'Layout'),
    f('extent', 'Extent', 0.92, 0.2, 1, 0.01),
    f('gap', 'Gap', 0.3, 0, 0.8, 0.01, 'Layout'),
    f('divider', 'Centre Divider', 1, 0, 2, 0.01, 'Style'),
    f('hue', 'Hue Shift', 0, 0, 1, 0.001, 'Color'),
    f('flare', 'Beat Flare', 0.8, 0, 2, 0.01, 'Style'),
    f('invertLeft', 'Mirror Left', 1, 0, 1, 1, 'Style'),
    f('skew', 'Channel Skew', 0.15, 0, 0.5, 0.01, 'Shape'),
  ],
  frag: /* glsl */ `
void mainImage(out vec4 fragColor, in vec2 fragCoord){
  vec2 uv = uv01(fragCoord);
  float side = uv.x < 0.5 ? -1.0 : 1.0;
  float cx = abs(uv.x - 0.5) * 2.0;        // 0 centre .. 1 edge

  float n = max(4.0, uP[0]);
  float cy = uv.y * n;
  float row = floor(cy);
  float fy = fract(cy);
  float inRow = step(uP[2] * 0.5, fy) * step(fy, 1.0 - uP[2] * 0.5);

  float base = (row + 0.5) / n;
  // Right side reads low-to-high, left side is flipped for a mirrored look.
  float x = side > 0.0 ? base : mix(base, 1.0 - base, uP[6]);
  float v = pow(clamp(spectrumAt(x), 0.0, 1.0), 0.9);
  v = clamp(v + (side > 0.0 ? uHighMid : uBass) * uP[7] * 0.18, 0.0, 1.0);
  float len = uP[1] * (0.015 + v);

  float body = step(cx, len) * inRow;
  vec3 c = side > 0.0 ? mix(uColorA.rgb, uColorC.rgb, v) : mix(uColorB.rgb, uColorD.rgb, v);
  vec3 col = c * body * (0.5 + v * 1.3);

  float cap = smoothstep(0.005, 0.0, abs(cx - len)) * inRow * (0.6 + uBeat);
  col += mix(c, vec3(1.0), 0.7) * cap;

  float divider = exp(-abs(uv.x - 0.5) * 220.0) * uP[3];
  col += (uColorA.rgb * (1.0 - step(0.5, uv.x)) + uColorB.rgb * step(0.5, uv.x)) * divider * 0.6;

  // Subtle stereo width haze that breathes with the mids.
  float haze = exp(-cx * 4.0) * 0.08 * (0.2 + uMid);
  col += mix(uColorC.rgb, uColorD.rgb, uv.y) * haze;

  float alpha = clamp(body + cap + divider, 0.0, 1.0);
  fragColor = vec4(tonemap(col), alpha);
}`,
};

const frequencyWaveform: TemplateDef = {
  id: 'classic.frequencyWaveform',
  name: 'Frequency Waveform',
  category: 'classic',
  description: 'A spectral gradient bed with the live waveform riding over it as a bright contour.',
  tags: ['waveform', 'spectrum', 'area', 'hybrid'],
  palette: palette('magma'),
  composite: 'normal',
  params: [
    f('bedHeight', 'Bed Height', 0.55, 0.05, 1, 0.01),
    f('waveGain', 'Waveform Gain', 0.55, 0.05, 1.5, 0.01),
    f('waveWidth', 'Trace Width', 0.006, 0.001, 0.03, 0.001, 'Style'),
    f('hue', 'Hue Shift', 0, 0, 1, 0.001, 'Color'),
    f('speed', 'Scroll Speed', 0, -2, 2, 0.01, 'Motion'),
    f('grid', 'Frequency Grid', 1, 0, 1, 1, 'Style'),
    f('glow', 'Trace Glow', 1, 0, 3, 0.01, 'Style'),
    f('gamma', 'Bed Gamma', 1.2, 0.3, 3, 0.01, 'Shape'),
  ],
  frag: /* glsl */ `
void mainImage(out vec4 fragColor, in vec2 fragCoord){
  vec2 uv = uv01(fragCoord);
  float x = fract(uv.x + uTime * uP[4] * 0.05);

  float spec = pow(clamp(spectrumAt(x), 0.0, 1.0), uP[7]);
  float bed = uP[0] * (0.04 + spec) * (0.8 + uBass * 0.3);
  float fill = step(uv.y, bed);

  vec3 bedColor = paletteRgb(uP[3] + x * 0.6 + uv.y * 0.25);
  vec3 col = bedColor * fill * (0.25 + uv.y / max(bed, 0.001) * 0.9);

  if (uP[5] > 0.5){
    // Faint log-frequency graticule under the bed.
    float gx = smoothstep(0.0025, 0.0, abs(fract(x * 16.0) - 0.5) * 0.12);
    col += uColorD.rgb * gx * 0.08;
  }

  float phase = uP[4] * uTime * 0.9;
  float w = (waveAt(fract(uv.x + phase * 0.1)) * 0.5 + waveAt(fract(uv.x + phase * 0.1 + 0.001)) * 0.5);
  float y = 0.5 + w * uP[1] * 0.5 * (0.6 + uRms * 0.8);
  float line = smoothstep(uP[2], 0.0, abs(uv.y - y));
  float glow = exp(-abs(uv.y - y) * 90.0) * uP[6];

  col += mix(uColorD.rgb, uColorA.rgb, 0.5) * line * 1.8;
  col += paletteRgb(uP[3] + 0.5) * glow * 0.5;

  float alpha = clamp(fill * (0.35 + spec) + line + glow * 0.35, 0.0, 1.0);
  fragColor = vec4(tonemap(col), alpha);
}`,
};

const oscilloscope: TemplateDef = {
  id: 'classic.oscilloscope',
  name: 'Oscilloscope',
  category: 'classic',
  description: 'A triggered CRT trace with phosphor persistence, graticule and a sweeping scan bar.',
  tags: ['waveform', 'crt', 'scope', 'retro'],
  palette: palette('emerald'),
  composite: 'screen',
  params: [
    f('gain', 'Vertical Gain', 0.62, 0.05, 1.4, 0.01),
    f('trace', 'Trace Width', 0.004, 0.001, 0.02, 0.001, 'Style'),
    f('persistence', 'Persistence', 0.5, 0, 1, 0.01, 'Style'),
    f('hue', 'Hue Shift', 0.02, 0, 1, 0.001, 'Color'),
    f('grid', 'Graticule', 1, 0, 1, 1, 'Style'),
    f('scan', 'Scan Bar', 0.5, 0, 1, 0.01, 'Motion'),
    f('sweep', 'Sweep Speed', 0.35, 0, 3, 0.01, 'Motion'),
    f('glow', 'Phosphor Glow', 1, 0, 3, 0.01, 'Style'),
  ],
  frag: /* glsl */ `
void mainImage(out vec4 fragColor, in vec2 fragCoord){
  vec2 uv = uv01(fragCoord);
  float phase = uTime * uP[6] * 0.15;

  // Four-tap average smooths the raw PCM into a readable trace.
  float x = fract(uv.x + phase);
  float w = waveAt(x) * 0.4 + waveAt(fract(x + 0.0015)) * 0.2 +
            waveAt(fract(x - 0.0015)) * 0.2 + waveAt(fract(x + 0.003)) * 0.2;
  float y = 0.5 + w * uP[0] * 0.5;

  vec3 traceColor = paletteRgb(uP[3] + uv.x * 0.4);
  float line = smoothstep(uP[1], 0.0, abs(uv.y - y));
  float halo = exp(-abs(uv.y - y) * 55.0) * uP[7];
  float afterglow = exp(-abs(uv.y - y) * 220.0) * uP[2];

  vec3 col = traceColor * (line * 1.9 + halo * 0.35 + afterglow * 0.8);

  if (uP[4] > 0.5){
    float cx = smoothstep(0.0015, 0.0, abs(fract(uv.x * 10.0) - 0.5)) * 0.10;
    float cy = smoothstep(0.0015, 0.0, abs(fract(uv.y * 8.0) - 0.5)) * 0.10;
    col += uColorC.rgb * (cx + cy) * 0.55;
    float axis = exp(-abs(uv.y - 0.5) * 320.0) * 0.22;
    col += uColorC.rgb * axis;
  }

  float scan = exp(-pow((uv.x - fract(uTime * 0.18)) * 12.0, 2.0)) * uP[5];
  col += traceColor * scan * 0.12;

  // Beam head.
  float head = exp(-length((uv - vec2(fract(phase + 1.0), y)) * vec2(2.2, 1.0)) * 26.0);
  col += vec3(1.0) * head * 1.4;

  float vignette = 1.0 - smoothstep(0.35, 0.95, length((uv - 0.5) * 2.0)) * 0.55;
  col *= vignette;

  float alpha = clamp(line + halo * 0.3 + afterglow + scan * 0.1 + 0.06, 0.0, 1.0);
  fragColor = vec4(tonemap(col), alpha);
}`,
};

const lissajous: TemplateDef = {
  id: 'classic.lissajous',
  name: 'Lissajous Curve',
  category: 'classic',
  description: 'A phase-space figure traced from the waveform, plotted as a glowing segment cloud.',
  tags: ['waveform', 'lissajous', 'xy', 'generative'],
  palette: palette('neonPink'),
  composite: 'add',
  params: [
    f('scale', 'Scale', 0.78, 0.1, 1.2, 0.01),
    f('ratio', 'Frequency Ratio', 1.5, 0.5, 5, 0.01, 'Shape'),
    f('phase', 'Phase', 0.25, 0, 1, 0.001, 'Shape'),
    f('speed', 'Phase Speed', 0.06, 0, 1, 0.001, 'Motion'),
    f('hue', 'Hue Shift', 0, 0, 1, 0.001, 'Color'),
    f('thickness', 'Line Width', 0.012, 0.002, 0.06, 0.001, 'Style'),
    f('samples', 'Segments', 64, 16, 96, 1, 'Style'),
    f('glow', 'Glow', 1, 0, 3, 0.01, 'Style'),
  ],
  frag: /* glsl */ `
void mainImage(out vec4 fragColor, in vec2 fragCoord){
  vec2 p = uvAspect(fragCoord) * 0.5;
  float ph = uP[2] + uTime * uP[3];
  float amp = uP[0] * (0.75 + uRms * 0.35);
  float segs = max(8.0, uP[6]);

  float dist = 1e5;
  vec2 prev = vec2(0.0);
  for (int s = 0; s <= 96; s++){
    if (float(s) > segs) break;
    float t = float(s) / segs;
    float ax = fract(t * 0.45 + ph * 0.05);
    float ay = fract(t * 0.45 * uP[1] + ph * 0.07 + 0.13);
    vec2 pt = vec2(waveAt(ax), waveAt(ay)) * amp;
    if (s > 0) dist = min(dist, sdSegment(p, prev, pt));
    prev = pt;
  }

  float core = smoothstep(uP[5], 0.0, dist);
  float halo = exp(-dist * 30.0) * uP[7];
  vec3 c = paletteRgb(uP[4] + length(p) * 0.6 + uTime * 0.02);
  vec3 col = c * (core * 2.0 + halo * 0.4);

  float origin = exp(-length(p) * 40.0) * (0.2 + uKick * 0.6);
  col += vec3(1.0) * origin;
  float alpha = clamp(core + halo * 0.35 + origin, 0.0, 1.0);
  fragColor = vec4(tonemap(col), alpha);
}`,
};

const circularWaveform: TemplateDef = {
  id: 'classic.circularWaveform',
  name: 'Circular Waveform',
  category: 'classic',
  description: 'The recent PCM window bent into a glowing loop, with rotating radial needles and a soft core.',
  tags: ['waveform', 'circular', 'loop', 'organic'],
  palette: palette('amber'),
  composite: 'normal',
  params: [
    f('radius', 'Radius', 0.52, 0.1, 0.95, 0.01),
    f('amplitude', 'Amplitude', 0.16, 0, 0.5, 0.01),
    f('phase', 'Rotation', 0, 0, 1, 0.001, 'Motion'),
    f('thickness', 'Line Width', 0.008, 0.001, 0.05, 0.001, 'Style'),
    f('hue', 'Hue Shift', 0, 0, 1, 0.001, 'Color'),
    f('needles', 'Needles', 96, 0, 240, 1, 'Style'),
    f('needleLength', 'Needle Length', 0.06, 0, 0.3, 0.001, 'Style'),
    f('spin', 'Spin Speed', 0.05, -0.6, 0.6, 0.001, 'Motion'),
  ],
  frag: /* glsl */ `
void mainImage(out vec4 fragColor, in vec2 fragCoord){
  vec2 p = uvAspect(fragCoord);
  float r = length(p);
  float a = atan(p.y, p.x) / TAU + 0.5;
  float aa = fract(a + uP[2] + uTime * uP[7]);

  float w = waveAt(aa) * 0.55 + waveAt(fract(aa + 0.002)) * 0.25 + waveAt(fract(aa - 0.002)) * 0.2;
  float R = uP[1] + w * uP[3] * (0.7 + uRms);
  float line = smoothstep(uP[3], 0.0, abs(r - R));
  float glow = exp(-abs(r - R) * 26.0) * (0.4 + uRms);

  vec3 c = paletteRgb(uP[4] + aa * 0.8 + w * 0.3);
  vec3 col = c * (line * 1.7 + glow * 0.55);

  // Radial needles sample the same waveform at low resolution.
  float n = uP[5];
  if (n > 0.5){
    float cell = aa * n;
    float idx = floor(cell);
    float frac = fract(cell);
    float nv = abs(waveAt((idx + 0.5) / n));
    float needle = step(0.5 - 0.12, frac) * step(frac, 0.5 + 0.12) *
                   step(R, r) * step(r, R + nv * uP[6]);
    col += c * needle * 0.45;
  }

  float core = smoothstep(uP[1] * 0.55, 0.0, r) * (0.08 + uBass * 0.25);
  col += paletteRgb(uP[4] + 0.5) * core;
  float dot = exp(-length(p) * 30.0) * (0.15 + uBeat * 0.5);
  col += vec3(1.0) * dot;

  float alpha = clamp(line + glow * 0.5 + core + dot, 0.0, 1.0);
  fragColor = vec4(tonemap(col), alpha);
}`,
};

const templates: TemplateDef[] = [
  circularSpectrum,
  radialBars,
  verticalEq,
  mirroredSpectrum,
  horizontalSpectrum,
  stereoSpectrum,
  frequencyWaveform,
  oscilloscope,
  lissajous,
  circularWaveform,
];

registerTemplates(templates);

export default templates;
