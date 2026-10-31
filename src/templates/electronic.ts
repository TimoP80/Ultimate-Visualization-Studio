/**
 * Electronic / cyberpunk templates.
 *
 * Neon grids, circuit traces, HUD reticles and quantised LED walls. These lean
 * on the palette's saturated hues and hard geometric edges, with the audio
 * driving pulses, sweeps and scanline flicker rather than organic motion.
 */

import { registerTemplates } from './registry';
import { f, i, palette } from './helpers';
import type { TemplateDef } from '@/types';

const neonGrid: TemplateDef = {
  id: 'electronic.neonGrid',
  name: 'Neon Horizon',
  category: 'electronic',
  description: 'A synthwave sunset over an infinite neon grid floor, with spectrum mountains on the horizon.',
  tags: ['synthwave', 'grid', 'retro', 'sunset', 'neon'],
  palette: palette('neonPink'),
  composite: 'normal',
  params: [
    f('horizon', 'Horizon', 0.42, 0.25, 0.66, 0.001, 'Layout'),
    f('speed', 'Grid Speed', 0.8, 0, 4, 0.01, 'Motion'),
    f('glow', 'Intensity', 1, 0.2, 2.5, 0.01, 'Style'),
    f('sunSize', 'Sun Size', 0.16, 0.04, 0.3, 0.001),
    f('hue', 'Hue Shift', 0, 0, 1, 0.001, 'Color'),
    f('mountains', 'Mountains', 1, 0, 2, 0.01),
    f('scanlines', 'Scanlines', 0.6, 0, 1, 0.01, 'Style'),
    f('gridDensity', 'Grid Density', 1, 0.4, 2, 0.01, 'Layout'),
  ],
  frag: /* glsl */ `
void mainImage(out vec4 fragColor, in vec2 fragCoord){
  vec2 uv = uv01(fragCoord);
  float aspect = uResolution.x / uResolution.y;
  float hz = clamp(uP[0], 0.2, 0.7);
  float t = uTime * uP[1];
  float above = step(hz, uv.y);

  // Sky: deep purple at the top fading into the horizon glow.
  float sy = clamp((uv.y - hz) / max(0.001, 1.0 - hz), 0.0, 1.0);
  vec3 sky = mix(paletteRgb(uP[4] + 0.62), uBackground.rgb, pow(sy, 0.6));
  vec3 col = mix(uBackground.rgb, sky, above);

  // Striped sun disc.
  vec2 sunC = vec2((uv.x - 0.5) * aspect, uv.y - (hz + uP[3] * 0.42));
  float sun = smoothstep(uP[3], uP[3] * 0.94, length(sunC)) * above;
  float cut = step(0.5, fract((uv.y - hz) * 34.0 - uTime * 0.25));
  sun *= mix(1.0, cut, smoothstep(0.0, uP[3] * 0.9, hz + uP[3] * 0.42 - uv.y));
  col += mix(uColorC.rgb, uColorA.rgb, sy) * sun * 1.35;

  // Sparse stars, only above the horizon.
  vec2 sg = floor(vec2(uv.x * aspect, uv.y) * 110.0);
  float star = step(0.986, hash12(sg)) * above * smoothstep(hz, hz + 0.06, uv.y);
  col += vec3(0.85, 0.9, 1.0) * star * (0.4 + 0.6 * hash12(sg + 3.1));

  // Perspective grid floor.
  float dz = max(hz - uv.y, 0.0005);
  float below = step(uv.y, hz);
  float depth = 0.22 / dz;
  float gx = fract((uv.x - 0.5) * depth * 5.0 * uP[7]);
  float gz = fract(depth * 1.6 * uP[7] - t * 0.9);
  float lx = smoothstep(0.07, 0.0, min(gx, 1.0 - gx));
  float lz = smoothstep(0.11, 0.0, min(gz, 1.0 - gz));
  float fade = smoothstep(0.0, 0.08, dz) * exp(-dz * 3.2);
  vec3 gridCol = mix(uColorA.rgb, uColorB.rgb, clamp(depth * 0.3, 0.0, 1.0));
  col += gridCol * clamp(lx + lz, 0.0, 1.0) * fade * below * 1.1;

  // Horizon bloom.
  col += mix(uColorA.rgb, vec3(1.0), 0.25) * exp(-abs(uv.y - hz) * 110.0) * 0.8;

  // Waveform/spectrum mountain ridge.
  float mw = waveAt(fract(uv.x * 0.75 + 0.1));
  float mh = hz + 0.01 + max(0.0, mw) * 0.16 * uP[5] + spectrumAt(fract(uv.x)) * 0.05 * uP[5];
  float mountain = above * step(uv.y, mh);
  col = mix(col, uBackground.rgb * 1.5 + paletteRgb(uP[4] + 0.5) * 0.16, mountain * 0.92);

  col *= 1.0 - uP[6] * 0.16 * (0.5 + 0.5 * sin(uv.y * uResolution.y * 1.7));
  col *= 1.0 - 0.35 * smoothstep(0.6, 1.2, length((uv - 0.5) * vec2(aspect, 1.0)));
  fragColor = vec4(tonemap(col * uP[2]), 1.0);
}`,
};

