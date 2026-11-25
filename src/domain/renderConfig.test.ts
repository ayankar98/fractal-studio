import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  DEFAULT_MANDELBROT_CONFIG,
  DEFAULT_VIEW,
  validateFractalConfig,
  validateView,
} from './renderConfig.ts'

test('default camera and fractal configuration are valid', () => {
  assert.doesNotThrow(() => validateView(DEFAULT_VIEW))
  assert.doesNotThrow(() => validateFractalConfig(DEFAULT_MANDELBROT_CONFIG))
  assert.equal(DEFAULT_VIEW.centerX, -0.5)
  assert.equal(DEFAULT_MANDELBROT_CONFIG.maxIterations, 300)
})

test('view validation rejects non-finite centers, non-positive scale, and invalid dimensions', () => {
  assert.throws(() => validateView({ ...DEFAULT_VIEW, centerX: Number.NaN }), RangeError)
  assert.throws(() => validateView({ ...DEFAULT_VIEW, centerY: Number.POSITIVE_INFINITY }), RangeError)
  assert.throws(() => validateView({ ...DEFAULT_VIEW, unitsPerPixel: 0 }), RangeError)
  assert.throws(() => validateView({ ...DEFAULT_VIEW, unitsPerPixel: -1 }), RangeError)
  assert.throws(() => validateView({ ...DEFAULT_VIEW, width: 1.5 }), RangeError)
  assert.throws(() => validateView({ ...DEFAULT_VIEW, height: 0 }), RangeError)
})

test('fractal validation enforces iteration limits and integer equation powers', () => {
  for (const maxIterations of [0, 10_001, 1.5, Number.NaN]) {
    assert.throws(() => validateFractalConfig({ maxIterations }), RangeError)
  }
  for (const power of [1, 9, 2.5, Number.NaN]) {
    assert.throws(() => validateFractalConfig({ maxIterations: 100, power }), RangeError)
  }
  assert.doesNotThrow(() => validateFractalConfig({ maxIterations: 10_000, power: 8 }))
})

test('fractal validation rejects unknown families and non-finite Julia parameters', () => {
  assert.doesNotThrow(() => validateFractalConfig({ maxIterations: 100, family: 'burning-ship' }))
  assert.throws(() => validateFractalConfig({ maxIterations: 100, family: 'julia', constantReal: Number.NaN }), /finite real and imaginary/)
  assert.throws(() => validateFractalConfig({ maxIterations: 100, family: 'julia', constantImaginary: Number.POSITIVE_INFINITY }), /finite real and imaginary/)
  assert.doesNotThrow(() => validateFractalConfig({ maxIterations: 100, family: 'julia', constantReal: -2, constantImaginary: 2 }))
})
