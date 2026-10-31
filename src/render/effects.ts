/**
 * GPU post-processing effect library.
 *
 * Every effect is a fragment shader compiled with {@link EFFECT_PRELUDE}.
 * Effects with more than one pass receive `uPass` / `uPassInput` so separable
 * filters (bloom, motion blur) can be implemented properly rather than faked
 * with a single wide kernel.
 */

import type { EffectType } from '@/types';

export interface EffectParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  /** Index into the shader's uP[8] array. */
  slot: number;
}

export interface EffectDef {
  type: EffectType;
  label: string;
  category: 'Lighting' | 'Distortion' | 'Image' | 'Motion';
  description: string;
  params: EffectParamDef[];
  /** Number of sequential passes; > 1 disables the automatic source mix. */
  passes: number;
  usesPrev?: boolean;
  frag: string;
}

function p(
  slot: number,
  key: string,
  label: string,
  min: number,
  max: number,
  def: number,
  step = 0.01,
): EffectParamDef {
  return { slot, key, label, min, max, step, default: def };
}

export function defaultEffectParams(def: EffectDef): Record<string, number> {
  const out: Record<string, number> = {};
  for (const param of def.params) out[param.key] = param.default;
  return out;
}

/* ------------------------------------------------------------------ */
/* Shared GLSL snippets                                                */
/* ------------------------------------------------------------------ */

const GAUSS5 = `const float GW[5] = float[5](0.2270270270, 0.1945945946, 0.1216216216, 0.0540540541, 0.0162162162);`;


/* ------------------------------------------------------------------ */
/* Definitions                                                         */
/* ------------------------------------------------------------------ */

