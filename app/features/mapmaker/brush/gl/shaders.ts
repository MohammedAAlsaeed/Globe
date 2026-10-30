/**
 * GLSL (WebGL2) for the land engine (./landGpu.ts). The noise and the
 * coast formulas mirror the CPU reference exactly — ../noise.ts,
 * ../roughStroke.ts and ../coastfx.ts — so the GPU and the fallback draw
 * the same map.
 *
 * Convention: every texture is addressed in *image* space — texel (x, y) is
 * image pixel (x, y), row 0 at the top — and gl_FragCoord.xy of a render
 * into a texture is that texel. Only the compose pass, which writes the
 * visible canvas, flips y.
 */
import { DETAIL_AMP, DETAIL_SEED, DETAIL_WAVE } from "../coastfx";
import {
  OCTAVE_SEED,
  ROUGH_AMP,
  ROUGH_PERSIST,
  ROUGH_WAVE,
} from "../roughStroke";

const f = (n: number) => (Number.isInteger(n) ? `${n}.0` : `${n}`);

/** Gradient noise identical to ../noise.ts gradientNoise (seed as uint). */
export const NOISE = /* glsl */ `
uint hashInt(int x, int y, uint seed) {
  uint h = (uint(x) * 374761393u) ^ (uint(y) * 668265263u) ^ (seed * 2246822519u);
  h = (h ^ (h >> 13u)) * 1274126177u;
  return h ^ (h >> 16u);
}
float hash01(int x, int y, uint seed) {
  return float(hashInt(x, y, seed)) / 4294967296.0;
}
float grad(int ix, int iy, uint seed, float dx, float dy) {
  float a = float(hashInt(ix, iy, seed) & 255u) * (6.283185307179586 / 256.0);
  return cos(a) * dx + sin(a) * dy;
}
float gradientNoise(vec2 p, uint seed) {
  vec2 i0 = floor(p);
  vec2 fr = p - i0;
  int x0 = int(i0.x), y0 = int(i0.y);
  float n00 = grad(x0, y0, seed, fr.x, fr.y);
  float n10 = grad(x0 + 1, y0, seed, fr.x - 1.0, fr.y);
  float n01 = grad(x0, y0 + 1, seed, fr.x, fr.y - 1.0);
  float n11 = grad(x0 + 1, y0 + 1, seed, fr.x - 1.0, fr.y - 1.0);
  vec2 u = fr * fr * fr * (fr * (fr * 6.0 - 15.0) + 10.0);
  float a = n00 + (n10 - n00) * u.x;
  float b = n01 + (n11 - n01) * u.x;
  return (a + (b - a) * u.y) * 1.41421356;
}
`;

// ---- quad vertex shaders --------------------------------------------------
/** A full-target triangle pair; fragments read texels by gl_FragCoord. */
export const QUAD_VS = /* glsl */ `#version 300 es
layout(location = 0) in vec2 pos;
void main() { gl_Position = vec4(pos, 0.0, 1.0); }
`;

/** A textured rectangle at image-space pixels (rect) on a target of size. */
export const RECT_VS = /* glsl */ `#version 300 es
layout(location = 0) in vec2 pos;
uniform vec4 rect;   // x, y, w, h in target pixels
uniform vec2 target; // target size
out vec2 uv;
void main() {
  uv = pos * 0.5 + 0.5;
  vec2 px = rect.xy + uv * rect.zw;
  gl_Position = vec4(px / target * 2.0 - 1.0, 0.0, 1.0);
}
`;

// ---- utility fragment shaders ------------------------------------------------
export const COPY_FS = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D src;
uniform ivec2 offset; // src texel = frag texel + offset
out vec4 color;
void main() { color = texelFetch(src, ivec2(gl_FragCoord.xy) + offset, 0); }
`;

/** Draws a coverage raster (alpha) into a single-channel target. */
export const RASTER_FS = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D src;
in vec2 uv;
out vec4 color;
void main() { color = vec4(texture(src, uv).a); }
`;

/** Separable box blur of the red channel (radius r, axis dir). */
export const BLUR_FS = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D src;
uniform int r;
uniform ivec2 dir;
uniform ivec2 size;
uniform bool wrap; // the left and right edges meet
out vec4 color;
void main() {
  ivec2 q = ivec2(gl_FragCoord.xy);
  float acc = 0.0;
  for (int k = -r; k <= r; k++) {
    ivec2 p = q + dir * k;
    p.x = wrap ? ((p.x % size.x) + size.x) % size.x : clamp(p.x, 0, size.x - 1);
    p.y = clamp(p.y, 0, size.y - 1);
    acc += texelFetch(src, p, 0).r;
  }
  color = vec4(acc / float(2 * r + 1));
}
`;

/** Average of a k×k block (coarse coverage for the depth field). */
export const DOWN_FS = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D src;
uniform int k;
uniform ivec2 size; // source size
out vec4 color;
void main() {
  ivec2 o = ivec2(gl_FragCoord.xy) * k;
  float acc = 0.0, n = 0.0;
  for (int y = 0; y < k; y++)
    for (int x = 0; x < k; x++) {
      ivec2 p = o + ivec2(x, y);
      if (p.x < size.x && p.y < size.y) { acc += texelFetch(src, p, 0).r; n += 1.0; }
    }
  color = vec4(n > 0.0 ? acc / n : 0.0);
}
`;

