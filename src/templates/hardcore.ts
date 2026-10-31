/**
 * Hardcore / rave / industrial templates.
 *
 * High-contrast strobes, hazard plating, reactor spikes and feedback smears.
 * Every preset is designed to survive a heavy effect chain: it already carries
 * its own hard edges, grain and kick-driven flashes, so the visuals stay legible
 * at rave brightness and speed.
 */

import { registerTemplates } from './registry';
import { f, i, palette } from './helpers';
import type { TemplateDef } from '@/types';

const strobeCuts: TemplateDef = {
  id: 'hardcore.strobeCuts',
  name: 'Strobe Cuts',
  category: 'hardcore',
  description: 'Harsh horizontal slices with spectral silhouettes, strobing on the kick and cut by grain.',
  tags: ['strobe', 'hardcore', 'slices', 'flash', 'industrial'],
  palette: palette('crimson'),
  composite: 'normal',
  params: [
    f('rate', 'Strobe Rate', 9, 0.5, 30, 0.1, 'Motion'),
    f('bands', 'Slice Count', 28, 4, 96, 1, 'Layout'),
    f('shift', 'Slice Shift', 0.08, 0, 0.4, 0.001, 'Shape'),
    f('hue', 'Hue Shift', 0, 0, 1, 0.001, 'Color'),
    f('invert', 'Invert', 0, 0, 1, 1, 'Style'),
    f('flash', 'Kick Flash', 0.8, 0, 2, 0.01, 'Style'),
    f('grain', 'Grain', 0.6, 0, 1, 0.01, 'Style'),
    f('contrast', 'Contrast', 0.45, 0, 1, 0.01, 'Style'),
  ],
  frag: /* glsl */ `
void mainImage(out vec4 fragColor, in vec2 fragCoord){
  vec2 uv = uv01(fragCoord);
  float t = uTime * uP[0];
  float bands = max(2.0, uP[1]);
  float row = floor(uv.y * bands);
  float seed = floor(t);
  float h = hash12(vec2(row, seed));
  float h2 = hash12(vec2(row + 11.0, seed));

  float shift = (h - 0.5) * uP[2];
  vec2 suv = vec2(fract(uv.x + shift + uTime * 0.02), uv.y);
  float spec = pow(clamp(spectrumAt(fract(suv.x)), 0.0, 1.0), 1.1);
  float w = waveAt(fract(suv.x * 1.3 + uTime * 0.05));
  float level = 0.62 - spec * 0.50 - abs(w) * 0.08;
  float lit = step(0.55, h) * step(level, fract(uv.y * bands));

  vec3 c = mix(paletteRgb(uP[3] + h * 0.5), uColorD.rgb, step(0.86, h2));
  vec3 col = uBackground.rgb;
  col += c * lit * 1.7;
  col += c * step(0.55, h) * 0.07;
  col *= mix(0.25, 1.0, step(0.08, fract(uv.y * bands)));

  col = mix(col, vec3(1.0) - col, uP[4]);

  float flash = pow(fract(uTime * uP[0] * 0.5), 24.0) * uP[5] * (0.35 + uKick);
  col += mix(vec3(1.0), paletteRgb(uP[3] + 0.4), 0.4) * flash;

  float grain = hash12(gl_FragCoord.xy + vec2(uTime * 37.0, uTime * 11.0));
  col += (grain - 0.5) * uP[6] * 0.35;

  col = pow(max(col, 0.0), vec3(0.6 + uP[7] * 1.4));
  fragColor = vec4(tonemap(col), 1.0);
}`,
};

