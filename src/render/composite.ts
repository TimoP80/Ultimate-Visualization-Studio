/**
 * Shaders that stitch the composition together: the scene background pass,
 * the per-layer composite (transform + blend mode) and the final present pass.
 */

export const BACKGROUND_FRAG = /* glsl */ `#version 300 es
precision highp float;

uniform vec2 uResolution;
uniform float uTime;
uniform float uMode;         // 0 solid, 1 vertical gradient, 2 radial gradient
uniform vec3 uColor0;
uniform vec3 uColor1;
uniform float uNoise;        // subtle animated dither/grain so flat fills breathe
uniform float uVignette;
uniform float uBass;

out vec4 outColor;

void main(){
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec3 c = uColor0;
  if (uMode < 0.5){
    c = uColor0;
  } else if (uMode < 1.5){
    c = mix(uColor0, uColor1, uv.y);
  } else {
    vec2 p = (uv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0) * 1.6;
    float d = length(p);
    c = mix(uColor0, uColor1, smoothstep(0.0, 1.25, d));
  }

  if (uNoise > 0.0){
    float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)) + uTime * 0.7) * 43758.5453);
    c += (n - 0.5) * uNoise * 0.06;
  }
  if (uVignette > 0.0){
    vec2 p = (uv - 0.5) * 2.0;
    p.x *= uResolution.x / uResolution.y;
    c *= 1.0 - uVignette * smoothstep(0.35, 1.25, length(p));
  }
  // A touch of bass-reactive breathing keeps flat backgrounds alive.
  c *= 1.0 + uBass * 0.06;
  outColor = vec4(c, 1.0);
}`;

export const COMPOSITE_FRAG = /* glsl */ `#version 300 es
precision highp float;

uniform vec2 uResolution;
uniform sampler2D uLayer;
uniform sampler2D uScene;
uniform float uOpacity;
uniform vec2  uTranslate;
uniform vec2  uScale;
uniform float uRotation;
uniform vec2  uAnchor;      // 0..1 anchor inside the layer
uniform float uAspect;      // width / height
uniform float uCanvasAspect;
uniform int   uBlend;

out vec4 outColor;

const float PI = 3.14159265359;

mat2 rot2(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

vec3 blendPixels(vec3 base, vec3 top, int mode){
  if (mode == 0) return top;                                  // normal
  if (mode == 1) return base + top;                           // add
  if (mode == 2) return 1.0 - (1.0 - base) * (1.0 - top);     // screen
  if (mode == 3) return base * top;                           // multiply
  if (mode == 4) {                                            // overlay
    return mix(2.0 * base * top, 1.0 - 2.0 * (1.0 - base) * (1.0 - top), step(0.5, base));
  }
  if (mode == 5) return max(base, top);                       // lighten
  if (mode == 6) return abs(base - top);                      // difference
  return top;
}

void main(){
  vec2 suv = gl_FragCoord.xy / uResolution;
  vec3 scene = texture(uScene, suv).rgb;

  // Inverse transform: scene uv -> layer uv.
  vec2 p = suv - uAnchor;
  p.x *= uAspect;
  p = rot2(-uRotation) * p;
  p /= max(abs(uScale), vec2(1e-4));
  p.x /= uAspect;
  vec2 luv = p + uAnchor - uTranslate;

  vec4 layer = texture(uLayer, luv);
  float inside = step(0.0, luv.x) * step(luv.x, 1.0) * step(0.0, luv.y) * step(luv.y, 1.0);
  float alpha = clamp(layer.a, 0.0, 1.0) * inside * uOpacity;

  vec3 blended = blendPixels(scene, layer.rgb, uBlend);
  vec3 result = mix(scene, blended, alpha);
  outColor = vec4(result, 1.0);
}`;

export const PRESENT_FRAG = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D uTexture;
uniform float uExposure;
uniform float uChecker;

out vec4 outColor;

void main(){
  vec2 uv = gl_FragCoord.xy / vec2(textureSize(uTexture, 0));
  vec4 c = texture(uTexture, uv);
  c.rgb *= pow(2.0, uExposure);
  if (uChecker > 0.5){
    vec2 g = floor(gl_FragCoord.xy / 12.0);
    float k = mod(g.x + g.y, 2.0);
    c.rgb = mix(c.rgb, mix(vec3(0.09), vec3(0.13), k), 1.0 - c.a);
  }
  outColor = vec4(clamp(c.rgb, 0.0, 1.0), 1.0);
}`;

/** Dry/wet mix between the frame entering an effect and the effect result. */
export const MIX_FRAG = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D uSource;   // dry
uniform sampler2D uEffect;   // wet
uniform float uMix;

out vec4 outColor;

void main(){
  vec2 uv = gl_FragCoord.xy / vec2(textureSize(uSource, 0));
  vec4 a = texture(uSource, uv);
  vec4 b = texture(uEffect, uv);
  outColor = mix(a, b, clamp(uMix, 0.0, 1.0));
}`;