// ---- land brush ----------------------------------------------------------------
/** One stroke segment per instance; fragments write their coverage (blended
 * with MAX into the stroke's scratch mask). Mirrors ../roughStroke.ts. */
export const STROKE_VS = /* glsl */ `#version 300 es
layout(location = 0) in vec2 pos;
layout(location = 1) in vec4 seg; // a.xy, b.xy in map units
uniform float reach;  // map units
uniform float unit;   // px per map unit
uniform vec2 target;
out vec4 vSeg;
void main() {
  vSeg = seg;
  vec2 lo = min(seg.xy, seg.zw) - reach, hi = max(seg.xy, seg.zw) + reach;
  vec2 px = mix(lo, hi, pos * 0.5 + 0.5) * unit;
  gl_Position = vec4(px / target * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const STROKE_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
${NOISE}
in vec4 vSeg;
uniform float unit;
uniform float radius;
uniform float rough;
uniform int octaves;
uniform uint seed;
out vec4 color;
float edgeNoise(vec2 m) {
  float f0 = 1.0 / (${f(ROUGH_WAVE)} * max(radius, 1e-5));
  float sum = 0.0, amp = 1.0, norm = 0.0, freq = f0;
  for (int o = 0; o < 6; o++) {
    if (o >= octaves) break;
    sum += amp * gradientNoise(m * freq, seed + uint(o) * ${OCTAVE_SEED}u);
    norm += amp;
    amp *= ${f(ROUGH_PERSIST)};
    freq *= 2.1;
  }
  return sum / norm;
}
void main() {
  vec2 m = gl_FragCoord.xy / unit;
  vec2 a = vSeg.xy, b = vSeg.zw, ab = b - a;
  float l2 = dot(ab, ab);
  float t = l2 > 0.0 ? clamp(dot(m - a, ab) / l2, 0.0, 1.0) : 0.0;
  float d = length(a + ab * t - m);
  float r = rough > 0.0 ? radius * (1.0 + ${f(ROUGH_AMP)} * rough * edgeNoise(m)) : radius;
  color = vec4(clamp(0.5 + (r - d) * unit, 0.0, 1.0));
}
`;

// ---- signed distance (jump flooding) ------------------------------------------------
/** Seeds: the sub-pixel coast point next to each texel on the coast, in
 * the window's own texels (fixed point ×8, 65535 = none). Works on a window
 * of the map whose top-left texel is \`org\`; on a seamless map the window
 * may reach past the left or right edge, and reads the other side there. */
export const SEED_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;
uniform sampler2D cov;
uniform ivec2 org;
uniform ivec2 size; // map size (cov)
uniform bool wrap;  // the left and right edges meet
out uvec2 seed;
float at(ivec2 p) {
  if (wrap) p.x = ((p.x % size.x) + size.x) % size.x;
  return texelFetch(cov, p, 0).r;
}
void main() {
  ivec2 l = ivec2(gl_FragCoord.xy), q = l + org;
  float c = at(q);
  bool land = c >= 0.5;
  vec2 best = vec2(0.0);
  float bestD = 1e9;
  ivec2 dirs[4] = ivec2[4](ivec2(1, 0), ivec2(-1, 0), ivec2(0, 1), ivec2(0, -1));
  for (int i = 0; i < 4; i++) {
    ivec2 n = q + dirs[i];
    if (n.y < 0 || n.y >= size.y || (!wrap && (n.x < 0 || n.x >= size.x))) continue;
    float cn = at(n);
    if ((cn >= 0.5) == land) continue;
    float t = clamp((0.5 - c) / (cn - c), 0.0, 1.0);
    if (t < bestD) { bestD = t; best = vec2(l) + 0.5 + vec2(dirs[i]) * t; }
  }
  // (a seed half a texel outside the window, at its very edge, is moved
  // onto it: that edge is the window's margin, never measured from)
  seed = bestD < 1e8 ? uvec2(round(max(best, vec2(0.0)) * 8.0)) : uvec2(65535u);
}
`;

export const JFA_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;
uniform usampler2D src;
uniform int step;
uniform ivec2 wsize;  // window size (seeds are in window texels)
out uvec2 seed;
void main() {
  ivec2 q = ivec2(gl_FragCoord.xy);
  vec2 p = vec2(q) + 0.5;
  uvec2 best = uvec2(65535u);
  float bestD = 1e20;
  for (int y = -1; y <= 1; y++)
    for (int x = -1; x <= 1; x++) {
      ivec2 n = q + ivec2(x, y) * step;
      if (n.x < 0 || n.y < 0 || n.x >= wsize.x || n.y >= wsize.y) continue;
      uvec2 s = texelFetch(src, n, 0).rg;
      if (s.x == 65535u) continue;
      vec2 d = vec2(s) / 8.0 - p;
      float dd = dot(d, d);
      if (dd < bestD) { bestD = dd; best = s; }
    }
  seed = best;
}
`;

