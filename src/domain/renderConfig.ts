/** Parameters shared by the math, preview, and export layers. */
export interface ViewState {
  /** Horizontal center of the visible complex-plane rectangle. */
  readonly centerX: number
  /** Vertical center of the visible complex-plane rectangle. */
  readonly centerY: number
  /** Complex-plane units represented by one output pixel. */
  readonly unitsPerPixel: number
  /** Pixel width of the target image. */
  readonly width: number
  /** Pixel height of the target image. */
  readonly height: number
}

export type FractalFamily = 'mandelbrot' | 'julia'

/** Parameters for a supported complex-plane recurrence. */
export interface FractalConfig {
  readonly maxIterations: number
  readonly family?: FractalFamily
  /** Integer exponent in z <- z^power + c (2 is the classic quadratic map). */
  readonly power?: number
  /** Fixed c for Julia rendering; the pixel coordinate is the starting z. */
  readonly constantReal?: number
  readonly constantImaginary?: number
}

/** @deprecated Kept as a source-compatible name for the original renderer API. */
export type MandelbrotConfig = FractalConfig

/** Validated default view, centered on the classic Mandelbrot overview. */
export const DEFAULT_VIEW: ViewState = {
  centerX: -0.5,
  centerY: 0,
  unitsPerPixel: 3.2 / 900,
  width: 1600,
  height: 900,
}

/** Initial iteration cap; bounded at the application boundary. */
export const DEFAULT_MANDELBROT_CONFIG: FractalConfig = {
  maxIterations: 300,
  family: 'mandelbrot',
  power: 2,
  constantReal: -0.4,
  constantImaginary: 0.6,
}

/**
 * Validate all view parameters before they reach mapping or rendering code.
 * Width and height are integers because they describe pixel dimensions.
 */
export function validateView(view: ViewState): void {
  const finite = [view.centerX, view.centerY, view.unitsPerPixel]
  if (!finite.every(Number.isFinite)) {
    throw new RangeError('View center and scale must be finite numbers.')
  }
  if (view.unitsPerPixel <= 0) {
    throw new RangeError('Units per pixel must be greater than zero.')
  }
  if (!Number.isSafeInteger(view.width) || view.width < 1) {
    throw new RangeError('Width must be a positive safe integer.')
  }
  if (!Number.isSafeInteger(view.height) || view.height < 1) {
    throw new RangeError('Height must be a positive safe integer.')
  }
}

/**
 * Validate the escape iteration limit. The upper bound protects preview
 * responsiveness; later UI controls should use this same domain rule.
 */
export function validateFractalConfig(config: FractalConfig): void {
  if (!Number.isSafeInteger(config.maxIterations)
    || config.maxIterations < 1
    || config.maxIterations > 10_000) {
    throw new RangeError('Maximum iterations must be an integer from 1 to 10000.')
  }
  const power = config.power ?? 2
  if (!Number.isSafeInteger(power) || power < 2 || power > 8) {
    throw new RangeError('Equation power must be an integer from 2 to 8.')
  }
  const family = config.family ?? 'mandelbrot'
  if (!['mandelbrot', 'julia'].includes(family)) {
    throw new RangeError('Unknown fractal family.')
  }
  if (!Number.isFinite(config.constantReal ?? -0.4)
    || !Number.isFinite(config.constantImaginary ?? 0.6)) {
    throw new RangeError('The Julia parameter must have finite real and imaginary parts.')
  }
}

/** @deprecated Use validateFractalConfig. */
export const validateMandelbrotConfig = validateFractalConfig
