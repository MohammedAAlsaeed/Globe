// A pHYs chunk retains the requested print DPI in the PNG.
export async function pngWithDpi(
  canvas: HTMLCanvasElement,
  dpi: number,
): Promise<Blob> {
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("PNG encoding failed"))),
      "image/png",
    ),
  );
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunk = new Uint8Array(21),
    v = new DataView(chunk.buffer);
  v.setUint32(0, 9);
  chunk.set([112, 72, 89, 115], 4);
  v.setUint32(8, Math.round(dpi / 0.0254));
  v.setUint32(12, Math.round(dpi / 0.0254));
  chunk[16] = 1;
  let crc = 0xffffffff;
  for (const byte of chunk.slice(4, 17)) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  v.setUint32(17, (crc ^ 0xffffffff) >>> 0);
  return new Blob([bytes.slice(0, 33), chunk, bytes.slice(33)], {
    type: "image/png",
  });
}