/** Signed distance (texels, >0 land) from the flooded seeds, capped. */
export const SDF_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;
uniform usampler2D seeds;
uniform sampler2D cov;
uniform ivec2 org;  // window origin (map texels)
uniform float cap;
out vec4 color;
void main() {
  ivec2 q = ivec2(gl_FragCoord.xy);
  ivec2 l = q - org;
  uvec2 s = texelFetch(seeds, l, 0).rg;
  bool land = texelFetch(cov, q, 0).r >= 0.5;
  float d = s.x == 65535u ? cap : min(cap, length(vec2(s) / 8.0 - (vec2(l) + 0.5)));
  color = vec4(land ? d : -d);
}
`;

// ---- islets ----------------------------------------------------------------------
/** Adds islets off the coast to the coverage (mirrors ../coastfx.ts). */
export const ISLET_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
${NOISE}
uniform sampler2D cov;
uniform sampler2D sdf;
uniform float unit;    // texels per map unit
uniform float islets;
uniform uint seed;
out vec4 color;
void main() {
  ivec2 q = ivec2(gl_FragCoord.xy);
  float c = texelFetch(cov, q, 0).r;
  float d = texelFetch(sdf, q, 0).r;
  float band = 0.035 * unit, gap = 0.005 * unit;
  if (d < -gap && d > -band) {
    vec2 m = (vec2(q) + 0.5) / unit;
    float n = 0.55 * gradientNoise(m / 0.016, seed + 707u)
            + 0.3 * gradientNoise(m / 0.007, seed + 808u)
            + 0.15 * gradientNoise(m / 0.003, seed + 909u);
    float thr = 0.62 - islets * 0.42 + (-d / band) * 0.26;
    if (n > thr) c = max(c, clamp(0.5 + (n - thr) * 0.008 * unit, 0.0, 1.0));
  }
  color = vec4(c);
}
`;

// ---- compose -------------------------------------------------------------------------
/**
 * The finished land layer for any window of the map at any resolution:
 * the land texture inside the coast, decoration around it. Distances come
 * from the fine signed distance field (bilinear — sharp at every zoom) plus
 * the analytic fine coast detail, so the edge is crisp however far one
 * zooms in. Mirrors ../coastfx.ts composeCoast, in output pixels.
 */
export const COMPOSE_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
${NOISE}
uniform sampler2D sdf;      // fine signed distance, map texels
uniform sampler2D sdfCoarse;// coarse signed distance, coarse texels
uniform sampler2D tex;      // land texture over the window (texUv maps)
uniform vec4 texRect;       // tex covers map units (x, y, w, h)
uniform vec2 mapTexels;     // fine sdf size
uniform float baseUnit;     // fine texels per map unit
uniform float coarseK;      // fine texels per coarse texel
uniform float capFine;      // texels
uniform vec4 view;          // window in map units (x, y, w, h)
uniform vec2 outSize;       // output pixels
uniform bool flipY;
uniform uint seed;
uniform int mode;           // 0 image, 1 land coverage
// coast settings (map units where lengths)
uniform float detailAmp;    // map units
uniform int detailOct;
uniform vec3 depthC, glowC, waveC, shoreC, lineC;
uniform float depthStrength, depthDist, glowW, glowOpacity, waveSp, waveOff, waveLw;
uniform int waves;
uniform float waveOpacity, waveFade, waveBreakup;
uniform float shoreW, shoreStrength, landShade, shadeW, lineW;
out vec4 color;

