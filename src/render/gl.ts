/**
 * Low-level WebGL2 helpers: shader compilation with useful error messages,
 * render targets, full-screen geometry and data textures.
 */

export class ShaderCompileError extends Error {
  readonly log: string;
  readonly stage: 'vertex' | 'fragment';
  constructor(stage: 'vertex' | 'fragment', log: string) {
    super(`${stage} shader compilation failed:\n${log}`);
    this.name = 'ShaderCompileError';
    this.stage = stage;
    this.log = log;
  }
}

export interface ProgramInfo {
  program: WebGLProgram;
  uniforms: Map<string, WebGLUniformLocation>;
  attribs: Map<string, number>;
  label: string;
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Unable to create shader object');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'unknown error';
    gl.deleteShader(shader);
    throw new ShaderCompileError(type === gl.VERTEX_SHADER ? 'vertex' : 'fragment', log.trim());
  }
  return shader;
}

export function createProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
  label = 'program',
): ProgramInfo {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);

  const program = gl.createProgram();
  if (!program) throw new Error('Unable to create program object');
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? 'unknown link error';
    gl.deleteProgram(program);
    throw new Error(`Program "${label}" failed to link:\n${log}`);
  }

  const uniforms = new Map<string, WebGLUniformLocation>();
  const uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < uniformCount; i++) {
    const info = gl.getActiveUniform(program, i);
    if (!info) continue;
    // Array uniforms report as "name[0]"; store both spellings.
    const base = info.name.replace(/\[0\]$/, '');
    const loc = gl.getUniformLocation(program, info.name);
    if (loc) uniforms.set(base, loc);
  }

  const attribs = new Map<string, number>();
  const attribCount = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES) as number;
  for (let i = 0; i < attribCount; i++) {
    const info = gl.getActiveAttrib(program, i);
    if (!info) continue;
    attribs.set(info.name, gl.getAttribLocation(program, info.name));
  }

  return { program, uniforms, attribs, label };
}

export function deleteProgram(gl: WebGL2RenderingContext, info: ProgramInfo | null): void {
  if (info) gl.deleteProgram(info.program);
}

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

/** A single oversized triangle covering the viewport. */
export function createFullscreenTriangle(gl: WebGL2RenderingContext): WebGLVertexArrayObject {
  const vao = gl.createVertexArray();
  if (!vao) throw new Error('Unable to create VAO');
  gl.bindVertexArray(vao);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  gl.bindVertexArray(null);
  return vao;
}

/* ------------------------------------------------------------------ */
/* Render targets                                                      */
/* ------------------------------------------------------------------ */

export interface RenderTargetOptions {
  /** Use a half-float target so additive/bloom passes do not clip. */
  float?: boolean;
  linear?: boolean;
}

export class RenderTarget {
  readonly gl: WebGL2RenderingContext;
  texture: WebGLTexture | null = null;
  fbo: WebGLFramebuffer | null = null;
  width = 0;
  height = 0;
  private readonly options: RenderTargetOptions;

  constructor(gl: WebGL2RenderingContext, width: number, height: number, options: RenderTargetOptions = {}) {
    this.gl = gl;
    this.options = options;
    this.resize(width, height);
  }

  resize(width: number, height: number): void {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    if (this.texture && this.width === w && this.height === h) return;
    this.width = w;
    this.height = h;

    const gl = this.gl;
    this.dispose();

    const tex = gl.createTexture();
    if (!tex) throw new Error('Unable to create render target texture');
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const float = this.options.float ?? true;
    if (float) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    const filter = this.options.linear === false ? gl.NEAREST : gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const fbo = gl.createFramebuffer();
    if (!fbo) throw new Error('Unable to create framebuffer');
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      // Fall back to an 8-bit target when float rendering is unsupported.
      if (float) {
        gl.deleteFramebuffer(fbo);
        gl.deleteTexture(tex);
        this.options.float = false;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        this.texture = null;
        this.fbo = null;
        this.resize(w, h);
        return;
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      throw new Error(`Incomplete framebuffer (0x${status.toString(16)})`);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.texture = tex;
    this.fbo = fbo;
  }

  bind(): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.width, this.height);
  }

  clear(r = 0, g = 0, b = 0, a = 1): void {
    const gl = this.gl;
    gl.clearColor(r, g, b, a);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  dispose(): void {
    const gl = this.gl;
    if (this.fbo) gl.deleteFramebuffer(this.fbo);
    if (this.texture) gl.deleteTexture(this.texture);
    this.fbo = null;
    this.texture = null;
  }
}

/* ------------------------------------------------------------------ */
/* Data textures                                                       */
/* ------------------------------------------------------------------ */

export function createDataTexture(
  gl: WebGL2RenderingContext,
  data: Float32Array,
  width: number,
  height = 1,
  filter: number = gl.LINEAR,
): WebGLTexture {
  const tex = gl.createTexture();
  if (!tex) throw new Error('Unable to create data texture');
  // R16F is texture-filterable in core WebGL2 (R32F would need
  // OES_texture_float_linear), and 16-bit precision is ample for 0..1 features.
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, width, height, 0, gl.RED, gl.FLOAT, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

export function updateDataTexture(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  data: Float32Array,
  width: number,
  height = 1,
): void {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RED, gl.FLOAT, data);
}

export function createImageTexture(
  gl: WebGL2RenderingContext,
  source: TexImageSource,
): WebGLTexture {
  const tex = gl.createTexture();
  if (!tex) throw new Error('Unable to create image texture');
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

export function createBlankTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const tex = gl.createTexture();
  if (!tex) throw new Error('Unable to create placeholder texture');
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  return tex;
}

/* ------------------------------------------------------------------ */
/* Color utilities                                                     */
/* ------------------------------------------------------------------ */

export type Rgba = [number, number, number, number];

export function hexToRgba(hex: string, alpha = 1): Rgba {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length === 6) h += 'ff';
  if (h.length !== 8) return [1, 1, 1, alpha];
  const num = parseInt(h, 16);
  return [
    ((num >>> 24) & 255) / 255,
    ((num >>> 16) & 255) / 255,
    ((num >>> 8) & 255) / 255,
    (((num & 255) / 255) * alpha),
  ];
}

/** Convert a hex colour to linear-ish sRGB floats without gamma correction. */
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
