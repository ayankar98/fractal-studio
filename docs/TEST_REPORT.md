# Fractal Studio Test Report

**Run date:** 2026-11-17  
**Command:** `npm test` (`vitest run --config vitest.config.ts`)  
**Result:** 30 passed, 6 failed (36 total, across 6 test files)

## Implemented feature inventory

- Interactive WebGL2 canvas for Mandelbrot/Multibrot and Julia sets.
- Fractal type selection, equation power, iteration limit, and Julia real/imaginary parameter controls.
- Cursor-centered wheel zoom, pointer drag pan, precision-aware zoom floor, and reset to the selected fractal's overview.
- Canvas coordinate, frame, and scale readouts; responsive workspace layout.
- Ten named color fields plus a three-stop Custom palette; frequency, phase, brightness, contrast, and contour controls; coloring reset.
- Collapsible Parameters, Coloring, and Export panels.
- Fullscreen canvas interaction and export while fullscreen remains active.
- 3840 x 2160 PNG/JPEG export with four-sample rendering, GPU limit checks, and status reporting.
- Gallery and Learn navigation routes with coming-soon pages.
- WebGL resource disposal and context loss/restoration handling.

## Test coverage added or included

- **Fractal math:** Mandelbrot and Julia recurrence behavior, escape thresholds, equation powers, pixel-to-complex mapping, and smooth escape counts.
- **Navigation and domain validation:** cursor-anchored zoom, pan direction, precision limits, zoom-out bounds, camera validation, and fractal configuration validation.
- **Shader source:** render uniforms, palette branches (including monochrome and custom stops), color adjustments, and four-sample export path.
- **Renderer:** WebGL2 unavailability, render parameter validation, uniform mapping, resize and scale handling, context loss/restoration, and disposal.
- **UI:** canvas and control presence, navigation routes, Julia selection/parameter/reset, parameter and color controls, custom stops and reset, collapsible panels, PNG/JPEG export, and fullscreen export behavior.

## Failed cases

These are the outcomes from the test run. They have been left unchanged for review, as requested. A failing assertion does not by itself establish that the corresponding product feature is broken; several messages point to test matching, mock, or call-selection assumptions.

| Test | Observed failure |
| --- | --- |
| UI: select Julia, edit its parameter, zoom, and reset while retaining the selected type | Testing Library could not match the Julia description using one regular expression because its text is rendered across nested inline nodes. |
| UI: collapse/reopen Parameters and Coloring | The query still returned the Iterations input while its panel was collapsed. |
| UI: PNG export in fullscreen | Timed out after 5 seconds before the expected completion message was observed. |
| UI: JPEG export from the Export panel | The role/name query matched multiple buttons named “Export”. |
| Renderer: resize and pixel-ratio-adjusted scale | Expected scale `0.5`, observed `0.01`. |
| Renderer: context loss and restoration | The test did not observe a `drawArrays` call after restoration. |

## Scope limits

The React UI tests mock the WebGL renderer and browser fullscreen/download APIs. They verify UI-to-renderer parameter wiring, but do not exercise a physical GPU, actual browser shader compilation, visual output quality, real file downloads, responsive layout in multiple browsers, or GPU performance. Pointer-drag math is covered in domain tests; drag gesture dispatch is not covered by the UI tests.
