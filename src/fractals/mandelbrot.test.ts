import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  iterateFractal,
  iterateMandelbrot,
  pixelToComplex,
  smoothEscapeCount,
} from './mandelbrot.ts'
import type { ViewState } from '../domain/renderConfig.ts'

const config = { maxIterations: 100 }
const view: ViewState = {
  centerX: 0,
  centerY: 0,
  unitsPerPixel: 1,
  width: 4,
  height: 2,
}

test('the origin does not escape within a finite iteration cap', () => {
  const result = iterateMandelbrot(0, 0, config)
  assert.equal(result.escaped, false)
  assert.equal(result.iterations, config.maxIterations)
})

test('a known period-two point remains bounded within the configured cap', () => {
  assert.equal(iterateMandelbrot(-1, 0, config).escaped, false)
})

test('c = 2 reaches the radius first, then escapes on its second iteration', () => {
  const result = iterateMandelbrot(2, 0, config)
  assert.equal(result.escaped, true)
  assert.equal(result.iterations, 1)
  assert.equal(result.real, 6)
  assert.equal(result.imaginary, 0)
})

test('equation power changes the recurrence from quadratic to cubic', () => {
  const quadratic = iterateMandelbrot(2, 0, { maxIterations: 4, power: 2 })
  const cubic = iterateMandelbrot(2, 0, { maxIterations: 4, power: 3 })
  assert.equal(quadratic.real, 6)
  assert.equal(cubic.real, 10)
  assert.equal(cubic.iterations, 1)
})

test('Julia mode varies the pixel start and holds its parameter fixed', () => {
  const julia = iterateFractal(2, 0, {
    family: 'julia', maxIterations: 10, power: 2, constantReal: 0, constantImaginary: 0,
  })
  const mandelbrot = iterateFractal(2, 0, { family: 'mandelbrot', maxIterations: 10, power: 2 })
  assert.equal(julia.escaped, true)
  assert.equal(julia.iterations, 0)
  assert.equal(mandelbrot.iterations, 1)
})

test('the escape threshold is strict at magnitude 2', () => {
  assert.equal(iterateMandelbrot(1, 0, { maxIterations: 1 }).escaped, false)
  assert.equal(iterateMandelbrot(2, 0, { maxIterations: 1 }).escaped, false)
  assert.equal(iterateMandelbrot(2, 0, { maxIterations: 2 }).escaped, true)
})

test('pixel mapping uses pixel centers, shared axis scale, and inverted screen y', () => {
  assert.deepEqual(pixelToComplex(0, 0, view), { real: -1.5, imaginary: 0.5 })
  assert.deepEqual(pixelToComplex(3, 1, view), { real: 1.5, imaginary: -0.5 })
})

test('mapping responds to aspect ratio without stretching complex units', () => {
  const wide = pixelToComplex(4, 2, { ...view, width: 8, height: 4 })
  assert.deepEqual(wide, { real: 0.5, imaginary: -0.5 })
})

test('invalid complex coordinates and iteration limits are rejected', () => {
  assert.throws(() => iterateMandelbrot(Number.NaN, 0, config), RangeError)
  assert.throws(() => iterateMandelbrot(0, 0, { maxIterations: 0 }), RangeError)
  assert.throws(() => iterateMandelbrot(0, 0, { maxIterations: 1.5 }), RangeError)
  assert.throws(() => iterateMandelbrot(0, 0, { maxIterations: 10, power: 1 }), RangeError)
  assert.throws(() => iterateMandelbrot(0, 0, { maxIterations: 10, power: 2.5 }), RangeError)
})

test('smooth escape values remain finite for escaped points and interior values', () => {
  const escaped = iterateMandelbrot(2, 0, config)
  const interior = iterateMandelbrot(0, 0, config)
  assert.ok(Number.isFinite(smoothEscapeCount(escaped)))
  const magnitude = Math.hypot(escaped.real, escaped.imaginary)
  const expected = escaped.iterations + 2 - Math.log2(Math.log(magnitude))
  assert.ok(Math.abs(smoothEscapeCount(escaped) - expected) < 1e-12)
  assert.equal(smoothEscapeCount(interior), config.maxIterations)
})

