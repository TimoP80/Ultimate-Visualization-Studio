/**
 * Shared GLSL ES 3.00 prelude.
 *
 * Every template and effect shader is compiled as:
 *
 *     <prelude>            <- this file (uniforms + math helpers)
 *     <author source>      <- defines mainImage() and any extra functions
 *     <entry point>        <- provided by the renderer
 *
 * Keeping the uniform block identical everywhere means templates are fully
 * interchangeable, and the Shader Studio can compile user code with the exact
 * same environment the built-in templates use.
 */

export const SCENE_PRELUDE = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

/* ---- resolution & time ------------------------------------------------ */
uniform vec2  uResolution;   // render target size in pixels
uniform float uTime;         // timeline seconds
uniform float uFrame;        // frame index since start of render
uniform vec2  uMouse;        // normalised 0..1
uniform float uSeed;         // per-layer random seed
uniform float uTexel;        // 1.0 / uResolution.x

/* ---- audio scalar features -------------------------------------------- */
uniform float uRms;
uniform float uPeak;
uniform float uEnergy;
uniform float uSubBass;
uniform float uBass;
uniform float uLowMid;
uniform float uMid;
uniform float uHighMid;
uniform float uTreble;
uniform float uAir;
uniform float uCentroid;
uniform float uFlux;
uniform float uBpm;
uniform float uBeat;         // 1 on beat, decays
uniform float uBeatPhase;    // 0..1 ramp since last beat
uniform float uBar;          // 0..1 position inside a 4-beat bar
uniform float uKick;
uniform float uSnare;
uniform float uOnset;
uniform float uSilence;

/* ---- audio bands & buffers -------------------------------------------- */
uniform float uBands[16];
uniform sampler2D uSpectrum;   // 512x1, R = magnitude 0..1
uniform sampler2D uWaveform;   // 1024x1, R = signed sample * 0.5 + 0.5

/* ---- palette ----------------------------------------------------------- */
uniform vec4 uColorA;
uniform vec4 uColorB;
uniform vec4 uColorC;
uniform vec4 uColorD;
uniform vec4 uBackground;

/* ---- per-layer parameters --------------------------------------------- */
uniform float uP[8];

/* ---- optional inputs --------------------------------------------------- */
uniform sampler2D uPrev;     // previous composed frame
uniform float uHasPrev;
uniform sampler2D uTex0;     // image / video / logo layer
uniform float uHasTex0;

/* ======================================================================= */
/* Math helpers                                                            */
/* ======================================================================= */

const float PI  = 3.14159265359;
const float TAU = 6.28318530718;

