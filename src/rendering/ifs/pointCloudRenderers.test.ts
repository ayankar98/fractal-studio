import { describe, expect, it } from 'vitest'
import { renderBarnsleyFern } from './barnsleyFern.ts'
import { renderLorenzAttractor } from './strangeAttractor.ts'
import type { PointCloudColorOptions } from './pointCloudColors.ts'

const colors: PointCloudColorOptions = {
  palette: 0,
  customPaletteStops: [[0, 0, 0], [0.5, 0.5, 0.5], [1, 1, 1]],
  colorFrequency: 1,
  colorPhase: 0,
  brightness: 1,
  contrast: 1,
  contourStrength: 0,
}

function makeCanvasContext() {
  const writes: Uint8ClampedArray[] = []
  const context = {
    createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4), width, height }),
    putImageData: (image: ImageData) => writes.push(image.data),
  } as unknown as CanvasRenderingContext2D
  return { context, writes }
}

describe('point-cloud renderers', () => {
  it('renders the same fern points deterministically and handles zero iterations', () => {
    const first = makeCanvasContext()
    const second = makeCanvasContext()
    renderBarnsleyFern(first.context, 96, 96, 8_000, colors)
    renderBarnsleyFern(second.context, 96, 96, 8_000, colors)
    expect(first.writes).toHaveLength(1)
    expect(first.writes[0]).toEqual(second.writes[0])
    expect(first.writes[0].some((channel, index) => index % 4 !== 3 && channel !== (index % 4 === 0 ? 7 : index % 4 === 1 ? 9 : 14))).toBe(true)

    const empty = makeCanvasContext()
    renderBarnsleyFern(empty.context, 8, 8, 0, colors)
    expect(empty.writes[0].slice(0, 4)).toEqual(new Uint8ClampedArray([7, 9, 14, 255]))
  })

  it('renders a visible Lorenz attractor and applies pan and zoom', async () => {
    const baseline = makeCanvasContext()
    const moved = makeCanvasContext()
    const parameters = { sigma: 10, rho: 28, beta: 8 / 3, timeStep: 0.005 }
    await renderLorenzAttractor(baseline.context, 96, 96, 4_000, parameters, colors, 1, { x: 0, y: 0 }, new AbortController().signal)
    await renderLorenzAttractor(moved.context, 96, 96, 4_000, parameters, colors, 1.8, { x: 0.12, y: -0.08 }, new AbortController().signal)

    expect(baseline.writes).toHaveLength(1)
    expect(baseline.writes[0]).not.toEqual(moved.writes[0])
    expect(baseline.writes[0].some((channel, index) => index % 4 !== 3 && channel !== (index % 4 === 0 ? 7 : index % 4 === 1 ? 9 : 14))).toBe(true)
  })

  it('does not write a stale attractor frame after its render is cancelled', async () => {
    const { context, writes } = makeCanvasContext()
    const controller = new AbortController()
    const render = renderLorenzAttractor(context, 32, 32, 100_000, { sigma: 10, rho: 28, beta: 8 / 3, timeStep: 0.005 }, colors, 1, { x: 0, y: 0 }, controller.signal)
    setTimeout(() => controller.abort(), 0)
    await render
    expect(writes).toHaveLength(0)
  })
})
