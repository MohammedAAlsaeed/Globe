/**
 * The one WebGL2 context the land engine shares between land layers, plus
 * small helpers (programs, textures, framebuffers, full-target draws).
 *
 * `getGl()` returns null where WebGL2 (with float render targets) is not
 * available or the context was lost; callers then use the CPU path.
 */
import { QUAD_VS } from "./shaders";

export interface Gl {
  gl: WebGL2RenderingContext;
  canvas: HTMLCanvasElement;
  quad: WebGLVertexArrayObject;
  quadBuf: WebGLBuffer;
  programs: Map<string, Program>;
  maxTex: number;
  /** Bumped when the context is lost: every GPU object made before is gone. */
  generation: number;
}

export interface Program {
  prog: WebGLProgram;
  uniforms: Map<string, WebGLUniformLocation | null>;
}

let shared: Gl | null = null,
  unavailable = false,
  generation = 0;
const lossListeners = new Set<() => void>();

/** Called when the GPU context is lost (GPU objects are gone). */
export function onGlLost(fn: () => void) {
  lossListeners.add(fn);
  return () => lossListeners.delete(fn);
}

export function getGl(): Gl | null {
  if (shared) return shared.gl.isContextLost() ? null : shared;
  if (unavailable || typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: true,
  });
  if (!gl || !gl.getExtension("EXT_color_buffer_float")) {
    unavailable = true;
    return null;
  }
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    generation++;
    shared = null;
    for (const fn of lossListeners) fn();
  });
  canvas.addEventListener("webglcontextrestored", () => {
    for (const fn of lossListeners) fn();
  });
  const quad = gl.createVertexArray()!,
    quadBuf = gl.createBuffer()!;
  gl.bindVertexArray(quad);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  shared = {
    gl,
    canvas,
    quad,
    quadBuf,
    programs: new Map(),
    maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
    generation,
  };
  return shared;
}

/** Whether the GPU land engine can run here. */
export function gpuAvailable() {
  return !!getGl();
}

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
    throw new Error(`shader: ${gl.getShaderInfoLog(sh)}`);
  return sh;
}

/** A linked program (cached by name). */
export function program(g: Gl, name: string, fs: string, vs = QUAD_VS) {
  const hit = g.programs.get(name);
  if (hit) return hit;
  const { gl } = g,
    prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
    throw new Error(`program ${name}: ${gl.getProgramInfoLog(prog)}`);
  const p = { prog, uniforms: new Map() };
  g.programs.set(name, p);
  return p;
}

/** Binds a program and sets uniforms (numbers → float unless listed in
 * `ints`; arrays by length; WebGLTexture → next texture unit). */
export function bind(
  g: Gl,
  p: Program,
  uniforms: Record<
    string,
    | number
    | boolean
    | number[]
    | WebGLTexture
    | { int: number | number[] }
    | { uint: number }
  >,
) {
  const { gl } = g;
  gl.useProgram(p.prog);
  let unit = 0;
  for (const [name, v] of Object.entries(uniforms)) {
    let loc = p.uniforms.get(name);
    if (loc === undefined) {
      loc = gl.getUniformLocation(p.prog, name);
      p.uniforms.set(name, loc);
    }
    if (loc === null) continue;
    if (v instanceof WebGLTexture) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, v);
      gl.uniform1i(loc, unit++);
    } else if (typeof v === "boolean") gl.uniform1i(loc, v ? 1 : 0);
    else if (typeof v === "number") gl.uniform1f(loc, v);
    else if (Array.isArray(v)) {
      if (v.length === 2) gl.uniform2f(loc, v[0], v[1]);
      else if (v.length === 3) gl.uniform3f(loc, v[0], v[1], v[2]);
      else gl.uniform4f(loc, v[0], v[1], v[2], v[3]);
    } else if ("uint" in v) gl.uniform1ui(loc, v.uint >>> 0);
    else {
      const n = v.int;
      if (typeof n === "number") gl.uniform1i(loc, n);
      else if (n.length === 2) gl.uniform2i(loc, n[0], n[1]);
      else gl.uniform4i(loc, n[0], n[1], n[2], n[3]);
    }
  }
}

export type TexFormat = "r8" | "r16f" | "rg16ui" | "rgba8";

export interface Tex {
  tex: WebGLTexture;
  fb: WebGLFramebuffer;
  w: number;
  h: number;
  format: TexFormat;
}

export function makeTex(
  g: Gl,
  w: number,
  h: number,
  format: TexFormat,
  linear = false,
): Tex {
  const { gl } = g,
    tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  const [internal, fmt, type] =
    format === "r8"
      ? [gl.R8, gl.RED, gl.UNSIGNED_BYTE]
      : format === "r16f"
        ? [gl.R16F, gl.RED, gl.HALF_FLOAT]
        : format === "rg16ui"
          ? [gl.RG16UI, gl.RG_INTEGER, gl.UNSIGNED_SHORT]
          : [gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE];
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, fmt, type, null);
  const filter = linear && format !== "rg16ui" ? gl.LINEAR : gl.NEAREST;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fb = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    tex,
    0,
  );
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fb, w, h, format };
}

export function freeTex(g: Gl, t: Tex | null) {
  if (!t) return;
  g.gl.deleteTexture(t.tex);
  g.gl.deleteFramebuffer(t.fb);
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Binds a texture's framebuffer with a viewport over all of it, and a
 * scissor limited to `clip` (texels) when given. */
export function target(g: Gl, t: Tex | null, clip?: Rect | null) {
  const { gl } = g;
  gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fb : null);
  const w = t ? t.w : g.canvas.width,
    h = t ? t.h : g.canvas.height;
  gl.viewport(0, 0, w, h);
  if (clip) {
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(clip.x, clip.y, clip.w, clip.h);
  } else gl.disable(gl.SCISSOR_TEST);
}

/** Draws the full-target quad. */
export function drawQuad(g: Gl) {
  g.gl.bindVertexArray(g.quad);
  g.gl.drawArrays(g.gl.TRIANGLE_STRIP, 0, 4);
  g.gl.bindVertexArray(null);
}

export function clearTarget(g: Gl, v = 0) {
  g.gl.clearColor(v, v, v, v);
  g.gl.clear(g.gl.COLOR_BUFFER_BIT);
}

/** Intersection and union of rects (null = empty). */
export function intersect(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x),
    y = Math.max(a.y, b.y),
    x1 = Math.min(a.x + a.w, b.x + b.w),
    y1 = Math.min(a.y + a.h, b.y + b.h);
  return x1 > x && y1 > y ? { x, y, w: x1 - x, h: y1 - y } : null;
}
export function union(a: Rect | null, b: Rect | null): Rect | null {
  if (!a) return b;
  if (!b) return a;
  const x = Math.min(a.x, b.x),
    y = Math.min(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  };
}
export function grow(r: Rect, by: number): Rect {
  return { x: r.x - by, y: r.y - by, w: r.w + 2 * by, h: r.h + 2 * by };
}