mat2 rot2(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

float hash11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float hash21(vec2 p){ return hash12(p); }
float hash31(vec3 p){ return hash13(p); }

vec2 hash22(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

vec3 hash33(vec3 p){
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

float valueNoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float noise2(vec2 p){ return valueNoise(p); }

float fbm2(vec2 p, int octaves){
  float v = 0.0, amp = 0.5;
  mat2 m = rot2(0.5);
  for (int i = 0; i < 8; i++){
    if (i >= octaves) break;
    v += amp * valueNoise(p);
    p = m * p * 2.02;
    amp *= 0.5;
  }
  return v;
}

float fbm2(vec2 p){ return fbm2(p, 5); }

float simplexish(vec3 p){
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i);
  float n100 = hash13(i + vec3(1,0,0));
  float n010 = hash13(i + vec3(0,1,0));
  float n110 = hash13(i + vec3(1,1,0));
  float n001 = hash13(i + vec3(0,0,1));
  float n101 = hash13(i + vec3(1,0,1));
  float n011 = hash13(i + vec3(0,1,1));
  float n111 = hash13(i + vec3(1,1,1));
  return mix(mix(mix(n000,n100,f.x), mix(n010,n110,f.x), f.y),
             mix(mix(n001,n101,f.x), mix(n011,n111,f.x), f.y), f.z);
}

float sdCircle(vec2 p, float r){ return length(p) - r; }
float sdBox(vec2 p, vec2 b){ vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
float sdSegment(vec2 p, vec2 a, vec2 b){
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

/* ======================================================================= */
/* Audio accessors                                                         */
/* ======================================================================= */

/* Spectrum sample at a normalised position, 0 = 20 Hz, 1 = 20 kHz. */
float spectrumAt(float x){
  return texture(uSpectrum, vec2(clamp(x, 0.0, 1.0), 0.5)).r;
}

/* 16 log band accessor, index 0..15. */
float bandAt(float i){
  int idx = int(clamp(i, 0.0, 15.0));
  float v = 0.0;
  for (int k = 0; k < 16; k++){ if (k == idx) v = uBands[k]; }
  return v;
}

/* Linear blend across the 16 bands for smooth bar heights. */
float bandSmooth(float x){
  float t = clamp(x, 0.0, 0.999) * 16.0;
  int i0 = int(floor(t));
  int i1 = min(i0 + 1, 15);
  float f = fract(t);
  float a = 0.0, b = 0.0;
  for (int k = 0; k < 16; k++){
    if (k == i0) a = uBands[k];
    if (k == i1) b = uBands[k];
  }
  return mix(a, b, f);
}

/* Signed waveform sample, -1..1, over the most recent window. */
float waveAt(float x){
  return texture(uWaveform, vec2(clamp(x, 0.0, 1.0), 0.5)).r * 2.0 - 1.0;
}

/* Beat impulse shaped with an exponential decay. */
float beatPulse(float decay){
  return exp(-uBeatPhase * decay);
}

/* ======================================================================= */
/* Palette                                                                 */
/* ======================================================================= */

/* t in 0..1 sweeps A -> B -> C -> D. */
vec4 palette(float t){
  t = fract(t);
  float s = t * 4.0;
  if (s < 1.0) return mix(uColorA, uColorB, s);
  if (s < 2.0) return mix(uColorB, uColorC, s - 1.0);
  if (s < 3.0) return mix(uColorC, uColorD, s - 2.0);
  return mix(uColorD, uColorA, s - 3.0);
}

vec3 paletteRgb(float t){ return palette(t).rgb; }

/* Ink/paper helpers: the palette with the background kept distinct. */
vec3 ink(float t){ return paletteRgb(t); }

/* Tone mapping so additive over-bright passes stay in range. */
vec3 tonemap(vec3 c){
  c = max(c, 0.0);
  return c / (1.0 + c * 0.62);
}

/* ======================================================================= */
/* Coordinate helpers                                                      */
/* ======================================================================= */

/* Aspect-corrected coordinates, x in -1..1. */
vec2 uvAspect(vec2 fragCoord){
  vec2 uv = fragCoord / uResolution;
  vec2 p = (uv - 0.5) * 2.0;
  p.x *= uResolution.x / uResolution.y;
  return p;
}

vec2 uv01(vec2 fragCoord){ return fragCoord / uResolution; }

/* Polar helpers: returns (angle 0..1, radius). */
vec2 toPolar(vec2 p){
  float a = atan(p.y, p.x) / TAU + 0.5;
  return vec2(a, length(p));
}
`;

/** Fragment prelude used by post-processing / effect passes. */
export const EFFECT_PRELUDE = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

uniform vec2  uResolution;
uniform vec2  uTexel;
uniform float uTime;
uniform float uFrame;
uniform float uSeed;
uniform float uIntensity;      // 0..1 blend of the effect
uniform float uP[8];           // effect parameters
uniform sampler2D uSource;     // frame entering this effect
uniform sampler2D uPassInput;  // result of the previous pass (= uSource on pass 0)
uniform int   uPass;           // 0-based pass index
uniform int   uPassCount;
uniform sampler2D uPrev;       // previous frame (feedback / trails)
uniform float uHasPrev;
uniform sampler2D uLut;        // optional 3D LUT flattened to 2D
uniform float uHasLut;
uniform float uBpm;
uniform float uBeat;
uniform float uBeatPhase;
uniform float uRms;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uKick;
uniform float uSnare;
uniform float uOnset;

const float PI  = 3.14159265359;
const float TAU = 6.28318530718;

mat2 rot2(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float hash11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
vec3 hash33(vec3 p){
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
float valueNoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm2(vec2 p){
  float v = 0.0, amp = 0.5;
  mat2 m = rot2(0.5);
  for (int i = 0; i < 6; i++){ v += amp * valueNoise(p); p = m * p * 2.02; amp *= 0.5; }
  return v;
}
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec2 uv01(vec2 fragCoord){ return fragCoord / uResolution; }
vec3 tonemap(vec3 c){ c = max(c, 0.0); return c / (1.0 + c * 0.62); }
`;

/** Vertex shader for every full-screen pass in the pipeline. */
export const QUAD_VERTEX = /* glsl */ `#version 300 es
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main(){
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

/**
 * Wrap author source (which defines `mainImage`) with the prelude and the
 * entry point. `fragCoordInPixels` matches Shadertoy semantics.
 */
export function buildFragmentShader(prelude: string, authorSource: string): string {
  return `${prelude}
out vec4 outColor;
#line 1
${authorSource}

void main(){
  vec4 col = vec4(0.0);
  mainImage(col, gl_FragCoord.xy);
  outColor = col;
}
`;
}

/** Entry point appended for shaders that write to `outColor` directly. */
export function buildRawFragmentShader(prelude: string, authorSource: string): string {
  return `${prelude}
out vec4 outColor;
#line 1
${authorSource}
`;
}