const industrialGrate: TemplateDef = {
  id: 'hardcore.industrialGrate',
  name: 'Industrial Grate',
  category: 'hardcore',
  description: 'Riveted steel plates, brushed metal, hazard edging and a shockwave punched out by the kick.',
  tags: ['industrial', 'metal', 'rivets', 'hazard', 'brutal'],
  palette: palette('amber'),
  composite: 'normal',
  params: [
    f('scale', 'Plate Scale', 7, 2, 20, 0.1, 'Layout'),
    f('hazard', 'Hazard Frequency', 16, 2, 60, 0.1, 'Layout'),
    f('shock', 'Shockwave', 1, 0, 3, 0.01, 'Style'),
    f('glow', 'Lighting', 0.8, 0, 2, 0.01, 'Style'),
    f('hue', 'Hue Shift', 0, 0, 1, 0.001, 'Color'),
    f('metal', 'Metal Sheen', 0.7, 0, 1, 0.01, 'Style'),
    f('hazardAmount', 'Hazard Edging', 1, 0, 2, 0.01, 'Style'),
    f('rust', 'Grime', 0.6, 0, 1, 0.01, 'Style'),
  ],
  frag: /* glsl */ `
void mainImage(out vec4 fragColor, in vec2 fragCoord){
  vec2 uv = uv01(fragCoord);
  float aspect = uResolution.x / uResolution.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  vec2 g = p * uP[0];
  vec2 cell = floor(g);
  vec2 fc = fract(g);

  float brush = noise2(vec2(uv.x * 260.0, uv.y * 7.0)) * 0.6 +
                noise2(vec2(uv.x * 70.0, uv.y * 3.0)) * 0.4;
  vec3 metal = mix(uBackground.rgb, paletteRgb(uP[4] + 0.55), 0.18 + brush * 0.5);
  metal *= (0.45 + 0.55 * uP[5]) * (0.75 + 0.25 * uP[7]);

  float seamX = smoothstep(0.018, 0.0, min(fc.x, 1.0 - fc.x));
  float seamY = smoothstep(0.018, 0.0, min(fc.y, 1.0 - fc.y));
  metal *= 1.0 - clamp(seamX + seamY, 0.0, 1.0) * 0.55;

  float rivet = smoothstep(0.075, 0.05, length(fc - 0.5)) * step(0.72, hash12(cell));
  metal += mix(uColorD.rgb, vec3(1.0), 0.5) * rivet * 0.5;
  metal *= 1.0 - smoothstep(0.10, 0.04, length(fc - 0.5)) * 0.25;

  float hazard = step(0.5, fract((uv.x * 1.1 + uv.y * 1.4) * uP[1]));
  float edgeBand = 1.0 - smoothstep(0.0, 0.16, min(uv.y, 1.0 - uv.y));
  metal = mix(metal, mix(vec3(0.03), uColorC.rgb, hazard), edgeBand * uP[6] * 0.85);

  float d = length((uv - 0.5) * vec2(aspect, 1.0));
  float shockR = fract(uTime * 0.6);
  float shock = exp(-abs(d - shockR * 0.9) * 34.0) * uP[2] * (0.25 + uKick);
  metal += paletteRgb(uP[4] + 0.1) * shock * 1.1;
  metal += paletteRgb(uP[4] + 0.45) * exp(-d * 5.0) * 0.10 * uP[3] * (0.3 + uBass);

  metal *= 1.0 - smoothstep(0.55, 1.15, d) * 0.5;
  fragColor = vec4(tonemap(metal), 1.0);
}`,
};

const bassReactor: TemplateDef = {
  id: 'hardcore.bassReactor',
  name: 'Bass Reactor',
  category: 'hardcore',
  description: 'A nuclear core ringed by spectrum spikes, throwing shockwave rings and jagged arcs on every hit.',
  tags: ['reactor', 'spikes', 'bass', 'core', 'hardcore'],
  palette: palette('magma'),
  composite: 'add',
  params: [
    i('spokes', 'Spike Count', 96, 16, 240, 'Layout'),
    f('length', 'Spike Length', 0.5, 0.05, 1.2, 0.01, 'Shape'),
    f('reactivity', 'Reactivity', 1, 0, 2, 0.01, 'Style'),
    f('core', 'Core Radius', 0.22, 0.05, 0.5, 0.001, 'Layout'),
    f('hue', 'Hue Shift', 0, 0, 1, 0.001, 'Color'),
    f('rings', 'Shock Rings', 1, 0, 3, 0.01, 'Style'),
    f('chaos', 'Chaos', 0.5, 0, 1, 0.01, 'Shape'),
    f('flare', 'Snare Flare', 1, 0, 3, 0.01, 'Style'),
  ],
  frag: /* glsl */ `
void mainImage(out vec4 fragColor, in vec2 fragCoord){
  vec2 p = uvAspect(fragCoord);
  float a = atan(p.y, p.x) / TAU + 0.5;
  float r = length(p);
  float n = max(8.0, uP[0]);
  float idx = floor(a * n);
  float fa = fract(a * n);
  float h = hash11(idx * 3.17);
  float spec = pow(clamp(spectrumAt(fract(a)), 0.0, 1.0), 1.15);
  float len = uP[1] * (0.05 + spec * 0.95) * (0.7 + uP[2] * (0.4 + uRms));
  float width = 0.5 - 0.32 * uP[6];
  float spoke = step(0.18, h) * smoothstep(0.5, width, abs(fa - 0.5));
  float spike = spoke * step(uP[3], r) * step(r, uP[3] + len);

  vec3 c = paletteRgb(uP[4] + h * 0.55 + r * 0.25);
  vec3 col = uBackground.rgb * 0.55;
  col += c * spike * 1.7;

  float tip = spoke * smoothstep(0.02, 0.0, abs(r - (uP[3] + len)));
  col += mix(c, vec3(1.0), 0.7) * tip * 1.6;

  float core = smoothstep(uP[3] * 0.92, 0.0, r) * (0.25 + uKick * 1.1);
  col += mix(uColorD.rgb, c, 0.45) * core;

  for (int i = 0; i < 4; i++){
    float fi = float(i);
    float rr = uP[3] + fract(uTime * 0.35 + fi * 0.25) * 0.95;
    float ring = smoothstep(0.005, 0.0, abs(r - rr)) * exp(-fi * 0.45) * (0.3 + uBass * 1.2);
    col += c * ring * uP[5];
  }

  float arc = smoothstep(0.03, 0.0, abs(fract(a * 5.0 + uTime * 0.3 + h * 2.0) - 0.5)) *
              step(uP[3], r) * uP[6];
  col += paletteRgb(uP[4] + 0.5) * arc * 0.4;

  float flareRing = exp(-abs(r - uP[3] * 1.3) * 18.0) * (0.2 + uP[7] * uSnare);
  col += mix(uColorC.rgb, vec3(1.0), 0.3) * flareRing * 0.7;

  col *= 1.0 - smoothstep(0.6, 1.2, r) * 0.4;
  fragColor = vec4(tonemap(col), 1.0);
}`,
};

