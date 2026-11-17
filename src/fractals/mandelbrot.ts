import type { ViewState, FractalConfig } from '../domain/renderConfig.ts'
import { validateFractalConfig, validateView } from '../domain/renderConfig.ts'

/** Result of a bounded Mandelbrot escape-time computation. */
export interface EscapeResult {
  /** True only when the magnitude exceeded the escape radius within the cap. */
  readonly escaped: boolean
  /** Zero-based loop index at escape, or the cap when not escaped. */
  readonly iterations: number
  /** Final real component of z, retained for smooth coloring. */
  readonly real: number
  /** Final imaginary component of z, retained for smooth coloring. */
  readonly imaginary: number
  /** Degree used for the smooth escape correction. */
  readonly power: number
}

/** Complex-plane coordinate for a pixel center in a top-left-origin image. */
export interface ComplexCoordinate {
  readonly real: number
  readonly imaginary: number
}

/**
 * Map a pixel to the complex plane using pixel centers and a shared scale.
 * Screen y increases downward, so rows below center have negative imaginary
 * coordinates. This convention keeps circles round because both axes use
 * the same complex units per pixel; aspect ratio changes the visible span.
 */
export function pixelToComplex(
  pixelX: number,
  pixelY: number,
  view: ViewState,
): ComplexCoordinate {
  validateView(view)
  if (!Number.isFinite(pixelX) || !Number.isFinite(pixelY)) {
    throw new RangeError('Pixel coordinates must be finite numbers.')
  }

  return {
    real: view.centerX + (pixelX + 0.5 - view.width / 2) * view.unitsPerPixel,
    imaginary: view.centerY - (pixelY + 0.5 - view.height / 2) * view.unitsPerPixel,
  }
}

/**
 * Calculate one family orbit. Mandelbrot/Multibrot vary c from the pixel and
 * start at zero; Julia varies z0 from the pixel and holds c fixed; Burning
 * Ship applies component-wise absolute values before its quadratic step.
 */
export function iterateFractal(
  realC: number,
  imaginaryC: number,
  config: FractalConfig,
): EscapeResult {
  validateFractalConfig(config)
  if (!Number.isFinite(realC) || !Number.isFinite(imaginaryC)) {
    throw new RangeError('Complex coordinates must be finite numbers.')
  }

  const family = config.family ?? 'mandelbrot'
  const power = config.power ?? 2
  const julia = family === 'julia'
  const mapReal = julia ? (config.constantReal ?? -0.4) : realC
  const mapImaginary = julia ? (config.constantImaginary ?? 0.6) : imaginaryC
  const escapeRadius = Math.max(2, Math.hypot(mapReal, mapImaginary))
  let realZ = julia ? realC : 0
  let imaginaryZ = julia ? imaginaryC : 0
  let iterations = 0

  while (iterations < config.maxIterations) {
    const baseReal = realZ
    const baseImaginary = imaginaryZ
    let poweredReal = 1
    let poweredImaginary = 0
    for (let exponent = 0; exponent < power; exponent += 1) {
      const nextReal = poweredReal * baseReal - poweredImaginary * baseImaginary
      poweredImaginary = poweredReal * baseImaginary + poweredImaginary * baseReal
      poweredReal = nextReal
    }
    realZ = poweredReal + mapReal
    imaginaryZ = poweredImaginary + mapImaginary

    if (realZ * realZ + imaginaryZ * imaginaryZ > escapeRadius * escapeRadius) {
      return { escaped: true, iterations, real: realZ, imaginary: imaginaryZ, power }
    }
    iterations += 1
  }

  return { escaped: false, iterations, real: realZ, imaginary: imaginaryZ, power }
}

/** Backward-compatible helper for quadratic or Multibrot parameter space. */
export function iterateMandelbrot(
  realC: number,
  imaginaryC: number,
  config: FractalConfig,
): EscapeResult {
  return iterateFractal(realC, imaginaryC, { ...config, family: 'mandelbrot' })
}

/**
 * Estimate a continuous escape count for smoother palette transitions.
 * Interior/non-finite inputs return the integer iteration count so callers
 * always receive a finite value; callers should use escaped=false separately.
 */
export function smoothEscapeCount(result: EscapeResult): number {
  if (!result.escaped) return result.iterations

  const magnitude = Math.hypot(result.real, result.imaginary)
  if (!Number.isFinite(magnitude) || magnitude <= 1) return result.iterations

  const correction = Math.log(Math.log(magnitude)) / Math.log(result.power)
  // `iterations` is a zero-based loop index; add two to recover the standard
  // one-based recurrence count plus the smoothing offset.
  const smooth = result.iterations + 2 - correction
  return Number.isFinite(smooth) ? smooth : result.iterations
}

/**
 * Evaluate one pixel through the shared coordinate transform and recurrence.
 * This is a CPU reference for tests and small diagnostic samples, not a
 * production full-frame preview path.
 */
export function evaluatePixel(
  pixelX: number,
  pixelY: number,
  view: ViewState,
  config: FractalConfig,
): EscapeResult {
  const coordinate = pixelToComplex(pixelX, pixelY, view)
  return iterateFractal(coordinate.real, coordinate.imaginary, config)
}
