/**
 * Miscellaneous templates.
 *
 * The grab bag: classic plasma, warp tunnels, kaleidoscopic blooms, moire
 * interference, parallax starfields and liquid metal. They share nothing but a
 * taste for full-frame procedural motion, so each one stays usable as a single
 * background layer or as a bed under other compositions.
 */

import { registerTemplates } from './registry';
import { f, i, palette } from './helpers';
import type { TemplateDef } from '@/types';

const plasmaField: TemplateDef = {
  id: 'misc.plasmaField',
  name: 'Plasma Field',
  category: 'misc',
  description: 'The classic sum-of-sines plasma, warped by fbm and coloured with slow palette drift.',
  tags: ['plasma', 'classic', 'generative', 'smooth', 'retro'],
  palette: palette('sunset'),
  composite: 'normal',
  params: [
    f('scale', 'Scale', 2.2, 0.4, 6, 0.01, 'Layout'),
    f('speed', 'Speed', 0.5, 0, 3, 0.01, 'Motion'),
    f('warp', 'Noise Warp', 0.6, 0, 2, 0.01, 'Shape'),
    f('hue', 'Hue Shift', 0, 0, 1, 0.001, 'Color'),
    f('glow', 'Glow', 1, 0, 3, 0.01, 'Style'),
    f('bands', 'Banding', 6, 1, 20, 0.1, 'Style'),
    f('contrast', 'Contrast', 0.5, 0, 1, 0.01, 'Style'),
    f('reactivity', 'Audio Boost', 1, 0, 2, 0.01, 'Style'),
  ],
  frag: /* glsl */ `
void mainImage(out vec4 fragColor, in vec2 fragCoord){
  vec2 uv = uv01(fragCoord);
  vec2 p = (uv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0) * uP[0];
  float t = uTime * uP[1];

  p += (vec2(noise2(p * 1.3 + t), noise2(p * 1.3 - t)) - 0.5) * uP[2] * 2.0;
  float v = sin(p.x * 1.7 + t);
  v += sin((p.y * 1.9 - t) * 1.3);
  v += sin(p.x * 2.4 + p.y * 1.6 + t * 0.7);
  v += sin(length(p * 2.2) * 1.8 - t * 0.9);
  v += sin(fbm2(p * 0.9 + vec2(t * 0.2, -t * 0.15)) * 5.0);
  v *= 0.2;

  float bands = sin(v * PI * uP[5] + uTime * 0.3);
  float glow = pow(clamp(1.0 - abs(v) * 1.4, 0.0, 1.0), 3.0) * uP[4];
  vec3 col = paletteRgb(uP[3] + v * 0.9 + uTime * 0.02);
  col = mix(col, vec3(1.0), pow(max(bands, 0.0), 6.0) * 0.35);
  col += paletteRgb(uP[3] + 0.45) * glow * 0.8 + paletteRgb(uP[3] + 0.2) * bands * 0.15;
  col *= 0.75 + uRms * 0.8 * uP[7] + uBass * 0.3 * uP[7];
  col = pow(max(col, 0.0), vec3(1.2 - uP[6] * 0.4));
  fragColor = vec4(tonemap(col), 1.0);
}`,
};

