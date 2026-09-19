# Al-Idrisi Atelier

A private bilingual globe-making and print-preparation studio. Built with Next.js, React, TypeScript, i18next, Three.js, pdf-lib, and fflate. Source images are processed locally in a dedicated worker; there is no upload service.

## Development

```sh
npm install
npm run dev
```

Open **http://localhost:3000** using the development server's hostname. Node 22.18+ is recommended.

```sh
npm run lint
npm run typecheck
npm test
npm run build:webpack
npm run format
```

`npm run build` also supports the default Turbopack build. `build:webpack` is useful in environments that restrict the local ports used by Turbopack CSS workers. Tests generate ignored PDF QA fixtures under `tmp/pdfs/`.

## Features

- North-up equirectangular or Mercator source images, with explicit Mercator latitude bounds. Unsupported polar areas remain transparent; the app never invents missing geography.
- Sphere and parametric-ellipsoid dimensions, displayed in mm, cm, or inches. The internal model always uses **millimetres**.
- 6–72 even-numbered gores, suggested counts based on maximum gore width, longitude offset, spacing, tapered glue tabs, rounded color bleed, vector cut contours, tab-fold lines, graticules, and labels.
- Bilinear, bicubic, or Lanczos 3 inverse sampling, alpha-aware interpolation and progressive downsampling. Rendering happens per gore in an OffscreenCanvas worker with progress and immediate cancellation. Preview quality is independent from print quality.
- A4, A3, Letter, or custom sheets; orientation/rotation search; margin-aware packing; oversized-gore tiling with overlap; registration marks; page numbering; outline-only trial prints.
- A 100 × 100 mm calibration sheet and independent X/Y correction. Named printer profiles store paper settings and correction. Print at 100%, with fit-to-page and browser headers/footers disabled.
- Shared page placements for the on-screen SVG preview and PDF generation. PDF artwork is raster at the requested resolution; cut/fold guides remain vector.
- Measured PDFs, standalone PNG/SVG gores, and ZIP packages with assembly instructions. PNG includes a pHYs DPI chunk. SVG contains embedded raster artwork **and independent vector guides**; it is not vectorized geography.
- Interactive 3D globe with orbit/zoom and optional seam overlay.
- Source-map editor with normalized brush strokes and mountain/city/star symbols, named layers, visibility, opacity, ordering, removal, and 40-step document undo/redo. Layers are applied before reprojection and included in every preview/export.
- Portable `.atelier` projects containing the original raster source, layers and settings; explicit local draft save/restore with IndexedDB. Source replacement resets layer history. Language and printer profiles persist locally.
- English and Arabic dictionaries, RTL layout, responsive layouts, keyboard-accessible controls, and reduced-motion styling.

## Code map

```text
app/
  page.tsx                 Route composition only
  layout.tsx               Metadata and document shell
  globals.css              CSS entry point
  atelier.css              Shared visual theme and base layout
components/ui/
  fields.tsx               Shared numeric/select/switch controls
  ornaments.tsx            Icons and cartographic decoration
features/studio/
  Studio.tsx               Screen composition and document wiring
  studio.css               Print studio and editor styles
  components/              Source, geometry, print, preview, export and project UI
  hooks/                   History, source lifecycle, preview and export jobs
  domain/
    types.ts               Canonical units, defaults and typed document model
    geometry.ts            Meridian integration, contours, bleed and PPI
    layout.ts              Deterministic packing/rotation/tiling
    validation.ts          Bounds and imported-project validation
  rendering/
    sampling.ts            Alpha-aware image resampling kernels
    layers.ts              Resolution-independent layer drawing
    client.ts              Worker lifecycle, cancellation and blob ownership
  workers/
    protocol.ts            Typed worker messages
    render.worker.ts       Decode, prefilter, inverse projection and PNG encoding
  export/
    svg.ts                 Vector scene, page preview and SVG generation
    pdf.ts                 Measured pages, vector guides and calibration PDF
    png.ts                 PNG physical-resolution metadata
    files.ts               Individual gores and ZIP assembly
  storage/projects.ts      Project archive validation and IndexedDB
lib/
  i18n.ts                  Translation setup
  locales/                 English and Arabic dictionaries
public/atelier-world.svg   Public-domain Natural Earth sample illustration
tests/                     Geometry, sampling, layout, validation, metadata and PDF tests
```

