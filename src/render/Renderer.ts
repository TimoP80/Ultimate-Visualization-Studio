/**
 * Composition renderer.
 *
 * Frame pipeline:
 *   background pass -> [layer pass -> layer effects -> composite] * n
 *   -> scene effect chain -> feedback copy -> present
 *
 * The same `renderFrame` call drives both the interactive preview and the
 * offline MP4 exporter; only the render-target size differs.
 */

import type { AudioSample } from '@/audio/analysis';
import type { Layer, Scene, TemplateDef, EffectInstance } from '@/types';
import {
  createProgram,
  createFullscreenTriangle,
  RenderTarget,
  createDataTexture,
  updateDataTexture,
  createImageTexture,
  createBlankTexture,
  hexToRgba,
  ShaderCompileError,
  type ProgramInfo,
} from './gl';
import { QUAD_VERTEX, SCENE_PRELUDE, EFFECT_PRELUDE, buildFragmentShader, buildRawFragmentShader } from './prelude';
import { BACKGROUND_FRAG, COMPOSITE_FRAG, PRESENT_FRAG, MIX_FRAG, TEXT_FRAG, IMAGE_FRAG, SOLID_FRAG } from './composite';
import { EFFECT_DEF_MAP, type EffectDef } from './effects';
import { ModulationState, resolveLayer, resolveEffectSlots, paletteRgba } from './params';
import { SPECTRUM_BINS } from '@/audio/bands';
import { getTemplate, compileTemplateShader } from '@/templates/registry';
import { rasterizeTextLayer } from './textRaster';
import { textEffectFor, textEffectProgress, textEffectValue } from './textEffects';
import { layerEffectsOf, sceneEffectsOf } from '@/state/selectors';

const WAVEFORM_SAMPLES = 1024;

export interface RenderRequest {
  scene: Scene;
  time: number;
  frame: number;
  audio: AudioSample;
  width: number;
  height: number;
  /** Global audio-reactivity enable. */
  audioActive: boolean;
  dt: number;
  /** Extra per-layer parameter overrides injected by the export/preview layer. */
  soloLayerId?: string | null;
}

