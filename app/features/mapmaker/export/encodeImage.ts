/**
 * Encodes a rendered map canvas in one of the image formats (see
 * ./imageFormats for the formats and the pure encoders).
 */
import { encodeTiff, jpegWithDpi, pngWithDpi, type ImageFormat } from "./imageFormats";

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encodeFailed"))), type, quality));
}

export async function encodeMapImage(
  canvas: HTMLCanvasElement,
  format: ImageFormat,
  { quality = 0.92, dpi = 300, title = "Map" }: { quality?: number; dpi?: number; title?: string } = {},
): Promise<Blob> {
  switch (format) {
    case "png": {
      const bytes = new Uint8Array(await (await toBlob(canvas, "image/png")).arrayBuffer());
      return new Blob([pngWithDpi(bytes, dpi) as BlobPart], { type: "image/png" });
    }
    case "jpeg": {
      const bytes = new Uint8Array(await (await toBlob(canvas, "image/jpeg", quality)).arrayBuffer());
      return new Blob([jpegWithDpi(bytes, dpi) as BlobPart], { type: "image/jpeg" });
    }
    case "webp":
      return toBlob(canvas, "image/webp", quality);
    case "tiff": {
      const ctx = canvas.getContext("2d")!,
        data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      return new Blob([encodeTiff(data, canvas.width, canvas.height, dpi) as BlobPart], { type: "image/tiff" });
    }
    case "pdf": {
      const { PDFDocument } = await import("pdf-lib");
      const pdf = await PDFDocument.create();
      pdf.setTitle(title);
      pdf.setCreator("Al-Idrisi Atelier");
      const png = await pdf.embedPng(await (await toBlob(canvas, "image/png")).arrayBuffer()),
        w = (canvas.width / dpi) * 72,
        h = (canvas.height / dpi) * 72;
      pdf.addPage([w, h]).drawImage(png, { x: 0, y: 0, width: w, height: h });
      return new Blob([new Uint8Array(await pdf.save())], { type: "application/pdf" });
    }
  }
}

/** Starts a download of a blob under a file name. */
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.hidden = true;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