const circuitPulse: TemplateDef = {
  id: 'electronic.circuitPulse',
  name: 'Circuit Pulse',
  category: 'electronic',
  description: 'A PCB of glowing traces with packets of light running the buses, pads flaring on the beat.',
  tags: ['circuit', 'pcb', 'cyberpunk', 'traces', 'pulse'],
  palette: palette('cyanViolet'),
  composite: 'normal',
  params: [
    f('density', 'Cell Density', 18, 4, 64, 1, 'Layout'),
    f('thickness', 'Trace Width', 0.06, 0.01, 0.2, 0.001, 'Shape'),
    f('glow', 'Glow', 1, 0, 3, 0.01, 'Style'),
    f('hue', 'Hue Shift', 0, 0, 1, 0.001, 'Color'),
    f('speed', 'Pulse Speed', 0.5, 0, 3, 0.01, 'Motion'),
    f('pulseWidth', 'Pulse Sharpness', 0.45, 0, 1, 0.01, 'Motion'),
    f('pads', 'Solder Pads', 1, 0, 2, 0.01),
    f('brightness', 'Board Brightness', 0.6, 0, 1.5, 0.01, 'Style'),
  ],
  frag: /* glsl */ `
void mainImage(out vec4 fragColor, in vec2 fragCoord){
  vec2 uv = uv01(fragCoord);
  float aspect = uResolution.x / uResolution.y;
  vec2 g = vec2(uv.x * aspect, uv.y) * max(4.0, uP[0]);
  vec2 cell = floor(g);
  vec2 fc = fract(g);
  float h = hash12(cell);
  float t = uTime * uP[4];

  vec3 col = uBackground.rgb * (0.55 + 0.45 * uP[7]);
  float w = max(0.008, uP[1] * 0.35);
  float horiz = step(0.5, h);
  float lineV = 1.0 - smoothstep(0.0, w, abs(fc.x - 0.5));
  float lineH = 1.0 - smoothstep(0.0, w, abs(fc.y - 0.5));
  float line = mix(lineV, lineH, horiz) * step(0.1, h);

  float pos = mix(fc.x, fc.y, horiz);
  float head = fract(t * (0.25 + 0.75 * hash11(h * 91.7)) + h * 3.0);
  float pulse = exp(-pow((pos - head) * (5.0 + 26.0 * uP[5]), 2.0));

  vec3 c = paletteRgb(uP[3] + h * 0.55);
  col += c * line * (0.16 + pulse * 1.9);

  float pad = smoothstep(0.18, 0.11, length(fc - 0.5)) * step(0.84, h) * uP[6];
  col += mix(c, vec3(1.0), 0.4) * pad * (0.35 + pulse * 1.4);

  float joint = smoothstep(0.06, 0.02, length(fc - vec2(0.5))) * step(0.965, hash12(cell + 17.3));
  col += mix(c, vec3(1.0), 0.5) * joint * 0.7;

  col += paletteRgb(uP[3] + 0.5) * exp(-length(uv - 0.5) * 9.0) * 0.06;
  col *= 0.75 + uRms * 0.5;
  fragColor = vec4(tonemap(col * uP[2]), 1.0);
}`,
};

