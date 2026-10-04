"use client";
import { useEffect, useRef, useState } from "react";
import type { StudioDocument } from "../domain/types";
import type { SourceState } from "./useSource";
import { goreBox } from "../domain/geometry";
import { planPrint } from "../domain/layout";
import { renderInWorker, releaseAssets } from "../rendering/client";
import { makePrintPdf } from "../export/pdf";
import { goreArchive, standaloneGore } from "../export/files";
import { printHtml } from "../export/svg";
export type ExportKind = "print" | "pdf" | "zip" | "single";
export function useExport(notify: (message: string) => void) {
  const [job, setJob] = useState<{ stage: string; progress: number } | null>(
      null,
    ),
    [pdfUrl, setPdfUrl] = useState(""),
    [printDocument, setPrintDocument] = useState(""),
    [preparedKey, setPreparedKey] = useState(""),
    [download, setDownload] = useState<{ url: string; name: string } | null>(
      null,
    );
  const abort = useRef<AbortController | null>(null),
    url = useRef(""),
    fileUrl = useRef("");
  useEffect(
    () => () => {
      abort.current?.abort();
      if (url.current) URL.revokeObjectURL(url.current);
      if (fileUrl.current) URL.revokeObjectURL(fileUrl.current);
    },
    [],
  );
  function dismiss() {
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = "";
    setPdfUrl("");
    setPrintDocument("");
  }
  function deliver(blob: Blob, name: string) {
    if (fileUrl.current) URL.revokeObjectURL(fileUrl.current);
    fileUrl.current = URL.createObjectURL(blob);
    setDownload({ url: fileUrl.current, name });
    const link = document.createElement("a");
    link.href = fileUrl.current;
    link.download = name;
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
  async function run(
    kind: ExportKind,
    d: StudioDocument,
    source: SourceState | null,
    format: "png" | "svg",
    gore: number,
  ) {
    if (abort.current) return;
    gore = Math.max(0, Math.min(gore, d.globe.gores - 1));
    if (!source) return notify("missingSource");
    const plan = planPrint(d.globe, d.print);
    if ((kind === "print" || kind === "pdf") && plan.error)
      return notify(plan.error);
    const box = goreBox(d.globe),
      ppm = d.dpi / 25.4;
    if (
      !((kind === "pdf" || kind === "print") && d.print.outline) &&
      Math.ceil(box.width * ppm) *
        Math.ceil(box.height * ppm) *
        (kind === "single" ? 1 : d.globe.gores) >
        240e6
    )
      return notify("totalLimit");
    const controller = new AbortController();
    abort.current = controller;
    setJob({ stage: "preparing", progress: 0 });
    let assets: Awaited<ReturnType<typeof renderInWorker>> = [];
    try {
      if (!((kind === "pdf" || kind === "print") && d.print.outline))
        assets = await renderInWorker(
          {
            source: source.blob,
            globe: d.globe,
            layers: d.layers,
            dpi: d.dpi,
            preview: false,
            mode: "gores",
            indices:
              kind === "single"
                ? [Math.min(gore, d.globe.gores - 1)]
                : undefined,
          },
          controller.signal,
          (value) => setJob({ stage: "preparing", progress: value * 0.8 }),
        );
      if (controller.signal.aborted)
        throw new DOMException("Cancelled", "AbortError");
      setJob({ stage: "assembling", progress: 0.8 });
      const progress = (v: number) =>
        setJob({ stage: "assembling", progress: 0.8 + v * 0.2 });
      const name = `al-idrisi-${d.globe.width}x${d.globe.height}mm-${d.globe.gores}gores`;
      if (kind === "pdf" || kind === "print") {
        const blob = await makePrintPdf(
          plan,
          d.globe,
          d.print,
          assets,
          controller.signal,
          progress,
        );
        if (controller.signal.aborted)
          throw new DOMException("Cancelled", "AbortError");
        if (kind === "pdf") deliver(blob, `${name}.pdf`);
        else {
          const html = await printHtml(plan.pages, d.globe, d.print, assets);
          if (controller.signal.aborted)
            throw new DOMException("Cancelled", "AbortError");
          dismiss();
          url.current = URL.createObjectURL(blob);
          setPdfUrl(url.current);
          setPrintDocument(html);
          setPreparedKey(JSON.stringify([d, source.url]));
          notify("pdfReady");
        }
      } else if (kind === "zip") {
        const blob = await goreArchive(
          assets,
          d.globe,
          d.dpi,
          format,
          d.print.outline,
          controller.signal,
          progress,
        );
        if (controller.signal.aborted)
          throw new DOMException("Cancelled", "AbortError");
        deliver(blob, `${name}.zip`);
      } else {
        const blob = await standaloneGore(
          assets[0],
          d.globe,
          d.dpi,
          format,
          d.print.outline,
        );
        if (controller.signal.aborted)
          throw new DOMException("Cancelled", "AbortError");
        deliver(blob, `${name}-${gore + 1}.${format}`);
      }
      if (kind !== "print") notify("jobComplete");
    } catch (e) {
      notify(
        e instanceof Error
          ? e.name === "AbortError"
            ? "cancelled"
            : e.message
          : "errorGeneric",
      );
    } finally {
      releaseAssets(assets);
      abort.current = null;
      setJob(null);
    }
  }
  return {
    job,
    pdfUrl,
    printDocument,
    preparedKey,
    download,
    run,
    cancel: () => abort.current?.abort(),
    dismiss,
  };
}
