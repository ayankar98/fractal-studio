# GPU Rendering

## Current implementation

`src/rendering/webgl/WebGLMandelbrotRenderer.ts` owns the WebGL2 context, linked shader program, and vertex array. The fragment shader source is in `mandelbrotShader.ts`. WebGL2 creation errors, shader compile/link diagnostics, and maximum texture/renderbuffer dimensions are exposed to the UI/export logic. The renderer releases its owned program and VAO on disposal.

## Capability and failure handling

- Request WebGL2 explicitly; report an actionable message if unavailable.
- Query relevant texture and renderbuffer limits before choosing export target sizes.
- Check shader compile and program link status and surface diagnostic logs during development.
- Do not silently reduce iterations or dimensions on limited hardware.
- Handle context loss and restoration; rebuild GPU objects after restoration.

## Resource ownership

The rendering module owns its program, vertex array, and event listeners. Partial initialization failures clean up created objects. Disposal is idempotent. Temporary export objects have a separate lifecycle and do not tear down preview resources.

## Fallback

The CPU math reference is for tests, not an automatic visual fallback. The UI reports that a compatible WebGL2 context is required rather than silently presenting a lower-quality mode.

## Browser and hardware limitations

WebGL capabilities and memory vary by browser and device. Limits are queried at runtime. The shader has compiled and rendered the overview in headless Edge using SwiftShader. Do not infer support solely from the browser name.
