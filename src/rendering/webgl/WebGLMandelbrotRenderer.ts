import type { FractalConfig, ViewState } from '../../domain/renderConfig.ts'
import { validateFractalConfig, validateView } from '../../domain/renderConfig.ts'
import { FULLSCREEN_VERTEX_SHADER, MANDELBROT_FRAGMENT_SHADER } from './mandelbrotShader.ts'

/** Immutable values consumed for one complete preview or export frame. */
export interface RenderParameters {
  readonly view: ViewState
  readonly fractal: FractalConfig
  readonly palette: number
  readonly customPaletteStops: readonly [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]]
  readonly colorFrequency: number
  readonly colorPhase: number
  readonly brightness: number
  readonly contrast: number
  readonly contourStrength: number
  /** Number of subpixel evaluations per output pixel. Defaults to one. */
  readonly samplesPerPixel?: 1 | 4
}

/** UI notifications for WebGL context lifecycle changes. */
export interface RendererCallbacks {
  readonly onContextLost: () => void
  readonly onContextRestored: () => void
}

/** Owns a WebGL2 context and all GPU objects used for Mandelbrot rendering. */
export class WebGLMandelbrotRenderer {
  private readonly gl: WebGL2RenderingContext
  private readonly canvas: HTMLCanvasElement
  private readonly callbacks: RendererCallbacks
  private program: WebGLProgram | null = null
  private vertexArray: WebGLVertexArrayObject | null = null
  private uniforms: {
    readonly resolution: WebGLUniformLocation | null
    readonly center: WebGLUniformLocation | null
    readonly unitsPerPixel: WebGLUniformLocation | null
    readonly maxIterations: WebGLUniformLocation | null
    readonly power: WebGLUniformLocation | null
    readonly family: WebGLUniformLocation | null
    readonly juliaConstant: WebGLUniformLocation | null
    readonly palette: WebGLUniformLocation | null
    readonly customColorStart: WebGLUniformLocation | null
    readonly customColorMiddle: WebGLUniformLocation | null
    readonly customColorEnd: WebGLUniformLocation | null
    readonly samplesPerPixel: WebGLUniformLocation | null
    readonly colorFrequency: WebGLUniformLocation | null
    readonly colorPhase: WebGLUniformLocation | null
    readonly brightness: WebGLUniformLocation | null
    readonly contrast: WebGLUniformLocation | null
    readonly contourStrength: WebGLUniformLocation | null
  } | null = null
  private lost = false
  private disposed = false
  private parameters: RenderParameters | null = null

  private readonly handleLost = (event: Event): void => {
    event.preventDefault()
    this.lost = true
    this.callbacks.onContextLost()
  }

  private readonly handleRestored = (): void => {
    try {
      this.createResources()
      this.lost = false
      this.callbacks.onContextRestored()
      if (this.parameters) this.draw(this.parameters)
    } catch (error) {
      this.callbacks.onContextLost()
      console.error('WebGL restoration failed:', error)
    }
  }

