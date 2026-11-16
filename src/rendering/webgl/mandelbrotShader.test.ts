import assert from 'node:assert/strict'
import { test } from 'vitest'
import { FULLSCREEN_VERTEX_SHADER, MANDELBROT_FRAGMENT_SHADER } from './mandelbrotShader.ts'

test('fragment shader exposes uniforms for render parameters and color editing controls', () => {
  for (const uniform of [
    'u_resolution', 'u_center', 'u_unitsPerPixel', 'u_maxIterations', 'u_power',
    'u_family', 'u_juliaConstant', 'u_palette', 'u_customColorStart',
    'u_customColorMiddle', 'u_customColorEnd', 'u_samplesPerPixel',
    'u_colorFrequency', 'u_colorPhase', 'u_brightness', 'u_contrast', 'u_contourStrength',
  ]) {
    assert.match(MANDELBROT_FRAGMENT_SHADER, new RegExp(`uniform \\w+ ${uniform};`))
  }
})

test('shader contains every named palette branch, including monochrome and custom stops', () => {
  for (let palette = 1; palette <= 10; palette += 1) {
    assert.ok(MANDELBROT_FRAGMENT_SHADER.includes(`palette == ${palette}`), `missing palette ${palette}`)
  }
  assert.match(MANDELBROT_FRAGMENT_SHADER, /dot\(color, vec3\(0\.299, 0\.587, 0\.114\)\)/)
  assert.match(MANDELBROT_FRAGMENT_SHADER, /mix\(u_customColorStart, u_customColorMiddle/)
  assert.match(MANDELBROT_FRAGMENT_SHADER, /mix\(u_customColorMiddle, u_customColorEnd/)
})

test('shader supports optional contour, brightness, contrast, and four-sample export rendering', () => {
  assert.match(MANDELBROT_FRAGMENT_SHADER, /contour \* u_contourStrength/)
  assert.match(MANDELBROT_FRAGMENT_SHADER, /\* u_brightness/)
  assert.match(MANDELBROT_FRAGMENT_SHADER, /\* u_contrast/)
  assert.match(MANDELBROT_FRAGMENT_SHADER, /u_samplesPerPixel == 1/)
  assert.equal((MANDELBROT_FRAGMENT_SHADER.match(/renderSample\(gl_FragCoord\.xy \+ vec2/g) ?? []).length, 4)
})

test('full-screen triangle vertex shader uses WebGL 2 core syntax', () => {
  assert.match(FULLSCREEN_VERTEX_SHADER, /^#version 300 es/)
  assert.match(FULLSCREEN_VERTEX_SHADER, /gl_VertexID/)
  assert.match(FULLSCREEN_VERTEX_SHADER, /gl_Position/)
})
