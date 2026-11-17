import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent, WheelEvent } from 'react'
import { DEFAULT_MANDELBROT_CONFIG, DEFAULT_VIEW } from './domain/renderConfig.ts'
import type { FractalFamily, ViewState } from './domain/renderConfig.ts'
import { minimumStableScale, panView, zoomViewAt } from './domain/navigation.ts'
import { WebGLMandelbrotRenderer } from './rendering/webgl/WebGLMandelbrotRenderer.ts'
import type { RenderParameters } from './rendering/webgl/WebGLMandelbrotRenderer.ts'
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

const FAMILY_OPTIONS: readonly { readonly id: FractalFamily; readonly name: string }[] = [
  { id: 'mandelbrot', name: 'Mandelbrot / Multibrot' },
  { id: 'julia', name: 'Julia set' },
]
const EXPORT_WIDTH = 3840
const EXPORT_HEIGHT = 2160
const PREVIEW_SAMPLES_PER_PIXEL: 1 | 4 = 4
const EXPORT_SAMPLES_PER_PIXEL: 1 | 4 = 4

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

type StudioPage = 'canvas' | 'gallery' | 'learn'

function pageFromPath(pathname: string): StudioPage {
  if (pathname === '/gallery') return 'gallery'
  if (pathname === '/learn') return 'learn'
  return 'canvas'
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const workspaceRef = useRef<HTMLElement>(null)
  const exportingRef = useRef(false)
  const preserveFullscreenDuringExportRef = useRef(false)
  const userRequestedFullscreenExitRef = useRef(false)
  const rendererRef = useRef<WebGLMandelbrotRenderer | null>(null)
  const dragRef = useRef<DragStart | null>(null)
  const [view, setView] = useState<ViewState>(DEFAULT_VIEW)
  const [family, setFamily] = useState<FractalFamily>('mandelbrot')
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
  const [collapsed, setCollapsed] = useState({ parameters: false, coloring: false, export: false })
  const customPaletteStops = useMemo(
    () => [hexToRgb(customColorStart), hexToRgb(customColorMiddle), hexToRgb(customColorEnd)] as const,
    [customColorStart, customColorMiddle, customColorEnd],
  )
  const [page, setPage] = useState<StudioPage>(() => pageFromPath(window.location.pathname))
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

  const selectFamily = (nextFamily: FractalFamily) => {
    setFamily(nextFamily)
    setPower(2)
    setConstantReal(-0.4)
    setConstantImaginary(0.6)
    setView((current) => ({
      ...current,
      centerX: nextFamily === 'julia' ? 0 : -0.5,
      centerY: 0,
      unitsPerPixel: 3.2 / current.height,
    }))
    setMessage(nextFamily === 'julia' ? 'Showing the Julia set overview.' : 'Showing the Mandelbrot / Multibrot overview.')
  }
  const resetView = useCallback(() => {
    setView((current) => ({
      ...DEFAULT_VIEW,
      centerX: family === 'julia' ? 0 : -0.5,
      width: current.width,
      height: current.height,
      unitsPerPixel: 3.2 / current.height,
    }))
    setMessage(family === 'julia' ? 'Reset to the Julia set overview.' : 'Reset to the Mandelbrot / Multibrot overview.')
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

  const exportImage = async () => {
    if (exporting) return
    const exportQuality = exportQualityFor(exportFormat)
    exportingRef.current = true
    preserveFullscreenDuringExportRef.current = document.fullscreenElement === workspaceRef.current
    userRequestedFullscreenExitRef.current = false
    setExporting(true)
    setMessage(`Rendering ${EXPORT_WIDTH} x ${EXPORT_HEIGHT} ${exportFormat.toUpperCase()} with preview-matching sampling...`)
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

    const exportCanvas = document.createElement('canvas')
    let exportRenderer: WebGLMandelbrotRenderer | null = null
    try {
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

      const mimeType = exportFormat === 'png' ? 'image/png' : 'image/jpeg'
      const blob = await new Promise<Blob>((resolve, reject) => {
        exportCanvas.toBlob((created) => {
          if (!created) reject(new Error('The browser could not encode the rendered image.'))
          else resolve(created)
        }, mimeType, exportQuality.jpegQuality)
      })
      if (exportRenderer.isContextLost) {
        throw new Error('The export graphics context was lost before the image could be verified.')
      }
      if (blob.type !== mimeType || blob.size === 0) {
        throw new Error('The browser returned an invalid or empty image file.')
      }

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `fractal-studio-3840x2160.${exportFormat === 'png' ? 'png' : 'jpg'}`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
      setMessage(`Saved ${EXPORT_WIDTH} x ${EXPORT_HEIGHT} ${exportFormat.toUpperCase()} image with preview-matching sampling.`)
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

  const familyName = FAMILY_OPTIONS.find((item) => item.id === family)?.name ?? 'Mandelbrot / Multibrot'
  const toggleSection = (section: keyof typeof collapsed) => setCollapsed((current) => ({ ...current, [section]: !current[section] }))

  return (
    <main className="studio-shell" id="top">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Fractal Studio home" onClick={(event) => navigate(event, '/')}><span className="brand-mark" aria-hidden="true">F</span><span>Fractal <span className="brand-light">Studio</span></span></a>
        <nav className="header-nav" aria-label="Main navigation">
          <a className={'nav-link' + (page === 'canvas' ? ' nav-link-active' : '')} href="/" aria-current={page === 'canvas' ? 'page' : undefined} onClick={(event) => navigate(event, '/')}><CanvasIcon />Generative Canvas</a>
          <a className={'nav-link' + (page === 'gallery' ? ' nav-link-active' : '')} href="/gallery" aria-current={page === 'gallery' ? 'page' : undefined} onClick={(event) => navigate(event, '/gallery')}><GalleryIcon />Gallery</a>
          <a className={'nav-link' + (page === 'learn' ? ' nav-link-active' : '')} href="/learn" aria-current={page === 'learn' ? 'page' : undefined} onClick={(event) => navigate(event, '/learn')}><BookIcon />Learn</a>
        </nav>
      </header>
      {page === 'canvas' ? <div className="studio-layout">
        <aside className="left-panel" aria-label="Fractal navigation">
          <h2 className="sidebar-title">Explore</h2>
          <div className="family-field"><label className="field-label" htmlFor="family">Fractal Type</label><div className="select-wrap"><select id="family" value={family} onChange={(event) => selectFamily(event.currentTarget.value as FractalFamily)}>{FAMILY_OPTIONS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><span className="select-chevron"><ChevronIcon /></span></div></div>
          <div className="fractal-description">
            <div className="equation-formula">z<sub>n+1</sub> = z<sub>n</sub><sup>p</sup> + c</div>
            <p>{family === 'julia'
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
                  {isFullscreen && <button className="canvas-action canvas-export-action" type="button" onClick={exportImage} disabled={!ready || exporting} aria-label={exporting ? 'Rendering export' : 'Export image'} title={exporting ? 'Rendering export' : 'Export image'}><DownloadIcon /><span>{exporting ? 'Rendering...' : 'Export'}</span></button>}
                </div>
              </div>
              <div className="canvas-subtitle-row"><p className="canvas-subtitle">{family === 'julia' ? 'Julia set with fixed c = ' + constantReal.toFixed(3) + ' ' + (constantImaginary < 0 ? '-' : '+') + ' ' + Math.abs(constantImaginary).toFixed(3) + 'i' : 'Classic Mandelbrot set with power ' + power}</p><div className="canvas-meta"><span><b>Frame</b> {view.width} x {view.height}</span><span><b>Scale</b> {view.unitsPerPixel.toExponential(2)} / px</span></div></div>
            </div>
          </div>
          <div className="canvas-frame"><canvas ref={canvasRef} className="fractal-canvas" aria-label={familyName + ' rendering. Scroll to zoom - drag to pan.'} onWheel={handleWheel} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={endPointer} onPointerCancel={endPointer} onLostPointerCapture={() => { dragRef.current = null }} />{!ready && <div className="canvas-message" role="status"><span>{message}</span></div>}<div className="coordinate-tag">x: {view.centerX.toFixed(6)} <span /> y: {view.centerY.toFixed(6)}</div></div>
        </section>
        <aside className="right-panel" aria-label="Fractal settings">
          <section className="settings-card"><button className="card-heading" type="button" aria-expanded={!collapsed.parameters} aria-controls="parameters-content" onClick={() => toggleSection('parameters')}><span className="card-icon"><SlidersIcon /></span><span>Parameters</span><ChevronIcon className="card-chevron" open={!collapsed.parameters} /></button><div id="parameters-content" className="card-body" hidden={collapsed.parameters}>
            <div className="control-block"><div className="control-heading"><label htmlFor="iterations">Iterations</label><output htmlFor="iterations">{maxIterations}</output></div><input id="iterations" type="range" min="50" max="1200" step="10" value={maxIterations} onChange={(event) => setMaxIterations(Number(event.currentTarget.value))} /><div className="range-ends"><span>50</span><span>1200</span></div></div>
            <div className="control-block"><div className="control-heading"><label htmlFor="power">Equation power (p)</label><output htmlFor="power">{power}</output></div><input id="power" type="range" min="2" max="8" step="1" value={power} onChange={(event) => setPower(Number(event.currentTarget.value))} /><div className="range-ends"><span>2 quadratic</span><span>8</span></div><p className="control-note">Changes the power in z^p + c.</p></div>
            {family === 'julia' && <div className="control-block"><div className="control-heading"><label htmlFor="constant-real">Julia parameter c</label><output htmlFor="constant-real">{constantReal.toFixed(3)} {constantImaginary < 0 ? '-' : '+'} {Math.abs(constantImaginary).toFixed(3)}i</output></div><label className="sub-control-label" htmlFor="constant-real">Real part</label><input id="constant-real" type="range" min="-2" max="2" step="0.005" value={constantReal} onChange={(event) => setConstantReal(Number(event.currentTarget.value))} /><label className="sub-control-label" htmlFor="constant-imaginary">Imaginary part</label><input id="constant-imaginary" type="range" min="-2" max="2" step="0.005" value={constantImaginary} onChange={(event) => setConstantImaginary(Number(event.currentTarget.value))} /><p className="control-note">Changing c changes the Julia set fixed parameter.</p></div>}
          </div></section>
          <section className="settings-card"><button className="card-heading" type="button" aria-expanded={!collapsed.coloring} aria-controls="coloring-content" onClick={() => toggleSection('coloring')}><span className="card-icon"><PaletteIcon /></span><span>Coloring</span><ChevronIcon className="card-chevron" open={!collapsed.coloring} /></button><div id="coloring-content" className="card-body" hidden={collapsed.coloring}>
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
          </div></section>
          <section className="settings-card"><button className="card-heading" type="button" aria-expanded={!collapsed.export} aria-controls="export-content" onClick={() => toggleSection('export')}><span className="card-icon"><DownloadIcon /></span><span>Export</span><ChevronIcon className="card-chevron" open={!collapsed.export} /></button><div id="export-content" className="card-body export-content" hidden={collapsed.export}>
            <div className="control-heading"><label htmlFor="format">Output format</label></div><div className="select-wrap format-select"><select id="format" value={exportFormat} onChange={(event) => setExportFormat(event.currentTarget.value as 'png' | 'jpeg')}><option value="png">PNG / Lossless</option><option value="jpeg">JPEG / High quality</option></select><span className="select-chevron"><ChevronIcon /></span></div>
            <div className="resolution-row"><span>Resolution</span><b>3840 x 2160 (4K UHD)</b></div><p className="export-note">Rendered at 3840 x 2160 with 1x sampling for a crisper export.</p><div className="export-status"><span className="field-label">Render status</span><p role="status" aria-live="polite">{message}</p></div><div className="parameter-readout"><span>Center X <b>{view.centerX.toFixed(6)}</b></span><span>Center Y <b>{view.centerY.toFixed(6)}</b></span></div>
            <button className="export-button" type="button" onClick={exportImage} disabled={!ready || exporting}>{exporting ? <><span className="button-spinner" /> Rendering 4K...</> : <><DownloadIcon /> Export</>}</button>
          </div></section>
        </aside>
      </div> : <section className="coming-page" aria-labelledby="coming-title">
        <div className="coming-card">
          <div className="coming-icon">{page === 'gallery' ? <GalleryIcon /> : <BookIcon />}</div>
          <p className="coming-eyebrow">A new space for fractal exploration</p>
          <h1 id="coming-title">{page === 'gallery' ? 'Fractal Gallery' : 'Learn'}</h1>
          <p>{page === 'gallery' ? 'The Fractal Gallery is coming soon. Browse and discover remarkable fractal artworks here in a future update.' : 'Learn is coming soon. Find guides and ideas for exploring fractals in a future update.'}</p>
          <a className="return-link" href="/" onClick={(event) => navigate(event, '/')}>Return to Generative Canvas</a>
        </div>
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
function GalleryIcon() { return <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="3" width="15" height="14" rx="2" /><circle cx="7" cy="7.5" r="1.3" /><path d="m4 14 4-4 2.5 2 2.5-3 3 5" /></svg> }
function BookIcon() { return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 5c-2-2-4.5-2-7-1v12c2.5-1 5-1 7 1m0-12c2-2 4.5-2 7-1v12c-2.5-1-5-1-7 1m0-12v12" /></svg> }
function ResetIcon() { return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 7V3m0 4h4M4.5 7A6.5 6.5 0 1 1 3.8 12" /></svg> }
function FullscreenIcon({ expanded }: { expanded: boolean }) { return expanded ? <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 3H3v4m10-4h4v4M3 13v4h4m10-4v4h-4M7 7 3 3m10 4 4-4M7 13l-4 4m10-4 4 4" /></svg> : <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 3H3v4m10-4h4v4M3 13v4h4m10-4v4h-4" /></svg> }