const warpTunnel: TemplateDef = {
  id: 'misc.warpTunnel',
  name: 'Warp Tunnel',
  category: 'misc',
  description: 'A star-streak jump through a twisting wormhole, with the centre flaring on kick drums.',
  tags: ['tunnel', 'warp', 'stars', 'space', 'hyperspace'],
  palette: palette('ultraviolet'),
  composite: 'normal',
  params: [
    f('speed', 'Warp Speed', 1.2, 0, 5, 0.01, 'Motion'),
    f('twist', 'Twist', 0.5, 0, 2, 0.01, 'Shape'),
    f('density', 'Star Density', 0.08, 0.005, 0.3, 0.001, 'Layout'),
    f('arms', 'Streak Arms', 14, 2, 40, 1, 'Shape'),
    f('hue', 'Hue Shift', 0, 0, 1, 0.001, 'Color'),
    f('glow', 'Glow', 1, 0, 3, 0.01, 'Style'),
    f('length', 'Streak Length', 0.5, 0.05, 1, 0.01, 'Style'),
    f('boost', 'Beat Boost', 1, 0, 2, 0.01, 'Style'),
  ],
  frag: /* glsl */ `
void mainImage(out vec4 fragColor, in vec2 fragCoord){
  vec2 uv = uv01(fragCoord);
  vec2 p = (uv - 0.5) * 2.0;
  p.x *= uResolution.x / uResolution.y;
  float r = length(p);
  float a = atan(p.y, p.x) / TAU + 0.5;

  float z = 1.0 / max(r, 0.05) * 0.6 + uTime * uP[0];
  vec2 cell = floor(vec2(a * uP[3] * 8.0 + z * uP[1], z * 2.0));
  float h = hash12(cell);
  float star = step(1.0 - uP[2], h);
  float streak = smoothstep(uP[6] * 0.5, 0.0, abs(fract(z * 2.0) - 0.5)) * star;
  float depthFade = smoothstep(0.0, 0.9, r);

  vec3 c = paletteRgb(uP[4] + h * 0.6 + z * 0.01);
  vec3 col = uBackground.rgb * 0.7;
  col += c * streak * depthFade * 1.6 * uP[5];

  float wall = pow(fract(a * 4.0 * uP[3] / 14.0 + uP[1] * z), 10.0);
  col += paletteRgb(uP[4] + 0.5) * wall * 0.15 * uP[5] * (0.4 + uBass);

  float core = exp(-r * 6.0) * (0.3 + uKick * 1.2 * uP[7]);
  col += mix(uColorD.rgb, vec3(1.0), 0.5) * core;

  col *= 0.8 + uRms * 0.7;
  col *= 1.0 - smoothstep(0.6, 1.4, r) * 0.6;
  fragColor = vec4(tonemap(col), 1.0);
}`,
};

const kaleidoBloom: TemplateDef = {
  id: 'misc.kaleidoBloom',
  name: 'Kaleido Bloom',
  category: 'misc',
  description: 'A mirrored fbm flower with rotating petals, glowing veins and a beat-pulsing core.',
  tags: ['kaleidoscope', 'symmetry', 'bloom', 'organic', 'generative'],
  palette: palette('neonPink'),
  composite: 'normal',
  params: [
    f('segments', 'Mirror Segments', 8, 2, 24, 1, 'Layout'),
    f('zoom', 'Zoom', 1, 0.2, 4, 0.01, 'Layout'),
    f('speed', 'Rotation', 0.5, -2, 2, 0.01, 'Motion'),
    f('hue', 'Hue Shift', 0, 0, 1, 0.001, 'Color'),
    f('petals', 'Petals', 6, 1, 16, 1, 'Shape'),
    f('glow', 'Glow', 1, 0, 3, 0.01, 'Style'),
    f('warp', 'Warp', 0.6, 0, 2, 0.01, 'Shape'),
    f('reactivity', 'Audio Boost', 1, 0, 2, 0.01, 'Style'),
  ],
  frag: /* glsl */ `
void mainImage(out vec4 fragColor, in vec2 fragCoord){
  vec2 p = uvAspect(fragCoord);
  float seg = max(2.0, uP[0]);
  float a = atan(p.y, p.x);
  float r = length(p);
  a = abs(mod(a, TAU / seg) - TAU / (seg * 2.0));

  vec2 q = vec2(cos(a), sin(a)) * r;
  q *= uP[1] * 3.0;
  q += vec2(uTime * uP[2] * 0.3, -uTime * uP[2] * 0.2);
  q += (vec2(noise2(q * 1.1 + uTime * 0.2), noise2(q * 1.1 - uTime * 0.2)) - 0.5) * uP[6];

  float n = fbm2(q * 2.0, 5);
  float petal = sin(n * PI * uP[4] + r * 8.0 - uTime * uP[2]);
  float v = n * 0.6 + petal * 0.25;

  vec3 c = paletteRgb(uP[3] + v + r * 0.3);
  float glow = pow(clamp(1.0 - abs(v), 0.0, 1.0), 2.0) * uP[5];
  vec3 col = c * (0.35 + v * 0.9) + c * glow;

  float spoke = smoothstep(0.02, 0.0, abs(fract(a / (TAU / seg) * 1.0) - 0.5)) * 0.1;
  col += paletteRgb(uP[3] + 0.5) * spoke;

  col += vec3(1.0) * exp(-r * 5.0) * (0.2 + uBeat * 0.8);
  col *= 0.7 + uRms * 0.7 * uP[7];
  fragColor = vec4(tonemap(col), 1.0);
}`,
};

