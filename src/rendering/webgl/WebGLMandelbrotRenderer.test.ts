import assert from 'node:assert/strict'
import { test, vi } from 'vitest'
import { DEFAULT_VIEW } from '../../domain/renderConfig.ts'
import { WebGLMandelbrotRenderer } from './WebGLMandelbrotRenderer.ts'
import type { RenderParameters } from './WebGLMandelbrotRenderer.ts'

const baseParameters: RenderParameters = {
  view: { ...DEFAULT_VIEW, width: 100, height: 50, unitsPerPixel: 0.01 },
  fractal: { family: 'julia', maxIterations: 320, power: 3, constantReal: -0.4, constantImaginary: 0.6 },
  palette: 10,
  customPaletteStops: [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6], [0.7, 0.8, 0.9]],
  colorFrequency: 1.25,
  colorPhase: 0.2,
  brightness: 1.1,
  contrast: 1.4,
  contourStrength: 0.35,
  samplesPerPixel: 4,
}

function createRendererHarness(contextAvailable = true, callbacks = { onContextLost: () => {}, onContextRestored: () => {} }) {
  const calls: Array<{ name: string; args: unknown[] }> = []
  const listeners = new Map<string, EventListener>()
  const constants: Record<string, unknown> = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    MAX_TEXTURE_SIZE: 5,
    MAX_RENDERBUFFER_SIZE: 6,
    TRIANGLES: 7,
  }
  const gl = new Proxy(constants, {
    get(target, key: string) {
      if (key in target) return target[key]
      return (...args: unknown[]) => {
        calls.push({ name: key, args })
        if (key === 'createShader') return { shaderType: args[0] }
        if (key === 'createProgram') return { program: true }
        if (key === 'createVertexArray') return { vertexArray: true }
        if (key === 'getUniformLocation') return { name: args[1] }
        if (key === 'getShaderParameter' || key === 'getProgramParameter') return true
        if (key === 'getParameter') return 8192
        if (key === 'isContextLost') return false
        return undefined
      }
    },
  }) as unknown as WebGL2RenderingContext

  const canvas = {
    width: 100,
    height: 50,
    getContext: () => contextAvailable ? gl : null,
    addEventListener: (type: string, listener: EventListener) => listeners.set(type, listener),
    removeEventListener: (type: string) => listeners.delete(type),
  } as unknown as HTMLCanvasElement
  const renderer = new WebGLMandelbrotRenderer(canvas, callbacks)
  return { renderer, canvas, callbacks, calls, listeners }
}

test('constructor reports missing WebGL 2 support clearly', () => {
  const canvas = { getContext: () => null } as unknown as HTMLCanvasElement
  assert.throws(
    () => new WebGLMandelbrotRenderer(canvas, { onContextLost() {}, onContextRestored() {} }),
    /WebGL 2 is unavailable/,
  )
})

test('renderer validates palettes, custom color stops, sampling, and finite color controls', () => {
  const { renderer } = createRendererHarness()
  assert.throws(() => renderer.render({ ...baseParameters, palette: 11 }), /Palette index/)
  assert.throws(() => renderer.render({ ...baseParameters, customPaletteStops: [[-0.1, 0, 0], [0, 0, 0], [0, 0, 0]] }), /Custom palette color channels/)
  assert.throws(() => renderer.render({ ...baseParameters, samplesPerPixel: 2 as 1 }), /Samples per pixel/)
  assert.throws(() => renderer.render({ ...baseParameters, colorFrequency: Number.NaN }), /Color controls must be finite/)
  renderer.dispose()
})

test('render maps Julia, custom palette, visual controls, and four-sample export to shader uniforms', () => {
  const { renderer, calls } = createRendererHarness()
  renderer.render(baseParameters)
  const uniformCalls = calls.filter(({ name }) => name.startsWith('uniform'))
  const integerUniforms = uniformCalls.filter(({ name }) => name === 'uniform1i')
    .map(({ args }) => [(args[0] as { name: string }).name, args[1]])
  assert.ok(integerUniforms.some(([name, value]) => name === 'u_family' && value === 1))
  assert.ok(integerUniforms.some(([name, value]) => name === 'u_palette' && value === 10))
  assert.ok(integerUniforms.some(([name, value]) => name === 'u_samplesPerPixel' && value === 4))
  assert.ok(uniformCalls.some(({ name, args }) => name === 'uniform3f'
    && (args[0] as { name: string }).name === 'u_customColorMiddle'
    && args.slice(1).join(',') === '0.4,0.5,0.6'))
  assert.ok(uniformCalls.some(({ name, args }) => name === 'uniform1f'
    && (args[0] as { name: string }).name === 'u_contourStrength'
    && args[1] === 0.35))
  assert.ok(calls.some(({ name }) => name === 'drawArrays'))
  renderer.dispose()
})

test('resize clamps drawing-buffer dimensions and redraws with pixel-ratio-adjusted scale', () => {
  const { renderer, canvas, calls } = createRendererHarness()
  renderer.render(baseParameters)
  renderer.resize(240.9, 0)
  assert.equal(canvas.width, 240)
  assert.equal(canvas.height, 1)
  assert.ok(calls.some(({ name, args }) => name === 'viewport' && args.join(',') === '0,0,240,1'))
  const scaleCall = calls.filter(({ name, args }) => name === 'uniform1f'
    && (args[0] as { name: string }).name === 'u_unitsPerPixel').at(-1)
  assert.equal(scaleCall?.args[1], 0.5)
  renderer.dispose()
})

test('context loss blocks rendering and restoration redraws the last parameters', () => {
  const callbacks = { onContextLost: vi.fn(), onContextRestored: vi.fn() }
  const harness = createRendererHarness(true, callbacks)
  harness.renderer.render(baseParameters)
  const lostListener = harness.listeners.get('webglcontextlost')
  assert.ok(lostListener)
  lostListener({ preventDefault() {} } as Event)
  assert.equal(harness.renderer.isContextLost, true)
  assert.equal(callbacks.onContextLost.mock.calls.length, 1)
  assert.throws(() => harness.renderer.render(baseParameters), /context is lost/)
  harness.listeners.get('webglcontextrestored')?.(new Event('webglcontextrestored'))
  assert.equal(harness.renderer.isContextLost, false)
  assert.equal(callbacks.onContextRestored.mock.calls.length, 1)
  assert.ok(harness.calls.some(({ name }) => name === 'drawArrays'))
  harness.renderer.dispose()
})

test('dispose is idempotent and prevents future renders', () => {
  const { renderer, calls } = createRendererHarness()
  renderer.dispose()
  const deletes = calls.filter(({ name }) => name === 'deleteProgram' || name === 'deleteVertexArray').length
  renderer.dispose()
  assert.equal(calls.filter(({ name }) => name === 'deleteProgram' || name === 'deleteVertexArray').length, deletes)
  assert.throws(() => renderer.render(baseParameters), /has been disposed/)
})
