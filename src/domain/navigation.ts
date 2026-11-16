import type { ViewState } from './renderConfig.ts'
import { validateView } from './renderConfig.ts'
import { pixelToComplex } from '../fractals/mandelbrot.ts'

/**
 * Conservative minimum scale for direct float32 shader coordinates. Eight
 * float32 ULPs at the view center leave several representable coordinate steps
 * per physical pixel at the app's maximum 2x drawing-buffer ratio.
 */
export function minimumStableScale(view: Pick<ViewState, 'centerX' | 'centerY'>): number {
  if (!Number.isFinite(view.centerX) || !Number.isFinite(view.centerY)) {
    throw new RangeError('View center must contain finite coordinates.')
  }
  const magnitude = Math.max(Math.abs(view.centerX), Math.abs(view.centerY))
  if (magnitude === 0) return 1e-7
  const float32Spacing = 2 ** (Math.floor(Math.log2(magnitude)) - 23)
  return Math.max(float32Spacing * 8, 1e-14)
}

/**
 * Pan the view by a drag measured in logical canvas pixels. Moving the pointer
 * right moves the artwork right, so the viewed center travels left in the
 * complex plane. Screen y is inverted relative to the imaginary axis.
 */
export function panView(view: ViewState, deltaX: number, deltaY: number): ViewState {
  validateView(view)
  if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) {
    throw new RangeError('Pan distance must be finite.')
  }
  return {
    ...view,
    centerX: view.centerX - deltaX * view.unitsPerPixel,
    centerY: view.centerY + deltaY * view.unitsPerPixel,
  }
}

/**
 * Zoom around a logical pixel so its complex coordinate remains fixed beneath
 * the cursor. factor > 1 zooms out, while factor < 1 zooms in.
 */
export function zoomViewAt(
  view: ViewState,
  pixelX: number,
  pixelY: number,
  factor: number,
): ViewState {
  validateView(view)
  if (!Number.isFinite(factor) || factor <= 0) {
    throw new RangeError('Zoom factor must be finite and greater than zero.')
  }
  const anchor = pixelToComplex(pixelX, pixelY, view)
  const minimumScale = minimumStableScale({ centerX: anchor.real, centerY: anchor.imaginary })
  const unitsPerPixel = Math.min(Math.max(view.unitsPerPixel * factor, minimumScale), 1e3)
  const horizontalOffset = pixelX + 0.5 - view.width / 2
  const verticalOffset = -(pixelY + 0.5 - view.height / 2)
  return {
    ...view,
    centerX: anchor.real - horizontalOffset * unitsPerPixel,
    centerY: anchor.imaginary - verticalOffset * unitsPerPixel,
    unitsPerPixel,
  }
}
