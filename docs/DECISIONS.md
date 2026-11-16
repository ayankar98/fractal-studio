# Architecture Decisions

Record decisions that shape module boundaries or user-visible behavior. Add dates, context, alternatives, and consequences when decisions are made or revised.

## 2026-11-15 - Create an isolated React and TypeScript application

**Context:** The supplied specification describes a browser-based creative application and explicitly requires a new independent project directory.

**Decision:** Create `D:\Projects\Fractal Project\fractal-studio` as a Vite React + TypeScript project with its own package manifest, lockfile, and Git repository.

**Alternatives considered:** A handwritten HTML/JavaScript app would reduce initial dependencies but would not establish the specified typed React application foundation. Putting files in the workspace root would violate project isolation.

**Consequences:** React, TypeScript, and Vite dependencies are local to the new project. The workspace root remains outside Git.

## 2026-11-15 - Use a WebGL2 fragment shader for the first renderer

**Context:** Per-pixel Mandelbrot iteration is computationally intensive, and the first milestone requires interactive preview on ordinary consumer hardware.

**Decision:** Render preview and 4K output with the same WebGL2 fragment shader; retain pure CPU functions as deterministic math references.

**Alternatives considered:** A full CPU canvas render calculates pixels serially on the main thread. A worker-based CPU engine could be a fallback, but would be a separate performance and correctness task.

**Consequences:** A WebGL2-capable browser is required for rendering. Shader diagnostics, context loss, and finite GPU precision need explicit handling. Export uses a separate full-size canvas and remains limited by browser/GPU allocation.

## 2026-11-15 - Define scale per logical image pixel

**Context:** Preview rendering uses a device-pixel-ratio drawing buffer, while interactions are measured in CSS pixels and export uses output pixels.

**Decision:** Keep `unitsPerPixel` relative to logical image height and convert it to drawing-buffer pixels in the renderer. Export rescales units-per-pixel to preserve the vertical view span.

**Consequences:** Preview and export keep the same composition across device-pixel ratios and same-aspect output dimensions. Responsive resizing adjusts scale to maintain vertical span.

## 2026-11-15 - Stop direct rendering before float32 precision artifacts

**Context:** Direct GPU rendering became visibly pixelated around 1e-8 units per logical pixel near the user's selected view.

**Decision:** Keep the simpler direct WebGL2 renderer and clamp zoom to a conservative scale based on float32 spacing at the view center, with margin for the maximum drawing-buffer ratio.

**Alternatives considered:** Add reference-orbit perturbation, implement double-single arithmetic, or render with arbitrary precision. These methods can extend zoom but require careful artifact detection and did not feel right in the first experiment.

**Consequences:** Zoom stops before known coordinate precision collapse and informs the user. The app does not claim deeper zoom; exploring finer detail will use curated locations and patterns at reliable scales.

## Planned decisions (not yet implemented)

- Add tile-based export for dimensions exceeding a safe single-frame allocation.
- Decide which resolutions and memory budgets to expose across supported GPUs and browsers.

These items are plans, not claims about current behavior. Convert each to a dated decision with consequences when implementation validates it.