const feedbackSmear: TemplateDef = {
  id: 'hardcore.feedbackSmear',
  name: 'Feedback Smear',
  category: 'hardcore',
  description: 'A zooming, rotating feedback loop of spectral shards that smears into chrome streaks.',
  tags: ['feedback', 'smear', 'trails', 'hardcore', 'rave'],
  palette: palette('crimson'),
  composite: 'normal',
  usesFeedback: true,
  params: [
    f('zoom', 'Feedback Zoom', 0.95, 0.7, 1.4, 0.001, 'Motion'),
    f('rotation', 'Rotation', 0.15, -1, 1, 0.001, 'Motion'),
    f('decay', 'Trail Decay', 0.9, 0.2, 1, 0.01, 'Style'),
    i('bands', 'Shard Bands', 18, 4, 64, 'Layout'),
    f('hue', 'Hue Shift', 0, 0, 1, 0.001, 'Color'),
    f('blur', 'Smear Blur', 1, 0, 3, 0.01, 'Style'),
    f('flash', 'Flash', 0.8, 0, 2, 0.01, 'Style'),
    f('boost', 'Exposure', 0.3, 0, 1, 0.01, 'Style'),
  ],
  frag: /* glsl */ `
void mainImage(out vec4 fragColor, in vec2 fragCoord){
  vec2 uv = uv01(fragCoord);
  vec2 p = uv - 0.5;
  p.x *= uResolution.x / uResolution.y;
  p = rot2(uTime * uP[1]) * p;
  vec2 prevUv = p / max(0.2, uP[0]) + 0.5;

  vec3 prev = vec3(0.0);
  if (uHasPrev > 0.5){
    float o = uP[5] * 0.006;
    prev = texture(uPrev, prevUv).rgb;
    prev += texture(uPrev, prevUv + vec2(o, 0.0)).rgb;
    prev += texture(uPrev, prevUv - vec2(0.0, o)).rgb;
    prev /= 3.0;
    prev *= uP[2];
  }

  float bands = max(2.0, uP[3]);
  float row = floor(uv.y * bands);
  float h = hash12(vec2(row, floor(uTime * 7.0)));
  float spec = pow(clamp(spectrumAt(fract(uv.y * 0.7 + uv.x * 0.3)), 0.0, 1.0), 1.25);
  float mask = step(fract(uv.y * bands), spec);
  float shard = step(0.5, h) * mask;
  vec3 src = paletteRgb(uP[4] + h * 0.6 + uv.x * 0.2) * shard * 1.4;

  vec3 col = max(src, prev) + prev * 0.4;
  float flash = pow(clamp(1.0 - fract(uTime * 0.4), 0.0, 1.0), 16.0) * uP[6] * (0.4 + uKick);
  col += mix(vec3(1.0), paletteRgb(uP[4] + 0.4), 0.35) * flash;
  col *= 1.0 + uP[7] * 0.25;
  col = pow(max(col, 0.0), vec3(1.1));
  fragColor = vec4(tonemap(col), 1.0);
}`,
};

