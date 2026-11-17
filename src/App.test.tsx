// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import App from './App.tsx'

const rendererState = vi.hoisted(() => ({
  instances: [] as Array<{
    canvas: HTMLCanvasElement
    maxTextureSize: number
    maxRenderbufferSize: number
    isContextLost: boolean
    renders: unknown[]
    resizeCalls: Array<[number, number]>
    disposed: boolean
    render: (parameters: unknown) => void
    resize: (width: number, height: number) => void
    dispose: () => void
  }>,
}))

vi.mock('./rendering/webgl/WebGLMandelbrotRenderer.ts', () => ({
  WebGLMandelbrotRenderer: class FakeRenderer {
    canvas: HTMLCanvasElement
    maxTextureSize = 8192
    maxRenderbufferSize = 8192
    isContextLost = false
    renders: unknown[] = []
    resizeCalls: Array<[number, number]> = []
    disposed = false

    constructor(canvas: HTMLCanvasElement) {
      this.canvas = canvas
      rendererState.instances.push(this)
    }

    render(parameters: unknown) { this.renders.push(parameters) }
    resize(width: number, height: number) { this.resizeCalls.push([width, height]) }
    dispose() { this.disposed = true }
  },
}))

class ResizeObserverStub {
  observe = vi.fn()
  disconnect = vi.fn()
  unobserve = vi.fn()
  constructor(_callback: ResizeObserverCallback) {}
}

const lastRender = () => {
  const renderer = rendererState.instances.at(-1)
  return renderer?.renders.at(-1) as {
    view: { centerX: number; centerY: number; unitsPerPixel: number; width: number; height: number }
    fractal: { family: string; maxIterations: number; power?: number; constantReal?: number; constantImaginary?: number }
    palette: number
    customPaletteStops: number[][]
    colorFrequency: number
    colorPhase: number
    brightness: number
    contrast: number
    contourStrength: number
    samplesPerPixel?: number
  }
}

