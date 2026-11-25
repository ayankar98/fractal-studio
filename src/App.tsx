import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent, WheelEvent } from 'react'
import { DEFAULT_MANDELBROT_CONFIG, DEFAULT_VIEW } from './domain/renderConfig.ts'
import type { FractalFamily, ViewState } from './domain/renderConfig.ts'
import { minimumStableScale, panView, zoomViewAt } from './domain/navigation.ts'
import { WebGLMandelbrotRenderer } from './rendering/webgl/WebGLMandelbrotRenderer.ts'
import type { RenderParameters } from './rendering/webgl/WebGLMandelbrotRenderer.ts'
import { renderFractalTree } from './rendering/tree/fractalTree.ts'
import { renderBarnsleyFern } from './rendering/ifs/barnsleyFern.ts'
import type { PointCloudColorOptions } from './rendering/ifs/pointCloudColors.ts'
import { renderLorenzAttractor } from './rendering/ifs/strangeAttractor.ts'
import './App.css'

const PALETTES = [
  { name: 'Solar flare', shaderIndex: 0 },
  { name: 'Arctic bloom', shaderIndex: 1 },
  { name: 'Ember', shaderIndex: 2 },
  { name: 'Psychedelic rainbow', shaderIndex: 3 },
  { name: 'Neon glow', shaderIndex: 4 },
  { name: 'Electric blue', shaderIndex: 5 },
  { name: 'Fire and lava', shaderIndex: 6 },
  { name: 'Monochrome', shaderIndex: 7 },
  { name: 'Cosmic gradient', shaderIndex: 8 },
  { name: 'Contour lines', shaderIndex: 9 },
  { name: 'Custom palette', shaderIndex: 10 },
] as const
const DEFAULT_CUSTOM_COLORS = { start: '#120b2e', middle: '#8b35f5', end: '#ffd36a' }

function hexToRgb(hex: string): readonly [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16 & 255) / 255, (value >> 8 & 255) / 255, (value & 255) / 255]
}

type StudioFractal = FractalFamily | 'tree' | 'barnsley-fern' | 'strange-attractor'

function usesCanvas2D(family: StudioFractal): family is 'tree' | 'barnsley-fern' | 'strange-attractor' {
  return family === 'tree' || family === 'barnsley-fern' || family === 'strange-attractor'
}

const FAMILY_OPTIONS: readonly { readonly id: StudioFractal; readonly name: string }[] = [
  { id: 'mandelbrot', name: 'Mandelbrot / Multibrot' },
  { id: 'julia', name: 'Julia set' },
  { id: 'burning-ship', name: 'Burning Ship' },
  { id: 'barnsley-fern', name: 'The Barnsley Fern' },
  { id: 'strange-attractor', name: 'Strange attractor' },
  { id: 'tree', name: 'Fractal tree' },
]
const EXPORT_WIDTH = 3840
const EXPORT_HEIGHT = 2160
const PREVIEW_SAMPLES_PER_PIXEL: 1 | 4 = 4
const EXPORT_SAMPLES_PER_PIXEL: 1 | 4 = 4
const MIN_TREE_ITERATIONS = 0
const MAX_TREE_ITERATIONS = 11
const DEFAULT_TREE_ITERATIONS = 11
const MIN_FERN_ITERATIONS = 0
const MAX_FERN_ITERATIONS = 1_500_000
const FERN_ITERATION_STEP = 1_000
const FERN_WHEEL_STEP = 100
const DEFAULT_FERN_ITERATIONS = 800_000
const MIN_ATTRACTOR_ITERATIONS = 20_000
const MAX_ATTRACTOR_ITERATIONS = 500_000
const ATTRACTOR_ITERATION_STEP = 10_000
const DEFAULT_ATTRACTOR_ITERATIONS = 200_000
const MIN_ATTRACTOR_ZOOM = 0.5
const MAX_ATTRACTOR_ZOOM = 20
const DEFAULT_LORENZ_PARAMETERS = { sigma: 10, rho: 28, beta: 8 / 3, timeStep: 0.005 }
const LEARN_IMAGE_BASE = `${import.meta.env.BASE_URL}images/learn/`

function exportQualityFor(format: 'png' | 'jpeg') {
  return format === 'jpeg'
    ? { jpegQuality: 0.95 }
    : { jpegQuality: undefined as undefined }
}

interface DragStart {
  readonly pointerId: number
  readonly x: number
  readonly y: number
  readonly view: ViewState
}

interface AttractorPan {
  readonly x: number
  readonly y: number
}

interface AttractorDragStart {
  readonly pointerId: number
  readonly x: number
  readonly y: number
  readonly pan: AttractorPan
}

type StudioPage = 'canvas' | 'learn'

