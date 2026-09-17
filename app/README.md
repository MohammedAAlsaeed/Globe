# Al-Idrisi Atelier

A private, browser-based globe gore converter, built with Next.js, React, TypeScript, and i18next. English is the source language; Arabic includes a mirrored RTL layout and a persisted language preference. Add new languages in `lib/i18n.ts`.

## Run

```sh
npm install
npm run dev
```

Open http://localhost:3000. Use the same hostname as the Next.js development server to avoid blocked development assets.

## Checks

```sh
npm run lint
node --test tests/projection.test.mjs
npm run build -- --webpack
```

Tests require Node 22.18+ (native TypeScript stripping). Webpack can be used when sandbox restrictions prevent Turbopack's CSS worker from binding a local port.

## Conversion

- Import a full-world, north-up equirectangular PNG, JPEG, or WebP. The expected aspect ratio is 2:1. Other projections are not automatically detected or reprojected.
- Set pole-to-pole height and equatorial diameter in millimetres (20–500 mm). Linked dimensions produce a sphere; independent dimensions produce an approximate ellipsoid wrap using parametric latitude and numerically integrated meridian distances.
- Choose 6–36 even-numbered gores, longitude offset, 0–10 mm gutters, cutting outlines, and latitude guides.
- The spherical mapping uses `x = R × relativeLongitude × cos(latitude)`, with meridional arc distance for y. Reference: https://proj.org/en/stable/operations/projections/sinu.html.
- PNG export stores print DPI in a pHYs chunk. SVG export wraps the rendered raster in an SVG with exact millimetre dimensions; it is **not** a vectorized map. Both preserve original colors, and use 150, 300, or 600 DPI output. The preview is rendered separately at a smaller size.
- Images remain in memory in the browser. No uploads, analytics, or remote font requests are made.
- Input is limited to 40 MB and 60 megapixels; exports to 40 megapixels and 16,000 pixels per side to bound canvas memory.

Source-resolution estimates are advisory. Upsampling cannot recover missing detail. Gores approximate a curved surface and need a paper-fit test. Export sheets include a 5 mm outer margin and are not automatically split into printer pages. Print at **100% / actual size**.

## Sample map

`public/atelier-world.svg` is a contemporary illustration derived from public-domain Natural Earth 1:110m land data: https://www.naturalearthdata.com/about/terms-of-use/. It is not a historical Islamic map. The interface draws on parchment, geometric astronomical instruments, and Islamic cartographic traditions.

## Next useful features

- Tiled A4/A3 PDFs with registration marks and calibration ruler.
- Glue tabs, bleed, individually numbered gores, and separate-gore downloads.
- Rotatable 3D globe preview.
- Project saving, additional source projections, and a worker-based export pipeline.
- A later map editor with layers, brushes, symbols, and terrain tools.
