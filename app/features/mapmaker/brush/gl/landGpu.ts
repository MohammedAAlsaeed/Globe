/**
 * The land engine on the GPU (WebGL2). One instance per land layer.
 *
 * Fields, all at the layer's base resolution (the project size, between
 * 2048 and 4096 px wide), in image space:
 *
 *   committed  coverage of every land object (Land tool), in order
 *   mask       committed + the object being drawn right now
 *   cov        mask after the coast's smoothing (= mask when none)
 *   sdf        signed distance to the coast, capped just past the widest
 *              decoration (R16F, bilinear: the edge stays sharp at any zoom)
 *   coarse     the same at ¼ resolution, far out to sea (depth shading)
 *   texture    the land texture: base texture + texture paint
 *
 * Every edit updates only the rectangle it touched: the mask is redrawn
 * there, and the distance field is re-flooded (jump flooding) in that
 * rectangle grown by the field's cap, in windows small enough to keep GPU
 * memory bounded. Drawing is therefore live: the coast — waves, beach,
 * outline — follows the brush as it moves.
 *
 * A seamless map (its left and right edges meet, as on a globe) floods
 * across that seam: windows reach past one edge into the other side, and
 * the fields are sampled with horizontal repeat, so the coast's decoration
 * and the depth shading continue unbroken where the edges join.
 *
 * Output is composed for any window of the map at any resolution
 * (`render`): the visible part of the screen at screen resolution, or an
 * export in tiles. The formulas mirror ../coastfx.ts (the CPU fallback).
 */
import { DETAIL_AMP, detailOctaves } from "../coastfx";
import { fillSource, makeCanvas, type RenderedPaint } from "../engine";
import { landStroke, renderLand } from "../land";
import { drawTexturePaint, rasterAt } from "../landLayer";
import {
  StrokeBuilder,
  STROKE_STEP,
  strokeBounds,
  strokeReach,
  type RoughStroke,
} from "../roughStroke";
import type { CoastEffect, MMLand, MMPaint, PaintSource } from "../../types";
import {
  clearTarget,
  drawQuad,
  freeTex,
  getGl,
  grow,
  intersect,
  makeTex,
  program,
  target,
  union,
  bind,
  type Gl,
  type Rect,
  type Tex,
} from "./glContext";
import {
  BLUR_FS,
  COMPOSE_FS,
  COPY_FS,
  DOWN_FS,
  ISLET_FS,
  JFA_FS,
  RASTER_FS,
  RECT_VS,
  SDF_FS,
  SEED_FS,
  STROKE_FS,
  STROKE_VS,
} from "./shaders";

/** Base resolution bounds (long edge). */
const BASE_MIN = 2048,
  BASE_MAX = 4096;
/** Coarse field: one texel per COARSE fine texels. */
const COARSE = 4;
/** Largest window flooded at once (texels, before its margin). */
const CHUNK = 1024;

export interface LiveLand {
  obj: MMLand;
  /** Bumped whenever the object changed (it is mutated while drawing). */
  rev: number;
}

export interface LandGpuInput {
  lands: MMLand[];
  live: LiveLand | null;
  paints: MMPaint[];
  base: PaintSource;
  fx: CoastEffect;
  seed: number;
}

/** A window of the map, in map units (both axes ÷ map width). */
export interface MapView {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The base resolution for a project size. */
export function landBaseSize(
  projectW: number,
  projectH: number,
  maxTex = 16384,
) {
  const long = Math.max(projectW, projectH),
    target = Math.min(maxTex, Math.max(BASE_MIN, Math.min(BASE_MAX, long))),
    k = target / long;
  return {
    w: Math.max(1, Math.round(projectW * k)),
    h: Math.max(1, Math.round(projectH * k)),
  };
}

const hexRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** How far (map units) the decoration reaches from the coast: the fine
 * distance field is capped just past it. */
function fineReach(fx: CoastEffect) {
  const waves = Math.round(fx.waves),
    waveEnd =
      waves > 0 && fx.waveOpacity > 0
        ? fx.waveOffset + (waves - 1) * fx.waveSpacing + fx.waveWidth
        : 0;
  return Math.max(
    fx.glowOpacity > 0 ? fx.glowWidth : 0,
    waveEnd,
    fx.shoreStrength > 0 ? fx.shoreWidth * 1.6 : 0,
    fx.landShade !== 0 ? fx.landShadeWidth * 1.6 : 0,
    fx.outlineWidth,
    fx.islets > 0 ? 0.035 : 0,
    DETAIL_AMP * 3,
  );
}

/** What changes the distance field (everything else is decoration). */
function fieldKey(fx: CoastEffect) {
  return [
    fx.smoothing,
    fx.islets,
    fineReach(fx).toFixed(5),
    fx.depthStrength > 0 ? fx.depthDistance : 0,
  ].join("|");
}

type Segs = { data: Float32Array; count: number; bounds: Rect | null };

export class GpuLandLayer {
  readonly bw: number;
  readonly bh: number;
  private g: Gl;
  private generation: number;
  private committed: Tex;
  private mask: Tex;
  private scratch: Tex;
  private liveFixed: Tex | null = null;
  private covTmp: Tex;
  private cov: Tex;
  private cov2: Tex | null = null;
  private sdf: Tex;
  private sdf2: Tex | null = null;
  private coarseCov: Tex;
  private coarse: Tex;
  private texture: Tex;
  private seedsA: Tex | null = null;
  private seedsB: Tex | null = null;
  private segBuf: WebGLBuffer;
  private segVao: WebGLVertexArrayObject;
  private strokes = new WeakMap<MMLand, RoughStroke>();