  /**
   * Create a renderer for a canvas. WebGL2 failure is reported as an error so
   * the UI can present a clear message instead of implying a render succeeded.
   */
  constructor(
    canvas: HTMLCanvasElement,
    callbacks: RendererCallbacks,
    preserveDrawingBuffer = false,
  ) {
    this.canvas = canvas
    this.callbacks = callbacks
    const context = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer,
      powerPreference: 'high-performance',
    })
    if (!context) throw new Error('WebGL 2 is unavailable in this browser or device.')
    this.gl = context
    this.canvas.addEventListener('webglcontextlost', this.handleLost)
    this.canvas.addEventListener('webglcontextrestored', this.handleRestored)

    try {
      this.createResources()
    } catch (error) {
      this.dispose()
      throw error
    }
  }

  /** Current maximum supported texture dimension for export validation. */
  get maxTextureSize(): number {
    return this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number
  }

  /** Current maximum supported renderbuffer dimension for export validation. */
  get maxRenderbufferSize(): number {
    return this.gl.getParameter(this.gl.MAX_RENDERBUFFER_SIZE) as number
  }

  /** Whether the context is lost now or was marked lost by its event handler. */
  get isContextLost(): boolean {
    return this.lost || this.gl.isContextLost()
  }

  /** Resize the drawing buffer to physical pixels and update the viewport. */
  resize(width: number, height: number): void {
    if (this.disposed || this.lost) return
    const safeWidth = Math.max(1, Math.floor(width))
    const safeHeight = Math.max(1, Math.floor(height))
    if (this.canvas.width !== safeWidth || this.canvas.height !== safeHeight) {
      this.canvas.width = safeWidth
      this.canvas.height = safeHeight
    }
    this.gl.viewport(0, 0, safeWidth, safeHeight)
    if (this.parameters) this.draw(this.parameters)
  }

  /** Render the supplied immutable view and palette configuration. */
  render(parameters: RenderParameters): void {
    if (this.disposed) throw new Error('This WebGL renderer has been disposed.')
    if (this.isContextLost) throw new Error('The WebGL context is lost; rendering cannot continue.')
    validateView(parameters.view)
    validateFractalConfig(parameters.fractal)
    if (!Number.isSafeInteger(parameters.palette) || parameters.palette < 0 || parameters.palette > 10) {
      throw new RangeError('Palette index must be an integer from 0 to 10.')
    }
    if (parameters.customPaletteStops.some((stop) => stop.some((channel) => !Number.isFinite(channel) || channel < 0 || channel > 1))) {
      throw new RangeError('Custom palette color channels must be between 0 and 1.')
    }
    if (parameters.samplesPerPixel !== undefined
      && parameters.samplesPerPixel !== 1
      && parameters.samplesPerPixel !== 4) {
      throw new RangeError('Samples per pixel must be 1 or 4.')
    }
    if (![parameters.colorFrequency, parameters.colorPhase, parameters.brightness, parameters.contrast, parameters.contourStrength].every(Number.isFinite)) {
      throw new RangeError('Color controls must be finite numbers.')
    }
    this.parameters = parameters
    this.draw(parameters)
  }

  /** Release all owned GPU resources and browser event listeners. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.canvas.removeEventListener('webglcontextlost', this.handleLost)
    this.canvas.removeEventListener('webglcontextrestored', this.handleRestored)
    if (!this.lost) {
      if (this.vertexArray) this.gl.deleteVertexArray(this.vertexArray)
      if (this.program) this.gl.deleteProgram(this.program)
    }
    this.vertexArray = null
    this.program = null
    this.uniforms = null
  }

  private draw(parameters: RenderParameters): void {
    if (this.disposed || this.lost || !this.program || !this.vertexArray || !this.uniforms) return
    const gl = this.gl
    const uniforms = this.uniforms
    gl.useProgram(this.program)
    gl.bindVertexArray(this.vertexArray)
    gl.uniform2f(uniforms.resolution, this.canvas.width, this.canvas.height)
    gl.uniform2f(uniforms.center, parameters.view.centerX, parameters.view.centerY)
    // View scale is defined per logical image pixel. Convert it to physical
    // drawing-buffer pixels so device-pixel ratio does not change the view.
    const bufferScale = parameters.view.unitsPerPixel * parameters.view.height / this.canvas.height
    gl.uniform1f(uniforms.unitsPerPixel, bufferScale)
    gl.uniform1i(uniforms.maxIterations, parameters.fractal.maxIterations)
    gl.uniform1i(uniforms.power, parameters.fractal.power ?? 2)
    const family = parameters.fractal.family ?? 'mandelbrot'
    gl.uniform1i(uniforms.family, family === 'julia' ? 1 : family === 'burning-ship' ? 2 : 0)
    gl.uniform2f(
      uniforms.juliaConstant,
      parameters.fractal.constantReal ?? -0.4,
      parameters.fractal.constantImaginary ?? 0.6,
    )
    gl.uniform1i(uniforms.palette, parameters.palette)
    gl.uniform3f(uniforms.customColorStart, ...parameters.customPaletteStops[0])
    gl.uniform3f(uniforms.customColorMiddle, ...parameters.customPaletteStops[1])
    gl.uniform3f(uniforms.customColorEnd, ...parameters.customPaletteStops[2])
    gl.uniform1i(uniforms.samplesPerPixel, parameters.samplesPerPixel ?? 1)
    gl.uniform1f(uniforms.colorFrequency, parameters.colorFrequency)
    gl.uniform1f(uniforms.colorPhase, parameters.colorPhase)
    gl.uniform1f(uniforms.brightness, parameters.brightness)
    gl.uniform1f(uniforms.contrast, parameters.contrast)
    gl.uniform1f(uniforms.contourStrength, parameters.contourStrength)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  private createResources(): void {
    const gl = this.gl
    const vertex = this.compileShader(gl.VERTEX_SHADER, FULLSCREEN_VERTEX_SHADER)
    let fragment: WebGLShader | null = null
    let program: WebGLProgram | null = null
    try {
      fragment = this.compileShader(gl.FRAGMENT_SHADER, MANDELBROT_FRAGMENT_SHADER)
      program = gl.createProgram()
      if (!program) throw new Error('The browser could not allocate a WebGL program.')
      gl.attachShader(program, vertex)
      gl.attachShader(program, fragment)
      gl.linkProgram(program)
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(`Mandelbrot shader link failed: ${gl.getProgramInfoLog(program) ?? 'No driver details.'}`)
      }
      const vertexArray = gl.createVertexArray()
      if (!vertexArray) throw new Error('The browser could not allocate a WebGL vertex array.')
      this.program = program
      this.vertexArray = vertexArray
      this.uniforms = {
        resolution: gl.getUniformLocation(program, 'u_resolution'),
        center: gl.getUniformLocation(program, 'u_center'),
        unitsPerPixel: gl.getUniformLocation(program, 'u_unitsPerPixel'),
        maxIterations: gl.getUniformLocation(program, 'u_maxIterations'),
        power: gl.getUniformLocation(program, 'u_power'),
        family: gl.getUniformLocation(program, 'u_family'),
        juliaConstant: gl.getUniformLocation(program, 'u_juliaConstant'),
        palette: gl.getUniformLocation(program, 'u_palette'),
        customColorStart: gl.getUniformLocation(program, 'u_customColorStart'),
        customColorMiddle: gl.getUniformLocation(program, 'u_customColorMiddle'),
        customColorEnd: gl.getUniformLocation(program, 'u_customColorEnd'),
        samplesPerPixel: gl.getUniformLocation(program, 'u_samplesPerPixel'),
        colorFrequency: gl.getUniformLocation(program, 'u_colorFrequency'),
        colorPhase: gl.getUniformLocation(program, 'u_colorPhase'),
        brightness: gl.getUniformLocation(program, 'u_brightness'),
        contrast: gl.getUniformLocation(program, 'u_contrast'),
        contourStrength: gl.getUniformLocation(program, 'u_contourStrength'),
      }
      gl.bindVertexArray(vertexArray)
      gl.useProgram(program)
    } catch (error) {
      if (program) gl.deleteProgram(program)
      throw error
    } finally {
      gl.deleteShader(vertex)
      if (fragment) gl.deleteShader(fragment)
    }
  }

  private compileShader(type: number, source: string): WebGLShader {
    const shader = this.gl.createShader(type)
    if (!shader) throw new Error('The browser could not allocate a WebGL shader.')
    this.gl.shaderSource(shader, source)
    this.gl.compileShader(shader)
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      const log = this.gl.getShaderInfoLog(shader) ?? 'No driver details.'
      this.gl.deleteShader(shader)
      throw new Error(`Mandelbrot shader compilation failed: ${log}`)
    }
    return shader
  }
}
