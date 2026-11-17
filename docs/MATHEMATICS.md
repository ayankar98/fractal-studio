# Mathematics

## Mandelbrot set escape-time calculation

For each complex-plane coordinate `c = x + yi`, initialize `z0 = 0` and iterate:

```text
z(n + 1) = z(n)^2 + c
```

Writing `z = a + bi`, complex squaring gives `(a + bi)^2 = (a^2 - b^2) + (2ab)i`. Therefore each iteration is:

```text
a' = a*a - b*b + x
b' = 2*a*b + y
```

The point is known to escape when `a*a + b*b > 4`, equivalent to `|z| > 2`. The comparison is strict: a value exactly on radius 2 has not escaped yet. The current CPU implementation increments its zero-based iteration counter after each non-escaping update, so `c = 2` reaches radius 2 at counter 0 and escapes at counter 1 on the following update. If a point has not escaped by the configured maximum iteration count, the finite computation reports it as not escaped within the cap. This is not a proof that it never escapes.

## Implemented equation families

The family selector changes the recurrence itself. The view preset selector is separate and changes the viewport coordinates or, for Julia presets, its fixed parameter.

### Mandelbrot and Multibrot parameter plane

Each pixel supplies `c`; start at `z0 = 0` and iterate `z(n+1) = z(n)^p + c`. Power 2 is the classic Mandelbrot set. Integer powers 3 through 8 are Multibrot variants.

### Julia dynamical plane

Each pixel supplies the initial value `z0`; the complex parameter `c` is held fixed and user-adjustable. Iterate the same polynomial `z(n+1) = z(n)^p + c`. The UI's named Julia presets set example values of `c`, and the two parameter sliders can then change them.

For both modes the CPU reference and GPU shader use an escape radius of `max(2, |c|)`. The iteration cap is a finite rendering bound and does not prove that a non-escaping orbit stays bounded forever.

## Pixel mapping

`pixelToComplex` uses pixel centers. The view center is at the midpoint; the same units-per-pixel is applied on both axes so aspect ratio changes visible width, not geometric shape. Screen y increases downward, so imaginary coordinate decreases below center. `ViewState.unitsPerPixel` is defined per logical image pixel. WebGL converts that scale for physical drawing-buffer height, and export rescales it to preserve the vertical span.

## Smooth escape coloring

For escaped values, a continuous estimate uses the recurrence degree `p`: `mu = n + 2 - log(log(|z|)) / log(p)`, where `n` is the zero-based loop index at escape. The interior remains a separate dark color. Color mapping is artistic and applied after the mathematical escape calculation; it is not part of set membership.

The palette controls change color-band frequency and phase, then apply brightness and contrast. Contour strength overlays smooth-iteration bands on escaped pixels. These controls affect both the live preview and 4K export; they do not change the recurrence or set membership.

## Validation and tests

The pure math tests cover the origin, known escaping inputs (for example `c = 2 + 0i`), threshold behavior, all three family recurrences, coordinate mapping, aspect ratio, parameter bounds, and finite smooth values. The inputs are deterministic; GPU output can differ slightly because of floating-point implementation details.

Implemented functions are `pixelToComplex`, `iterateFractal`, the compatibility helper `iterateMandelbrot`, `smoothEscapeCount`, and `evaluatePixel` in `src/fractals/mandelbrot.ts`. Deterministic checks cover mapping, the three recurrence families, bounded escape behavior, validation, and finite smooth values.