function pageFromPath(pathname: string): StudioPage {
  if (pathname === '/learn') return 'learn'
  return 'canvas'
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const proceduralCanvasRef = useRef<HTMLCanvasElement>(null)
  const workspaceRef = useRef<HTMLElement>(null)
  const exportingRef = useRef(false)
  const preserveFullscreenDuringExportRef = useRef(false)
  const userRequestedFullscreenExitRef = useRef(false)
  const rendererRef = useRef<WebGLMandelbrotRenderer | null>(null)
  const dragRef = useRef<DragStart | null>(null)
  const attractorDragRef = useRef<AttractorDragStart | null>(null)
  const exportMenuRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<ViewState>(DEFAULT_VIEW)
  const [family, setFamily] = useState<StudioFractal>('mandelbrot')
  const [treeIterations, setTreeIterations] = useState(DEFAULT_TREE_ITERATIONS)
  const [fernIterations, setFernIterations] = useState(DEFAULT_FERN_ITERATIONS)
  const [attractorIterations, setAttractorIterations] = useState(DEFAULT_ATTRACTOR_ITERATIONS)
  const [attractorZoom, setAttractorZoom] = useState(1)
  const [attractorPan, setAttractorPan] = useState<AttractorPan>({ x: 0, y: 0 })
  const [lorenz, setLorenz] = useState(DEFAULT_LORENZ_PARAMETERS)
  const [maxIterations, setMaxIterations] = useState(DEFAULT_MANDELBROT_CONFIG.maxIterations)
  const [power, setPower] = useState(DEFAULT_MANDELBROT_CONFIG.power ?? 2)
  const [constantReal, setConstantReal] = useState(DEFAULT_MANDELBROT_CONFIG.constantReal ?? -0.4)
  const [constantImaginary, setConstantImaginary] = useState(DEFAULT_MANDELBROT_CONFIG.constantImaginary ?? 0.6)
  const [palette, setPalette] = useState(0)
  const [customColorStart, setCustomColorStart] = useState(DEFAULT_CUSTOM_COLORS.start)
  const [customColorMiddle, setCustomColorMiddle] = useState(DEFAULT_CUSTOM_COLORS.middle)
  const [customColorEnd, setCustomColorEnd] = useState(DEFAULT_CUSTOM_COLORS.end)
  const [colorFrequency, setColorFrequency] = useState(1)
  const [colorPhase, setColorPhase] = useState(0)
  const [brightness, setBrightness] = useState(1)
  const [contrast, setContrast] = useState(1)
  const [contourStrength, setContourStrength] = useState(0)
  const [ready, setReady] = useState(false)
  const [contextLost, setContextLost] = useState(false)
  const [message, setMessage] = useState('Preparing WebGL renderer...')
  const [exportFormat, setExportFormat] = useState<'png' | 'jpeg'>('png')
  const [exporting, setExporting] = useState(false)
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false)
  const [collapsed, setCollapsed] = useState({ parameters: false, coloring: false, export: false })
  const customPaletteStops = useMemo(
    () => [hexToRgb(customColorStart), hexToRgb(customColorMiddle), hexToRgb(customColorEnd)] as const,
    [customColorStart, customColorMiddle, customColorEnd],
  )
  const [page, setPage] = useState<StudioPage>(() => pageFromPath(window.location.pathname))
  const [learnExpanded, setLearnExpanded] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const navigate = (event: ReactMouseEvent<HTMLAnchorElement>, path: string) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    if (window.location.pathname !== path) window.history.pushState({}, '', path)
    setPage(pageFromPath(path))
  }

  useEffect(() => {
    const onPopState = () => setPage(pageFromPath(window.location.pathname))
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    if (!isExportMenuOpen) return
    const closeExportMenu = (event: Event) => {
      if (!exportMenuRef.current?.contains(event.target as Node)) setIsExportMenuOpen(false)
    }
    document.addEventListener('pointerdown', closeExportMenu)
    return () => document.removeEventListener('pointerdown', closeExportMenu)
  }, [isExportMenuOpen])

  useEffect(() => {
    const syncFullscreenState = () => {
      const workspaceIsFullscreen = document.fullscreenElement === workspaceRef.current
      setIsFullscreen(workspaceIsFullscreen)
      if (!workspaceIsFullscreen
        && exportingRef.current
        && preserveFullscreenDuringExportRef.current
        && !userRequestedFullscreenExitRef.current) {
        const workspace = workspaceRef.current
        if (workspace && document.fullscreenEnabled) {
          void workspace.requestFullscreen().catch(() => undefined)
        }
      }
    }
    const trackExplicitExit = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && document.fullscreenElement === workspaceRef.current && exportingRef.current) {
        userRequestedFullscreenExitRef.current = true
      }
    }
    document.addEventListener('fullscreenchange', syncFullscreenState)
    document.addEventListener('keydown', trackExplicitExit)
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreenState)
      document.removeEventListener('keydown', trackExplicitExit)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    try {
      const renderer = new WebGLMandelbrotRenderer(canvas, {
        onContextLost: () => {
          setContextLost(true)
          setReady(false)
          setMessage('Graphics context was lost. Waiting for the browser to restore it...')
        },
        onContextRestored: () => {
          setContextLost(false)
          setReady(true)
          setMessage('Graphics context restored.')
        },
      })
      rendererRef.current = renderer
      // WebGL is an external resource; this state update reflects whether its
      // initialization succeeded so the accessible UI can report readiness.
      // oxlint-disable-next-line react/set-state-in-effect -- synchronize WebGL initialization status
      setReady(true)
      setMessage('WebGL 2 renderer ready.')
    } catch (error) {
      setReady(false)
      setMessage(error instanceof Error ? error.message : 'WebGL initialization failed.')
      return
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      const activeRenderer = rendererRef.current
      if (!entry || !activeRenderer) return

      const width = Math.max(1, Math.round(entry.contentRect.width))
      const height = Math.max(1, Math.round(entry.contentRect.height))
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      activeRenderer.resize(width * pixelRatio, height * pixelRatio)
      setView((current) => {
        if (current.width === width && current.height === height) return current
        // Preserve the vertical complex-plane span when responsive layout or
        // device size changes, avoiding an unexpected zoom on resize.
        const unitsPerPixel = current.unitsPerPixel * current.height / height
        return { ...current, width, height, unitsPerPixel }
      })
    })
    observer.observe(canvas)

    return () => {
      observer.disconnect()
      rendererRef.current?.dispose()
      rendererRef.current = null
    }
  }, [page])

  useEffect(() => {
    if (!usesCanvas2D(family) || page !== 'canvas') return
    const canvas = proceduralCanvasRef.current
    if (!canvas) return
    let attractorRender: AbortController | null = null

    const drawCanvasFractal = () => {
      const bounds = canvas.getBoundingClientRect()
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      const width = Math.max(1, Math.round(bounds.width * pixelRatio))
      const height = Math.max(1, Math.round(bounds.height * pixelRatio))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
      const context = canvas.getContext('2d')
      if (!context) return
      if (family === 'tree') {
        renderFractalTree(context, width, height, treeIterations)
      } else {
        const colorOptions: PointCloudColorOptions = {
          palette,
          customPaletteStops,
          colorFrequency,
          colorPhase,
          brightness,
          contrast,
          contourStrength,
        }
        if (family === 'barnsley-fern') {
          renderBarnsleyFern(context, width, height, fernIterations, colorOptions)
        } else {
          attractorRender?.abort()
          attractorRender = new AbortController()
          void renderLorenzAttractor(context, width, height, attractorIterations, lorenz, colorOptions, attractorZoom, attractorPan, attractorRender.signal)
        }
      }
    }

    drawCanvasFractal()
    const observer = new ResizeObserver(drawCanvasFractal)
    observer.observe(canvas)
    return () => {
      attractorRender?.abort()
      observer.disconnect()
    }
  }, [family, treeIterations, fernIterations, attractorIterations, attractorZoom, attractorPan, lorenz, palette, customPaletteStops, colorFrequency, colorPhase, brightness, contrast, contourStrength, page])

  useEffect(() => {
    if (usesCanvas2D(family)) return
    const renderer = rendererRef.current
    if (!renderer || !ready || contextLost) return
    const parameters: RenderParameters = {
      view,
      fractal: { family, maxIterations, power, constantReal, constantImaginary },
      palette,
      customPaletteStops,
      colorFrequency,
      colorPhase,
      brightness,
      contrast,
      contourStrength,
      samplesPerPixel: PREVIEW_SAMPLES_PER_PIXEL,
    }
    try {
      renderer.render(parameters)
    } catch (error) {
      // Surface a synchronous GPU validation/driver failure in the live status.
      // oxlint-disable-next-line react/set-state-in-effect -- report renderer failure
      setMessage(error instanceof Error ? error.message : 'Unable to render this view.')
    }
  }, [view, family, maxIterations, power, constantReal, constantImaginary, palette, customPaletteStops, colorFrequency, colorPhase, brightness, contrast, contourStrength, ready, contextLost, page])

  const selectFamily = (nextFamily: StudioFractal) => {
    setFamily(nextFamily)
    if (nextFamily === 'tree') {
      setTreeIterations(DEFAULT_TREE_ITERATIONS)
      setMessage(`Showing a fractal tree at ${DEFAULT_TREE_ITERATIONS} iterations.`)
      return
    }
    if (nextFamily === 'barnsley-fern') {
      setFernIterations(DEFAULT_FERN_ITERATIONS)
      setMessage(`Showing The Barnsley Fern with ${DEFAULT_FERN_ITERATIONS.toLocaleString()} points.`)
      return
    }
    if (nextFamily === 'strange-attractor') {
      setAttractorIterations(DEFAULT_ATTRACTOR_ITERATIONS)
      setAttractorZoom(1)
      setAttractorPan({ x: 0, y: 0 })
      setLorenz(DEFAULT_LORENZ_PARAMETERS)
      setMessage('Showing the Lorenz strange attractor.')
      return
    }
    setPower(2)
    setConstantReal(-0.4)
    setConstantImaginary(0.6)
    setView((current) => ({
      ...current,
      centerX: nextFamily === 'julia' ? 0 : nextFamily === 'burning-ship' ? -0.4 : -0.5,
      centerY: nextFamily === 'burning-ship' ? -0.5 : 0,
      unitsPerPixel: 3.2 / current.height,
    }))
    setMessage(nextFamily === 'julia'
      ? 'Showing the Julia set overview.'
      : nextFamily === 'burning-ship'
        ? 'Showing the Burning Ship overview.'
        : 'Showing the Mandelbrot / Multibrot overview.')
  }
  const resetView = useCallback(() => {
    if (family === 'tree') {
      setTreeIterations(DEFAULT_TREE_ITERATIONS)
      setMessage(`Reset fractal tree to ${DEFAULT_TREE_ITERATIONS} iterations.`)
      return
    }
    if (family === 'barnsley-fern') {
      setFernIterations(DEFAULT_FERN_ITERATIONS)
      setMessage(`Reset The Barnsley Fern to ${DEFAULT_FERN_ITERATIONS.toLocaleString()} points.`)
      return
    }
    if (family === 'strange-attractor') {
      setAttractorIterations(DEFAULT_ATTRACTOR_ITERATIONS)
      setAttractorZoom(1)
      setAttractorPan({ x: 0, y: 0 })
      setLorenz(DEFAULT_LORENZ_PARAMETERS)
      setMessage('Reset the Lorenz strange attractor.')
      return
    }
    setView((current) => ({
      ...DEFAULT_VIEW,
      centerX: family === 'julia' ? 0 : family === 'burning-ship' ? -0.4 : -0.5,
      centerY: family === 'burning-ship' ? -0.5 : 0,
      width: current.width,
      height: current.height,
      unitsPerPixel: 3.2 / current.height,
    }))
    setMessage(family === 'julia'
      ? 'Reset to the Julia set overview.'
      : family === 'burning-ship'
        ? 'Reset to the Burning Ship overview.'
        : 'Reset to the Mandelbrot / Multibrot overview.')
  }, [family])

  const toggleFullscreen = async () => {
    const workspace = workspaceRef.current
    if (!workspace) return
    try {
      if (document.fullscreenElement === workspace) {
        userRequestedFullscreenExitRef.current = true
        await document.exitFullscreen()
      } else {
        userRequestedFullscreenExitRef.current = false
        await workspace.requestFullscreen()
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Fullscreen mode is unavailable in this browser.')
    }
  }

  const handleWheel = (event: WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault()
    const bounds = event.currentTarget.getBoundingClientRect()
    const factor = Math.exp(Math.max(-500, Math.min(500, event.deltaY)) * 0.001)
    if (factor < 1 && view.unitsPerPixel * factor < minimumStableScale(view)) {
      setMessage('Zoom limit reached to keep the image accurate. Pan to explore another area.')
    }
    setView((current) => zoomViewAt(
      current,
      event.clientX - bounds.left,
      event.clientY - bounds.top,
      factor,
    ))
  }

  const handleTreeWheel = (event: WheelEvent<HTMLCanvasElement>) => {
    if (event.deltaY === 0) return
    event.preventDefault()
    const direction = event.deltaY < 0 ? 1 : -1
    setTreeIterations((current) => Math.max(
      MIN_TREE_ITERATIONS,
      Math.min(MAX_TREE_ITERATIONS, current + direction),
    ))
  }

  const handleFernWheel = (event: WheelEvent<HTMLCanvasElement>) => {
    if (event.deltaY === 0) return
    event.preventDefault()
    const direction = event.deltaY < 0 ? 1 : -1
    setFernIterations((current) => Math.max(
      MIN_FERN_ITERATIONS,
      Math.min(MAX_FERN_ITERATIONS, current + direction * FERN_WHEEL_STEP),
    ))
  }

  const handleAttractorWheel = (event: WheelEvent<HTMLCanvasElement>) => {
    if (event.deltaY === 0) return
    event.preventDefault()
    const factor = Math.exp(Math.max(-500, Math.min(500, -event.deltaY)) * 0.001)
    setAttractorZoom((current) => Math.max(
      MIN_ATTRACTOR_ZOOM,
      Math.min(MAX_ATTRACTOR_ZOOM, current * factor),
    ))
  }

  const handleAttractorPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    attractorDragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      pan: attractorPan,
    }
  }

  const handleAttractorPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const drag = attractorDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const bounds = event.currentTarget.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0) return
    setAttractorPan({
      x: drag.pan.x + (event.clientX - drag.x) / bounds.width,
      y: drag.pan.y + (event.clientY - drag.y) / bounds.height,
    })
  }

  const endAttractorPointer = (event: PointerEvent<HTMLCanvasElement>) => {
    if (attractorDragRef.current?.pointerId === event.pointerId) attractorDragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      view,
    }
  }

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setView(panView(drag.view, event.clientX - drag.x, event.clientY - drag.y))
  }

  const endPointer = (event: PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const exportImage = async (format: 'png' | 'jpeg' = exportFormat) => {
    if (exporting) return
    const exportQuality = exportQualityFor(format)
    exportingRef.current = true
    preserveFullscreenDuringExportRef.current = document.fullscreenElement === workspaceRef.current
    userRequestedFullscreenExitRef.current = false
    setExporting(true)
    setMessage(`Rendering ${EXPORT_WIDTH} x ${EXPORT_HEIGHT} ${format.toUpperCase()} image...`)
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

    const exportCanvas = document.createElement('canvas')
    let exportRenderer: WebGLMandelbrotRenderer | null = null
    try {
      if (usesCanvas2D(family)) {
        exportCanvas.width = EXPORT_WIDTH
        exportCanvas.height = EXPORT_HEIGHT
        const context = exportCanvas.getContext('2d')
        if (!context) throw new Error('The browser could not create a 2D canvas for this export.')
        if (family === 'tree') {
          renderFractalTree(context, EXPORT_WIDTH, EXPORT_HEIGHT, treeIterations)
        } else {
          const colorOptions: PointCloudColorOptions = {
            palette,
            customPaletteStops,
            colorFrequency,
            colorPhase,
            brightness,
            contrast,
            contourStrength,
          }
          if (family === 'barnsley-fern') {
            renderBarnsleyFern(context, EXPORT_WIDTH, EXPORT_HEIGHT, fernIterations, colorOptions)
          } else {
            await renderLorenzAttractor(context, EXPORT_WIDTH, EXPORT_HEIGHT, attractorIterations, lorenz, colorOptions, attractorZoom, attractorPan, new AbortController().signal)
          }
        }
      } else {
        exportRenderer = new WebGLMandelbrotRenderer(exportCanvas, {
          onContextLost: () => setMessage('The export graphics context was lost.'),
          onContextRestored: () => setMessage('Export graphics context restored.'),
        }, true)
        if (EXPORT_WIDTH > exportRenderer.maxTextureSize
          || EXPORT_HEIGHT > exportRenderer.maxTextureSize
          || EXPORT_WIDTH > exportRenderer.maxRenderbufferSize
          || EXPORT_HEIGHT > exportRenderer.maxRenderbufferSize) {
          throw new Error('This GPU cannot render a 4K frame buffer. Try a device with higher WebGL limits.')
        }
        // Only allocate the large backing buffer after capability checks pass.
        exportRenderer.resize(EXPORT_WIDTH, EXPORT_HEIGHT)

        // Preserve the current vertical span, then recalculate each output pixel
        // using the export dimensions; this does not upscale the preview image.
        const exportView: ViewState = {
          ...view,
          width: EXPORT_WIDTH,
          height: EXPORT_HEIGHT,
          unitsPerPixel: view.unitsPerPixel * view.height / EXPORT_HEIGHT,
        }
        exportRenderer.render({
          view: exportView,
          fractal: { family, maxIterations, power, constantReal, constantImaginary },
          palette,
          customPaletteStops,
          colorFrequency,
          colorPhase,
          brightness,
          contrast,
          contourStrength,
          samplesPerPixel: EXPORT_SAMPLES_PER_PIXEL,
        })
        if (exportRenderer.isContextLost) {
          throw new Error('The export graphics context was lost while rendering.')
        }
      }

      const mimeType = format === 'png' ? 'image/png' : 'image/jpeg'
      const blob = await new Promise<Blob>((resolve, reject) => {
        exportCanvas.toBlob((created) => {
          if (!created) reject(new Error('The browser could not encode the rendered image.'))
          else resolve(created)
        }, mimeType, exportQuality.jpegQuality)
      })
      if (exportRenderer?.isContextLost) {
        throw new Error('The export graphics context was lost before the image could be verified.')
      }
      if (blob.type !== mimeType || blob.size === 0) {
        throw new Error('The browser returned an invalid or empty image file.')
      }

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `fractal-studio-3840x2160.${format === 'png' ? 'png' : 'jpg'}`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
      setMessage(`Saved ${EXPORT_WIDTH} x ${EXPORT_HEIGHT} ${format.toUpperCase()} image.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Image export failed.')
    } finally {
      exportRenderer?.dispose()
      exportingRef.current = false
      preserveFullscreenDuringExportRef.current = false
      userRequestedFullscreenExitRef.current = false
      setExporting(false)
    }
  }

  const selectFullscreenExport = (format: 'png' | 'jpeg') => {
    setExportFormat(format)
    setIsExportMenuOpen(false)
    void exportImage(format)
  }

  const familyName = FAMILY_OPTIONS.find((item) => item.id === family)?.name ?? 'Mandelbrot / Multibrot'
  const toggleSection = (section: keyof typeof collapsed) => setCollapsed((current) => ({ ...current, [section]: !current[section] }))

  return (
    <main className="studio-shell" id="top">
      <div className="mobile-block" role="status" aria-live="polite">
        <div className="mobile-block-card">
          <span className="mobile-block-eyebrow">Fractal Studio</span>
          <h1>Desktop screen required</h1>
          <p>This interactive fractal canvas is currently available on desktop screens only.</p>
        </div>
      </div>
      <header className="topbar">
        <a className="brand" href="/" aria-label="Fractal Studio home" onClick={(event) => navigate(event, '/')}><span>Fractal <span className="brand-light">Studio</span></span><span className="brand-beta">BETA</span></a>
        <nav className="header-nav" aria-label="Main navigation">
          <a className={'nav-link' + (page === 'canvas' ? ' nav-link-active' : '')} href="/" aria-current={page === 'canvas' ? 'page' : undefined} onClick={(event) => navigate(event, '/')}><CanvasIcon />Generative Canvas</a>
          <a className={'nav-link' + (page === 'learn' ? ' nav-link-active' : '')} href="/learn" aria-current={page === 'learn' ? 'page' : undefined} onClick={(event) => navigate(event, '/learn')}><BookIcon />Learn</a>
        </nav>
      </header>
      {page === 'canvas' ? <div className="studio-layout">
        <aside className="left-panel" aria-label="Fractal navigation">
          <h2 className="sidebar-title">Explore</h2>
          <div className="family-field"><label className="field-label" htmlFor="family">Fractal Type</label><div className="select-wrap"><select id="family" value={family} onChange={(event) => selectFamily(event.currentTarget.value as StudioFractal)}>{FAMILY_OPTIONS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><span className="select-chevron"><ChevronIcon /></span></div></div>
          <div className="fractal-description">
            <div className="equation-formula">{family === 'tree'
              ? 'Recursive binary branching'
              : family === 'barnsley-fern'
                ? 'Barnsley fern iterated function system'
                : family === 'strange-attractor'
                  ? 'Lorenz system (σ, ρ, β)'
              : family === 'burning-ship'
                ? <>z<sub>n+1</sub> = (|Re(z<sub>n</sub>)| + i|Im(z<sub>n</sub>)|)<sup>2</sup> + c</>
                : <>z<sub>n+1</sub> = z<sub>n</sub><sup>p</sup> + c</>}</div>
            <p>{family === 'tree'
              ? <>Each branch splits into two smaller branches. Choose 0 to {MAX_TREE_ITERATIONS} iterations to control the detail.</>
              : family === 'barnsley-fern'
                ? <>A seeded sequence of affine transformations builds the fern from repeated leaf points. Adjust the number of points and the color field.</>
                : family === 'strange-attractor'
                  ? <>A chaotic Lorenz trajectory is projected onto the X/Z plane. Adjust the integration steps and Lorenz parameters to change its shape.</>
              : family === 'burning-ship'
                ? <>Each pixel supplies <i>c</i>. Before squaring each orbit value, the renderer takes the absolute value of its real and imaginary parts.</>
                : family === 'julia'
              ? <>Each pixel is a starting value for <i>z</i>; <i>c</i> stays fixed at {constantReal.toFixed(3)} {constantImaginary < 0 ? '-' : '+'} {Math.abs(constantImaginary).toFixed(3)}i. The set shows which starting values stay bounded.</>
              : <>Each pixel supplies <i>c</i>, and iteration starts at <i>z</i> = 0. The set shows which values of <i>c</i> stay bounded.</>}</p>
          </div>
        </aside>
        <section ref={workspaceRef} className="workspace" aria-label="Interactive fractal canvas">
          <div className="canvas-toolbar">
            <div className="canvas-title">
              <div className="canvas-title-row">
                <h1>{familyName}</h1>
                <div className="canvas-actions">
                  <button className="canvas-action" type="button" onClick={resetView} aria-label="Reset view"><ResetIcon /><span>Reset view</span></button>
                  <button className="canvas-action" type="button" onClick={toggleFullscreen} disabled={!document.fullscreenEnabled} aria-label={isFullscreen ? 'Exit fullscreen view' : 'Enter fullscreen view'} title={isFullscreen ? 'Exit fullscreen view' : 'Fullscreen view'}><FullscreenIcon expanded={isFullscreen} /><span>{isFullscreen ? 'Exit fullscreen' : 'Fullscreen view'}</span></button>
                  {isFullscreen && <div ref={exportMenuRef} className="canvas-export-menu"><button className="canvas-action canvas-export-action" type="button" onClick={() => setIsExportMenuOpen((open) => !open)} disabled={(!ready && !usesCanvas2D(family)) || exporting} aria-expanded={isExportMenuOpen} aria-haspopup="menu" aria-controls="fullscreen-export-options" aria-label={exporting ? 'Rendering export' : 'Export image'} title={exporting ? 'Rendering export' : 'Export image'}><DownloadIcon /><span>{exporting ? 'Rendering...' : 'Export'}</span><ChevronIcon className="canvas-export-chevron" open={isExportMenuOpen} /></button>{isExportMenuOpen && <div id="fullscreen-export-options" className="canvas-export-options" role="menu" aria-label="Export format"><button type="button" role="menuitem" onClick={() => selectFullscreenExport('png')} disabled={exporting}>PNG</button><button type="button" role="menuitem" onClick={() => selectFullscreenExport('jpeg')} disabled={exporting}>JPEG</button></div>}</div>}
                </div>
              </div>
              <div className="canvas-subtitle-row"><p className="canvas-subtitle">{family === 'tree' ? `Binary fractal tree | ${treeIterations} iterations` : family === 'barnsley-fern' ? `Barnsley Fern | ${fernIterations.toLocaleString()} points` : family === 'strange-attractor' ? `Lorenz attractor | ${attractorIterations.toLocaleString()} steps | ${attractorZoom.toFixed(2)}×` : family === 'burning-ship' ? 'Burning Ship set | quadratic recurrence' : family === 'julia' ? 'Julia set with fixed c = ' + constantReal.toFixed(3) + ' ' + (constantImaginary < 0 ? '-' : '+') + ' ' + Math.abs(constantImaginary).toFixed(3) + 'i' : 'Classic Mandelbrot set with power ' + power}</p><div className="canvas-meta"><span><b>Frame</b> {view.width} x {view.height}</span>{!usesCanvas2D(family) && <span><b>Scale</b> {view.unitsPerPixel.toExponential(2)} / px</span>}</div></div>
            </div>
          </div>
          <div className="canvas-frame"><canvas ref={canvasRef} className="fractal-canvas" style={{ visibility: usesCanvas2D(family) ? 'hidden' : 'visible' }} aria-hidden={usesCanvas2D(family)} aria-label={familyName + ' rendering. Scroll to zoom - drag to pan.'} onWheel={handleWheel} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={endPointer} onPointerCancel={endPointer} onLostPointerCapture={() => { dragRef.current = null }} /><canvas ref={proceduralCanvasRef} className="procedural-canvas" style={{ display: usesCanvas2D(family) ? 'block' : 'none', cursor: family === 'strange-attractor' ? 'grab' : undefined }} aria-hidden={!usesCanvas2D(family)} aria-label={family === 'tree' ? `Fractal tree rendered with ${treeIterations} iterations.` : family === 'barnsley-fern' ? `The Barnsley Fern rendered with ${fernIterations.toLocaleString()} points. Scroll to adjust point count.` : `Lorenz strange attractor rendered with ${attractorIterations.toLocaleString()} steps. Scroll to zoom and drag to pan.`} onWheel={family === 'tree' ? handleTreeWheel : family === 'barnsley-fern' ? handleFernWheel : family === 'strange-attractor' ? handleAttractorWheel : undefined} onPointerDown={family === 'strange-attractor' ? handleAttractorPointerDown : undefined} onPointerMove={family === 'strange-attractor' ? handleAttractorPointerMove : undefined} onPointerUp={family === 'strange-attractor' ? endAttractorPointer : undefined} onPointerCancel={family === 'strange-attractor' ? endAttractorPointer : undefined} onLostPointerCapture={family === 'strange-attractor' ? () => { attractorDragRef.current = null } : undefined} />{!ready && !usesCanvas2D(family) && <div className="canvas-message" role="status"><span>{message}</span></div>}{!usesCanvas2D(family) && <div className="coordinate-tag">x: {view.centerX.toFixed(6)} <span /> y: {view.centerY.toFixed(6)}</div>}</div>
        </section>
        <aside className="right-panel" aria-label="Fractal settings">
          <section className="settings-card"><button className="card-heading" type="button" aria-expanded={!collapsed.parameters} aria-controls="parameters-content" onClick={() => toggleSection('parameters')}><span className="card-icon"><SlidersIcon /></span><span>Parameters</span><ChevronIcon className="card-chevron" open={!collapsed.parameters} /></button><div id="parameters-content" className="card-body" hidden={collapsed.parameters}>
            {family === 'tree'
              ? <div className="control-block"><div className="control-heading"><label htmlFor="tree-iterations">Tree iterations</label><output htmlFor="tree-iterations">{treeIterations}</output></div><input id="tree-iterations" type="range" min={MIN_TREE_ITERATIONS} max={MAX_TREE_ITERATIONS} step="1" value={treeIterations} onChange={(event) => setTreeIterations(Number(event.currentTarget.value))} /><div className="range-ends"><span>{MIN_TREE_ITERATIONS}</span><span>{MAX_TREE_ITERATIONS}</span></div><p className="control-note">Each iteration doubles the branch count. Scroll over the tree to change depth.</p></div>
              : family === 'barnsley-fern'
                ? <div className="control-block"><div className="control-heading"><label htmlFor="fern-iterations">Point iterations</label><output htmlFor="fern-iterations">{fernIterations.toLocaleString()}</output></div><input id="fern-iterations" type="range" min={MIN_FERN_ITERATIONS} max={MAX_FERN_ITERATIONS} step={FERN_ITERATION_STEP} value={fernIterations} onChange={(event) => setFernIterations(Number(event.currentTarget.value))} /><div className="range-ends"><span>{MIN_FERN_ITERATIONS.toLocaleString()}</span><span>{MAX_FERN_ITERATIONS.toLocaleString()}</span></div><p className="control-note">Scroll over the fern to change point count by 100; use the slider to move more quickly through the full range.</p></div>
              : family === 'strange-attractor'
                ? <>
                  <div className="control-block"><div className="control-heading"><label htmlFor="attractor-iterations">Integration steps</label><output htmlFor="attractor-iterations">{attractorIterations.toLocaleString()}</output></div><input id="attractor-iterations" type="range" min={MIN_ATTRACTOR_ITERATIONS} max={MAX_ATTRACTOR_ITERATIONS} step={ATTRACTOR_ITERATION_STEP} value={attractorIterations} onChange={(event) => setAttractorIterations(Number(event.currentTarget.value))} /><div className="range-ends"><span>20,000</span><span>500,000</span></div><p className="control-note">Scroll over the attractor to zoom between {MIN_ATTRACTOR_ZOOM}× and {MAX_ATTRACTOR_ZOOM}×.</p></div>
                  <div className="control-block"><div className="control-heading"><label htmlFor="lorenz-sigma">Sigma (σ)</label><output htmlFor="lorenz-sigma">{lorenz.sigma.toFixed(1)}</output></div><input id="lorenz-sigma" type="range" min="8" max="14" step="0.1" value={lorenz.sigma} onChange={(event) => { const value = Number(event.currentTarget.value); setLorenz((current) => ({ ...current, sigma: value })) }} /><div className="range-ends"><span>8</span><span>14</span></div></div>
                  <div className="control-block"><div className="control-heading"><label htmlFor="lorenz-rho">Rho (ρ)</label><output htmlFor="lorenz-rho">{lorenz.rho.toFixed(1)}</output></div><input id="lorenz-rho" type="range" min="20" max="40" step="0.1" value={lorenz.rho} onChange={(event) => { const value = Number(event.currentTarget.value); setLorenz((current) => ({ ...current, rho: value })) }} /><div className="range-ends"><span>20</span><span>40</span></div></div>
                  <div className="control-block"><div className="control-heading"><label htmlFor="lorenz-beta">Beta (β)</label><output htmlFor="lorenz-beta">{lorenz.beta.toFixed(2)}</output></div><input id="lorenz-beta" type="range" min="2" max="4" step="0.01" value={lorenz.beta} onChange={(event) => { const value = Number(event.currentTarget.value); setLorenz((current) => ({ ...current, beta: value })) }} /><div className="range-ends"><span>2</span><span>4</span></div></div>
                  <div className="control-block"><div className="control-heading"><label htmlFor="lorenz-step">Time step</label><output htmlFor="lorenz-step">{lorenz.timeStep.toFixed(3)}</output></div><input id="lorenz-step" type="range" min="0.001" max="0.01" step="0.001" value={lorenz.timeStep} onChange={(event) => { const value = Number(event.currentTarget.value); setLorenz((current) => ({ ...current, timeStep: value })) }} /><div className="range-ends"><span>0.001</span><span>0.010</span></div><p className="control-note">Sigma, rho, and beta define the Lorenz system; the time step controls integration accuracy.</p></div>
                </>
              : <>
                <div className="control-block"><div className="control-heading"><label htmlFor="iterations">Iterations</label><output htmlFor="iterations">{maxIterations}</output></div><input id="iterations" type="range" min="50" max="1200" step="10" value={maxIterations} onChange={(event) => setMaxIterations(Number(event.currentTarget.value))} /><div className="range-ends"><span>50</span><span>1200</span></div></div>
                {family !== 'burning-ship' && <div className="control-block"><div className="control-heading"><label htmlFor="power">Equation power (p)</label><output htmlFor="power">{power}</output></div><input id="power" type="range" min="2" max="8" step="1" value={power} onChange={(event) => setPower(Number(event.currentTarget.value))} /><div className="range-ends"><span>2 quadratic</span><span>8</span></div><p className="control-note">Changes the power in z^p + c.</p></div>}
                {family === 'julia' && <div className="control-block"><div className="control-heading"><label htmlFor="constant-real">Julia parameter c</label><output htmlFor="constant-real">{constantReal.toFixed(3)} {constantImaginary < 0 ? '-' : '+'} {Math.abs(constantImaginary).toFixed(3)}i</output></div><label className="sub-control-label" htmlFor="constant-real">Real part</label><input id="constant-real" type="range" min="-2" max="2" step="0.005" value={constantReal} onChange={(event) => setConstantReal(Number(event.currentTarget.value))} /><label className="sub-control-label" htmlFor="constant-imaginary">Imaginary part</label><input id="constant-imaginary" type="range" min="-2" max="2" step="0.005" value={constantImaginary} onChange={(event) => setConstantImaginary(Number(event.currentTarget.value))} /><p className="control-note">Changing c changes the Julia set fixed parameter.</p></div>}
              </>}
          </div></section>
          {family !== 'tree' && <section className="settings-card"><button className="card-heading" type="button" aria-expanded={!collapsed.coloring} aria-controls="coloring-content" onClick={() => toggleSection('coloring')}><span className="card-icon"><PaletteIcon /></span><span>Coloring</span><ChevronIcon className="card-chevron" open={!collapsed.coloring} /></button><div id="coloring-content" className="card-body" hidden={collapsed.coloring}>
            <div className="control-block"><div className="control-heading"><label htmlFor="palette">Color field</label><span className="micro-label">PRESET</span></div><div className="select-wrap"><select id="palette" value={palette} onChange={(event) => setPalette(Number(event.currentTarget.value))}>{PALETTES.map((item) => <option key={item.shaderIndex} value={item.shaderIndex}>{item.name}</option>)}</select><span className={'palette-swatch swatch-' + palette} style={palette === 10 ? { background: 'linear-gradient(90deg, ' + customColorStart + ', ' + customColorMiddle + ', ' + customColorEnd + ')' } : undefined} /><span className="select-chevron"><ChevronIcon /></span></div></div>
            {palette === 10 && <div className="custom-palette-controls">
              <div className="custom-palette-heading">Custom color stops</div>
              <div className="color-stop-row"><label htmlFor="custom-color-start">Start</label><input id="custom-color-start" type="color" value={customColorStart} onChange={(event) => setCustomColorStart(event.currentTarget.value)} /></div>
              <div className="color-stop-row"><label htmlFor="custom-color-middle">Middle</label><input id="custom-color-middle" type="color" value={customColorMiddle} onChange={(event) => setCustomColorMiddle(event.currentTarget.value)} /></div>
              <div className="color-stop-row"><label htmlFor="custom-color-end">End</label><input id="custom-color-end" type="color" value={customColorEnd} onChange={(event) => setCustomColorEnd(event.currentTarget.value)} /></div>
              <p className="control-note">The palette blends these colors across the fractal.</p>
            </div>}
            <div className="color-controls">
              <div className="control-block"><div className="control-heading"><label htmlFor="color-frequency">Color frequency</label><output htmlFor="color-frequency">{colorFrequency.toFixed(2)}x</output></div><input id="color-frequency" type="range" min="0.25" max="3" step="0.05" value={colorFrequency} onChange={(event) => setColorFrequency(Number(event.currentTarget.value))} /></div>
              <div className="control-block"><div className="control-heading"><label htmlFor="color-phase">Color phase</label><output htmlFor="color-phase">{colorPhase.toFixed(2)}</output></div><input id="color-phase" type="range" min="0" max="1" step="0.01" value={colorPhase} onChange={(event) => setColorPhase(Number(event.currentTarget.value))} /></div>
              <div className="control-block"><div className="control-heading"><label htmlFor="brightness">Brightness</label><output htmlFor="brightness">{brightness.toFixed(2)}</output></div><input id="brightness" type="range" min="0.5" max="1.5" step="0.01" value={brightness} onChange={(event) => setBrightness(Number(event.currentTarget.value))} /></div>
              <div className="control-block"><div className="control-heading"><label htmlFor="contrast">Contrast</label><output htmlFor="contrast">{contrast.toFixed(2)}</output></div><input id="contrast" type="range" min="0.5" max="2" step="0.01" value={contrast} onChange={(event) => setContrast(Number(event.currentTarget.value))} /></div>
              <div className="control-block"><div className="control-heading"><label htmlFor="contours">Contour overlay</label><output htmlFor="contours">{Math.round(contourStrength * 100)}%</output></div><input id="contours" type="range" min="0" max="1" step="0.01" value={contourStrength} onChange={(event) => setContourStrength(Number(event.currentTarget.value))} /><p className="control-note">Tune color bands and add fine contour highlights.</p></div>
            </div><button className="color-reset" type="button" onClick={() => { setPalette(0); setCustomColorStart(DEFAULT_CUSTOM_COLORS.start); setCustomColorMiddle(DEFAULT_CUSTOM_COLORS.middle); setCustomColorEnd(DEFAULT_CUSTOM_COLORS.end); setColorFrequency(1); setColorPhase(0); setBrightness(1); setContrast(1); setContourStrength(0) }}>Reset color controls</button>
          </div></section>}
          <section className="settings-card"><button className="card-heading" type="button" aria-expanded={!collapsed.export} aria-controls="export-content" onClick={() => toggleSection('export')}><span className="card-icon"><DownloadIcon /></span><span>Export</span><ChevronIcon className="card-chevron" open={!collapsed.export} /></button><div id="export-content" className="card-body export-content" hidden={collapsed.export}>
            <div className="control-heading"><label htmlFor="format">Output format</label></div><div className="select-wrap format-select"><select id="format" value={exportFormat} onChange={(event) => setExportFormat(event.currentTarget.value as 'png' | 'jpeg')}><option value="png">PNG / Lossless</option><option value="jpeg">JPEG / High quality</option></select><span className="select-chevron"><ChevronIcon /></span></div>
            <div className="resolution-row"><span>Resolution</span><b>3840 x 2160 (4K UHD)</b></div><p className="export-note">{family === 'tree' ? `The tree is redrawn at 4K using ${treeIterations} iterations.` : family === 'barnsley-fern' ? `The fern is redrawn at 4K using ${fernIterations.toLocaleString()} points.` : family === 'strange-attractor' ? `The Lorenz attractor is redrawn at 4K using ${attractorIterations.toLocaleString()} integration steps.` : 'Rendered at 3840 x 2160 with 1x sampling for a crisper export.'}</p><div className="export-status"><span className="field-label">Render status</span><p role="status" aria-live="polite">{message}</p></div>{!usesCanvas2D(family) && <div className="parameter-readout"><span>Center X <b>{view.centerX.toFixed(6)}</b></span><span>Center Y <b>{view.centerY.toFixed(6)}</b></span></div>}
            <button className="export-button" type="button" onClick={() => void exportImage()} disabled={(!ready && !usesCanvas2D(family)) || exporting}>{exporting ? <><span className="button-spinner" /> Rendering 4K...</> : <><DownloadIcon /> Export</>}</button>
          </div></section>
        </aside>
      </div> : <section className="learn-page" aria-labelledby="learn-title">
        <article className="learn-card">
          <h1 className="learn-card-heading">
            <button id="learn-title" className="learn-card-toggle" type="button" aria-expanded={learnExpanded} aria-controls="understanding-fractals-content" onClick={() => setLearnExpanded((expanded) => !expanded)}>
              <span className="learn-card-title-group"><BookIcon /><span><span className="learn-card-eyebrow">The geometry of patterns, complexity and infinite detail</span><span className="learn-card-title">Understanding Fractals</span></span></span>
              <ChevronIcon className="learn-card-chevron" open={learnExpanded} />
            </button>
          </h1>
          <div id="understanding-fractals-content" className="learn-article" hidden={!learnExpanded}>
            <p className="learn-lead">Look closely at a fern. Its leaves branch outward from a central stem, and each small leaflet seems to echo the shape of the entire leaf. Look at a tree: its trunk divides into branches, those branches divide again into smaller branches, and the pattern continues towards the finest twigs. These forms share a visual quality: a structure built through repetition.</p>
            <figure className="learn-figure">
              <img src={LEARN_IMAGE_BASE + 'fern-leaves.jpg'} alt="Close-up of fern leaflets showing their repeated branching pattern." loading="lazy" />
              <figcaption>Fern leaflets repeat the branching pattern of the larger frond. Becky Phan / Unsplash, CC0.</figcaption>
            </figure>
            <p>This kind of repetition appears throughout the natural world—in the branching of trees, the intricate structure of snowflakes, the shapes of coastlines, the networks formed by rivers and the patterns of clouds. These forms are often irregular, yet they are not entirely random. Beneath their complexity, patterns and relationships repeat.</p>

            <h2>Seeing the world through fractal geometry</h2>
            <p>For a long time, geometry focused on shapes that could be described with simple, precise rules. A circle has a constant radius. A square has four equal sides. A triangle has three edges. These shapes are fundamental to mathematics, architecture and engineering, but they do not fully describe the world around us. Nature rarely produces perfect circles or straight lines. Mountains are not cones, coastlines are not smooth curves, and trees do not grow like carefully constructed geometric diagrams.</p>
            <p>This is where fractal geometry offers a different way of looking at shapes. A fractal is a geometric pattern whose structure reveals further complexity as we look closer. Many fractals are formed by repeating a simple mathematical rule, often applying the same process again and again at smaller scales. What begins as a straightforward construction can develop into a remarkably intricate structure.</p>
            <p>One of the most interesting properties found in many fractals is <strong>self-similarity</strong>. This means that parts of a structure resemble the larger whole. The resemblance does not always have to be exact. In mathematical fractals, smaller regions can reproduce the overall pattern with extraordinary precision. In nature, the resemblance is usually approximate, shaped by physical processes and environmental constraints.</p>

            <h2>How repetition creates complexity</h2>
            <p>Consider how a branching structure develops. Start with a single line. Divide it into two smaller branches. Then divide those branches again, repeating the same process. The rule is simple, but each repetition adds another level of detail. After enough iterations, the original line becomes a complex network. The complexity does not come from introducing a completely new idea at every stage; it emerges from applying the same rule repeatedly.</p>
            <figure className="learn-figure learn-diagram">
              <img src={LEARN_IMAGE_BASE + 'recursive-branching.svg'} alt="Four stages of a branching tree, showing a line splitting and the same split repeating." loading="lazy" />
              <figcaption>A simple branching rule repeated over four stages. Diagram created for Fractal Studio.</figcaption>
            </figure>
            <p>This is one of the central ideas behind fractal construction: a small set of instructions can produce a structure that appears far more complicated than the instructions themselves.</p>
            <p>The Koch snowflake offers another example. Begin with an equilateral triangle. Divide each side into three equal parts, then replace the middle section with two sides of a small outward-pointing triangle. Repeat this operation on every new segment. With each iteration, the boundary becomes increasingly detailed, developing a distinctive snowflake-like outline. A simple geometric operation, repeated consistently, creates an increasingly intricate form.</p>
            <figure className="learn-figure learn-diagram">
              <img src={LEARN_IMAGE_BASE + 'koch-iterations.svg'} alt="Koch snowflake construction from iteration zero through iteration seven." loading="lazy" />
              <figcaption>The Koch snowflake grows more detailed at each iteration. Jochen Burghardt, public domain.</figcaption>
            </figure>

            <h2>The Mandelbrot set: a rule with endless detail</h2>
            <p>Fractals become even more fascinating when we move from geometric constructions to mathematical systems. One of the most famous examples is the Mandelbrot set, a shape generated from a remarkably compact equation involving complex numbers.</p>
            <div className="learn-equation" role="math" aria-label="z n plus 1 equals z n squared plus c"><span>z<sub>n+1</sub> = z<sub>n</sub><sup>2</sup> + c</span><small>Mandelbrot iteration</small></div>
            <p>Starting with <em>z</em><sub>0</sub> = 0, the calculation is repeated for a chosen value of <em>c</em>. For some values of <em>c</em>, the resulting sequence remains bounded. For others, it grows without limit. The Mandelbrot set consists of the values of <em>c</em> for which the sequence remains bounded.</p>
            <figure className="learn-figure learn-diagram">
              <img src={LEARN_IMAGE_BASE + 'mandelbrot-overview.jpg'} alt="Overview of the Mandelbrot set, with its central cardioid and surrounding bulbs." loading="lazy" />
              <figcaption>The Mandelbrot set's overall shape contains detail along its entire boundary. Wolfgang Beyer, CC BY-SA 3.0.</figcaption>
            </figure>
            <p>The equation itself is short, but its visual result is extraordinarily detailed. Its boundary contains intricate structures, spirals and smaller shapes that echo features of the larger form. As we zoom into different regions, new patterns emerge. There is no need to manually draw each detail; the repeated calculation generates the structure.</p>
            <div className="learn-zoom-sequence" role="group" aria-label="Three stages in a Mandelbrot zoom sequence">
              <figure className="learn-figure learn-zoom-item"><img src={LEARN_IMAGE_BASE + 'mandelbrot-overview.jpg'} alt="Mandelbrot set overview before zooming in." loading="lazy" /><figcaption>Overview</figcaption></figure>
              <figure className="learn-figure learn-zoom-item"><img src={LEARN_IMAGE_BASE + 'mandelbrot-zoom-01.jpg'} alt="First close-up of the Mandelbrot set's seahorse valley." loading="lazy" /><figcaption>Closer view — SimsContPics, public domain</figcaption></figure>
              <figure className="learn-figure learn-zoom-item"><img src={LEARN_IMAGE_BASE + 'mandelbrot-zoom-02.jpg'} alt="Deeper view revealing spirals and seahorse-like shapes along the set's boundary." loading="lazy" /><figcaption>More detail — Wolfgang Beyer, CC BY-SA 3.0</figcaption></figure>
            </div>

            <h2>Fractals and measurement</h2>
            <p>Fractal geometry also changed the way we think about measurement. Consider the length of a coastline. If we measure it using a large measuring unit, we overlook many of its smaller bends and inlets. If we use a shorter unit, more detail becomes visible, and the measured length increases. The result depends on the scale at which the measurement is made.</p>
            <figure className="learn-figure learn-diagram">
              <img src={LEARN_IMAGE_BASE + 'coastline-scale.svg'} alt="The same jagged coastline followed with large, medium and fine measuring steps." loading="lazy" />
              <figcaption>Shorter measuring steps follow more bends in the same irregular boundary. Diagram created for Fractal Studio.</figcaption>
            </figure>
            <p>This does not mean that every coastline is a perfect mathematical fractal. It shows that familiar geometric ideas can become insufficient when describing highly irregular forms. The work of mathematician Benoît Mandelbrot helped bring these questions into focus and established fractal geometry as a powerful way to study complexity.</p>

            <h2>Fractal patterns in nature and practice</h2>
            <p>Fractal-like structures are not limited to mathematics. They can be found in branching river systems, the arrangement of leaves, lightning paths, mountain profiles and the large-scale structure of certain biological networks. These examples do not follow one universal formula, nor do they repeat identically at every scale. Their similarities arise from different physical and biological processes, but fractal geometry gives us a useful language for understanding some of the patterns they produce.</p>
            <div className="learn-nature-gallery" role="group" aria-label="Examples of fractal-like patterns in nature">
              <figure className="learn-figure"><img src={LEARN_IMAGE_BASE + 'fern-leaves.jpg'} alt="Fern leaflets branching from a central stem." loading="lazy" /><figcaption>Repeated branching in a fern. CC0</figcaption></figure>
              <figure className="learn-figure"><img src={LEARN_IMAGE_BASE + 'nile-delta.jpg'} alt="Satellite view of branching waterways in the Nile Delta." loading="lazy" /><figcaption>River channels at the Nile Delta. NASA, public domain</figcaption></figure>
              <figure className="learn-figure"><img src={LEARN_IMAGE_BASE + 'lightning-noaa.jpg'} alt="Lightning branching across the night sky." loading="lazy" /><figcaption>Branching lightning paths. C. Clark / NOAA, public domain</figcaption></figure>
            </div>
            <p>The ideas behind fractals have also found practical uses. They help generate natural-looking landscapes and textures in computer graphics, describe complex shapes in scientific models, and support techniques in image processing. Their value lies in the relationship between simple rules and complex outcomes—a relationship that appears in many systems beyond geometry.</p>

            <h2>Explore the process</h2>
            <p>Perhaps the most compelling thing about fractals is that they challenge our intuition about complexity. We tend to associate intricate structures with intricate instructions. Fractals show that this is not always necessary. A repeated operation, applied consistently, can create forms with seemingly endless variation and detail.</p>
            <p>When you explore a fractal, you are not simply looking at an elaborate image. You are looking at the visible result of a process. Every curve, boundary and repeating structure reflects the rules that generated it. Change a parameter, alter an iteration, or examine a different region, and the resulting geometry can change dramatically.</p>
            <p className="learn-conclusion">That is what makes fractals so interesting: the beauty is not only in the final pattern, but in the simple mathematical ideas that make its complexity possible.</p>
          </div>
        </article>
      </section>}
    </main>
  )
}

export default App

function ChevronIcon({ className = '', open = false }: { className?: string; open?: boolean }) { return <svg className={className + (open ? ' is-open' : '')} viewBox="0 0 16 16" aria-hidden="true"><path d="m3 6 5 5 5-5" /></svg> }
function SlidersIcon() { return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14M7 3v4m6 1v4m-4 1v4" /></svg> }
function PaletteIcon() { return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.5a7.5 7.5 0 1 0 0 15h1.2a1.5 1.5 0 0 0 1.1-2.5 1.4 1.4 0 0 1 1-2.4h1.1A3.1 3.1 0 0 0 17.5 9.5 7 7 0 0 0 10 2.5Z" /><circle cx="6.2" cy="9" r=".8" /><circle cx="8.8" cy="5.8" r=".8" /><circle cx="12.6" cy="6.2" r=".8" /></svg> }
function DownloadIcon() { return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.5v10m-4-4 4 4 4-4M3.5 14v3h13v-3" /></svg> }
function CanvasIcon() { return <svg className="canvas-icon" viewBox="0 0 20 20" aria-hidden="true" stroke="#ffffff" fill="none" strokeWidth="2.2" strokeLinecap="square" strokeLinejoin="miter"><path d="M4 4h12v12H4zM6.5 6.5h7v7h-7zM9 9h2v2H9z" /></svg> }
function BookIcon() { return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 5c-2-2-4.5-2-7-1v12c2.5-1 5-1 7 1m0-12c2-2 4.5-2 7-1v12c-2.5-1-5-1-7 1m0-12v12" /></svg> }
function ResetIcon() { return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 7V3m0 4h4M4.5 7A6.5 6.5 0 1 1 3.8 12" /></svg> }
function FullscreenIcon({ expanded }: { expanded: boolean }) { return expanded ? <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 3H3v4m10-4h4v4M3 13v4h4m10-4v4h-4M7 7 3 3m10 4 4-4M7 13l-4 4m10-4 4 4" /></svg> : <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 3H3v4m10-4h4v4M3 13v4h4m10-4v4h-4" /></svg> }

