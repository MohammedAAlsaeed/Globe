# 🌐 Al-Idrisi Atelier — Maps, Globes & Print Design

**من الخريطة إلى المجسّم | From map to globe**

A bilingual cartography workspace combining an interactive map editor with a globe-print preparation studio. Create layered maps, preview them on a 3D globe, and generate printable gores for physical globe assembly.

> **Project status:** Active development. The print studio can work locally; accounts, cloud maps, and asset-library features require the Laravel API.

## What it does

- **Map editor:** Layers, brushes, symbols, opacity, ordering, undo/redo, and local drafts.
- **Globe projection:** Convert supported map imagery into 6–72 printable globe gores, with configurable sphere/ellipsoid geometry.
- **3D preview:** Inspect globe output with orbit/zoom and optional seam overlay.
- **Print preparation:** Page layouts, bleed, glue tabs, calibration, registration marks, and tiling.
- **Export:** PDF, PNG, SVG, and ZIP packages.
- **Localization:** Arabic/English UI with RTL support.

## Architecture

| Layer | Technologies | Responsibility |
| --- | --- | --- |
| Web | Next.js 16, React, TypeScript | Editor, studio, previews, UI |
| Rendering | Web Workers, OffscreenCanvas, Three.js | Image sampling, projections, 3D preview |
| Export | pdf-lib, fflate | Print files and bundled output |
| API | Laravel, PostgreSQL, Sanctum | Accounts, saved maps, asset library, plans |
| Deployment | OpenNext / Cloudflare Workers | Web deployment workflow |

Source-image processing in the print studio runs locally in a dedicated worker, not through an image-upload service.

## Repository structure

```text
app/       Next.js frontend, map editor, print studio, tests
api/       Laravel backend and API tests
deploy/    Deployment configuration and guides
```

## Run locally

For the print studio alone:

```bash
cd app
npm install
npm run dev
```

Open http://localhost:3000. Node.js 22.18+ is recommended.

To enable accounts and cloud saving, set up the Laravel API first and run it on http://localhost:8000. Follow the complete guides:

- [Frontend setup, features & architecture](app/README.md)
- [API setup & data model](api/README.md)
- [Deployment notes](deploy/README.md)

## Quality checks

From `app/`:

```bash
npm run lint
npm run typecheck
npm test
```

From `api/`:

```bash
composer test
```

These commands are available in the project; this README does not claim that they currently pass in CI.

## Screenshots & demo

Visual examples can be added once approved screenshots or a public demo are available.

---

Built by [Mohammed Alsaeed](https://github.com/MohammedAAlsaeed) · **خرائط تحكي قصصًا**
