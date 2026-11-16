# Fractal Studio

The canvas currently supports Mandelbrot / Multibrot and Julia sets. The
Fractal Family menu selects the recurrence; View Preset changes the camera view
or Julia parameter within that family. Power 2-8 is available for both. Julia's
fixed complex parameter has separate real and imaginary controls. Ten color
fields, adjustable color frequency and phase, brightness, contrast, contour
overlay, iteration control, zoom, pan, reset, and 4K PNG/JPEG export are also
available.

An independent browser-based generative art application for exploring escape-time fractals with interactive WebGL rendering and high-resolution export.

## Current status

The renderer uses WebGL2 and direct float32 arithmetic, so zoom stops at a precision-aware limit. See [`docs/`](docs/) for implementation details and known limitations. Deeper precision, camera animation, tiled export, additional output sizes, and undo/history remain future work.

## Development

Requirements: Node.js 20.19+ (or 22.12+) and npm.

```sh
npm install
npm run dev
npm run build
npm run lint
```

Run these commands from the `fractal-studio` directory. See [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) for environment details and troubleshooting.

## Project layout

- `src/` - application source
- `docs/` - architecture and engineering references
- `public/` - static public assets

All project dependencies, configuration, source, documentation, tests, and generated assets belong inside this directory.
