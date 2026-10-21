/**
 * Cutting a font down to the letters a text uses (HarfBuzz's subsetter,
 * public/wasm/harfbuzz-subset.wasm — the same HarfBuzz build as the shaper,
 * loaded only when an export embeds fonts).
 *
 * Every layout feature is kept, so a subset still joins Arabic, places
 * marks and makes ligatures exactly like the full font; a few kilobytes
 * instead of hundreds.
 */

interface SubsetExports {
  memory: WebAssembly.Memory;
  malloc(n: number): number;
  free(p: number): void;
  hb_blob_create(
    data: number,
    len: number,
    mode: number,
    user: number,
    destroy: number,
  ): number;
  hb_blob_destroy(b: number): void;
  hb_blob_get_data(b: number, len: number): number;
  hb_blob_get_length(b: number): number;
  hb_face_create(b: number, index: number): number;
  hb_face_destroy(f: number): void;
  hb_face_reference_blob(f: number): number;
  hb_set_add(s: number, v: number): void;
  hb_set_clear(s: number): void;
  hb_set_invert(s: number): void;
  hb_subset_input_create_or_fail(): number;
  hb_subset_input_destroy(i: number): void;
  hb_subset_input_unicode_set(i: number): number;
  hb_subset_input_set(i: number, which: number): number;
  hb_subset_or_fail(f: number, i: number): number;
}

const HB_MEMORY_MODE_WRITABLE = 2;
const HB_SUBSET_SETS_LAYOUT_FEATURE_TAG = 6;
const HB_SUBSET_SETS_LAYOUT_SCRIPT_TAG = 7;

let source: () => Promise<ArrayBuffer> = async () => {
  const r = await fetch("/wasm/harfbuzz-subset.wasm");
  if (!r.ok) throw new Error(`subset ${r.status}`);
  return r.arrayBuffer();
};
/** Where the subsetter comes from (tests read it from node_modules). */
export function setSubsetSource(fn: () => Promise<ArrayBuffer>) {
  source = fn;
  loading = null;
}

let loading: Promise<SubsetExports> | null = null;
function subsetter(): Promise<SubsetExports> {
  loading ??= source()
    .then((bytes) => WebAssembly.instantiate(bytes, {}))
    .then((r) => r.instance.exports as unknown as SubsetExports);
  return loading;
}

/**
 * The font with only `codepoints` (and what they need: ligatures, joined
 * forms, marks). Null when HarfBuzz can't subset it.
 */
export async function subsetFont(
  bytes: ArrayBuffer | Uint8Array,
  codepoints: Iterable<number>,
): Promise<Uint8Array | null> {
  const hb = await subsetter();
  const src = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const ptr = hb.malloc(src.byteLength);
  if (!ptr) return null;
  new Uint8Array(hb.memory.buffer).set(src, ptr);
  const blob = hb.hb_blob_create(
    ptr,
    src.byteLength,
    HB_MEMORY_MODE_WRITABLE,
    0,
    0,
  );
  const face = hb.hb_face_create(blob, 0);
  hb.hb_blob_destroy(blob);
  const input = hb.hb_subset_input_create_or_fail();
  let out: Uint8Array | null = null;
  if (input) {
    const unicodes = hb.hb_subset_input_unicode_set(input);
    for (const cp of codepoints) hb.hb_set_add(unicodes, cp);
    // All layout features and scripts (the default keeps only common ones).
    for (const which of [
      HB_SUBSET_SETS_LAYOUT_FEATURE_TAG,
      HB_SUBSET_SETS_LAYOUT_SCRIPT_TAG,
    ]) {
      const set = hb.hb_subset_input_set(input, which);
      hb.hb_set_clear(set);
      hb.hb_set_invert(set);
    }
    const result = hb.hb_subset_or_fail(face, input);
    hb.hb_subset_input_destroy(input);
    if (result) {
      const rb = hb.hb_face_reference_blob(result);
      const data = hb.hb_blob_get_data(rb, 0),
        len = hb.hb_blob_get_length(rb);
      // The memory may have grown: view it afresh.
      if (data && len)
        out = new Uint8Array(hb.memory.buffer, data, len).slice();
      hb.hb_blob_destroy(rb);
      hb.hb_face_destroy(result);
    }
  }
  hb.hb_face_destroy(face);
  hb.free(ptr);
  return out;
}

/** Base64 of bytes (for data: URLs), in chunks so big fonts don't overflow the stack. */
export function base64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