const moireBands: TemplateDef = {
  id: 'misc.moireBands',
  name: 'Moire Bands',
  category: 'misc',
  description: 'Interfering wave gratings create shifting moire figures, with a slow palette drift and scanlines.',
  tags: ['moire', 'interference', 'optical', 'bands', 'minimal'],
  palette: palette('ice'),
  composite: 'normal',
  params: [
    f('frequency', 'Frequency', 1.4, 0.2, 5, 0.01, 'Shape'),
    i('gratingCount', 'Gratings', 4, 1, 5, 'Shape'),
    f('speed', 'Drift Speed', 0.4, 0, 2, 0.01, 'Motion'),
    f('hue', 'Hue Shift', 0, 0, 1, 0.001, 'Color'),
    f('intensity', 'Contrast', 1, 0, 2, 0.01, 'Style'),
    f('rings', 'Ring Glow', 0.8, 0, 3, 0.01, 'Style'),
    f('ringRadius', 'Ring Radius', 0.55, 0.1, 1.2, 0.01, 'Layout'),
    f('scanlines', 'Scanlines', 0.5, 0, 1, 0.01, 'Style'),
  ],
  frag: /* glsl */ `
void mainImage(out vec4 fragColor, in vec2 fragCoord){
  vec2 uv = uv01(fragCoord);
  vec2 p = (uv - 0.5) * 2.0;
  p.x *= uResolution.x / uResolution.y;
  float t = uTime * uP[2];
  float freq = uP[0] * 12.0;
  float m = 0.0;

  for (int i = 0; i < 5; i++){
    float fi = float(i);
    if (fi >= uP[1]) break;
    float ang = fi * 1.256 + t * (0.1 + fi * 0.03);
    vec2 d = vec2(cos(ang), sin(ang));
    m += sin(dot(p, d) * freq + fi * 1.7 + t * 0.6);
  }
  m /= max(1.0, uP[1]);

  float bands = smoothstep(0.0, 0.25, abs(m));
  float rings = smoothstep(0.03, 0.0, abs(length(p) - uP[6])) * uP[5];
  vec3 c = paletteRgb(uP[3] + m * 0.5 + length(p) * 0.2);
  vec3 col = mix(uBackground.rgb, c, bands * 0.85);
  col += c * rings;
  col *= 0.75 + uP[4] * 0.6;
  col += paletteRgb(uP[3] + 0.4) * exp(-length(p) * 5.0) * 0.15 * (0.3 + uBass);

  float scan = sin(uv.y * uResolution.y * 2.0 + uTime * 3.0) * 0.04 * uP[7];
  col += scan;
  fragColor = vec4(tonemap(col), 1.0);
}`,
};

const starfield: TemplateDef = {
  id: 'misc.starfield',
  name: 'Parallax Starfield',
  category: 'misc',
  description: 'Three drifting star layers that twinkle, plus a spectrum-driven warp halo around the centre.',
  tags: ['stars', 'space', 'parallax', 'twinkle', 'background'],
  palette: palette('ice'),
  composite: 'normal',
  params: [
    f('drift', 'Drift Speed', 0.4, 0, 3, 0.01, 'Motion'),
    i('layers', 'Layers', 3, 1, 3, 'Layout'),
    f('grid', 'Star Grid', 40, 8, 120, 1, 'Layout'),
    f('hue', 'Hue Shift', 0, 0, 1, 0.001, 'Color'),
    f('density', 'Density', 0.08, 0.005, 0.3, 0.001, 'Layout'),
    f('brightness', 'Brightness', 1, 0, 3, 0.01, 'Style'),
    f('size', 'Star Size', 0.5, 0, 1.5, 0.01, 'Shape'),
    f('warp', 'Warp Streaks', 1, 0, 3, 0.01, 'Style'),
  ],
  frag: /* glsl */ `
void mainImage(out vec4 fragColor, in vec2 fragCoord){
  vec2 uv = uv01(fragCoord);
  vec2 p = (uv - 0.5) * 2.0;
  p.x *= uResolution.x / uResolution.y;
  vec3 col = uBackground.rgb;

  for (int i = 0; i < 3; i++){
    float fi = float(i);
    if (fi >= uP[1]) break;
    vec2 q = p * (1.0 + fi * 1.6) + vec2(uTime * uP[0] * 0.02 * (fi + 1.0), 0.0);
    vec2 g = q * uP[2] * (1.0 + fi * 0.8);
    vec2 cell = floor(g);
    vec2 fc = fract(g) - 0.5;
    float h = hash12(cell + fi * 19.3);
    float star = smoothstep(0.14 + uP[6] * 0.2, 0.0, length(fc)) * step(1.0 - uP[4], h);
    star *= 0.6 + 0.4 * sin(uTime * (2.0 + h * 5.0) + h * 20.0);
    vec3 c = paletteRgb(uP[3] + h * 0.7);
    col += c * star * (0.6 + fi * 0.25) * uP[5];
  }

  float ang = atan(p.y, p.x) / TAU + 0.5;
  float rr = length(p);
  float streak = pow(clamp(spectrumAt(fract(ang)), 0.0, 1.0), 2.0) *
                 smoothstep(0.2, 1.2, rr) * uP[7];
  col += paletteRgb(uP[3] + 0.5) * streak * 0.25;
  col += vec3(1.0) * exp(-rr * 7.0) * (0.15 + uKick * 0.5);
  fragColor = vec4(tonemap(col), 1.0);
}`,
};