export const EFFECT_DEFS: EffectDef[] = [
  /* ---------------- Lighting ---------------- */
  {
    type: 'bloom',
    label: 'Bloom',
    category: 'Lighting',
    description: 'Threshold, blur and re-add highlights for a filmic glow.',
    passes: 4,
    params: [
      p(0, 'threshold', 'Threshold', 0, 1, 0.55),
      p(1, 'radius', 'Radius', 1, 8, 3.2),
      p(2, 'gain', 'Gain', 0, 4, 1.15),
      p(3, 'bloomMix', 'Mix', 0, 1, 0.85),
    ],
    frag: `
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec3 src = texture(uSource, uv).rgb;
  float threshold = uP[0];
  float radius = uP[1];
  float gain = uP[2];

  if (uPass == 0){
    vec3 c = texture(uPassInput, uv).rgb;
    float l = luma(c);
    vec3 bright = c * smoothstep(threshold, threshold + 0.25, l);
    outColor = vec4(bright * gain, 1.0);
    return;
  }
  if (uPass == 1 || uPass == 2){
    ${GAUSS5}
    vec2 dir = uPass == 1 ? vec2(uTexel.x * radius, 0.0) : vec2(0.0, uTexel.y * radius);
    vec3 acc = texture(uPassInput, uv).rgb * GW[0];
    for (int i = 1; i < 5; i++){
      acc += texture(uPassInput, uv + dir * float(i)).rgb * GW[i];
      acc += texture(uPassInput, uv - dir * float(i)).rgb * GW[i];
    }
    outColor = vec4(acc, 1.0);
    return;
  }
  // Composite
  vec3 bloom = texture(uPassInput, uv).rgb;
  vec3 outc = mix(src, src + bloom, clamp(uP[3], 0.0, 1.0));
  outColor = vec4(tonemap(outc), 1.0);
}`,
  },

  {
    type: 'glow',
    label: 'Glow',
    category: 'Lighting',
    description: 'Soft additive halo driven by the overall audio level.',
    passes: 1,
    params: [
      p(0, 'strength', 'Strength', 0, 2, 0.7),
      p(1, 'radius', 'Radius', 1, 12, 5),
      p(2, 'reactivity', 'Audio Reactive', 0, 1, 0.6),
    ],
    frag: `
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec3 c = texture(uSource, uv).rgb;
  vec3 acc = vec3(0.0);
  float total = 0.0;
  for (int i = 0; i < 16; i++){
    float a = float(i) * 2.399963;
    float r = uP[1] * uTexel.x * (0.35 + float(i) / 16.0);
    vec2 o = vec2(cos(a), sin(a)) * r;
    float w = 1.0 - float(i) / 17.0;
    acc += texture(uSource, uv + o).rgb * w;
    total += w;
  }
  acc /= total;
  float amt = uP[0] * mix(1.0, 0.35 + uRms * 2.0, clamp(uP[2], 0.0, 1.0));
  outColor = vec4(tonemap(c + acc * amt), 1.0);
}`,
  },

  {
    type: 'neon',
    label: 'Neon Edge',
    category: 'Lighting',
    description: 'Sobel edges tinted with a neon cyan/violet duotone.',
    passes: 1,
    params: [
      p(0, 'thickness', 'Thickness', 0.5, 4, 1.4),
      p(1, 'strength', 'Strength', 0, 3, 1.2),
      p(2, 'fill', 'Original Fill', 0, 1, 0.45),
    ],
    frag: `
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 e = uTexel * uP[0];
  vec3 c = texture(uSource, uv).rgb;
  float l = luma(c);
  float lx = luma(texture(uSource, uv + vec2(e.x, 0.0)).rgb) - luma(texture(uSource, uv - vec2(e.x, 0.0)).rgb);
  float ly = luma(texture(uSource, uv + vec2(0.0, e.y)).rgb) - luma(texture(uSource, uv - vec2(0.0, e.y)).rgb);
  float g = clamp(length(vec2(lx, ly)) * 3.5, 0.0, 2.0);
  vec3 neon = mix(vec3(0.13, 0.83, 0.93), vec3(0.55, 0.36, 0.96), clamp(l * 1.3, 0.0, 1.0));
  vec3 outc = c * uP[2] + neon * g * uP[1];
  outColor = vec4(tonemap(outc), 1.0);
}`,
  },

  {
    type: 'lensFlare',
    label: 'Lens Flare',
    category: 'Lighting',
    description: 'Ghost chain mirrored through the frame centre from bright spots.',
    passes: 1,
    params: [
      p(0, 'ghosts', 'Ghost Count', 2, 8, 5, 1),
      p(1, 'spacing', 'Spacing', 0.1, 1.2, 0.45),
      p(2, 'strength', 'Strength', 0, 2, 0.6),
      p(3, 'threshold', 'Threshold', 0.3, 1, 0.72),
    ],
    frag: `
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec3 c = texture(uSource, uv).rgb;
  vec2 centre = vec2(0.5);
  vec2 dir = uv - centre;
  vec3 acc = vec3(0.0);
  int ghosts = int(uP[0]);
  for (int i = 1; i <= 8; i++){
    if (i > ghosts) break;
    vec2 suv = centre - dir * (float(i) * uP[1]);
    vec3 s = texture(uSource, clamp(suv, 0.001, 0.999)).rgb;
    float l = luma(s);
    float mask = smoothstep(uP[3], 1.0, l);
    float falloff = 1.0 / (1.0 + float(i) * 0.9);
    vec3 tint = mix(vec3(1.0, 0.55, 0.25), vec3(0.35, 0.7, 1.0), fract(float(i) * 0.37));
    acc += s * mask * falloff * tint;
  }
  outColor = vec4(tonemap(c + acc * uP[2] * (0.6 + uBeat * 0.8)), 1.0);
}`,
  },

  {
    type: 'lightRays',
    label: 'Light Rays',
    category: 'Lighting',
    description: 'Radial god-ray streaks from the brightest region.',
    passes: 1,
    params: [
      p(0, 'decay', 'Decay', 0.85, 0.99, 0.945),
      p(1, 'density', 'Density', 0.3, 2, 0.85),
      p(2, 'strength', 'Strength', 0, 2.5, 0.9),
      p(3, 'threshold', 'Threshold', 0.2, 1, 0.58),
    ],
    frag: `
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec3 src = texture(uSource, uv).rgb;
  vec2 centre = vec2(0.5, 0.5 + sin(uTime * 0.13) * 0.05);
  vec2 delta = (uv - centre) * (uP[1] / 48.0);
  vec2 suv = uv;
  float illum = 1.0;
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 48; i++){
    suv -= delta;
    vec3 s = texture(uSource, clamp(suv, 0.0, 1.0)).rgb;
    float l = max(0.0, luma(s) - uP[3]);
    acc += s * l * illum;
    illum *= uP[0];
  }
  acc /= 48.0;
  outColor = vec4(tonemap(src + acc * uP[2] * 3.0), 1.0);
}`,
  },

  {
    type: 'volumetric',
    label: 'Volumetric Fog',
    category: 'Lighting',
    description: 'Layered noise fog that brightens with bass energy.',
    passes: 1,
    params: [
      p(0, 'density', 'Density', 0, 1.5, 0.55),
      p(1, 'speed', 'Speed', 0, 2, 0.28),
      p(2, 'scale', 'Scale', 0.5, 8, 2.6),
      p(3, 'reactivity', 'Bass Reactive', 0, 1, 0.75),
    ],
    frag: `
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec3 c = texture(uSource, uv).rgb;
  vec2 q = uv * uP[2];
  float n = fbm2(q + vec2(uTime * uP[1], uTime * uP[1] * 0.6));
  float n2 = fbm2(q * 1.9 - vec2(uTime * uP[1] * 0.7));
  float fog = smoothstep(0.35, 0.95, n * 0.65 + n2 * 0.5);
  float amt = uP[0] * mix(1.0, 0.25 + uBass * 2.2, clamp(uP[3], 0.0, 1.0));
  vec3 fogCol = vec3(0.55, 0.62, 0.78) * (0.35 + uRms);
  outColor = vec4(tonemap(c + fogCol * fog * amt), 1.0);
}`,
  },

  /* ---------------- Distortion ---------------- */
  {
    type: 'rgbSplit',
    label: 'RGB Split',
    category: 'Distortion',
    description: 'Chromatic aberration, optionally pushed by transients.',
    passes: 1,
    params: [
      p(0, 'amount', 'Amount', 0, 12, 2.4),
      p(1, 'angle', 'Angle', 0, 6.2832, 0),
      p(2, 'reactivity', 'Transient Push', 0, 1, 0.5),
      p(3, 'radial', 'Radial', 0, 1, 0),
    ],
    frag: `
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution;
  float amt = uP[0] * (1.0 + mix(0.0, uOnset * 14.0, clamp(uP[2], 0.0, 1.0)));
  vec2 dir = vec2(cos(uP[1]), sin(uP[1]));
  vec2 offset = mix(dir, normalize(uv - 0.5) * 1.4, clamp(uP[3], 0.0, 1.0)) * amt * uTexel.x;
  float r = texture(uSource, uv + offset).r;
  float g = texture(uSource, uv).g;
  float b = texture(uSource, uv - offset).b;
  outColor = vec4(r, g, b, 1.0);
}`,
  },

  {
    type: 'glitch',
    label: 'Glitch',
    category: 'Distortion',
    description: 'Block displacement, scan tearing and channel shuffle on onsets.',
    passes: 1,
    params: [
      p(0, 'amount', 'Amount', 0, 1, 0.4),
      p(1, 'blocks', 'Block Size', 4, 80, 24),
      p(2, 'reactivity', 'Onset Driven', 0, 1, 0.8),
      p(3, 'speed', 'Speed', 0, 12, 6),
    ],
    frag: `
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution;
  float amt = uP[0] * mix(1.0, uOnset * 3.5, clamp(uP[2], 0.0, 1.0));
  float t = floor(uTime * uP[3]);
  float blockY = floor(uv.y * uP[1]);
  float rnd = hash12(vec2(blockY, t));
  float shift = step(1.0 - amt, rnd) * (hash12(vec2(blockY, t + 7.0)) - 0.5) * amt * 0.5;
  vec2 suv = vec2(fract(uv.x + shift), uv.y);
  // Occasional hard tearing.
  if (hash12(vec2(t, 3.0)) > 1.0 - amt * 0.35){
    suv.x = fract(suv.x + (uv.y < fract(t * 0.37) ? amt * 0.2 : -amt * 0.12));
  }
  vec3 c = texture(uSource, clamp(suv, 0.0, 1.0)).rgb;
  float ch = hash12(vec2(t, 11.0));
  if (ch > 1.0 - amt * 0.6){
    c = c.gbr;
  }
  float scan = 0.92 + 0.08 * sin(uv.y * uResolution.y * 0.6 + uTime * 40.0);
  outColor = vec4(c * scan, 1.0);
}`,
  },

  {
    type: 'displacement',
    label: 'Displacement',
    category: 'Distortion',
    description: 'Noise-driven UV displacement, scaled by the audio envelope.',
    passes: 1,
    params: [
      p(0, 'amount', 'Amount', 0, 0.2, 0.03),
      p(1, 'scale', 'Noise Scale', 0.5, 16, 4),
      p(2, 'speed', 'Speed', 0, 3, 0.5),
      p(3, 'reactivity', 'Audio Reactive', 0, 1, 0.6),
    ],
    frag: `
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 q = uv * uP[1] + vec2(uTime * uP[2], uTime * uP[2] * 0.7);
  float n1 = fbm2(q);
  float n2 = fbm2(q + 5.2);
  vec2 o = (vec2(n1, n2) - 0.5) * 2.0 * uP[0] * mix(1.0, 0.3 + uRms * 3.0, clamp(uP[3], 0.0, 1.0));
  outColor = texture(uSource, clamp(uv + o, 0.0, 1.0));
}`,
  },

  {
    type: 'vhs',
    label: 'VHS',
    category: 'Distortion',
    description: 'Analogue tape: chroma bleed, jitter, dropout and line noise.',
    passes: 1,
    params: [
      p(0, 'warp', 'Warp', 0, 0.05, 0.012),
      p(1, 'chroma', 'Chroma Bleed', 0, 6, 2.2),
      p(2, 'noise', 'Noise', 0, 1, 0.35),
      p(3, 'dropout', 'Dropouts', 0, 1, 0.4),
    ],
    frag: `
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution;
  float jitter = sin(uv.y * 220.0 + uTime * 9.0) * uP[0];
  jitter += (hash12(vec2(uv.y * 90.0, floor(uTime * 24.0))) - 0.5) * uP[0] * 0.8;
  vec2 suv = vec2(fract(uv.x + jitter), uv.y);
  vec2 off = vec2(uP[1] * uTexel.x, 0.0);
  vec3 c;
  c.r = texture(uSource, suv + off).r;
  c.g = texture(uSource, suv).g;
  c.b = texture(uSource, suv - off).b;
  float n = hash12(uv * uResolution + uTime * 60.0);
  c += (n - 0.5) * uP[2] * 0.28;
  float band = step(1.0 - uP[3] * 0.35, hash12(vec2(floor(uv.y * 140.0), floor(uTime * 12.0))));
  c = mix(c, vec3(0.75), band * 0.55 * uP[3]);
  c *= 1.0 - 0.22 * smoothstep(0.4, 1.0, abs(uv.x - 0.5) * 2.0);
  outColor = vec4(max(c, 0.0), 1.0);
}`,
  },

  {
    type: 'pixelSort',
    label: 'Pixel Sort',
    category: 'Distortion',
    description: 'Sorts horizontal pixel runs by luminance above a threshold.',
    passes: 1,
    params: [
      p(0, 'threshold', 'Threshold', 0, 1, 0.45),
      p(1, 'length', 'Max Run', 4, 128, 48, 1),
      p(2, 'direction', 'Vertical', 0, 1, 0, 1),
      p(3, 'reactivity', 'Audio Reactive', 0, 1, 0.5),
    ],
    frag: `
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 axis = uP[2] > 0.5 ? vec2(0.0, 1.0) : vec2(1.0, 0.0);
  float thresh = uP[0] * mix(1.0, 0.35 + uRms * 1.6, clamp(uP[3], 0.0, 1.0));
  int maxRun = int(uP[1]);
  vec3 best = texture(uSource, uv).rgb;
  float bestL = luma(best);
  int count = 0;
  for (int i = 1; i <= 128; i++){
    if (i > maxRun) break;
    vec2 p2 = uv + axis * uTexel.x * float(i) * (uP[2] > 0.5 ? 1.0 : 1.0);
    vec3 c = texture(uSource, clamp(p2, 0.0, 1.0)).rgb;
    float l = luma(c);
    if (l > thresh){ count++; if (l > bestL){ bestL = l; best = c; } }
    else break;
  }
  outColor = vec4(count > 0 ? best : texture(uSource, uv).rgb, 1.0);
}`,
  },

  {
    type: 'waveWarp',
    label: 'Wave Warp',
    category: 'Distortion',
    description: 'Sine ripple with amplitude tied to the bass band.',
    passes: 1,
    params: [
      p(0, 'amplitude', 'Amplitude', 0, 0.08, 0.014),
      p(1, 'frequency', 'Frequency', 1, 40, 9),
      p(2, 'speed', 'Speed', 0, 6, 1.4),
      p(3, 'radial', 'Radial', 0, 1, 0),
    ],
    frag: `
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution;
  float amp = uP[0] * (0.5 + uBass * 2.2);
  float ph = uTime * uP[2];
  vec2 o;
  if (uP[3] > 0.5){
    float r = length(uv - 0.5) * uP[1];
    o = normalize(uv - 0.5 + 1e-5) * sin(r - ph) * amp;
  } else {
    o = vec2(sin(uv.y * uP[1] + ph), sin(uv.x * uP[1] * 1.3 - ph)) * amp;
  }
  outColor = texture(uSource, clamp(uv + o, 0.0, 1.0));
}`,
  },

  {
    type: 'datamosh',
    label: 'Datamosh',
    category: 'Distortion',
    description: 'Motion-vector smearing that drags previous frames into the current one.',
    passes: 1,
    usesPrev: true,
    params: [
      p(0, 'amount', 'Moshing', 0, 1, 0.42),
      p(1, 'threshold', 'Motion Threshold', 0, 0.6, 0.08),
      p(2, 'drag', 'Drag', 0, 1, 0.7),
      p(3, 'reactivity', 'Beat Driven', 0, 1, 0.55),
    ],
    frag: `
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec3 cur = texture(uSource, uv).rgb;
  if (uHasPrev < 0.5){ outColor = vec4(cur, 1.0); return; }
  vec3 prev = texture(uPrev, uv).rgb;
  float diff = length(cur - prev);
  float amt = uP[0] * mix(1.0, 0.2 + uBeat * 1.6, clamp(uP[3], 0.0, 1.0));
  float mask = smoothstep(uP[1], uP[1] + 0.25, diff);
  vec3 moshed = mix(cur, prev, mask * amt * uP[2]);
  // Pull a displaced sample from the previous frame to fake motion vectors.
  vec2 mv = vec2(hash12(uv * 40.0) - 0.5, hash12(uv * 40.0 + 3.0) - 0.5);
  vec3 pulled = texture(uPrev, clamp(uv + mv * amt * 0.06, 0.0, 1.0)).rgb;
  outColor = vec4(mix(moshed, pulled, mask * amt * 0.5), 1.0);
}`,
  },

  /* ---------------- Image ---------------- */
  {
    type: 'blur',
    label: 'Blur',
    category: 'Image',
    description: 'Separable gaussian blur, three passes for a wide kernel.',
    passes: 1,
    params: [
      p(0, 'radius', 'Radius', 0, 14, 3),
      p(1, 'quality', 'Taps', 4, 16, 9, 1),
    ],
    frag: `
void main(){
  ${GAUSS5}
  vec2 uv = gl_FragCoord.xy / uResolution;
  float radius = uP[0];
  if (radius < 0.01){ outColor = texture(uSource, uv); return; }
  int taps = int(clamp(uP[1], 4.0, 16.0));
  vec3 acc = texture(uSource, uv).rgb * 0.2270270270;
  float wsum = 0.2270270270;
  for (int i = 1; i < 16; i++){
    if (i >= taps) break;
    float fi = float(i);
    float w = exp(-fi * fi / (2.0 * float(taps) * 0.35 + 1.0));
    vec2 o = vec2(fi * radius * uTexel.x, fi * radius * uTexel.y * 0.55);
    acc += texture(uSource, uv + o).rgb * w;
    acc += texture(uSource, uv - o).rgb * w;
    wsum += w * 2.0;
  }
  outColor = vec4(acc / wsum, 1.0);
}`,
  },

  {
    type: 'sharpen',
    label: 'Sharpen',
    category: 'Image',
    description: 'Unsharp mask with a controllable amount.',
    passes: 1,
    params: [p(0, 'amount', 'Amount', 0, 3, 1.1), p(1, 'radius', 'Radius', 0.5, 6, 1.2)],
    frag: `
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec3 c = texture(uSource, uv).rgb;
  vec2 o = uTexel * uP[1];
  vec3 b = (texture(uSource, uv + vec2(o.x, 0.0)).rgb + texture(uSource, uv - vec2(o.x, 0.0)).rgb +
            texture(uSource, uv + vec2(0.0, o.y)).rgb + texture(uSource, uv - vec2(0.0, o.y)).rgb) * 0.25;
  outColor = vec4(clamp(c + (c - b) * uP[0], 0.0, 1.0), 1.0);
}`,
  },

  {
    type: 'edgeDetect',
    label: 'Edge Detect',
    category: 'Image',
    description: 'Sobel magnitude rendered over the source or standalone.',
    passes: 1,
    params: [p(0, 'thickness', 'Thickness', 0.5, 4, 1), p(1, 'mix', 'Overlay Mix', 0, 1, 0.75)],
    frag: `
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 e = uTexel * uP[0];
  float tl = luma(texture(uSource, uv + vec2(-e.x,  e.y)).rgb);
  float t  = luma(texture(uSource, uv + vec2( 0.0,  e.y)).rgb);
  float tr = luma(texture(uSource, uv + vec2( e.x,  e.y)).rgb);
  float l  = luma(texture(uSource, uv + vec2(-e.x,  0.0)).rgb);
  float r  = luma(texture(uSource, uv + vec2( e.x,  0.0)).rgb);
  float bl = luma(texture(uSource, uv + vec2(-e.x, -e.y)).rgb);
  float b  = luma(texture(uSource, uv + vec2( 0.0, -e.y)).rgb);
  float br = luma(texture(uSource, uv + vec2( e.x, -e.y)).rgb);
  float gx = -tl - 2.0*l - bl + tr + 2.0*r + br;
  float gy = -tl - 2.0*t - tr + bl + 2.0*b + br;
  float g = clamp(length(vec2(gx, gy)) * 1.6, 0.0, 1.0);
  vec3 src = texture(uSource, uv).rgb;
  outColor = vec4(mix(vec3(g), src, clamp(uP[1], 0.0, 1.0)), 1.0);
}`,
  },

  {
    type: 'colorGrade',
    label: 'Color Grade',
    category: 'Image',
    description: 'Lift/gamma/gain, saturation, contrast and temperature.',
    passes: 1,
    params: [
      p(0, 'exposure', 'Exposure', -2, 2, 0),
      p(1, 'contrast', 'Contrast', 0.4, 2.4, 1.06),
      p(2, 'saturation', 'Saturation', 0, 2.5, 1.1),
      p(3, 'temperature', 'Temperature', -1, 1, 0),
      p(4, 'lift', 'Lift', -0.3, 0.3, 0),
      p(5, 'gamma', 'Gamma', 0.4, 2.2, 1),
    ],
    frag: `
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec3 c = texture(uSource, uv).rgb;
  c *= pow(2.0, uP[0]);
  c += uP[4];
  c = pow(max(c, 0.0), vec3(1.0 / max(uP[5], 0.05)));
  c = (c - 0.5) * uP[1] + 0.5;
  float l = luma(c);
  c = mix(vec3(l), c, uP[2]);
  c.r += uP[3] * 0.08;
  c.b -= uP[3] * 0.08;
  outColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`,
  },

  {
    type: 'lut',
    label: 'LUT Grade',
    category: 'Image',
    description: '3D LUT lookup (flattened 2D strip) with an intensity blend.',
    passes: 1,
    params: [p(0, 'mix', 'Mix', 0, 1, 1), p(1, 'size', 'LUT Size', 2, 64, 16, 1)],
    frag: `
vec3 sampleLut(vec3 c){
  float size = uP[1];
  c = clamp(c, 0.0, 1.0);
  float blue = c.b * (size - 1.0);
  float b0 = floor(blue);
  float b1 = min(b0 + 1.0, size - 1.0);
  float fb = blue - b0;
  float tx = (b0 * size + c.r * (size - 1.0) + 0.5) / (size * size);
  float ty = (c.g * (size - 1.0) + 0.5) / size;
  float tx1 = (b1 * size + c.r * (size - 1.0) + 0.5) / (size * size);
  vec3 a = texture(uLut, vec2(tx, ty)).rgb;
  vec3 b = texture(uLut, vec2(tx1, ty)).rgb;
  return mix(a, b, fb);
}
vec3 sampleGrade(vec3 c){
  float l = luma(c);
  vec3 shadow = vec3(0.03, 0.06, 0.09);
  vec3 high = vec3(1.03, 0.99, 0.93);
  return clamp(mix(shadow * (1.0 - l) + c * l, c * high, l), 0.0, 1.0);
}
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec3 c = texture(uSource, uv).rgb;
  if (uHasLut < 0.5){
    // No LUT bound: apply a neutral teal/amber print emulation so the effect
    // still does something deterministic.
    outColor = vec4(sampleGrade(c), 1.0);
    return;
  }
  outColor = vec4(mix(c, sampleLut(c), clamp(uP[0], 0.0, 1.0)), 1.0);
}`,
  },

  {
    type: 'vignette',
    label: 'Vignette',
    category: 'Image',
    description: 'Radial darkening with aspect and softness control.',
    passes: 1,
    params: [
      p(0, 'amount', 'Amount', 0, 1.5, 0.55),
      p(1, 'softness', 'Softness', 0.05, 1.5, 0.5),
      p(2, 'roundness', 'Roundness', 0, 1, 0.6),
    ],
    frag: `
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec3 c = texture(uSource, uv).rgb;
  vec2 p = (uv - 0.5) * 2.0;
  p.x *= mix(1.0, uResolution.x / uResolution.y, uP[2]);
  float d = length(p);
  float v = smoothstep(1.0 + uP[1], 1.0 - uP[1], d);
  outColor = vec4(c * mix(1.0, v, clamp(uP[0], 0.0, 1.5)), 1.0);
}`,
  },

  {
    type: 'filmGrain',
    label: 'Film Grain',
    category: 'Image',
    description: 'Animated grain with a softness control and optional mono mode.',
    passes: 1,
    params: [
      p(0, 'amount', 'Amount', 0, 0.4, 0.08),
      p(1, 'size', 'Grain Size', 0.5, 4, 1.2),
      p(2, 'colored', 'Coloured', 0, 1, 0),
      p(3, 'reactivity', 'Audio Reactive', 0, 1, 0.3),
    ],
    frag: `
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec3 c = texture(uSource, uv).rgb;
  vec2 gp = floor(uv * uResolution / uP[1]);
  vec3 n = vec3(hash12(gp + uTime * 91.0), hash12(gp + uTime * 91.0 + 17.0), hash12(gp + uTime * 91.0 + 41.0));
  n = mix(vec3(n.x), n, clamp(uP[2], 0.0, 1.0));
  float amt = uP[0] * mix(1.0, 1.0 + uRms * 2.5, clamp(uP[3], 0.0, 1.0));
  outColor = vec4(clamp(c + (n - 0.5) * amt * 2.0, 0.0, 1.0), 1.0);
}`,
  },

  {
    type: 'scanlines',
    label: 'Scanlines',
    category: 'Image',
    description: 'CRT line darkening with rolling refresh bar.',
    passes: 1,
    params: [
      p(0, 'amount', 'Amount', 0, 1, 0.28),
      p(1, 'count', 'Line Count', 80, 1200, 420, 1),
      p(2, 'roll', 'Roll Speed', 0, 4, 0.5),
      p(3, 'flicker', 'Flicker', 0, 1, 0.2),
    ],
    frag: `
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec3 c = texture(uSource, uv).rgb;
  float lines = sin(uv.y * uP[1] * 3.14159) * 0.5 + 0.5;
  c *= 1.0 - uP[0] * lines;
  float bar = fract(uv.y - uTime * uP[2] * 0.1);
  c *= 1.0 + smoothstep(0.92, 1.0, bar) * 0.22;
  c *= 1.0 - uP[3] * hash12(vec2(floor(uTime * 30.0))) * 0.15;
  outColor = vec4(c, 1.0);
}`,
  },

  {
    type: 'halftone',
    label: 'Halftone',
    category: 'Image',
    description: 'Rotated dot screen with variable pitch.',
    passes: 1,
    params: [
      p(0, 'scale', 'Dot Pitch', 2, 30, 9),
      p(1, 'angle', 'Screen Angle', 0, 1.5708, 0.4),
      p(2, 'mix', 'Overlay Mix', 0, 1, 0.85),
      p(3, 'sharpen', 'Dot Sharpness', 0.2, 3, 1),
    ],
    frag: `
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec3 c = texture(uSource, uv).rgb;
  float l = luma(c);
  vec2 p = rot2(uP[1]) * uv * uResolution / uP[0];
  vec2 cell = fract(p) - 0.5;
  float d = length(cell) * 2.0;
  float radius = sqrt(clamp(1.0 - l, 0.0, 1.0));
  float dot = smoothstep(radius + 0.15 / uP[3], radius - 0.15 / uP[3], d);
  float inv = 1.0 - dot;
  // Preserve hue by tinting the dot with the source colour.
  vec3 ht = mix(vec3(0.0), max(c, vec3(0.15)), inv);
  outColor = vec4(mix(c, ht, clamp(uP[2], 0.0, 1.0)), 1.0);
}`,
  },

  /* ---------------- Motion ---------------- */
  {
    type: 'motionBlur',
    label: 'Motion Blur',
    category: 'Motion',
    description: 'Directional blur with an audio-driven streak length.',
    passes: 1,
    params: [
      p(0, 'amount', 'Amount', 0, 1, 0.3),
      p(1, 'angle', 'Angle', 0, 6.2832, 0),
      p(2, 'samples', 'Samples', 4, 24, 10, 1),
      p(3, 'reactivity', 'Audio Reactive', 0, 1, 0.5),
    ],
    frag: `
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution;
  int samples = int(clamp(uP[2], 4.0, 24.0));
  float amt = uP[0] * mix(1.0, 0.2 + uRms * 4.0, clamp(uP[3], 0.0, 1.0));
  vec2 dir = vec2(cos(uP[1]), sin(uP[1])) * amt * 0.09;
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 24; i++){
    if (i >= samples) break;
    float t = float(i) / float(samples - 1) - 0.5;
    acc += texture(uSource, clamp(uv + dir * t, 0.0, 1.0)).rgb;
  }
  outColor = vec4(acc / float(samples), 1.0);
}`,
  },

  {
    type: 'cameraShake',
    label: 'Camera Shake',
    category: 'Motion',
    description: 'Kick-triggered positional and rotational shake.',
    passes: 1,
    params: [
      p(0, 'amount', 'Amount', 0, 1, 0.35),
      p(1, 'speed', 'Speed', 1, 40, 18),
      p(2, 'rotation', 'Rotation', 0, 1, 0.3),
      p(3, 'reactivity', 'Kick Driven', 0, 1, 0.85),
    ],
    frag: `
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution;
  float drive = mix(1.0, 0.15 + uKick * 1.6 + uBeat * 0.5, clamp(uP[3], 0.0, 1.0));
  float t = floor(uTime * uP[1]);
  vec2 o = vec2(hash12(vec2(t, 1.0)), hash12(vec2(t, 2.0))) - 0.5;
  o *= uP[0] * drive * 0.12;
  float ang = (hash12(vec2(t, 3.0)) - 0.5) * uP[2] * drive * 0.12;
  vec2 p = rot2(ang) * (uv - 0.5) + 0.5;
  outColor = texture(uSource, clamp(p + o, 0.0, 1.0));
}`,
  },

  {
    type: 'zoomPulse',
    label: 'Zoom Pulse',
    category: 'Motion',
    description: 'Beat-synced punch-in with a controllable decay.',
    passes: 1,
    params: [
      p(0, 'amount', 'Amount', 0, 0.6, 0.14),
      p(1, 'decay', 'Decay', 1, 20, 7),
      p(2, 'bassMix', 'Bass Follow', 0, 1, 0.35),
      p(3, 'center', 'Center Offset', 0, 1, 0.5),
    ],
    frag: `
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution;
  float pulse = exp(-uBeatPhase * uP[1]);
  float z = 1.0 - (pulse * 0.85 + uBass * 0.6) * uP[0] * mix(1.0, 0.4, clamp(uP[2], 0.0, 1.0));
  z = max(z, 0.2);
  vec2 centre = vec2(mix(0.5, 0.5 + (hash12(vec2(uSeed)) - 0.5) * 0.3, 1.0 - clamp(uP[3], 0.0, 1.0)));
  vec2 p = centre + (uv - centre) * z;
  outColor = texture(uSource, clamp(p, 0.0, 1.0));
}`,
  },

  {
    type: 'feedback',
    label: 'Feedback Trails',
    category: 'Motion',
    description: 'Frame-blended feedback with zoom and rotation feedback loops.',
    passes: 1,
    usesPrev: true,
    params: [
      p(0, 'decay', 'Decay', 0, 0.99, 0.82),
      p(1, 'zoom', 'Zoom', 0.9, 1.1, 1.01),
      p(2, 'rotate', 'Rotate', -0.2, 0.2, 0.006),
      p(3, 'amount', 'Amount', 0, 1, 0.85),
    ],
    frag: `
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec3 cur = texture(uSource, uv).rgb;
  if (uHasPrev < 0.5){ outColor = vec4(cur, 1.0); return; }
  vec2 p = rot2(uP[2]) * (uv - 0.5) * uP[1] + 0.5;
  vec3 prev = texture(uPrev, clamp(p, 0.0, 1.0)).rgb;
  outColor = vec4(mix(cur, max(prev * uP[0], cur), clamp(uP[3], 0.0, 1.0)), 1.0);
}`,
  },

  {
    type: 'echo',
    label: 'Echo',
    category: 'Motion',
    description: 'Directional decaying repeats of the frame.',
    passes: 1,
    params: [
      p(0, 'count', 'Echoes', 1, 10, 4, 1),
      p(1, 'offset', 'Offset', 0, 0.35, 0.08),
      p(2, 'angle', 'Angle', 0, 6.2832, 0),
      p(3, 'decay', 'Decay', 0.2, 0.95, 0.62),
    ],
    frag: `
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 dir = vec2(cos(uP[2]), sin(uP[2])) * uP[1];
  vec3 acc = texture(uSource, uv).rgb;
  float w = 1.0;
  int count = int(uP[0]);
  for (int i = 1; i <= 10; i++){
    if (i > count) break;
    w *= uP[3];
    acc += texture(uSource, clamp(uv - dir * float(i), 0.0, 1.0)).rgb * w;
  }
  outColor = vec4(acc / (1.0 + uP[3]), 1.0);
}`,
  },

  {
    type: 'kaleidoscope',
    label: 'Kaleidoscope',
    category: 'Motion',
    description: 'Radial mirroring with a rotating segment count.',
    passes: 1,
    params: [
      p(0, 'segments', 'Segments', 2, 24, 6, 1),
      p(1, 'rotation', 'Rotation', 0, 6.2832, 0),
      p(2, 'zoom', 'Zoom', 0.3, 3, 1),
      p(3, 'spin', 'Spin Speed', -2, 2, 0.15),
    ],
    frag: `
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 p = (uv - 0.5) * 2.0;
  p.x *= uResolution.x / uResolution.y;
  float seg = max(2.0, uP[0]);
  float a = atan(p.y, p.x) + uP[1] + uTime * uP[3];
  float r = length(p) / max(uP[2], 0.01);
  float sector = TAU / seg;
  a = mod(a, sector);
  a = abs(a - sector * 0.5);
  vec2 q = vec2(cos(a), sin(a)) * r;
  q.x /= uResolution.x / uResolution.y;
  outColor = texture(uSource, clamp(q * 0.5 + 0.5, 0.0, 1.0));
}`,
  },

  {
    type: 'mirror',
    label: 'Mirror',
    category: 'Motion',
    description: 'Horizontal, vertical and quadrant mirroring.',
    passes: 1,
    params: [
      p(0, 'horizontal', 'Horizontal', 0, 1, 1, 1),
      p(1, 'vertical', 'Vertical', 0, 1, 0, 1),
      p(2, 'quadrant', 'Quadrant', 0, 1, 0, 1),
    ],
    frag: `
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 s = uv;
  if (uP[1] > 0.5) s.y = 1.0 - s.y;
  if (uP[0] > 0.5) s.x = s.x < 0.5 ? s.x : 1.0 - s.x;
  if (uP[2] > 0.5){ s.x = s.x < 0.5 ? s.x : 1.0 - s.x; s.y = s.y < 0.5 ? s.y : 1.0 - s.y; }
  outColor = texture(uSource, clamp(s, 0.0, 1.0));
}`,
  },
];

export const EFFECT_DEF_MAP: Record<string, EffectDef> = Object.fromEntries(
  EFFECT_DEFS.map((d) => [d.type, d]),
);

export const EFFECT_CATEGORIES = ['Lighting', 'Distortion', 'Image', 'Motion'] as const;