  private lands: MMLand[] = [];
  private live: {
    obj: MMLand;
    rev: number;
    builder: StrokeBuilder | null;
    fed: number;
    fixedDrawn: number;
    rect: Rect | null;
    /** Shapes: the current raster (the object is mutated while drawing). */
    raster: RenderedPaint | null;
  } | null = null;
  private liveTex: WebGLTexture | null = null;
  private fx: CoastEffect | null = null;
  private fieldKeyNow = "";
  private seed = 0;
  private capFine = 2;
  /** Coarse field area still to update, and when it last was. */
  private coarsePending: Rect | null = null;
  private coarseAt = 0;
  private capCoarse = 2;
  private hasLand = false;
  // land texture
  private texCanvas: HTMLCanvasElement | null = null;
  private texBase: PaintSource | null = null;
  private texPaints: MMPaint[] = [];
  /** The left and right edges meet (MMProject.seamless). */
  readonly wrap: boolean;

  constructor(projectW: number, projectH: number, wrap = false) {
    const g = getGl();
    if (!g) throw new Error("WebGL2 unavailable");
    this.g = g;
    this.generation = g.generation;
    const { w, h } = landBaseSize(projectW, projectH, g.maxTex);
    this.bw = w;
    this.bh = h;
    this.committed = makeTex(g, w, h, "r8");
    this.mask = makeTex(g, w, h, "r8");
    this.scratch = makeTex(g, w, h, "r8");
    this.covTmp = makeTex(g, w, h, "r8");
    this.cov = makeTex(g, w, h, "r8");
    this.sdf = makeTex(g, w, h, "r16f", true);
    const cw = Math.ceil(w / COARSE),
      ch = Math.ceil(h / COARSE);
    this.coarseCov = makeTex(g, cw, ch, "r8");
    this.coarse = makeTex(g, cw, ch, "r16f", true);
    this.texture = makeTex(g, w, h, "rgba8", true);
    this.wrap = wrap;
    if (wrap)
      for (const t of [this.sdf, this.coarse, this.texture]) this.repeatX(t);
    for (const t of [this.committed, this.mask, this.cov]) {
      target(g, t);
      clearTarget(g, 0);
    }
    const { gl } = g;
    this.segBuf = gl.createBuffer()!;
    this.segVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.segVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, g.quadBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.segBuf);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.bindVertexArray(null);
  }

  /** False once the GPU context is gone (the layer must be rebuilt). */
  get alive() {
    const g = getGl();
    return !!g && g === this.g && g.generation === this.generation;
  }

  /** Horizontal repeat, so sampling across the seam reads the other side. */
  private repeatX(t: Tex) {
    const { gl } = this.g;
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  }

  /** The parts of `r` on a field `w` × `h` texels: clipped to it, or on a
   * seamless map with what reaches past the left or right edge brought in
   * from the other side. */
  private parts(r: Rect | null, w: number, h: number): Rect[] {
    if (!r) return [];
    const y = Math.max(0, r.y),
      hh = Math.min(h, r.y + r.h) - y;
    if (hh <= 0) return [];
    if (!this.wrap) {
      const x = Math.max(0, r.x),
        ww = Math.min(w, r.x + r.w) - x;
      return ww > 0 ? [{ x, y, w: ww, h: hh }] : [];
    }
    if (r.w >= w) return [{ x: 0, y, w, h: hh }];
    const a = ((r.x % w) + w) % w,
      b = a + r.w;
    return b <= w
      ? [{ x: a, y, w: r.w, h: hh }]
      : [
          { x: a, y, w: w - a, h: hh },
          { x: 0, y, w: b - w, h: hh },
        ];
  }