const cyberTunnel: TemplateDef = {
  id: 'electronic.cyberTunnel',
  name: 'Cyber Tunnel',
  category: 'electronic',
  description: 'An endless rotating square tunnel of neon rings, with speed lines and a kick-driven rush forward.',
  tags: ['tunnel', 'neon', 'cyberpunk', 'rings', 'perspective'],
  palette: palette('ultraviolet'),
  composite: 'normal',
  params: [
    f('speed', 'Tunnel Speed', 0.7, 0, 4, 0.01, 'Motion'),
    f('twist', 'Ring Twist', 0.4, 0, 2, 0.01, 'Motion'),
    f('thickness', 'Ring Glow', 0.5, 0, 2, 0.01, 'Style'),
    f('rotation', 'Roll Speed', 0.08, -0.6, 0.6, 0.001, 'Motion'),
    f('hue', 'Hue Shift', 0, 0, 1, 0.001, 'Color'),
    f('core', 'Core Light', 1, 0, 3, 0.01, 'Style'),
    f('spokes', 'Speed Lines', 18, 4, 64, 1, 'Style'),
    f('rush', 'Kick Rush', 0.6, 0, 2, 0.01, 'Style'),
  ],
  frag: /* glsl */ `
void mainImage(out vec4 fragColor, in vec2 fragCoord){
  vec2 uv = uv01(fragCoord);
  vec2 p = (uv - 0.5) * 2.0;
  p.x *= uResolution.x / uResolution.y;
  vec2 rp = rot2(uTime * uP[3]) * p;
  float box = max(abs(rp.x), abs(rp.y));
  float depth = 1.0 / max(box, 0.04);
  float z = depth * 0.5 + uTime * uP[0];
  float ringF = fract(z);
  float ring = smoothstep(0.09 + uP[2] * 0.12, 0.0, min(ringF, 1.0 - ringF));

  vec3 c = paletteRgb(uP[4] + depth * 0.10 - uTime * 0.04);
  vec3 col = uBackground.rgb * 0.5;
  col += c * ring * (0.85 + uBass * 1.2) * (0.4 + uP[2]);
  col += mix(c, vec3(1.0), 0.5) * smoothstep(0.02, 0.0, abs(box - 0.55)) * 0.35;

  float core = exp(-length(p) * 4.5) * (0.25 + uKick * 1.1) * uP[5];
  col += mix(uColorD.rgb, vec3(1.0), 0.4) * core;

  float ang = atan(p.y, p.x) / TAU + 0.5;
  float spokes = pow(fract(ang * uP[6] + depth * 0.6), 14.0);
  col += c * spokes * 0.25 * (0.4 + uTreble);

  // A twist of the rings around the roll axis.
  col *= 1.0 + uP[1] * 0.12 * sin(z * 2.0);
  col *= 1.0 + uP[7] * uKick * 0.3;
  fragColor = vec4(tonemap(col), 1.0);
}`,
};

const dataStream: TemplateDef = {
  id: 'electronic.dataStream',
  name: 'Data Stream',
  category: 'electronic',
  description: 'Falling columns of digital glyphs with bright heads, audio-reactive trails and scan interference.',
  tags: ['matrix', 'data', 'digital', 'rain', 'cyberpunk'],
  palette: palette('emerald'),
  composite: 'normal',
  params: [
    i('columns', 'Columns', 44, 8, 120, 'Layout'),
    f('trail', 'Trail Length', 4, 0.4, 12, 0.01),
    f('brightness', 'Glyph Brightness', 1, 0, 3, 0.01, 'Style'),
    f('hue', 'Hue Shift', 0, 0, 1, 0.001, 'Color'),
    f('speed', 'Fall Speed', 1, 0, 4, 0.01, 'Motion'),
    f('headGlow', 'Head Glow', 1, 0, 3, 0.01, 'Style'),
    f('haze', 'Data Haze', 1, 0, 3, 0.01, 'Style'),
    f('interference', 'Interference', 0.7, 0, 1, 0.01, 'Style'),
  ],
  frag: /* glsl */ `
void mainImage(out vec4 fragColor, in vec2 fragCoord){
  vec2 uv = uv01(fragCoord);
  float cols = max(8.0, uP[0]);
  float rows = cols * 1.9;
  float col = floor(uv.x * cols);
  float fx = fract(uv.x * cols);
  float hy = hash12(vec2(col, 3.7));
  float speed = (0.06 + hy * 0.25) * uP[4];
  float head = fract(-uTime * speed + hy * 7.0);
  float d = fract(uv.y - head + 1.0);
  float trailMask = exp(-d * (16.0 / max(0.4, uP[1]))) * step(0.18, hy);

  float cy = fract(uv.y * rows);
  float gy = floor(uv.y * rows);
  float glyphSeed = hash12(vec2(col, gy));
  float glyph = step(0.40, glyphSeed) * step(0.22, cy) * step(cy, 0.78) *
                step(0.16, fx) * step(fx, 0.84);

  vec3 c = paletteRgb(uP[3] + d * 0.45 + col * 0.025);
  vec3 col3 = uBackground.rgb * 0.55;
  col3 += c * glyph * trailMask * uP[2] * 1.9;

  float headGlow = exp(-abs(uv.y - head) * 110.0) * step(0.18, hy) * uP[5];
  col3 += mix(c, vec3(1.0), 0.7) * headGlow;

  col3 += c * 0.05 * uP[6] * (0.25 + uRms);
  col3 *= 1.0 - uP[7] * 0.18 * step(0.94, fract(uv.y * 64.0 + uTime * 0.7));
  fragColor = vec4(tonemap(col3), 1.0);
}`,
};