## Geometry and print contracts

`width` is the model's **equatorial diameter**, not its circumference. `height` is the straight pole-to-pole dimension. For a sphere, each gore has equatorial width `π × diameter / goreCount` and pole-to-pole surface length `π × diameter / 2`.

For an ellipsoid, `a = width/2`, `b = height/2`; the meridian arc integrates `sqrt(a² sin²(latitude) + b² cos²(latitude))`. Latitude is **parametric**, not geodetic. Geographic and physical fit should be tested before final assembly.

Cut contours and image sampling use the same geometry. Glue tabs taper to zero at the poles; rounded bleed expands the cut footprint in physical units. Gutters, page overlap, glue tabs, and bleed are distinct controls.

Calibration is applied in printer X/Y axes **before packing**. The chosen orientation tries both rotations and chooses the fewest pages among the supported uniform shelf layouts; it is not an arbitrary-polygon nesting optimizer. When a gore cannot fit whole, tiles retain its physical size and overlap by the requested amount. A footer strip is reserved separately from printer margins.

The 3D view displays the edited source on the model and seam positions. It is not a paper/adhesive simulation. A curved surface cannot be flattened perfectly. More gores generally reduce local distortion at the cost of more assembly work.

## Limits and printing

- Raster imports: PNG, JPEG or WebP, up to 40 MB / 60 megapixels. File signatures and decoded dimensions are checked.
- Output: 150, 300 or 600 PPI. Each gore is limited to 32 megapixels / 16,000 pixels per side; full raster jobs to 240 megapixels. A single-gore job only renders that gore. PDF outline-only printing bypasses raster generation.
- Model dimensions: 20–1000 mm; custom paper: 50–1500 mm per side; print plans: at most 250 pages.
- Editing: 20 layers, 5,000 strokes per layer, 4,000 points per gesture, with a project-wide point budget.
- Browser: requires Web Workers, createImageBitmap and OffscreenCanvas. WebGL is optional; if unavailable, gore/print previews still work.
- Source PPI is a conservative estimate based on the source projection and model dimensions. Raising output PPI does not reconstruct missing details.
- The app prepares measured pages and opens a PDF print preview. Your browser/OS controls printer selection, paper support and final scaling. There is no silent or direct printer-driver access. No physical printer has been calibrated automatically.
- Outputs use browser RGB colors. ICC proofing, CMYK/PDF-X workflows, TIFF import and arbitrary source projections are not included.

## Verification

`npm test` checks analytic sphere dimensions, ellipsoid symmetry, taper and bleed, source mapping, sampling/alpha boundaries, source density, physical placements, tile coverage, calibration, rotation, unsafe project settings, PNG CRC/DPI, PDF page sizes, and cancellation. PDF fixtures have asymmetric colored quadrants so rotation/reflection errors are visible when rendered.

Manual browser QA includes upload, English/Arabic switching, desktop/mobile layout, 3D preview, drawing/layer undo-redo, local save/restore, print preparation and export. For a printer-specific release, also measure the calibration square and assemble an outline-only test on the target model.

## References

- Sinusoidal projection: https://proj.org/en/stable/operations/projections/sinu.html
- Sample land outlines: https://www.naturalearthdata.com/about/terms-of-use/
- PDF generation: https://pdf-lib.js.org/docs/api/classes/pdfpage

The sample is a contemporary illustration, not a historical Islamic map. The design is inspired by Islamic cartographic and astronomical craft.
