export type ColorStop = readonly [number, number, number]

export interface PointCloudColorOptions {
  readonly palette: number
  readonly customPaletteStops: readonly [ColorStop, ColorStop, ColorStop]
  readonly colorFrequency: number
  readonly colorPhase: number
  readonly brightness: number
  readonly contrast: number
  readonly contourStrength: number
}

const PALETTE_STOPS: readonly (readonly [string, string, string])[] = [
  ['#51331f', '#c77a32', '#f4d58d'],
  ['#17484e', '#38a6a0', '#d4f2d2'],
  ['#431b2c', '#c4573c', '#ffd17a'],
  ['#652c9b', '#28c9c1', '#f7d643'],
  ['#351078', '#e249d1', '#a6ffff'],
  ['#081d64', '#1979df', '#a0f6ff'],
  ['#45140d', '#ec5018', '#ffe17a'],
  ['#20232a', '#858b94', '#f5f6f7'],
  ['#101846', '#8556c5', '#f1b16c'],
  ['#071025', '#4ab9dc', '#d4fbff'],
]

function parseHex(hex: string): ColorStop {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16 & 255) / 255, (value >> 8 & 255) / 255, (value & 255) / 255]
}

function fract(value: number): number {
  return value - Math.floor(value)
}

/** Build a byte RGB lookup for palette-colored point clouds. */
export function createPointColorLookup(options: PointCloudColorOptions): Uint8Array {
  const presetStops = PALETTE_STOPS[Math.max(0, Math.min(PALETTE_STOPS.length - 1, options.palette))]
  const stops: readonly [ColorStop, ColorStop, ColorStop] = options.palette === 10
    ? options.customPaletteStops
    : [parseHex(presetStops[0]), parseHex(presetStops[1]), parseHex(presetStops[2])]
  const lookup = new Uint8Array(256 * 3)
  for (let i = 0; i < 256; i += 1) {
    const t = fract((i / 255) * options.colorFrequency + options.colorPhase)
    const segment = t < 0.5 ? 0 : 1
    const segmentT = segment === 0 ? t * 2 : (t - 0.5) * 2
    const contour = Math.pow(Math.max(0, Math.cos(t * Math.PI * 20)), 20) * options.contourStrength
    for (let channel = 0; channel < 3; channel += 1) {
      const gradient = stops[segment][channel] * (1 - segmentT) + stops[segment + 1][channel] * segmentT
      const mixed = gradient * (1 - contour) + contour
      const adjusted = Math.max(0, Math.min(1, (mixed - 0.5) * options.contrast + 0.5)) * options.brightness
      lookup[i * 3 + channel] = Math.round(Math.max(0, Math.min(1, adjusted)) * 255)
    }
  }
  return lookup
}