const liquidMetal: TemplateDef = {
  id: 'misc.liquidMetal',
  name: 'Liquid Metal',
  category: 'misc',
  description: 'Drifting metaballs fused with fbm, finished with a hard specular rim and a mirrored-black bed.',
  tags: ['liquid', 'metal', 'metaballs', 'chrome', 'organic'],
  palette: palette('monochrome'),
  composite: 'normal',
  params: [
    f('scale', 'Scale', 2.4, 0.5, 6, 0.01, 'Layout'),
    f('speed', 'Flow Speed', 0.6, 0, 3, 0.01, 'Motion'),
    f('blobs', 'Blob Frequency', 3, 0.5, 8, 0.01, 'Shape'),
    f('hue', 'Hue Shift', 0, 0, 1, 0.001, 'Color'),
    f('specular', 'Specular', 1, 0, 3, 0.01, 'Style'),
    f('rim', 'Rim Glow', 1, 0, 3, 0.01, 'Style'),
    f('threshold', 'Melt Threshold', 0.5, 0, 1, 0.01, 'Shape'),
    f('reactivity', 'Audio Boost', 1, 0, 2, 0.01, 'Style'),
  ],
  frag: /* glsl */ `
void mainImage(out vec4 fragColor, in vec2 fragCoord){
  vec2 uv = uv01(fragCoord);
  vec2 p = (uv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0) * uP[0];
  float t = uTime * uP[1];

  float v = 0.0;
  v += sin(length(p - vec2(sin(t * 0.6), cos(t * 0.4))) * uP[2] - t);
  v += sin(length(p - vec2(cos(t * 0.5), sin(t * 0.7))) * uP[2] * 1.3 + t * 0.7);
  v += sin(length(p - vec2(sin(t * 0.9 + 2.0), cos(t * 0.3))) * uP[2] * 0.8 - t * 0.5);
  v /= 3.0;

  float n = fbm2(p * 1.4 + vec2(t * 0.15, -t * 0.1));
  float field = v * 0.5 + n * 0.6;
  float liquid = smoothstep(uP[6] - 0.18, uP[6] + 0.18, field);
  float rim = smoothstep(0.08, 0.0, abs(field - uP[6]));

  vec3 c = paletteRgb(uP[3] + v * 0.8 + n * 0.4);
  vec3 col = uBackground.rgb * 0.5 + c * liquid * 0.9;
  col += mix(c, vec3(1.0), 0.6) * rim * uP[5] * 1.4;

  float spec = pow(max(0.0, 1.0 - abs(n - 0.5) * 6.0), 3.0) * uP[4];
  col += vec3(1.0) * spec * liquid;

  col *= 0.8 + uRms * 0.6 * uP[7];
  col = pow(max(col, 0.0), vec3(1.15));
  fragColor = vec4(tonemap(col), 1.0);
}`,
};

const templates: TemplateDef[] = [
  plasmaField,
  warpTunnel,
  kaleidoBloom,
  moireBands,
  starfield,
  liquidMetal,
];

registerTemplates(templates);

export default templates;