float coastNoise(vec2 m) {
  float sum = 0.0, amp = 1.0, norm = 0.0, wl = ${f(DETAIL_WAVE)};
  for (int o = 0; o < 6; o++) {
    if (o >= detailOct) break;
    sum += amp * gradientNoise(m / wl, seed + uint(o) * ${DETAIL_SEED}u);
    norm += amp;
    amp *= 0.6;
    wl *= 0.5;
  }
  return sum / norm;
}
void main() {
  vec2 frag = gl_FragCoord.xy;
  if (flipY) frag.y = outSize.y - frag.y;
  vec2 m = view.xy + frag / outSize * view.zw;          // map units
  float unit = outSize.x / view.z;                        // output px per map unit
  float s = unit / baseUnit;                              // output px per fine texel
  float S = texture(sdf, m * baseUnit / mapTexels).r;     // fine texels
  float df = S * s;                                       // output px
  // fine coast detail, fading out away from the edge
  if (detailAmp > 0.0) {
    float a = detailAmp * unit;
    float w = 1.0 - smoothstep(a * 1.25 + 2.0, a * 2.5 + 4.0, abs(df));
    if (w > 0.0) df += a * coastNoise(m) * w;
  }
  // Detail steepens the field; dividing by its slope keeps it a true
  // distance in pixels (outline width, anti-aliasing) next to the coast.
  float slope = length(vec2(dFdx(df), dFdy(df)));
  if (slope > 1.0) {
    float near = max(1.0, detailAmp * unit);
    df = mix(df / slope, df, smoothstep(4.0 * near, 8.0 * near, abs(df)));
  }
  float landA = clamp(df + 0.5, 0.0, 1.0);
  if (mode == 1) { color = vec4(landA); return; }

  vec4 acc = vec4(0.0); // premultiplied
  if (landA < 1.0) {
    float dw = df < 0.0 ? -df : 0.0;
    // far out at sea the fine field is capped: use the coarse one
    if (S <= -capFine + 1.5) {
      vec2 cs = vec2(textureSize(sdfCoarse, 0));
      dw = max(dw, -texture(sdfCoarse, m * baseUnit / coarseK / cs).r * coarseK * s);
    }
    float a;
    if (depthStrength > 0.0) {
      a = depthStrength * smoothstep(0.0, depthDist * unit, dw);
      acc = vec4(depthC * a, a);
    }
    float gw = glowW * unit;
    if (glowOpacity > 0.0 && dw < gw) {
      float t = 1.0 - smoothstep(0.0, gw, dw);
      a = glowOpacity * pow(t, 1.6);
      acc = vec4(glowC * a, a) + acc * (1.0 - a);
    }
    float sp = max(2.0, waveSp * unit), off = max(0.0, waveOff * unit), lw = max(0.8, waveLw * unit);
    float wend = off + float(waves - 1) * sp + lw;
    if (waves > 0 && waveOpacity > 0.0 && dw > off - lw && dw < wend + 1.0) {
      float k = clamp(floor((dw - off) / sp + 0.5), 0.0, float(waves - 1));
      float c = off + k * sp;
      float line = 1.0 - smoothstep(lw * 0.5 - 0.6, lw * 0.5 + 0.6, abs(dw - c));
      if (line > 0.0) {
        a = waveOpacity * line * pow(1.0 - waveFade, k);
        if (waveBreakup > 0.0) {
          float n = gradientNoise(m / 0.018, seed + 31u * (uint(k) + 1u));
          a *= 1.0 - waveBreakup * (1.0 - smoothstep(-0.35, 0.05, n));
        }
        acc = vec4(waveC * a, a) + acc * (1.0 - a);
      }
    }
  }
  if (landA > 0.0) {
    vec3 col = texture(tex, (m - texRect.xy) / texRect.zw).rgb * 255.0;
    float dl = df > 0.0 ? df : 0.0;
    float sw = max(0.5, shoreW * unit);
    if (shoreStrength > 0.0 && dl < sw * 1.6) {
      // grain on a 2-texel grid of the map, so it doesn't swim with zoom
      ivec2 g = ivec2(floor(m * baseUnit * 0.5));
      float grain = 0.94 + hash01(g.x, g.y, seed) * 0.12;
      float t = shoreStrength * pow(1.0 - smoothstep(0.0, sw, dl), 1.2);
      col += (shoreC * grain - col) * t;
    }
    float hw = max(0.5, shadeW * unit);
    if (landShade != 0.0 && dl < hw * 1.6) {
      float t = abs(landShade) * 0.6 * (1.0 - smoothstep(0.0, hw, dl));
      col = landShade > 0.0 ? col * (1.0 - t) : col + (255.0 - col) * t;
    }
    acc = vec4(col * landA, landA) + acc * (1.0 - landA);
  }
  float lwp = lineW * unit;
  if (lwp >= 0.3) {
    // (a little fuller than the exact width: the weight styles were tuned at)
    float a = (1.0 - smoothstep(lwp * 0.5 - 0.2, lwp * 0.5 + 1.0, abs(df))) * min(1.0, lwp + 0.4);
    if (a > 0.0) acc = vec4(lineC * a, a) + acc * (1.0 - a);
  }
  color = vec4(acc.rgb / 255.0, acc.a);
}
`;
export { DETAIL_AMP };