export interface RenderStats {
  layersDrawn: number;
  drawCalls: number;
  programsCompiled: number;
}

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGL2RenderingContext;
  private vao: WebGLVertexArrayObject;

  private sceneRT: RenderTarget;
  private sceneRT2: RenderTarget;
  private layerRT: RenderTarget;
  private layerFx: [RenderTarget, RenderTarget];
  private fx: [RenderTarget, RenderTarget];
  private prevRT: RenderTarget;

  private backgroundProgram: ProgramInfo;
  private compositeProgram: ProgramInfo;
  private presentProgram: ProgramInfo;
  private mixProgram: ProgramInfo;
  private solidProgram: ProgramInfo;
  private textProgram: ProgramInfo;
  private imageProgram: ProgramInfo;

  private templatePrograms = new Map<string, ProgramInfo>();
  private effectPrograms = new Map<string, ProgramInfo>();

  private spectrumTex: WebGLTexture;
  private waveformTex: WebGLTexture;
  private blankTex: WebGLTexture;
  private spectrumUpload = new Float32Array(SPECTRUM_BINS);
  private waveformUpload = new Float32Array(WAVEFORM_SAMPLES);

  private imageTextures = new Map<string, WebGLTexture>();

  readonly modulation = new ModulationState();
  private hasPrevFrame = false;
  private programsCompiled = 0;

  /** Drawing-buffer size in device pixels; read by previews and the exporter. */
  width = 0;
  height = 0;

  private lastError: string | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
      desynchronized: false,
    });
    if (!gl) {
      throw new Error(
        'WebGL2 is not available. Ultimate Visualization Studio requires a WebGL2-capable GPU.',
      );
    }
    this.gl = gl;
    gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    this.vao = createFullscreenTriangle(gl);

    this.backgroundProgram = createProgram(gl, QUAD_VERTEX, BACKGROUND_FRAG, 'background');
    this.compositeProgram = createProgram(gl, QUAD_VERTEX, COMPOSITE_FRAG, 'composite');
    this.presentProgram = createProgram(gl, QUAD_VERTEX, PRESENT_FRAG, 'present');
    this.mixProgram = createProgram(gl, QUAD_VERTEX, MIX_FRAG, 'mix');
    this.solidProgram = createProgram(gl, QUAD_VERTEX, SOLID_FRAG, 'solid');
    this.textProgram = createProgram(gl, QUAD_VERTEX, TEXT_FRAG, 'text');
    this.imageProgram = createProgram(gl, QUAD_VERTEX, IMAGE_FRAG, 'image');
    this.programsCompiled += 7;

    const w = canvas.width || 1280;
    const h = canvas.height || 720;
    this.sceneRT = new RenderTarget(gl, w, h, { float: true });
    this.sceneRT2 = new RenderTarget(gl, w, h, { float: true });
    this.layerRT = new RenderTarget(gl, w, h, { float: true });
    this.layerFx = [
      new RenderTarget(gl, w, h, { float: true }),
      new RenderTarget(gl, w, h, { float: true }),
    ];
    this.fx = [
      new RenderTarget(gl, w, h, { float: true }),
      new RenderTarget(gl, w, h, { float: true }),
    ];
    this.prevRT = new RenderTarget(gl, w, h, { float: true });
    this.outputTarget = this.sceneRT;
    this.width = w;
    this.height = h;

    const zero = new Float32Array(SPECTRUM_BINS);
    this.spectrumTex = createDataTexture(gl, zero, SPECTRUM_BINS);
    const z2 = new Float32Array(WAVEFORM_SAMPLES);
    z2.fill(0.5);
    this.waveformTex = createDataTexture(gl, z2, WAVEFORM_SAMPLES);
    this.blankTex = createBlankTexture(gl);
  }

  /* ---------------------------------------------------------------- */
  /* Lifecycle                                                        */
  /* ---------------------------------------------------------------- */

  resize(width: number, height: number): void {
    const w = Math.max(64, Math.floor(width));
    const h = Math.max(64, Math.floor(height));
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.canvas.width = w;
    this.canvas.height = h;
    this.sceneRT.resize(w, h);
    this.sceneRT2.resize(w, h);
    this.layerRT.resize(w, h);
    this.layerFx[0].resize(w, h);
    this.layerFx[1].resize(w, h);
    this.fx[0].resize(w, h);
    this.fx[1].resize(w, h);
    this.prevRT.resize(w, h);
    this.hasPrevFrame = false;
  }

  resetFeedback(): void {
    this.hasPrevFrame = false;
    this.modulation.reset();
  }

  get lastRenderError(): string | null {
    return this.lastError;
  }

  dispose(): void {
    const gl = this.gl;
    this.sceneRT.dispose();
    this.sceneRT2.dispose();
    this.layerRT.dispose();
    this.layerFx.forEach((t) => t.dispose());
    this.fx.forEach((t) => t.dispose());
    this.prevRT.dispose();
    gl.deleteTexture(this.spectrumTex);
    gl.deleteTexture(this.waveformTex);
    gl.deleteTexture(this.blankTex);
    for (const tex of this.imageTextures.values()) gl.deleteTexture(tex);
    this.imageTextures.clear();
    for (const p of this.templatePrograms.values()) gl.deleteProgram(p.program);
    for (const p of this.effectPrograms.values()) gl.deleteProgram(p.program);
    this.templatePrograms.clear();
    this.effectPrograms.clear();
    gl.deleteProgram(this.backgroundProgram.program);
    gl.deleteProgram(this.compositeProgram.program);
    gl.deleteProgram(this.presentProgram.program);
    gl.deleteProgram(this.mixProgram.program);
    gl.deleteProgram(this.solidProgram.program);
    gl.deleteProgram(this.textProgram.program);
    gl.deleteProgram(this.imageProgram.program);
  }

  /* ---------------------------------------------------------------- */
  /* Asset textures                                                   */
  /* ---------------------------------------------------------------- */

  setLayerImage(layerId: string, source: TexImageSource | null): void {
    const existing = this.imageTextures.get(layerId);
    if (existing) {
      this.gl.deleteTexture(existing);
      this.imageTextures.delete(layerId);
    }
    if (source) {
      this.imageTextures.set(layerId, createImageTexture(this.gl, source));
    }
  }

  refreshLayerImage(layerId: string, source: TexImageSource): void {
    const existing = this.imageTextures.get(layerId);
    if (!existing) {
      this.setLayerImage(layerId, source);
      return;
    }
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, existing);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  }

  /* ---------------------------------------------------------------- */
  /* Frame                                                            */
  /* ---------------------------------------------------------------- */

  renderFrame(req: RenderRequest): RenderStats {
    const gl = this.gl;
    this.lastError = null;
    if (req.width !== this.width || req.height !== this.height) {
      this.resize(req.width, req.height);
    }

    // Upload audio features.
    this.spectrumUpload.set(req.audio.spectrum.subarray(0, SPECTRUM_BINS));
    updateDataTexture(gl, this.spectrumTex, this.spectrumUpload, SPECTRUM_BINS);
    for (let i = 0; i < WAVEFORM_SAMPLES; i++) {
      this.waveformUpload[i] = req.audio.waveform[i] * 0.5 + 0.5;
    }
    updateDataTexture(gl, this.waveformTex, this.waveformUpload, WAVEFORM_SAMPLES);

    const stats: RenderStats = { layersDrawn: 0, drawCalls: 0, programsCompiled: 0 };
    const startPrograms = this.programsCompiled;

    gl.bindVertexArray(this.vao);

    // ---- Background --------------------------------------------------
    this.sceneRT.bind();
    this.drawBackground(req);

    // ---- Layers ------------------------------------------------------
    // Compositing reads the accumulated scene while writing the next one, so
    // the scene targets ping-pong. Sampling the bound framebuffer would be a
    // feedback loop and is rejected by the driver.
    const layers = this.visibleLayers(req);
    let sceneCurrent = this.sceneRT;
    for (const layer of layers) {
      const sceneWrite = sceneCurrent === this.sceneRT ? this.sceneRT2 : this.sceneRT;
      if (this.drawLayer(layer, req, stats, sceneCurrent, sceneWrite)) {
        sceneCurrent = sceneWrite;
      }
    }
    stats.layersDrawn = layers.length;

    // ---- Scene effect chain -----------------------------------------
    const output = this.applyEffectChain(
      sceneEffectsOf(req.scene, req.time).filter((e) => e.enabled),
      sceneCurrent,
      this.fx,
      req,
      stats,
    );

    // ---- Feedback copy ----------------------------------------------
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.prevRT.fbo);
    gl.viewport(0, 0, this.width, this.height);
    this.useProgram(this.presentProgram);
    this.bindTexture('uTexture', output.texture, 0);
    this.set1f(this.presentProgram, 'uExposure', 0);
    this.set1f(this.presentProgram, 'uChecker', 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    stats.drawCalls++;

    this.outputTexture = output.texture;
    this.outputTarget = output;
    this.hasPrevFrame = true;

    stats.programsCompiled = this.programsCompiled - startPrograms;
    gl.bindVertexArray(null);
    return stats;
  }

  private outputTexture: WebGLTexture | null = null;
  private outputTarget!: RenderTarget;

  /** The most recently rendered composition, ready to be presented or read back. */
  get finalTexture(): WebGLTexture | null {
    return this.outputTexture;
  }

  /** Render target that owns {@link finalTexture}; use for pixel readback. */
  get finalTarget(): RenderTarget {
    return this.outputTarget;
  }

  private visibleLayers(req: RenderRequest): Layer[] {
    const out: Layer[] = [];
    for (const layer of req.scene.layers) {
      if (!layer.visible) continue;
      if (req.soloLayerId && layer.id !== req.soloLayerId && !layer.solo) continue;
      if (req.time < layer.start - 1e-6 || req.time > layer.end + 1e-6) continue;
      out.push(layer);
    }
    return out;
  }

  private drawBackground(req: RenderRequest): void {
    const gl = this.gl;
    const scene = req.scene;
    const [c0, c1] = scene.bgColors;
    const mode = scene.bgMode === 'solid' ? 0 : 1;
    this.useProgram(this.backgroundProgram);
    this.set2f(this.backgroundProgram, 'uResolution', this.width, this.height);
    this.set1f(this.backgroundProgram, 'uTime', req.time);
    this.set1f(this.backgroundProgram, 'uMode', mode);
    const a = hexToRgba(c0);
    const b = hexToRgba(scene.bgMode === 'solid' ? c0 : c1);
    this.set3f(this.backgroundProgram, 'uColor0', a[0], a[1], a[2]);
    this.set3f(this.backgroundProgram, 'uColor1', b[0], b[1], b[2]);
    this.set1f(this.backgroundProgram, 'uNoise', 0.35);
    this.set1f(this.backgroundProgram, 'uVignette', 0.25);
    this.set1f(this.backgroundProgram, 'uBass', req.audioActive ? req.audio.bass : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private drawLayer(
    layer: Layer,
    req: RenderRequest,
    stats: RenderStats,
    sceneRead: RenderTarget,
    sceneWrite: RenderTarget,
  ): boolean {
    const gl = this.gl;
    const template = layer.type === 'template' || layer.type === 'shader' ? getTemplate(layer) : null;
    // Resolve once per frame: resolving twice would advance the modulation
    // envelopes twice and desynchronise audio mapping from the export path.
    const resolved = template
      ? resolveLayer(layer, template, req.audio, {
          dt: req.dt,
          state: this.modulation,
          time: req.time,
          audioActive: req.audioActive,
        })
      : null;

    // ---- Render the layer content into layerRT ----------------------
    this.layerRT.bind();
    this.layerRT.clear(0, 0, 0, 0);

    let drew = false;
    if (layer.type === 'solid') {
      this.useProgram(this.solidProgram);
      this.set2f(this.solidProgram, 'uResolution', this.width, this.height);
      const a = hexToRgba(layer.palette.a);
      const b = hexToRgba(layer.palette.b);
      this.set4f(this.solidProgram, 'uColorA', a[0], a[1], a[2], layer.transform.opacity);
      this.set4f(this.solidProgram, 'uColorB', b[0], b[1], b[2], layer.transform.opacity);
      this.set1f(this.solidProgram, 'uGradient', 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      drew = true;
    } else if (layer.type === 'text') {
      const canvas = rasterizeTextLayer(layer);
      if (canvas) {
        this.refreshOrCreateTexture(layer.id, canvas);
        this.useProgram(this.textProgram);
        this.set2f(this.textProgram, 'uResolution', this.width, this.height);
        const a = hexToRgba(layer.palette.a);
        const b = hexToRgba(layer.palette.b);
        this.set4f(this.textProgram, 'uColorA', a[0], a[1], a[2], layer.transform.opacity);
        this.set4f(this.textProgram, 'uColorB', b[0], b[1], b[2], layer.transform.opacity);
        const c = hexToRgba(layer.palette.c);
        this.set4f(this.textProgram, 'uColorC', c[0], c[1], c[2], layer.transform.opacity);
        this.set1f(this.textProgram, 'uGradient', 0.4);
        this.set1f(this.textProgram, 'uGlow', 0.12);
        this.set1f(this.textProgram, 'uRms', req.audioActive ? req.audio.rms : 0);
        const effect = textEffectFor(layer.textEffect);
        this.set1f(this.textProgram, 'uEffect', effect.mode);
        this.set1f(this.textProgram, 'uIntensity', textEffectValue(layer, 'intensity'));
        this.set1f(this.textProgram, 'uSpeed', textEffectValue(layer, 'speed'));
        this.set1f(this.textProgram, 'uTime', req.time);
        this.set1f(this.textProgram, 'uBeat', req.audioActive ? req.audio.beat : 0);
        this.set1f(this.textProgram, 'uProgress', textEffectProgress(layer, req.time));
        this.bindTexture('uTex0', this.imageTextures.get(layer.id) ?? this.blankTex, 3);
        this.set1f(this.textProgram, 'uHasTex0', this.imageTextures.has(layer.id) ? 1 : 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        drew = true;
      }
    } else if (layer.type === 'image' || layer.type === 'video') {
      const tex = this.imageTextures.get(layer.id);
      if (tex) {
        this.useProgram(this.imageProgram);
        this.set2f(this.imageProgram, 'uResolution', this.width, this.height);
        this.set2f(this.imageProgram, 'uImageSize', this.width, this.height);
        this.set1f(this.imageProgram, 'uFit', 0);
        this.set1f(this.imageProgram, 'uOpacity', layer.transform.opacity);
        this.set1f(this.imageProgram, 'uTint', 0);
        this.set1f(this.imageProgram, 'uBass', req.audioActive ? req.audio.bass : 0);
        const a = hexToRgba(layer.palette.a);
        this.set4f(this.imageProgram, 'uColorA', a[0], a[1], a[2], 1);
        this.bindTexture('uTex0', tex, 3);
        this.set1f(this.imageProgram, 'uHasTex0', 1);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        drew = true;
      }
    } else if (template) {
      const program = this.getTemplateProgram(template, layer);
      if (program && resolved) {
        this.useProgram(program);
        this.bindSceneUniforms(program, req, layer, resolved.slots, resolved.palette);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        drew = true;
      }
    }
    stats.drawCalls++;

    if (!drew) return false;

    // ---- Layer-scoped effects ---------------------------------------
    const layerEffects = layerEffectsOf(layer, req.time).filter((e) => e.enabled);
    const layerResult = this.applyEffectChain(
      layerEffects,
      this.layerRT,
      this.layerFx,
      req,
      stats,
    );

    // ---- Composite onto the scene -----------------------------------
    const t = resolved?.transform ?? layer.transform;

    sceneWrite.bind();
    this.useProgram(this.compositeProgram);
    this.set2f(this.compositeProgram, 'uResolution', this.width, this.height);
    this.set1f(this.compositeProgram, 'uOpacity', t.opacity);
    this.set2f(this.compositeProgram, 'uTranslate', t.x, t.y);
    this.set2f(this.compositeProgram, 'uScale', t.scaleX, t.scaleY);
    this.set1f(this.compositeProgram, 'uRotation', t.rotation);
    this.set2f(this.compositeProgram, 'uAnchor', 0.5, 0.5);
    this.set1f(this.compositeProgram, 'uAspect', this.width / this.height);
    this.set1i(this.compositeProgram, 'uBlend', resolved?.blend ?? 0);
    this.bindTexture('uLayer', layerResult.texture, 0);
    this.bindTexture('uScene', sceneRead.texture, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    stats.drawCalls++;
    return true;
  }

  private refreshOrCreateTexture(layerId: string, canvas: HTMLCanvasElement): void {
    const existing = this.imageTextures.get(layerId);
    if (existing) this.refreshLayerImage(layerId, canvas);
    else this.setLayerImage(layerId, canvas);
  }

  /* ---------------------------------------------------------------- */
  /* Effect chain                                                     */
  /* ---------------------------------------------------------------- */

  private applyEffectChain(
    effects: EffectInstance[],
    input: RenderTarget,
    targets: [RenderTarget, RenderTarget],
    req: RenderRequest,
    stats: RenderStats,
  ): RenderTarget {
    const gl = this.gl;
    if (effects.length === 0) return input;

    let currentTexture = input.texture as WebGLTexture;
    let writeIndex = 0;

    for (const effect of effects) {
      const def = EFFECT_DEF_MAP[effect.type];
      if (!def) continue;
      const program = this.getEffectProgram(def);
      if (!program) continue;

      const slots = resolveEffectSlots(effect, def);
      const passes = Math.max(1, def.passes);
      const intensity = effect.params.intensity ?? 1;
      let passInput = currentTexture;

      for (let pass = 0; pass < passes; pass++) {
        const target = targets[writeIndex % 2];
        target.bind();
        this.useProgram(program);

        this.set2f(program, 'uResolution', this.width, this.height);
        this.set2f(program, 'uTexel', 1 / this.width, 1 / this.height);
        this.set1f(program, 'uTime', req.time);
        this.set1f(program, 'uFrame', req.frame);
        this.set1f(program, 'uSeed', 0);
        this.set1f(program, 'uIntensity', passes === 1 ? intensity : 1);
        this.set1i(program, 'uPass', pass);
        this.set1i(program, 'uPassCount', passes);
        this.set1fv(program, 'uP', slots);

        // Audio uniforms for reactive effects.
        this.set1f(program, 'uBpm', req.audio.bpm);
        this.set1f(program, 'uBeat', req.audioActive ? req.audio.beat : 0);
        this.set1f(program, 'uBeatPhase', req.audio.beatPhase);
        this.set1f(program, 'uRms', req.audioActive ? req.audio.rms : 0);
        this.set1f(program, 'uBass', req.audioActive ? req.audio.bass : 0);
        this.set1f(program, 'uMid', req.audioActive ? req.audio.mid : 0);
        this.set1f(program, 'uTreble', req.audioActive ? req.audio.treble : 0);
        this.set1f(program, 'uKick', req.audioActive ? req.audio.kick : 0);
        this.set1f(program, 'uSnare', req.audioActive ? req.audio.snare : 0);
        this.set1f(program, 'uOnset', req.audioActive ? req.audio.onset : 0);

        this.bindTexture('uSource', currentTexture, 4);
        this.bindTexture('uPassInput', passInput, 5);
        this.bindTexture('uPrev', this.hasPrevFrame ? this.prevRT.texture : this.blankTex, 2);
        this.set1f(program, 'uHasPrev', this.hasPrevFrame ? 1 : 0);
        this.bindTexture('uLut', this.blankTex, 6);
        this.set1f(program, 'uHasLut', 0);

        gl.drawArrays(gl.TRIANGLES, 0, 3);
        stats.drawCalls++;

        let resultTexture = target.texture as WebGLTexture;
        writeIndex++;

        // Single-pass effects honour `intensity` as a dry/wet blend. Multi-pass
        // effects expose their own mix parameter instead.
        if (passes === 1 && intensity < 0.999 && intensity > 0.001) {
          const mixTarget = targets[writeIndex % 2];
          mixTarget.bind();
          this.useProgram(this.mixProgram);
          this.set2f(this.mixProgram, 'uResolution', this.width, this.height);
          this.set1f(this.mixProgram, 'uMix', Math.max(0, Math.min(1, intensity)));
          this.bindTexture('uSource', currentTexture, 0);
          this.bindTexture('uEffect', resultTexture, 1);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          stats.drawCalls++;
          writeIndex++;
          resultTexture = mixTarget.texture as WebGLTexture;
        }

        passInput = resultTexture;
      }

      currentTexture = passInput;
    }

    return this.targetOwningTexture(currentTexture, targets, input);
  }

  private targetOwningTexture(
    texture: WebGLTexture,
    targets: [RenderTarget, RenderTarget],
    fallback: RenderTarget,
  ): RenderTarget {
    if (targets[0].texture === texture) return targets[0];
    if (targets[1].texture === texture) return targets[1];
    return fallback;
  }

  /* ---------------------------------------------------------------- */
  /* Programs                                                         */
  /* ---------------------------------------------------------------- */

  private getTemplateProgram(template: TemplateDef, layer: Layer): ProgramInfo | null {
    const source = compileTemplateShader(template, layer.shaderSource);
    const key = `${template.id}:${hashString(source)}`;
    const cached = this.templatePrograms.get(key);
    if (cached) return cached;
    try {
      const program = createProgram(
        this.gl,
        QUAD_VERTEX,
        buildFragmentShader(SCENE_PRELUDE, source),
        template.name,
      );
      this.templatePrograms.set(key, program);
      this.programsCompiled++;
      return program;
    } catch (err) {
      this.lastError = err instanceof ShaderCompileError ? err.log : String(err);
      return null;
    }
  }

  private getEffectProgram(def: EffectDef): ProgramInfo | null {
    const cached = this.effectPrograms.get(def.type);
    if (cached) return cached;
    try {
      const program = createProgram(
        this.gl,
        QUAD_VERTEX,
        buildRawFragmentShader(EFFECT_PRELUDE, def.frag),
        `fx:${def.type}`,
      );
      this.effectPrograms.set(def.type, program);
      this.programsCompiled++;
      return program;
    } catch (err) {
      this.lastError = err instanceof ShaderCompileError ? err.log : String(err);
      return null;
    }
  }

  /** Compile a user shader for the Shader Studio, returning any error text. */
  compileUserShader(source: string, name = 'shader-studio'): { program: ProgramInfo | null; error: string | null } {
    try {
      const program = createProgram(
        this.gl,
        QUAD_VERTEX,
        buildFragmentShader(SCENE_PRELUDE, source),
        name,
      );
      return { program, error: null };
    } catch (err) {
      return { program: null, error: err instanceof ShaderCompileError ? err.log : String(err) };
    }
  }

  /* ---------------------------------------------------------------- */
  /* Uniform plumbing                                                 */
  /* ---------------------------------------------------------------- */

  private useProgram(program: ProgramInfo): void {
    this.gl.useProgram(program.program);
    this.activeProgram = program;
  }

  private bindTexture(name: string, texture: WebGLTexture | null, unit: number): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    const loc = this.currentProgramUniform(name);
    if (loc) gl.uniform1i(loc, unit);
  }

  private activeProgram: ProgramInfo | null = null;

  private currentProgramUniform(name: string): WebGLUniformLocation | null {
    return this.activeProgram?.uniforms.get(name) ?? null;
  }

  private set1f(p: ProgramInfo, name: string, v: number): void {
    const loc = p.uniforms.get(name);
    if (loc) this.gl.uniform1f(loc, v);
  }
  private set1i(p: ProgramInfo, name: string, v: number): void {
    const loc = p.uniforms.get(name);
    if (loc) this.gl.uniform1i(loc, v);
  }
  private set2f(p: ProgramInfo, name: string, x: number, y: number): void {
    const loc = p.uniforms.get(name);
    if (loc) this.gl.uniform2f(loc, x, y);
  }
  private set3f(p: ProgramInfo, name: string, x: number, y: number, z: number): void {
    const loc = p.uniforms.get(name);
    if (loc) this.gl.uniform3f(loc, x, y, z);
  }
  private set4f(p: ProgramInfo, name: string, x: number, y: number, z: number, w: number): void {
    const loc = p.uniforms.get(name);
    if (loc) this.gl.uniform4f(loc, x, y, z, w);
  }
  private set1fv(p: ProgramInfo, name: string, values: Float32Array): void {
    const loc = p.uniforms.get(name);
    if (loc) this.gl.uniform1fv(loc, values);
  }

  private bindSceneUniforms(
    program: ProgramInfo,
    req: RenderRequest,
    layer: Layer,
    slots: Float32Array,
    palette: Layer['palette'],
  ): void {
    const gl = this.gl;
    const a = req.audio;
    this.activeProgram = program;
    // `bindTexture` needs the active program for its location lookup.
    this.set2f(program, 'uResolution', this.width, this.height);
    this.set1f(program, 'uTime', req.time);
    this.set1f(program, 'uFrame', req.frame);
    this.set2f(program, 'uMouse', 0.5, 0.5);
    this.set1f(program, 'uSeed', layer.seed);
    this.set1f(program, 'uTexel', 1 / this.width);

    const active = req.audioActive ? 1 : 0;
    this.set1f(program, 'uRms', a.rms * active);
    this.set1f(program, 'uPeak', a.peak * active);
    this.set1f(program, 'uEnergy', a.energy * active);
    this.set1f(program, 'uSubBass', a.subBass * active);
    this.set1f(program, 'uBass', a.bass * active);
    this.set1f(program, 'uLowMid', a.lowMid * active);
    this.set1f(program, 'uMid', a.mid * active);
    this.set1f(program, 'uHighMid', a.highMid * active);
    this.set1f(program, 'uTreble', a.treble * active);
    this.set1f(program, 'uAir', a.air * active);
    this.set1f(program, 'uCentroid', a.centroid);
    this.set1f(program, 'uFlux', a.flux * active);
    this.set1f(program, 'uBpm', a.bpm);
    this.set1f(program, 'uBeat', a.beat * active);
    this.set1f(program, 'uBeatPhase', a.beatPhase);
    this.set1f(program, 'uBar', a.bar);
    this.set1f(program, 'uKick', a.kick * active);
    this.set1f(program, 'uSnare', a.snare * active);
    this.set1f(program, 'uOnset', a.onset * active);
    this.set1f(program, 'uSilence', a.silence);

    const bandsLoc = program.uniforms.get('uBands');
    if (bandsLoc) gl.uniform1fv(bandsLoc, a.bands);

    const pLoc = program.uniforms.get('uP');
    if (pLoc) gl.uniform1fv(pLoc, slots);

    const pal = paletteRgba(palette);
    this.set4f(program, 'uColorA', pal.a[0], pal.a[1], pal.a[2], 1);
    this.set4f(program, 'uColorB', pal.b[0], pal.b[1], pal.b[2], 1);
    this.set4f(program, 'uColorC', pal.c[0], pal.c[1], pal.c[2], 1);
    this.set4f(program, 'uColorD', pal.d[0], pal.d[1], pal.d[2], 1);
    this.set4f(program, 'uBackground', pal.background[0], pal.background[1], pal.background[2], 1);

    this.bindTexture('uSpectrum', this.spectrumTex, 0);
    this.bindTexture('uWaveform', this.waveformTex, 1);
    this.bindTexture('uPrev', this.hasPrevFrame ? this.prevRT.texture : this.blankTex, 2);
    this.set1f(program, 'uHasPrev', this.hasPrevFrame ? 1 : 0);
    const layerTex = this.imageTextures.get(layer.id);
    this.bindTexture('uTex0', layerTex ?? this.blankTex, 3);
    this.set1f(program, 'uHasTex0', layerTex ? 1 : 0);
  }

  /* ---------------------------------------------------------------- */
  /* Present                                                          */
  /* ---------------------------------------------------------------- */

  presentToCanvas(): void {
    const gl = this.gl;
    if (this.canvas.width !== this.width || this.canvas.height !== this.height) {
      this.canvas.width = this.width;
      this.canvas.height = this.height;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    gl.bindVertexArray(this.vao);
    this.useProgram(this.presentProgram);
    this.set1f(this.presentProgram, 'uExposure', 0);
    this.set1f(this.presentProgram, 'uChecker', 0);
    this.bindTexture('uTexture', this.outputTexture, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  /** Read the default framebuffer after {@link presentToCanvas} (used by tests). */
  readCanvas(out?: Uint8Array): Uint8Array {
    const gl = this.gl;
    const size = this.width * this.height * 4;
    const buffer = out && out.length >= size ? out : new Uint8Array(size);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, this.width, this.height, gl.RGBA, gl.UNSIGNED_BYTE, buffer);
    return buffer;
  }

  /** Read the composed frame back as RGBA bytes (row order: bottom-up). */
  readPixels(target: RenderTarget, out?: Uint8Array): Uint8Array {
    const gl = this.gl;
    const size = target.width * target.height * 4;
    const buffer = out && out.length >= size ? out : new Uint8Array(size);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.readPixels(0, 0, target.width, target.height, gl.RGBA, gl.UNSIGNED_BYTE, buffer);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return buffer;
  }
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
