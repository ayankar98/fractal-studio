# Rendering Engine

## Current status

The preview uses `WebGLMandelbrotRenderer` and a full-screen WebGL2 fragment shader. A family uniform selects Mandelbrot/Multibrot parameter space or Julia dynamical space. The shader uses a finite iteration cap and ten color fields, with live frequency, phase, brightness, contrast, and contour controls. Direct float32 coordinates are used, with navigation stopping at a conservative precision limit. There is no CPU visual fallback; when WebGL2 is unavailable, the interface shows the initialization error.

## Renderer approach

Use a WebGL2 full-screen primitive and fragment shader. Each fragment maps its pixel center to a complex-plane coordinate and executes the selected escape-time recurrence. The GPU computes the iterations per pixel, avoiding a per-pixel CPU loop and large CPU-to-GPU result transfers during interactive preview.

The CPU functions in `src/fractals/mandelbrot.ts` are deterministic math references. They are not used to calculate preview frames.

## Render lifecycle

1. Create a WebGL2 context and install loss/restoration handlers.
2. Compile and link shader programs; include driver diagnostics on failure.
3. Allocate stable geometry and other required resources.
4. On a render request, snapshot validated configuration and set uniforms.
5. Draw using the canvas drawing-buffer dimensions and current viewport.
6. On resize, update dimensions/viewport. React requests a frame with the updated view.
7. On context loss, stop rendering and inform the UI. On restoration, rebuild invalid GPU objects.
8. On disposal, remove listeners and release the owned program and vertex array.

## Interaction constraints

`zoomViewAt` preserves the complex coordinate below the cursor across the scale change. `panView` moves the center in units derived from the same pixel-to-complex mapping. Pointer movement uses the original drag state to avoid cumulative rounding drift.

## Precision

Standard shader floating-point values have finite precision; direct rendering eventually loses the ability to distinguish neighboring pixel coordinates. `minimumStableScale` estimates a conservative floor from the spacing of float32 numbers at the view center, accounting for the app's maximum 2x drawing-buffer ratio. It stops zooming before the renderer shows the severe blockiness seen beyond that limit. This does not add precision; deeper rendering would require a separate numerical method.
