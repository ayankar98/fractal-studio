import { createPointColorLookup } from './pointCloudColors.ts'
import type { PointCloudColorOptions } from './pointCloudColors.ts'

export interface LorenzParameters {
  readonly sigma: number
  readonly rho: number
  readonly beta: number
  readonly timeStep: number
}

/** Render a Lorenz strange attractor, yielding periodically to keep controls responsive. */
export async function renderLorenzAttractor(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  iterations: number,
  parameters: LorenzParameters,
  colorOptions: PointCloudColorOptions,
  zoom: number,
  pan: { readonly x: number; readonly y: number },
  signal: AbortSignal,
): Promise<void> {
  const points = new Float32Array(iterations * 3)
  const burnIn = Math.min(1_000, Math.floor(iterations / 20))
  let x = 0.1
  let y = 0
  let z = 0
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY
  let pointCount = 0

  for (let step = 0; step < iterations; step += 1) {
    const h = parameters.timeStep
    const k1x = parameters.sigma * (y - x)
    const k1y = x * (parameters.rho - z) - y
    const k1z = x * y - parameters.beta * z

    const x2 = x + h * k1x * 0.5
    const y2 = y + h * k1y * 0.5
    const z2 = z + h * k1z * 0.5
    const k2x = parameters.sigma * (y2 - x2)
    const k2y = x2 * (parameters.rho - z2) - y2
    const k2z = x2 * y2 - parameters.beta * z2

    const x3 = x + h * k2x * 0.5
    const y3 = y + h * k2y * 0.5
    const z3 = z + h * k2z * 0.5
    const k3x = parameters.sigma * (y3 - x3)
    const k3y = x3 * (parameters.rho - z3) - y3
    const k3z = x3 * y3 - parameters.beta * z3

    const x4 = x + h * k3x
    const y4 = y + h * k3y
    const z4 = z + h * k3z
    const k4x = parameters.sigma * (y4 - x4)
    const k4y = x4 * (parameters.rho - z4) - y4
    const k4z = x4 * y4 - parameters.beta * z4

    x += h / 6 * (k1x + 2 * k2x + 2 * k3x + k4x)
    y += h / 6 * (k1y + 2 * k2y + 2 * k3y + k4y)
    z += h / 6 * (k1z + 2 * k2z + 2 * k3z + k4z)
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) break
    if (step < burnIn) continue

    const offset = pointCount * 3
    points[offset] = x
    points[offset + 1] = y
    points[offset + 2] = z
    pointCount += 1
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minZ = Math.min(minZ, z)
    maxZ = Math.max(maxZ, z)
    if (step > 0 && step % 20_000 === 0) {
      if (signal.aborted) return
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }
  }

  if (signal.aborted) return
  const image = context.createImageData(width, height)
  const pixels = image.data
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels[offset] = 7
    pixels[offset + 1] = 9
    pixels[offset + 2] = 14
    pixels[offset + 3] = 255
    if (offset > 0 && offset % 800_000 === 0) {
      if (signal.aborted) return
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }
  }

  if (pointCount === 0) {
    context.putImageData(image, 0, 0)
    return
  }

  const colors = createPointColorLookup(colorOptions)
  const rangeX = Math.max(1, maxX - minX)
  const rangeZ = Math.max(1, maxZ - minZ)
  const scale = Math.min(width * 0.86 / rangeX, height * 0.88 / rangeZ) * zoom
  const attractorWidth = rangeX * scale
  const attractorHeight = rangeZ * scale
  const left = (width - attractorWidth) / 2 + pan.x * width
  const top = (height - attractorHeight) / 2 + pan.y * height
  const dotSize = Math.max(1, Math.round(Math.min(width, height) / 1200))

  for (let i = 0; i < pointCount; i += 1) {
    const offset = i * 3
    const pixelX = Math.floor(left + (points[offset] - minX) * scale)
    const pixelY = Math.floor(top + attractorHeight - (points[offset + 2] - minZ) * scale)
    if (pixelX < 0 || pixelX >= width || pixelY < 0 || pixelY >= height) continue
    const colorIndex = Math.max(0, Math.min(255, Math.floor((points[offset + 2] - minZ) / rangeZ * 255))) * 3
    for (let dy = 0; dy < dotSize; dy += 1) {
      for (let dx = 0; dx < dotSize; dx += 1) {
        const targetX = pixelX + dx
        const targetY = pixelY + dy
        if (targetX >= width || targetY >= height) continue
        const target = (targetY * width + targetX) * 4
        pixels[target] = colors[colorIndex]
        pixels[target + 1] = colors[colorIndex + 1]
        pixels[target + 2] = colors[colorIndex + 2]
        pixels[target + 3] = 255
      }
    }
    if (i > 0 && i % 20_000 === 0) {
      if (signal.aborted) return
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }
  }

  if (signal.aborted) return
  context.putImageData(image, 0, 0)
}