/**
 * Renders a text layer's glyph texture with its selected effect preset.
 * `uEffect` picks the branch; unknown values fall through to the plain look.
 */
export const TEXT_FRAG = /* glsl */ `#version 300 es
precision highp float;

uniform vec2 uResolution;
uniform sampler2D uTex0;
uniform float uHasTex0;
uniform vec4 uColorA;
uniform vec4 uColorB;
uniform vec4 uColorC;
uniform float uGradient;
uniform float uGlow;
uniform float uRms;
uniform float uBeat;
uniform float uTime;
uniform float uEffect;
uniform float uIntensity;
uniform float uSpeed;
uniform float uProgress;

out vec4 outColor;

float hash21(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float glyph(vec2 p){
  vec2 c = clamp(p, 0.0, 1.0);
  float inside = step(0.0, p.x) * step(p.x, 1.0) * step(0.0, p.y) * step(p.y, 1.0);
  return texture(uTex0, c).a * inside;
}

float halo(vec2 uv, float radius){
  float acc = 0.0;
  for (int i = 0; i < 8; i++){
    float ang = float(i) * 0.7853981634;
    vec2 o = vec2(cos(ang), sin(ang)) * radius;
    acc += glyph(uv + o);
    acc += glyph(uv + o * 0.55);
  }
  return acc * 0.0625;
}

void main(){
  if (uHasTex0 < 0.5){ outColor = vec4(0.0); return; }

  // The glyph raster is laid out to span the whole frame, so frame uv is also
  // the raster uv. Using the texture size here would only work when the canvas
  // happens to match the raster resolution.
  vec2 uv = gl_FragCoord.xy / uResolution;
  float t = uTime * max(uSpeed, 0.01);
  float amount = max(uIntensity, 0.0);
  vec3 base = mix(uColorA.rgb, uColorB.rgb, uv.y);
  vec3 col = base;
  float alpha = 0.0;
  int mode = int(uEffect + 0.5);

  if (mode == 0){
    alpha = glyph(uv);
  } else if (mode == 1){
    float a = glyph(uv);
    float h = halo(uv, 0.006 + 0.014 * amount);
    float flicker = 0.86 + 0.14 * hash21(vec2(floor(uTime * 11.0), 3.0));
    alpha = clamp(a + h * 1.15 * amount, 0.0, 1.0) * flicker;
    col = base * 1.25 + uColorC.rgb * h * 3.0 * amount + base * pow(h, 0.5) * 0.8;
  } else if (mode == 2){
    float a = glyph(uv);
    float bevel = glyph(uv + vec2(0.0, 0.014)) - glyph(uv - vec2(0.0, 0.014));
    float band = 0.5 + 0.5 * sin((uv.y + bevel * 1.8) * 24.0 + t * 1.4);
    vec3 metal = mix(uColorC.rgb, uColorA.rgb, band);
    metal = mix(metal, vec3(1.0), pow(band, 5.0) * 0.75);
    metal = mix(metal, uColorB.rgb, clamp(0.5 + bevel * 6.0, 0.0, 1.0) * 0.35 * amount);
    col = metal;
    alpha = a;
  } else if (mode == 3){
    float a = glyph(uv);
    float r = 0.004 + 0.016 * amount;
    float inner = 1.0;
    for (int i = 0; i < 8; i++){
      float ang = float(i) * 0.7853981634;
      inner = min(inner, glyph(uv + vec2(cos(ang), sin(ang)) * r));
    }
    float stroke = clamp(a - inner, 0.0, 1.0);
    alpha = clamp(stroke * 1.5 + a * 0.16, 0.0, 1.0);
    col = mix(base, uColorA.rgb, 0.55);
  } else if (mode == 4){
    float band = floor(uv.y * 18.0);
    float n = hash21(vec2(band, floor(uTime * 9.0)));
    float shift = (n - 0.5) * 0.09 * amount * step(0.5, n);
    float split = 0.002 + 0.01 * amount;
    float ar = glyph(uv + vec2(shift + split, 0.0));
    float ag = glyph(uv + vec2(shift, 0.0));
    float ab = glyph(uv + vec2(shift - split, 0.0));
    alpha = max(max(ar, ag), ab);
    col = base + vec3(ar - ag, ag - ab, ab - ar) * 0.85;
    float slice = step(0.92, hash21(vec2(floor(uv.y * 60.0), floor(uTime * 4.0))));
    alpha *= 1.0 - slice * 0.65 * amount;
  } else if (mode == 5){
    float split = 0.0015 + 0.0025 * amount;
    float ar = glyph(uv + vec2(split, 0.0));
    float ag = glyph(uv);
    float ab = glyph(uv - vec2(split, 0.0));
    float scan = 0.7 + 0.3 * sin(uv.y * 1400.0 + uTime * 6.0);
    float flick = 0.94 + 0.06 * sin(uTime * 31.0) * amount;
    alpha = max(max(ar, ag), ab) * mix(1.0, scan, 0.65 * amount) * flick;
    col = mix(base, vec3(0.85, 1.0, 0.9) * base, 0.4);
    col += uColorB.rgb * pow(max(ag, 0.0), 3.0) * 0.35;
  } else if (mode == 6){
    float reveal = clamp(uProgress, 0.0, 1.0);
    float edge = smoothstep(reveal + 0.02, reveal - 0.012, uv.x);
    alpha = glyph(uv) * edge;
    col = base;
    float cursor = smoothstep(0.006, 0.0, abs(uv.x - reveal)) * step(reveal, 0.995);
    alpha = clamp(alpha + cursor * 0.7, 0.0, 1.0);
    col += uColorC.rgb * cursor * 1.8;
  } else if (mode == 7){
    float amp = 0.018 * amount;
    vec2 w = uv;
    w.y += sin(uv.x * 14.0 + t * 2.2) * amp;
    w.x += cos(uv.y * 9.0 - t * 1.6) * amp * 0.7;
    alpha = glyph(w);
    col = mix(base, uColorC.rgb, 0.25 + 0.25 * sin(t * 1.5 + uv.x * 6.0));
  } else if (mode == 8){
    float scale = 1.0 + uBeat * 0.14 * amount;
    vec2 p = (uv - 0.5) / max(scale, 0.2) + 0.5;
    float a = glyph(p);
    float h = halo(p, 0.01 + 0.016 * amount);
    alpha = clamp(a + h * (0.3 + uBeat * 0.9) * amount, 0.0, 1.0);
    col = base + uColorC.rgb * (uBeat * 0.9 + uRms * 0.4) * amount;
  } else if (mode == 9){
    vec2 off = vec2(0.016, -0.014) * amount;
    float a = glyph(uv);
    float sh = glyph(uv - off);
    alpha = clamp(a + sh * 0.75, 0.0, 1.0);
    col = mix(base, uColorC.rgb, sh * 0.85 * (1.0 - a));
    col = mix(col, base, a);
  } else if (mode == 10){
    float sweep = fract(uv.x * 0.8 + uv.y * 0.35 - t * 0.25);
    vec3 g = mix(uColorA.rgb, uColorB.rgb, smoothstep(0.0, 0.55, sweep));
    g = mix(g, uColorC.rgb, smoothstep(0.55, 1.0, sweep));
    alpha = glyph(uv);
    col = g + uColorB.rgb * uGlow * 0.3;
  } else {
    float grid = mix(40.0, 420.0, clamp(amount, 0.0, 1.0));
    vec2 q = (floor(uv * grid) + 0.5) / grid;
    alpha = glyph(q);
  }

  // Cheap emissive lift keeps text readable over busy backgrounds.
  col += uColorA.rgb * uGlow * (0.25 + uRms * 1.0);
  outColor = vec4(col, clamp(alpha, 0.0, 1.0) * uColorA.a);
}`;

