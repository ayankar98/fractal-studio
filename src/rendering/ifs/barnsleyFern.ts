import { createPointColorLookup } from './pointCloudColors.ts'
import type { PointCloudColorOptions } from './pointCloudColors.ts'

/** Render the Barnsley fern IFS into a 2D canvas using a seeded point stream. */
export function renderBarnsleyFern(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  iterations: number,
  colorOptions: PointCloudColorOptions,
): void {
  const image = context.createImageData(width, height)
  const pixels = image.data
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels[offset] = 7
    pixels[offset + 1] = 9
    pixels[offset + 2] = 14
    pixels[offset + 3] = 255
  }

  const colors = createPointColorLookup(colorOptions)
  const minX = -2.182
  const maxX = 2.6558
  const maxY = 9.9983
  const scale = Math.min(width * 0.82 / (maxX - minX), height * 0.9 / maxY)
  const fernWidth = (maxX - minX) * scale
  const fernHeight = maxY * scale
  const left = (width - fernWidth) / 2
  const top = (height - fernHeight) / 2
  const dotSize = Math.max(1, Math.round(Math.min(width, height) / 1100))

  let x = 0
  let y = 0
  let seed = 0x6d2b79f5
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 0x1_0000_0000
  }

  for (let i = 0; i < iterations; i += 1) {
    const choice = random()
    const oldX = x
    const oldY = y
    if (choice < 0.01) {
      x = 0
      y = 0.16 * oldY
    } else if (choice < 0.86) {
      x = 0.85 * oldX + 0.04 * oldY
      y = -0.04 * oldX + 0.85 * oldY + 1.6
    } else if (choice < 0.93) {
      x = 0.2 * oldX - 0.26 * oldY
      y = 0.23 * oldX + 0.22 * oldY + 1.6
    } else {
      x = -0.15 * oldX + 0.28 * oldY
      y = 0.26 * oldX + 0.24 * oldY + 0.44
    }

    if (i < 20) continue
    const pixelX = Math.floor(left + (x - minX) * scale)
    const pixelY = Math.floor(height - top - y * scale)
    if (pixelX < 0 || pixelX >= width || pixelY < 0 || pixelY >= height) continue
    const colorIndex = Math.max(0, Math.min(255, Math.floor(y / maxY * 255))) * 3
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
  }

  context.putImageData(image, 0, 0)
}