describe('Fractal Studio UI', () => {
  let activeFullscreen: Element | null

  beforeEach(() => {
    rendererState.instances.length = 0
    activeFullscreen = null
    window.history.replaceState({}, '', '/')
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true })
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => activeFullscreen })
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
      configurable: true,
      value: vi.fn(function (this: HTMLElement) {
        activeFullscreen = this
        document.dispatchEvent(new Event('fullscreenchange'))
        return Promise.resolve()
      }),
    })
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: vi.fn(() => {
        activeFullscreen = null
        document.dispatchEvent(new Event('fullscreenchange'))
        return Promise.resolve()
      }),
    })
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
      configurable: true,
      value: vi.fn((callback: BlobCallback, mimeType = 'image/png') => callback(new Blob(['rendered image'], { type: mimeType }))),
    })
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:fractal-test') })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
    vi.spyOn(window, 'setTimeout').mockImplementation(() => 0 as unknown as ReturnType<typeof setTimeout>)
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('renders the canvas, navigation, fractal selector, parameter and coloring controls', () => {
    render(<App />)
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Generative Canvas/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Gallery/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Learn/ })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Fractal Type' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Interactive fractal canvas' })).toBeTruthy()
    expect(screen.getByLabelText('Iterations')).toBeTruthy()
    expect(screen.getByLabelText('Equation power (p)')).toBeTruthy()
    expect(screen.getByLabelText('Color frequency')).toBeTruthy()
    expect(screen.getByLabelText('Color phase')).toBeTruthy()
    expect(screen.getByLabelText('Brightness')).toBeTruthy()
    expect(screen.getByLabelText('Contrast')).toBeTruthy()
    expect(screen.getByLabelText('Contour overlay')).toBeTruthy()
    expect(lastRender().samplesPerPixel).toBe(4)
    expect(screen.getByLabelText('Output format')).toBeTruthy()
  })

  it('routes to Gallery and Learn, and returns to the canvas from the coming-soon pages', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('link', { name: /Gallery/ }))
    expect(window.location.pathname).toBe('/gallery')
    expect(screen.getByRole('heading', { name: 'Fractal Gallery' })).toBeTruthy()
    expect(screen.getByText(/coming soon/)).toBeTruthy()

    fireEvent.click(screen.getByRole('link', { name: /Learn/ }))
    expect(window.location.pathname).toBe('/learn')
    expect(screen.getByRole('heading', { name: 'Learn' })).toBeTruthy()
    fireEvent.click(screen.getByRole('link', { name: 'Return to Generative Canvas' }))
    expect(window.location.pathname).toBe('/')
    expect(screen.getByRole('region', { name: 'Interactive fractal canvas' })).toBeTruthy()
  })

  it('selects Julia, updates its parameter, and resets to the Julia overview without changing type', () => {
    render(<App />)
    const family = screen.getByRole('combobox', { name: 'Fractal Type' }) as HTMLSelectElement
    fireEvent.change(family, { target: { value: 'julia' } })
    expect(family.value).toBe('julia')
    expect(screen.getByRole('heading', { name: 'Julia set' })).toBeTruthy()
    expect(screen.getByText(/Julia set with fixed c = -0\.400 \+ 0\.600i/)).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Real part'), { target: { value: '0.5' } })
    expect(screen.getByText(/Julia set with fixed c = 0\.500 \+ 0\.600i/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Reset view' }))
    expect(family.value).toBe('julia')
    expect(lastRender().fractal.family).toBe('julia')
    expect(lastRender().fractal.constantReal).toBe(0.5)
    expect(lastRender().view.centerX).toBe(0)
  })

  it('updates parameter sliders and preserves readable values', () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('Iterations'), { target: { value: '520' } })
    fireEvent.change(screen.getByLabelText('Equation power (p)'), { target: { value: '4' } })
    expect(lastRender().fractal.maxIterations).toBe(520)
    expect(lastRender().fractal.power).toBe(4)
    expect(screen.getByText('520')).toBeTruthy()
    expect(screen.getByText('4', { selector: 'output' })).toBeTruthy()
  })

  it('changes palette and color effects, edits custom stops, and resets coloring controls', () => {
    render(<App />)
    const palette = screen.getByRole('combobox', { name: 'Color field' })
    fireEvent.change(palette, { target: { value: '10' } })
    expect(palette).toHaveProperty('value', '10')
    const startColor = screen.getByLabelText('Start') as HTMLInputElement
    fireEvent.change(startColor, { target: { value: '#abcdef' } })
    fireEvent.change(screen.getByLabelText('Color frequency'), { target: { value: '1.5' } })
    fireEvent.change(screen.getByLabelText('Color phase'), { target: { value: '0.25' } })
    fireEvent.change(screen.getByLabelText('Brightness'), { target: { value: '1.2' } })
    fireEvent.change(screen.getByLabelText('Contrast'), { target: { value: '1.5' } })
    fireEvent.change(screen.getByLabelText('Contour overlay'), { target: { value: '0.5' } })

    expect(lastRender().palette).toBe(10)
    expect(lastRender().customPaletteStops[0]).toEqual([171 / 255, 205 / 255, 239 / 255])
    expect(lastRender().colorFrequency).toBe(1.5)
    expect(lastRender().colorPhase).toBe(0.25)
    expect(lastRender().brightness).toBe(1.2)
    expect(lastRender().contrast).toBe(1.5)
    expect(lastRender().contourStrength).toBe(0.5)

    fireEvent.click(screen.getByRole('button', { name: 'Reset color controls' }))
    expect(palette).toHaveProperty('value', '0')
    expect(lastRender().colorFrequency).toBe(1)
    expect(lastRender().colorPhase).toBe(0)
    expect(lastRender().brightness).toBe(1)
    expect(lastRender().contrast).toBe(1)
    expect(lastRender().contourStrength).toBe(0)
  })

  it('collapses and reopens the Parameters and Coloring panels', () => {
    render(<App />)
    const parametersToggle = screen.getByRole('button', { name: 'Parameters' })
    const parametersContent = document.getElementById('parameters-content')
    if (!parametersContent) throw new Error('Missing parameters panel')
    fireEvent.click(parametersToggle)
    expect(parametersToggle.getAttribute('aria-expanded')).toBe('false')
    expect(parametersContent.hasAttribute('hidden')).toBe(true)
    fireEvent.click(parametersToggle)
    expect(parametersContent.hasAttribute('hidden')).toBe(false)
    expect(screen.getByLabelText('Iterations')).toBeTruthy()

    const coloringToggle = screen.getByRole('button', { name: 'Coloring' })
    const coloringContent = document.getElementById('coloring-content')
    if (!coloringContent) throw new Error('Missing coloring panel')
    fireEvent.click(coloringToggle)
    expect(coloringContent.hasAttribute('hidden')).toBe(true)
    fireEvent.click(coloringToggle)
    expect(coloringContent.hasAttribute('hidden')).toBe(false)
    expect(screen.getByLabelText('Color field')).toBeTruthy()
  })

  it('exports PNG in fullscreen with 4x sampling and remains fullscreen after download', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Enter fullscreen view' }))
    const workspace = screen.getByRole('region', { name: 'Interactive fractal canvas' })
    expect(document.fullscreenElement).toBe(workspace)
    fireEvent.click(screen.getByRole('button', { name: 'Export image' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'PNG' }))

    await Promise.resolve()
    await Promise.resolve()
    expect(document.fullscreenElement).toBe(workspace)
    const exportedRenderer = rendererState.instances.at(-1)!
    const parameters = exportedRenderer.renders.at(-1) as { view: { width: number; height: number }; samplesPerPixel: number }
    expect(parameters.view).toMatchObject({ width: 3840, height: 2160 })
    expect(parameters.samplesPerPixel).toBe(4)
    expect(exportedRenderer.resizeCalls).toContainEqual([3840, 2160])
    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png', undefined)
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled()
  })

  it('exports JPEG using the selected format from the Export panel', async () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('Output format'), { target: { value: 'jpeg' } })
    const exportSection = document.getElementById('export-content')
    if (!exportSection) throw new Error('Missing export panel')
    fireEvent.click(within(exportSection).getByRole('button', { name: /^Export$/ }))
    await Promise.resolve()
    await Promise.resolve()
    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.95)
  })
})