/** Draws a user image / video / logo layer with fit and tint controls. */
export const IMAGE_FRAG = /* glsl */ `#version 300 es
precision highp float;

uniform vec2 uResolution;
uniform sampler2D uTex0;
uniform float uHasTex0;
uniform vec2 uImageSize;
uniform float uFit;        // 0 = cover, 1 = contain
uniform float uOpacity;
uniform float uTint;
uniform vec4 uColorA;
uniform float uBass;

out vec4 outColor;

void main(){
  if (uHasTex0 < 0.5){ outColor = vec4(0.0); return; }
  vec2 canvas = vec2(textureSize(uTex0, 0));
  vec2 res = uResolution;
  vec2 uv = gl_FragCoord.xy / res;
  // Convert to image space with aspect-preserving fit.
  float canvasAspect = (uImageSize.x / max(uImageSize.y, 1.0)) * mix(1.0, res.x / res.y, 1.0 - uFit);
  vec2 p = uv - 0.5;
  float targetAspect = canvasAspect;
  float frameAspect = res.x / res.y;
  if (uFit < 0.5){
    // cover
    if (targetAspect > frameAspect) p.x *= frameAspect / targetAspect;
    else p.y *= targetAspect / frameAspect;
  } else {
    // contain
    if (targetAspect > frameAspect) p.y *= targetAspect / frameAspect;
    else p.x *= frameAspect / targetAspect;
  }
  vec2 iuv = p + 0.5;
  float inside = step(0.0, iuv.x) * step(iuv.x, 1.0) * step(0.0, iuv.y) * step(iuv.y, 1.0);
  vec4 tex = texture(uTex0, clamp(iuv, 0.0, 1.0));
  vec3 col = mix(tex.rgb, uColorA.rgb * (0.6 + uBass * 0.8), uTint);
  outColor = vec4(col, tex.a * uOpacity * inside);
}`;

/** Phase-2 helper: renders a solid colour fill layer. */
export const SOLID_FRAG = /* glsl */ `#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform vec4 uColorA;
uniform vec4 uColorB;
uniform float uGradient;
out vec4 outColor;
void main(){
  vec2 uv = gl_FragCoord.xy / uResolution;
  outColor = mix(uColorA, uColorB, uv.y * uGradient);
}`;