  private get full(): Rect {
    return { x: 0, y: 0, w: this.bw, h: this.bh };
  }
  private clip(r: Rect | null): Rect | null {
    return r && intersect(r, this.full);
  }

  // ---- objects ------------------------------------------------------------------------
  private strokeOf(o: MMLand) {
    let s = this.strokes.get(o);
    if (!s) {
      s = landStroke(o, this.bh / this.bw);
      this.strokes.set(o, s);
    }
    return s;
  }
  private segments(s: RoughStroke, from = 0, to = s.line.length): Segs {
    const line = s.line.length === 1 ? [s.line[0], s.line[0]] : s.line,
      a = Math.max(0, from),
      b = Math.min(line.length, Math.max(to, a + 2)),
      n = Math.max(0, b - a - 1),
      data = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const p = line[a + i],
        q = line[a + i + 1];
      data.set([p.x, p.y, q.x, q.y], i * 4);
    }
    return {
      data,
      count: n,
      bounds: n
        ? strokeBounds({ ...s, line: line.slice(a, b) }, this.bw)
        : null,
    };
  }
  private bounds(o: MMLand): Rect | null {
    if (o.mode === "free") {
      const s = this.strokeOf(o);
      return s.line.length && s.radius > 0 ? strokeBounds(s, this.bw) : null;
    }
    const r = rasterAt(o, this.bw, this.bh);
    return r ? { x: r.x, y: r.y, w: r.canvas.width, h: r.canvas.height } : null;
  }

  /** Draws stroke segments into `t` with MAX (t must be single-channel). */
  private drawSegments(s: RoughStroke, segs: Segs, t: Tex, clip: Rect) {
    if (!segs.count) return;
    const g = this.g,
      { gl } = g;
    target(g, t, clip);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.MAX);
    gl.blendFunc(gl.ONE, gl.ONE);
    bind(g, program(g, "stroke", STROKE_FS, STROKE_VS), {
      reach: strokeReach(s) + 2 / this.bw,
      unit: this.bw,
      target: [t.w, t.h],
      radius: s.radius,
      rough: s.roughness,
      octaves: { int: s.octaves },
      seed: { uint: s.seed },
    });
    gl.bindBuffer(gl.ARRAY_BUFFER, this.segBuf);
    gl.bufferData(gl.ARRAY_BUFFER, segs.data, gl.STREAM_DRAW);
    gl.bindVertexArray(this.segVao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, segs.count);
    gl.bindVertexArray(null);
    gl.blendEquation(gl.FUNC_ADD);
    gl.disable(gl.BLEND);
  }

  /** Blends a single-channel coverage texture into `dst` within `clip`:
   * land is added over, removals cut out. */
  private blendCoverage(src: Tex, dst: Tex, clip: Rect, erase: boolean) {
    const g = this.g,
      { gl } = g;
    target(g, dst, clip);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    if (erase) gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_COLOR);
    else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
    bind(g, program(g, "copy", COPY_FS), {
      src: src.tex,
      offset: { int: [0, 0] },
    });
    drawQuad(g);
    gl.disable(gl.BLEND);
  }

  private copy(src: Tex, dst: Tex, clip: Rect) {
    const g = this.g;
    target(g, dst, clip);
    bind(g, program(g, "copy", COPY_FS), {
      src: src.tex,
      offset: { int: [0, 0] },
    });
    drawQuad(g);
  }

  /** GL copies of land shape rasters (few, most recent kept). */
  private rasterTex = new Map<HTMLCanvasElement, WebGLTexture>();
  private uploadRaster(canvas: HTMLCanvasElement, t: WebGLTexture) {
    const { gl } = this.g;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  private rasterTexture(canvas: HTMLCanvasElement) {
    const hit = this.rasterTex.get(canvas);
    if (hit) {
      this.rasterTex.delete(canvas);
      this.rasterTex.set(canvas, hit);
      return hit;
    }
    const t = this.uploadRaster(canvas, this.g.gl.createTexture()!);
    this.rasterTex.set(canvas, t);
    if (this.rasterTex.size > 48) {
      const [k, old] = this.rasterTex.entries().next().value!;
      this.g.gl.deleteTexture(old);
      this.rasterTex.delete(k);
    }
    return t;
  }

  /** Draws a land shape raster into `dst` within `clip`. */
  private drawRaster(
    raster: RenderedPaint,
    tex: WebGLTexture,
    dst: Tex,
    clip: Rect,
    erase: boolean,
  ) {
    const g = this.g,
      { gl } = g;
    target(g, dst, clip);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    if (erase) gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_COLOR);
    else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
    bind(g, program(g, "raster", RASTER_FS, RECT_VS), {
      src: tex,
      rect: [raster.x, raster.y, raster.canvas.width, raster.canvas.height],
      target: [dst.w, dst.h],
    });
    drawQuad(g);
    gl.disable(gl.BLEND);
  }

  /** Draws one land object into `dst` within `clip` (add or cut out). */
  private drawObject(o: MMLand, dst: Tex, clip: Rect) {
    const b = this.bounds(o),
      r = b && intersect(b, clip);
    if (!r) return;
    if (o.mode === "free") {
      const s = this.strokeOf(o);
      target(this.g, this.scratch, r);
      clearTarget(this.g, 0);
      this.drawSegments(s, this.segments(s), this.scratch, r);
      this.blendCoverage(this.scratch, dst, r, o.erase);
      return;
    }
    const raster = rasterAt(o, this.bw, this.bh);
    if (raster)
      this.drawRaster(
        raster,
        this.rasterTexture(raster.canvas),
        dst,
        r,
        o.erase,
      );
  }

  /** Redraws `committed` inside `r` from every land object. */
  private redrawCommitted(r: Rect) {
    target(this.g, this.committed, r);
    clearTarget(this.g, 0);
    for (const o of this.lands) this.drawObject(o, this.committed, r);
  }

  /** mask = committed + the live object, inside `r`. */
  private refreshMask(r: Rect) {
    this.copy(this.committed, this.mask, r);
    const live = this.live;
    if (!live) return;
    const o = live.obj;
    if (o.mode !== "free") {
      const raster = live.raster,
        rr =
          raster &&
          intersect(
            {
              x: raster.x,
              y: raster.y,
              w: raster.canvas.width,
              h: raster.canvas.height,
            },
            r,
          );
      if (raster && rr && this.liveTex)
        this.drawRaster(raster, this.liveTex, this.mask, rr, o.erase);
      return;
    }
    if (!live.builder || !this.liveFixed) return;
    const s = { ...this.strokeOf(o), line: live.builder.polyline() };
    this.copy(this.liveFixed, this.scratch, r);
    const tail = this.segments(s, live.fixedDrawn - 1);
    this.drawSegments(s, tail, this.scratch, r);
    this.blendCoverage(this.scratch, this.mask, r, o.erase);
  }

  // ---- distance fields ---------------------------------------------------------------
  private seeds(w: number, h: number) {
    const g = this.g;
    if (!this.seedsA || this.seedsA.w < w || this.seedsA.h < h) {
      freeTex(g, this.seedsA);
      freeTex(g, this.seedsB);
      const sw = Math.max(w, this.seedsA?.w ?? 0),
        sh = Math.max(h, this.seedsA?.h ?? 0);
      this.seedsA = makeTex(g, sw, sh, "rg16ui");
      this.seedsB = makeTex(g, sw, sh, "rg16ui");
    }
    return [this.seedsA, this.seedsB!] as const;
  }

  /** Signed distance of `cov` into `out` (capped at `cap` texels), redone
   * inside `region` only. */
  private flood(cov: Tex, out: Tex, region: Rect, cap: number) {
    const g = this.g,
      { gl } = g,
      all = { x: 0, y: 0, w: cov.w, h: cov.h };
    const margin = Math.ceil(cap) + 2;
    let kmax = 1;
    while (kmax < cap + 1) kmax *= 2;
    for (const q of this.parts(region, cov.w, cov.h))
      for (let cy = q.y; cy < q.y + q.h; cy += CHUNK)
        for (let cx = q.x; cx < q.x + q.w; cx += CHUNK) {
          const chunk = {
              x: cx,
              y: cy,
              w: Math.min(CHUNK, q.x + q.w - cx),
              h: Math.min(CHUNK, q.y + q.h - cy),
            },
            grown = grow(chunk, margin),
            // seamless: the window may reach past the left or right edge
            e = this.wrap
              ? {
                  x: grown.x,
                  y: Math.max(0, grown.y),
                  w: grown.w,
                  h: Math.min(all.h, grown.y + grown.h) - Math.max(0, grown.y),
                }
              : intersect(grown, all)!;
          const [A, B] = this.seeds(e.w, e.h);
          // seeds
          gl.bindFramebuffer(gl.FRAMEBUFFER, A.fb);
          gl.viewport(0, 0, e.w, e.h);
          gl.disable(gl.SCISSOR_TEST);
          bind(g, program(g, "seed", SEED_FS), {
            cov: cov.tex,
            org: { int: [e.x, e.y] },
            size: { int: [cov.w, cov.h] },
            wrap: this.wrap,
          });
          drawQuad(g);
          // flood
          let src = A,
            dst = B;
          const steps: number[] = [];
          for (let k = kmax; k >= 1; k >>= 1) steps.push(k);
          steps.push(1);
          const jfa = program(g, "jfa", JFA_FS);
          for (const k of steps) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
            gl.viewport(0, 0, e.w, e.h);
            bind(g, jfa, {
              src: src.tex,
              step: { int: k },
              wsize: { int: [e.w, e.h] },
            });
            drawQuad(g);
            [src, dst] = [dst, src];
          }
          // signed distance for the chunk
          target(g, out, chunk);
          bind(g, program(g, "sdf", SDF_FS), {
            seeds: src.tex,
            cov: cov.tex,
            org: { int: [e.x, e.y] },
            cap,
          });
          drawQuad(g);
        }
  }

  /** Rebuilds every field inside `r` (fine texels) after the mask changed
   * there. */
  private rebuildFields(r: Rect) {
    const g = this.g,
      fx = this.fx!,
      W = this.bw,
      H = this.bh,
      blurR = Math.round(fx.smoothing * 0.005 * this.bw);
    if (!this.parts(r, W, H).length) return;
    // 1. smoothing (on a seamless map, across the seam too)
    const o = blurR >= 1 ? grow(r, blurR) : r;
    if (blurR >= 1) {
      const blur = program(g, "blur", BLUR_FS);
      for (const p of this.parts(o, W, H)) {
        target(
          g,
          this.covTmp,
          this.clip({ ...p, y: p.y - blurR, h: p.h + 2 * blurR })!,
        );
        bind(g, blur, {
          src: this.mask.tex,
          r: { int: blurR },
          dir: { int: [1, 0] },
          size: { int: [W, H] },
          wrap: this.wrap,
        });
        drawQuad(g);
        target(g, this.cov, p);
        bind(g, blur, {
          src: this.covTmp.tex,
          r: { int: blurR },
          dir: { int: [0, 1] },
          size: { int: [W, H] },
          wrap: this.wrap,
        });
        drawQuad(g);
      }
    } else
      for (const p of this.parts(o, W, H)) this.copy(this.mask, this.cov, p);
    // 2. fine distance
    const q = grow(o, Math.ceil(this.capFine));
    this.flood(this.cov, this.sdf, q, this.capFine);
    let finalCov = this.cov,
      changed = q;
    // 3. islets (then the distance once more, around them)
    if (fx.islets > 0) {
      if (!this.cov2) this.cov2 = makeTex(g, W, H, "r8");
      if (!this.sdf2) {
        this.sdf2 = makeTex(g, W, H, "r16f", true);
        if (this.wrap) this.repeatX(this.sdf2);
      }
      for (const p of this.parts(q, W, H)) {
        target(g, this.cov2, p);
        bind(g, program(g, "islet", ISLET_FS), {
          cov: this.cov.tex,
          sdf: this.sdf.tex,
          unit: this.bw,
          islets: fx.islets,
          seed: { uint: this.seed },
        });
        drawQuad(g);
      }
      changed = grow(q, Math.ceil(this.capFine));
      this.flood(this.cov2, this.sdf2, changed, this.capFine);
      finalCov = this.cov2;
    }
    // 4. coarse distance (depth shading far out to sea). Depth is a slow,
    // soft gradient: while drawing it catches up a few times a second.
    this.coarsePending = union(changed, this.coarsePending);
    if (this.live && performance.now() - this.coarseAt < 250) return;
    this.rebuildCoarse(finalCov);
  }

  /** Updates the coarse distance field where it is out of date. */
  private rebuildCoarse(
    finalCov: Tex = this.fx!.islets > 0 && this.cov2 ? this.cov2 : this.cov,
  ) {
    const g = this.g,
      fx = this.fx!,
      changed = this.coarsePending;
    this.coarsePending = null;
    this.coarseAt = performance.now();
    if (!changed || fx.depthStrength <= 0) return;
    const c = {
        x: Math.floor(changed.x / COARSE),
        y: Math.floor(changed.y / COARSE),
        w:
          Math.ceil((changed.x + changed.w) / COARSE) -
          Math.floor(changed.x / COARSE),
        h:
          Math.ceil((changed.y + changed.h) / COARSE) -
          Math.floor(changed.y / COARSE),
      },
      cw = this.coarse.w,
      ch = this.coarse.h,
      down = this.parts(c, cw, ch);
    if (!down.length) return;
    for (const p of down) {
      target(g, this.coarseCov, p);
      bind(g, program(g, "down", DOWN_FS), {
        src: finalCov.tex,
        k: { int: COARSE },
        size: { int: [this.bw, this.bh] },
      });
      drawQuad(g);
    }
    this.flood(
      this.coarseCov,
      this.coarse,
      grow(c, Math.ceil(this.capCoarse)),
      this.capCoarse,
    );
  }

  // ---- the layer's land texture ----------------------------------------------------------
  private updateTexture(base: PaintSource, paints: MMPaint[]) {
    const g = this.g,
      { gl } = g,
      W = this.bw,
      H = this.bh;
    const prev = this.texPaints,
      appended =
        this.texCanvas &&
        base === this.texBase &&
        paints.length >= prev.length &&
        prev.every((p, i) => p === paints[i]);
    if (appended && paints.length === prev.length) return false;
    let rect: Rect | null = null;
    if (!appended || !this.texCanvas) {
      this.texCanvas ??= makeCanvas(W, H);
      const ctx = this.texCanvas.getContext("2d")!;
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      fillSource(ctx, base, W, 0, 0, W, H);
      drawTexturePaint(ctx, paints, base, W, H);
      rect = this.full;
    } else {
      const added = paints.slice(prev.length),
        ctx = this.texCanvas.getContext("2d")!;
      drawTexturePaint(ctx, added, base, W, H);
      for (const p of added) {
        const r = rasterAt(p, W, H);
        if (r)
          rect = union(rect, {
            x: r.x,
            y: r.y,
            w: r.canvas.width,
            h: r.canvas.height,
          });
      }
      rect = this.clip(rect);
    }
    this.texBase = base;
    this.texPaints = paints;
    if (!rect) return true;
    gl.bindTexture(gl.TEXTURE_2D, this.texture.tex);
    if (rect.w === W && rect.h === H)
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA8,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        this.texCanvas,
      );
    else {
      const data = this.texCanvas
        .getContext("2d")!
        .getImageData(rect.x, rect.y, rect.w, rect.h);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        rect.x,
        rect.y,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        data,
      );
    }
    return true;
  }

  // ---- update ---------------------------------------------------------------------------
  /** Advances the object being drawn to its current state; returns the
   * rectangle whose mask changed. */
  private stepLive(live: LiveLand): Rect | null {
    const o = live.obj;
    if (!this.live || this.live.obj !== o) {
      this.live = {
        obj: o,
        rev: -1,
        builder: null,
        fed: 0,
        fixedDrawn: 0,
        rect: null,
        raster: null,
      };
      if (o.mode === "free") {
        const s = landStroke(o, this.bh / this.bw);
        this.live.builder = new StrokeBuilder(
          Math.max(1e-5, s.radius * STROKE_STEP),
        );
        this.strokes.set(o, { ...s, line: [] });
        this.liveFixed ??= makeTex(this.g, this.bw, this.bh, "r8");
        target(this.g, this.liveFixed);
        clearTarget(this.g, 0);
      }
    }
    const L = this.live;
    if (live.rev === L.rev) return null;
    L.rev = live.rev;
    let r: Rect | null = L.rect;
    if (o.mode === "free" && L.builder) {
      const aspect = this.bh / this.bw,
        pts = o.points;
      for (; L.fed < pts.length; L.fed++)
        L.builder.feed({ x: pts[L.fed].x, y: pts[L.fed].y * aspect });
      const s = { ...this.strokeOf(o), line: L.builder.polyline() },
        fixed = L.builder.fixedCount;
      // The object is mutated in place: keep its cached stroke in step.
      this.strokes.set(o, s);
      if (fixed > L.fixedDrawn) {
        const segs = this.segments(s, Math.max(0, L.fixedDrawn - 1), fixed),
          b = this.clip(segs.bounds);
        if (b) this.drawSegments(s, segs, this.liveFixed!, b);
        r = union(r, segs.bounds);
        L.fixedDrawn = fixed;
      }
      L.rect = this.segments(s, L.fixedDrawn - 1).bounds;
      return union(r, L.rect);
    }
    // shapes: re-rasterize (full quality: what you see is what is kept)
    L.raster = renderLand(o, this.bw, this.bh);
    if (L.raster) {
      this.liveTex ??= this.g.gl.createTexture()!;
      this.uploadRaster(L.raster.canvas, this.liveTex);
    }
    L.rect = L.raster
      ? {
          x: L.raster.x,
          y: L.raster.y,
          w: L.raster.canvas.width,
          h: L.raster.canvas.height,
        }
      : null;
    return union(r, L.rect);
  }

  /**
   * Brings the layer up to date: only what changed is redrawn and
   * re-flooded. Returns whether its image changed.
   */
  update(input: LandGpuInput): boolean {
    const { lands, live, fx, seed } = input;
    let changed = this.updateTexture(input.base, input.paints);
    const key = fieldKey(fx),
      fieldChanged = key !== this.fieldKeyNow || seed !== this.seed;
    if (fx !== this.fx) changed = true;
    this.fx = fx;
    this.seed = seed;
    if (fieldChanged) {
      this.fieldKeyNow = key;
      this.capFine = fineReach(fx) * this.bw + 4;
      this.capCoarse =
        (fx.depthStrength > 0 ? fx.depthDistance : 0) * (this.bw / COARSE) + 2;
    }

    let dirty: Rect | null = null;
    const prevLive = this.live,
      // The object just drawn was kept: bring it to its final state first,
      // so the mask already holds exactly what gets committed.
      finishing = !!prevLive && !live && lands.includes(prevLive.obj);
    if (live) dirty = union(dirty, this.stepLive(live));
    else if (finishing)
      dirty = union(
        dirty,
        this.stepLive({ obj: prevLive!.obj, rev: prevLive!.rev + 1 }),
      );

    // committed land objects
    const prev = this.lands;
    if (lands !== prev) {
      const prevSet = new Set(prev),
        nextSet = new Set(lands),
        added = lands.filter((o) => !prevSet.has(o)),
        removed = prev.filter((o) => !nextSet.has(o)),
        appendOnly =
          removed.length === 0 && prev.every((o, i) => lands[i] === o);
      this.lands = lands;
      if (appendOnly) {
        for (const o of added) {
          const b = this.clip(this.bounds(o));
          if (!b) continue;
          this.drawObject(o, this.committed, b);
          // the object just drawn live is in the mask as it is already
          if (!(finishing && o === prevLive!.obj)) dirty = union(dirty, b);
        }
      } else {
        let r: Rect | null = null;
        for (const o of [...added, ...removed]) r = union(r, this.bounds(o));
        if (!added.length && !removed.length) r = this.full; // reordered
        r = this.clip(r);
        if (r) {
          this.redrawCommitted(r);
          dirty = union(dirty, r);
        }
      }
    }

    if (!live && prevLive) {
      // cancelled: its area goes back to what it was
      if (!finishing)
        dirty = union(
          union(dirty, prevLive.rect),
          this.liveBounds(prevLive.obj),
        );
      this.live = null;
    }

    if (fieldChanged) dirty = this.full;
    dirty = this.clip(dirty);
    if (dirty) {
      this.refreshMask(dirty);
      this.rebuildFields(dirty);
      changed = true;
    } else if (!this.live && this.coarsePending) {
      this.rebuildCoarse();
      changed = true;
    }
    this.hasLand = lands.some((o) => !o.erase) || !!(live && !live.obj.erase);
    return changed;
  }

  private liveBounds(o: MMLand): Rect | null {
    return o.mode === "free" ? this.bounds(o) : null;
  }

  get empty() {
    return !this.hasLand;
  }

  // ---- output --------------------------------------------------------------------------
  private composeUniforms(fx: CoastEffect) {
    return {
      detailAmp: fx.roughness * DETAIL_AMP,
      detailOct: { int: detailOctaves(fx.detail) },
      depthC: hexRgb(fx.depthColor),
      glowC: hexRgb(fx.glowColor),
      waveC: hexRgb(fx.waveColor),
      shoreC: hexRgb(fx.shoreColor),
      lineC: hexRgb(fx.outlineColor),
      depthStrength: fx.depthStrength,
      depthDist: Math.max(1e-6, fx.depthDistance),
      glowW: fx.glowWidth,
      glowOpacity: fx.glowOpacity,
      waveSp: fx.waveSpacing,
      waveOff: fx.waveOffset,
      waveLw: fx.waveWidth,
      waves: { int: Math.round(fx.waves) },
      waveOpacity: fx.waveOpacity,
      waveFade: fx.waveFade,
      waveBreakup: fx.waveBreakup,
      shoreW: fx.shoreWidth,
      shoreStrength: fx.shoreStrength,
      landShade: fx.landShade,
      shadeW: fx.landShadeWidth,
      lineW: fx.outlineWidth,
    };
  }

  /**
   * Composes the window `view` (map units) at outW × outH output pixels onto
   * the shared GL canvas and returns it — draw it somewhere before the next
   * GPU call. `tex` overrides the land texture (exports, at output
   * resolution) with the map window it covers.
   */
  render(
    view: MapView,
    outW: number,
    outH: number,
    mode: "image" | "coverage" = "image",
    tex?: { tex: WebGLTexture; rect: MapView },
  ): HTMLCanvasElement {
    const g = this.g,
      { gl } = g,
      fx = this.fx!;
    if (g.canvas.width !== outW || g.canvas.height !== outH) {
      g.canvas.width = outW;
      g.canvas.height = outH;
    }
    target(g, null);
    clearTarget(g, 0);
    if (!this.hasLand) return g.canvas;
    bind(g, program(g, "compose", COMPOSE_FS), {
      sdf: (fx.islets > 0 && this.sdf2 ? this.sdf2 : this.sdf).tex,
      sdfCoarse: this.coarse.tex,
      tex: tex ? tex.tex : this.texture.tex,
      texRect: tex
        ? [tex.rect.x, tex.rect.y, tex.rect.w, tex.rect.h]
        : [0, 0, 1, this.bh / this.bw],
      mapTexels: [this.bw, this.bh],
      baseUnit: this.bw,
      coarseK: COARSE,
      capFine: this.capFine,
      view: [view.x, view.y, view.w, view.h],
      outSize: [outW, outH],
      flipY: true,
      seed: { uint: this.seed },
      mode: { int: mode === "coverage" ? 1 : 0 },
      ...this.composeUniforms(fx),
    });
    drawQuad(g);
    gl.flush();
    return g.canvas;
  }

  /** Land coverage over the whole map (for clipping live paint previews),
   * at most `max` px wide. */
  coverage(max = 2048): HTMLCanvasElement | null {
    if (!this.hasLand) return null;
    const w = Math.min(max, this.bw),
      h = Math.max(1, Math.round((w * this.bh) / this.bw)),
      out = makeCanvas(w, h);
    const src = this.render(
      { x: 0, y: 0, w: 1, h: this.bh / this.bw },
      w,
      h,
      "coverage",
    );
    out.getContext("2d")!.drawImage(src, 0, 0);
    return out;
  }

  /**
   * The finished layer at outW × outH (an export), drawn in tiles with the
   * land texture rebuilt at output resolution for each.
   */
  exportImage(
    outW: number,
    outH: number,
    base: PaintSource,
    paints: MMPaint[],
  ): HTMLCanvasElement | null {
    if (!this.hasLand) return null;
    const g = this.g,
      { gl } = g,
      out = makeCanvas(outW, outH),
      octx = out.getContext("2d")!,
      TILE = Math.min(2048, g.maxTex),
      tile = makeCanvas(TILE, TILE),
      tctx = tile.getContext("2d")!,
      texTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    try {
      for (let ty = 0; ty < outH; ty += TILE)
        for (let tx = 0; tx < outW; tx += TILE) {
          const tw = Math.min(TILE, outW - tx),
            th = Math.min(TILE, outH - ty);
          tctx.setTransform(1, 0, 0, 1, 0, 0);
          tctx.globalCompositeOperation = "copy";
          tctx.clearRect(0, 0, TILE, TILE);
          tctx.globalCompositeOperation = "source-over";
          fillSource(tctx, base, outW, tx, ty, tw, th);
          tctx.translate(-tx, -ty);
          drawTexturePaint(tctx, paints, base, outW, outH);
          tctx.setTransform(1, 0, 0, 1, 0, 0);
          gl.bindTexture(gl.TEXTURE_2D, texTex);
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA8,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            tile,
          );
          const rect = {
            x: tx / outW,
            y: ty / outW,
            w: tw / outW,
            h: th / outW,
          };
          const src = this.render(rect, tw, th, "image", {
            tex: texTex,
            rect: { x: rect.x, y: rect.y, w: TILE / outW, h: TILE / outW },
          });
          octx.drawImage(src, 0, 0, tw, th, tx, ty, tw, th);
        }
    } finally {
      gl.deleteTexture(texTex);
    }
    return out;
  }

  dispose() {
    const g = this.g;
    if (!this.alive) return;
    for (const t of [
      this.committed,
      this.mask,
      this.scratch,
      this.liveFixed,
      this.covTmp,
      this.cov,
      this.cov2,
      this.sdf,
      this.sdf2,
      this.coarseCov,
      this.coarse,
      this.texture,
      this.seedsA,
      this.seedsB,
    ])
      freeTex(g, t);
    for (const t of this.rasterTex.values()) g.gl.deleteTexture(t);
    this.rasterTex.clear();
    if (this.liveTex) g.gl.deleteTexture(this.liveTex);
    g.gl.deleteBuffer(this.segBuf);
    g.gl.deleteVertexArray(this.segVao);
  }
}
