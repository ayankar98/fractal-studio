import { describe, expect, it, vi } from 'vitest'
import { renderFractalTree } from './fractalTree.ts'

function makeTreeContext() {
  let lineSegments = 0
  const context = {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(() => { lineSegments += 1 }),
    stroke: vi.fn(),
    set fillStyle(_value: string) {},
    set lineCap(_value: CanvasLineCap) {},
    set strokeStyle(_value: string) {},
    set lineWidth(_value: number) {},
  } as unknown as CanvasRenderingContext2D
  return { context, getLineSegments: () => lineSegments }
}

describe('fractal tree renderer', () => {
  it('safely renders the full supported depth of 11 iterations', () => {
    const { context, getLineSegments } = makeTreeContext()
    expect(() => renderFractalTree(context, 800, 600, 11)).not.toThrow()
    expect(getLineSegments()).toBe(2 ** 11 - 1)
    expect(context.stroke).toHaveBeenCalledTimes(11)
  })

  it('renders the trunk at one iteration and only clears at zero', () => {
    const oneLevel = makeTreeContext()
    renderFractalTree(oneLevel.context, 100, 100, 1)
    expect(oneLevel.getLineSegments()).toBe(1)

    const zero = makeTreeContext()
    renderFractalTree(zero.context, 100, 100, 0)
    expect(zero.getLineSegments()).toBe(0)
    expect(zero.context.fillRect).toHaveBeenCalledOnce()
  })
})
