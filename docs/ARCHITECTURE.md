# Architecture

## Current implementation

React mounts `src/App.tsx` from `src/main.tsx`. The UI owns control state and view orchestration. Pure math and navigation live in `src/fractals/mandelbrot.ts` and `src/domain/`; `src/rendering/webgl/` owns shaders and GPU resources. Export creates a separate temporary canvas and renderer so it can calculate output pixels at 3840 x 2160 independently of the preview buffer.

## Module responsibilities

- **Application/UI:** React layout, control input, visible status, and current render parameters.
- **Domain:** typed view and iteration configuration, validation, and cursor/pan transformations independent of React and WebGL.
- **Fractal math:** Mandelbrot/Multibrot and Julia recurrences, coordinate mapping, and smooth escape reference calculations.
- **Rendering:** WebGL2 context, shader compilation, drawing, resizing, loss/restoration, and GPU resource disposal.
- **Color:** three named cosine palettes in the fragment shader selected through an integer index.
- **Export:** parameter snapshot, GPU output-limit validation, full-frame recalculation, PNG/JPEG encoding, status, and temporary resource cleanup. Tiling, cancel, and custom sizes are not implemented.

The dependency direction is UI -> domain/math and renderer. Domain math does not import React or WebGL. Export creates a separate renderer instance and does not depend on preview internals beyond the current parameter snapshot.

## State and rendering flow

```text
Wheel / drag / controls -> validated ViewState + iteration + palette -> preview shader uniforms
Export button -> current view + family parameters + palette -> separate 4K WebGL canvas with 4 subpixel samples -> Blob download
```

Exports snapshot parameters at click time. Keep GPU resource ownership and disposal in the rendering layer.

## Design constraints

- Add abstractions only when they serve an implemented module responsibility.
- Keep the renderer independent of React.
- Do not add controls before their behavior is implemented.
- Keep artistic effects as optional post-processing, separate from the mathematical recurrence.
- Update this document whenever actual module ownership or data flow changes.