const hudReticle: TemplateDef = {
  id: 'electronic.hudReticle',
  name: 'HUD Reticle',
  category: 'electronic',
  description: 'A tactical targeting overlay: concentric rings, ticking dials, a radar sweep and a spectrum arc.',
  tags: ['hud', 'reticle', 'sci-fi', 'radar', 'interface'],
  palette: palette('cyanViolet'),
  composite: 'normal',
  params: [
    f('radius', 'Radius', 0.72, 0.2, 1.2, 0.01, 'Layout'),
    f('rings', 'Ring Count', 4, 1, 6, 1, 'Layout'),
    f('ticks', 'Tick Count', 96, 16, 240, 1, 'Layout'),
    f('sweep', 'Sweep Glow', 1, 0, 3, 0.01, 'Style'),
    f('hue', 'Hue Shift', 0, 0, 1, 0.001, 'Color'),
    f('rotation', 'Tick Rotation', 0.05, -0.4, 0.4, 0.001, 'Motion'),
    f('spectrumArc', 'Spectrum Arc', 1, 0, 2, 0.01, 'Style'),
    f('jitter', 'Signal Jitter', 0.3, 0, 2, 0.01, 'Style'),
  ],
  frag: /* glsl */ `
void mainImage(out vec4 fragColor, in vec2 fragCoord){
  vec2 uv = uv01(fragCoord);
  float aspect = uResolution.x / uResolution.y;
  vec2 p = (uv - 0.5) * 2.0;
  p.x *= aspect;
  float jitter = (noise2(vec2(uTime * 6.0, 0.5)) - 0.5) * uP[7] * 0.012;
  p += jitter;
  float r = length(p);
  float a = atan(p.y, p.x) / TAU + 0.5;
  float t = uTime * uP[5];
  vec3 col = uBackground.rgb * 0.30;
  float ink = 0.0;

  for (int i = 0; i < 6; i++){
    float fi = float(i);
    if (fi >= uP[1]) break;
    float rr = uP[0] * (0.30 + fi * 0.17);
    float gate = step(0.18, hash11(fi + 2.0));
    float ring = smoothstep(0.0055, 0.0, abs(r - rr)) * gate;
    col += paletteRgb(uP[4] + fi * 0.10) * ring * 0.8;
    ink += ring;
  }

  float n = max(8.0, uP[2]);
  float tickR = uP[0] * 1.05;
  float tickPhase = a * n + t;
  float tf = abs(fract(tickPhase) - 0.5);
  float inR = step(tickR, r) * step(r, tickR + 0.018 + 0.028 * step(0.55, hash11(floor(tickPhase))));
  float ticks = inR * smoothstep(0.5, 0.40, tf);
  col += uColorD.rgb * ticks * 0.8;
  ink += ticks;

  float arcR = uP[0] * 0.76 + spectrumAt(a) * 0.10;
  float arc = smoothstep(0.007, 0.0, abs(r - arcR)) * uP[6];
  col += mix(uColorA.rgb, uColorD.rgb, spectrumAt(a)) * arc * 1.5;
  ink += arc;

  float sweep = pow(fract(a - uTime * 0.12), 12.0) * smoothstep(uP[0] * 1.05, 0.0, r);
  col += paletteRgb(uP[4] + 0.4) * sweep * uP[3] * 0.6;

  float cross = smoothstep(0.0022, 0.0, abs(p.x)) * smoothstep(0.6, 0.35, abs(p.y)) +
                smoothstep(0.0022, 0.0, abs(p.y)) * smoothstep(0.85, 0.4, abs(p.x));
  col += uColorD.rgb * cross * 0.30;

  float boxD = abs(max(abs(p.x), abs(p.y)) - uP[0] * 0.98);
  col += paletteRgb(uP[4] + 0.2) * smoothstep(0.004, 0.0, boxD) * 0.45;

  float dot1 = smoothstep(0.010, 0.0, abs(r - tickR - 0.06)) *
               step(0.82, hash12(floor(vec2(a * 48.0, r * 60.0))));
  col += mix(uColorC.rgb, vec3(1.0), 0.4) * dot1 * 0.9;

  col *= 0.8 + uRms * 0.6;
  float alpha = clamp(ink * 1.4 + arc + sweep * uP[3] + cross * 0.3 + dot1, 0.0, 1.0);
  fragColor = vec4(tonemap(col), alpha);
}`,
};

