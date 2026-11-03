/**
 * Loads an image from another origin (uploaded stamps on R2) so it can be
 * drawn on a canvas and the canvas still exported.
 *
 * Why the retry: the same signed URL may already sit in the browser's cache
 * from a plain <img> (no CORS), and that copy has no CORS headers. The
 * browser then hands it to this request too, and the image fails ("tainted").
 * The URL can't be changed (it is signed), so on failure the file is fetched
 * again past the cache (`cache: "reload"`, which also repairs the cached
 * copy) and drawn from a same-origin blob.
 */
export function loadCorsImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    let retried = false;
    img.onload = () => resolve(img);
    img.onerror = () => {
      if (retried) return reject(new Error(`Image failed: ${url}`));
      retried = true;
      fetch(url, { mode: "cors", cache: "reload", credentials: "omit" })
        .then((res) =>
          res.ok ? res.blob() : Promise.reject(new Error(`HTTP ${res.status}`)),
        )
        // Same-origin: never taints the canvas. Kept (not revoked): the
        // image may be decoded again from it later.
        .then((blob) => (img.src = URL.createObjectURL(blob)))
        .catch(reject);
    };
    img.src = url;
  });
}
