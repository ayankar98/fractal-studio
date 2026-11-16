import assert from 'node:assert/strict'
import { test } from 'vitest'
import { minimumStableScale, panView, zoomViewAt } from './navigation.ts'
import { pixelToComplex } from '../fractals/mandelbrot.ts'
import type { ViewState } from './renderConfig.ts'

const view: ViewState = {
  centerX: -0.5,
  centerY: 0.2,
  unitsPerPixel: 0.01,
  width: 100,
  height: 80,
}

test('pan follows the pointer while the viewed center moves oppositely', () => {
  assert.deepEqual(panView(view, 10, 5), {
    ...view,
    centerX: -0.6,
    centerY: 0.25,
  })
})

test('cursor-anchored zoom preserves the complex point under the cursor', () => {
  const before = pixelToComplex(17, 63, view)
  const afterView = zoomViewAt(view, 17, 63, 0.25)
  const after = pixelToComplex(17, 63, afterView)
  assert.ok(Math.abs(before.real - after.real) < 1e-12)
  assert.ok(Math.abs(before.imaginary - after.imaginary) < 1e-12)
  assert.equal(afterView.unitsPerPixel, view.unitsPerPixel * 0.25)
})

test('zoom stops at the float32 precision floor and bounds zooming out', () => {
  assert.equal(
    zoomViewAt(view, 49, 39, 1e-20).unitsPerPixel,
    minimumStableScale(view),
  )
  assert.equal(zoomViewAt(view, 50, 40, 1e20).unitsPerPixel, 1e3)
})

test('minimum zoom scale increases with coordinate magnitude', () => {
  assert.ok(minimumStableScale({ centerX: -0.75, centerY: 0.02 })
    > minimumStableScale({ centerX: -0.02, centerY: 0.002 }))
  assert.equal(minimumStableScale({ centerX: 0, centerY: 0 }), 1e-7)
})