const pixelWave: TemplateDef = {
  id: 'electronic.pixelWave',
  name: 'Pixel Wave',
  category: 'electronic',
  description: 'A chunky LED matrix wave with quantised bars, chromatic edge ghosts and hard scanlines.',
  tags: ['led', 'pixel', 'matrix', 'wave', 'retro'],
  palette: palette('ice'),
  composite: 'normal',
  params: [
    f('pixels', 'Pixel Rows', 54, 12, 160, 1, 'Layout'),
    f('gain', 'Wave Gain', 1, 0, 2, 0.01, 'Shape'),
    f('split', 'Chromatic Split', 1, 0, 3, 0.01, 'Style'),
    f('hue', 'Hue Shift', 0, 0, 1, 0.001, 'Color'),
    f('speed', 'Scroll Speed', 0.35, -2, 2, 0.01, 'Motion'),
    f('edge', 'Edge Glow', 1, 0, 3, 0.01, 'Style'),
    f('brightness', 'Brightness', 1, 0.2, 2.5, 0.01, 'Style'),
    f('scanlines', 'Scanlines', 0.5, 0, 1, 0.01, 'Style'),
  ],
  frag: /* glsl */ `
void mainImage(out vec4 fragColor, in vec2 fragCoord){
  vec2 uv = uv01(fragCoord);
  float aspect = uResolution.x / uResolution.y;
  float px = max(12.0, uP[0]);
  vec2 cellSize = vec2(1.0 / (px * aspect), 1.0 / px);
  vec2 q = floor(uv / cellSize) * cellSize;
  float x = q.x;
  float spec = pow(clamp(spectrumAt(fract(x)), 0.0, 1.0), 1.25);
  float w = waveAt(fract(x * 1.6 + uTime * uP[4] * 0.1));
  float h = 0.42 + (w * 0.16 + spec * 0.30) * uP[1];
  float body = step(q.y, h);
  float edge = body * step(h - cellSize.y, q.y);

  vec3 c = paletteRgb(uP[3] + q.y * 0.9 + x * 0.15);
  vec3 col = uBackground.rgb * 0.65;
  col += mix(c, paletteRgb(uP[3] + 0.5), q.y) * body * 0.85 * uP[6];
  col += mix(c, vec3(1.0), 0.65) * edge * uP[5] * 1.5;

  // Chromatic ghosting: shift the spectrum left and right per channel.
  float split = uP[2] * 0.02;
  float edgeL = step(q.y, 0.42 + (pow(clamp(spectrumAt(fract(x - split)), 0.0, 1.0), 1.25) * 0.30 + w * 0.16) * uP[1]);
  float edgeR = step(q.y, 0.42 + (pow(clamp(spectrumAt(fract(x + split)), 0.0, 1.0), 1.25) * 0.30 + w * 0.16) * uP[1]);
  col.r += edgeL * uP[2] * 0.20;
  col.b += edgeR * uP[2] * 0.20;

  col *= 1.0 - uP[7] * 0.20 * step(0.5, fract(uv.y * px * 0.5));
  col *= 0.85 + uKick * 0.45;
  fragColor = vec4(tonemap(col), 1.0);
}`,
};

const templates: TemplateDef[] = [
  neonGrid,
  circuitPulse,
  cyberTunnel,
  dataStream,
  hudReticle,
  pixelWave,
];

registerTemplates(templates);

export default templates;