const hazardBars: TemplateDef = {
  id: 'hardcore.hazardBars',
  name: 'Hazard Bars',
  category: 'hardcore',
  description: 'Barber-pole warning stripes sliced by beat-synced glitch rows, with a hard strobe on the kick.',
  tags: ['hazard', 'warning', 'stripes', 'glitch', 'rave'],
  palette: palette('amber'),
  composite: 'normal',
  params: [
    i('rows', 'Glitch Rows', 24, 4, 80, 'Layout'),
    f('rate', 'Glitch Rate', 8, 0.5, 30, 0.1, 'Motion'),
    f('shift', 'Row Shift', 0.06, 0, 0.4, 0.001, 'Shape'),
    f('stripes', 'Stripe Frequency', 22, 2, 90, 0.1, 'Shape'),
    f('hue', 'Hue Shift', 0, 0, 1, 0.001, 'Color'),
    f('colorize', 'Palette Mix', 0.6, 0, 1, 0.01, 'Color'),
    f('flash', 'Kick Flash', 0.9, 0, 2, 0.01, 'Style'),
    f('glitch', 'Glitch Amount', 0.5, 0, 1, 0.01, 'Style'),
  ],
  frag: /* glsl */ `
void mainImage(out vec4 fragColor, in vec2 fragCoord){
  vec2 uv = uv01(fragCoord);
  float rows = max(2.0, uP[0]);
  float row = floor(uv.y * rows);
  float h = hash12(vec2(row, floor(uTime * uP[1])));
  float shift = (h - 0.5) * uP[2] * step(0.55, h);
  vec2 q = vec2(fract(uv.x + shift), uv.y);

  float stripes = step(0.5, fract((q.x * 1.4 + q.y * 2.2) * uP[3] + h));
  vec3 warnA = vec3(0.98, 0.72, 0.04);
  vec3 warnB = vec3(0.03, 0.03, 0.035);
  vec3 c = mix(warnB, warnA, stripes);

  float spec = pow(clamp(spectrumAt(fract(q.x)), 0.0, 1.0), 1.1);
  float lit = smoothstep(0.55, 0.45, abs(q.y - 0.5) - spec * 0.45);
  c *= 0.35 + lit * 0.9;
  c *= mix(vec3(1.0), paletteRgb(uP[4] + q.y * 0.5), uP[5]);

  float flash = pow(max(0.0, 1.0 - fract(uTime * 2.0)), 18.0) * uP[6] * (0.3 + uKick);
  c += vec3(0.9, 0.95, 1.0) * flash;

  float gl = step(0.98, hash12(vec2(row, floor(uTime * 14.0))));
  c = mix(c, paletteRgb(uP[4] + 0.5), gl * uP[7] * 0.5);

  fragColor = vec4(tonemap(c * 1.3), 1.0);
}`,
};

const distortionWall: TemplateDef = {
  id: 'hardcore.distortionWall',
  name: 'Distortion Wall',
  category: 'hardcore',
  description: 'Stacked waveform traces torn into rows of jagged, glitching bars that flare with the kick.',
  tags: ['distortion', 'waveform', 'wall', 'glitch', 'hardcore'],
  palette: palette('crimson'),
  composite: 'normal',
  params: [
    i('rows', 'Row Count', 22, 4, 70, 'Layout'),
    f('amplitude', 'Amplitude', 0.5, 0, 1.2, 0.01, 'Shape'),
    f('thickness', 'Trace Width', 0.006, 0.001, 0.03, 0.001, 'Style'),
    f('hue', 'Hue Shift', 0, 0, 1, 0.001, 'Color'),
    f('speed', 'Scroll Speed', 1, 0, 4, 0.01, 'Motion'),
    f('tear', 'Row Tear', 0.3, 0, 1, 0.01, 'Shape'),
    f('flash', 'Kick Flare', 0.8, 0, 2, 0.01, 'Style'),
    f('crush', 'Scan Crush', 0.4, 0, 1, 0.01, 'Style'),
  ],
  frag: /* glsl */ `
void mainImage(out vec4 fragColor, in vec2 fragCoord){
  vec2 uv = uv01(fragCoord);
  float rows = max(4.0, uP[0]);
  float ry = floor(uv.y * rows);
  float fy = fract(uv.y * rows);
  float h = hash12(vec2(ry, 1.7));
  float off = (hash12(vec2(ry, floor(uTime * 6.0))) - 0.5) * uP[5] * step(0.7, h);

  float w = waveAt(fract(uv.x * 1.5 + off + uTime * uP[4] * 0.1));
  float spec = pow(clamp(spectrumAt(fract(uv.x)), 0.0, 1.0), 1.2);
  float amp = uP[1] * (0.4 + spec * 0.9);
  float y = 0.5 + w * amp * 0.5;
  float line = smoothstep(uP[2], 0.0, abs(fy - y * 0.9 - 0.05));

  vec3 c = paletteRgb(uP[3] + ry / rows * 0.6 + uv.x * 0.2);
  vec3 col = uBackground.rgb * 0.7;
  col += c * line * 1.8;

  float fill = step(fy, y * 0.9 + 0.05) * step(0.35, h);
  col += c * fill * 0.12;

  col *= 1.0 - uP[7] * 0.25 * step(0.85, fract(uv.y * 90.0));
  col += c * uKick * uP[6] * 0.6;
  fragColor = vec4(tonemap(col), 1.0);
}`,
};

const templates: TemplateDef[] = [
  strobeCuts,
  industrialGrate,
  bassReactor,
  feedbackSmear,
  hazardBars,
  distortionWall,
];

registerTemplates(templates);

export default templates;
