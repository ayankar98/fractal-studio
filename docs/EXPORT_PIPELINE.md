# Export Pipeline

## Current implementation

The UI exports PNG or JPEG at 3840 x 2160. On click, it uses the current view, family, equation parameters, iteration count, and palette, creates a temporary WebGL2 canvas with `preserveDrawingBuffer`, scales units-per-pixel to preserve the vertical view span, and runs the fragment shader at output dimensions. Each output pixel uses four 2x2 subpixel evaluations averaged together to reduce aliasing. This makes export roughly four times more computationally expensive than one sample per pixel. It checks GPU texture and renderbuffer limits before drawing, then verifies MIME type and nonzero Blob size before starting a download. The preview image is not upscaled.

## Current flow

1. Capture the current view, family and equation parameters, iteration count, and palette.
2. Check fixed output dimensions against GPU texture and renderbuffer limits.
3. Render a full 3840 x 2160 frame directly in a temporary canvas with an independent WebGL2 context and four samples per pixel.
4. Encode PNG or JPEG at 0.95 JPEG quality and verify output MIME type and size.
5. Download the Blob and release temporary WebGL resources in `finally`.

## Constraints and next work

Only 3840 x 2160 is currently exposed. Tiling, custom dimensions, progress percentages, and cancellation are not implemented yet. The single-frame approach depends on browser canvas allocation and may fail on devices with insufficient memory; failures are reported. Add tiling and broader dimension support before treating export as complete for the full specification.

The export implementation is independent of preview resolution and preview canvas resources. Actual browser behavior still requires runtime verification on supported browsers and GPUs.
