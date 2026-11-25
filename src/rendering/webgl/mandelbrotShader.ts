/**
 * Fragment shader for the first GPU renderer. Screen-space pixels map to
 * complex coordinates using one units-per-pixel value on both axes.
 */
export const MANDELBROT_FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp int;

uniform vec2 u_resolution;
uniform vec2 u_center;
uniform float u_unitsPerPixel;
uniform int u_maxIterations;
uniform int u_power;
uniform int u_family;
uniform vec2 u_juliaConstant;
uniform int u_palette;
uniform vec3 u_customColorStart;
uniform vec3 u_customColorMiddle;
uniform vec3 u_customColorEnd;
uniform int u_samplesPerPixel;
uniform float u_colorFrequency;
uniform float u_colorPhase;
uniform float u_brightness;
uniform float u_contrast;
uniform float u_contourStrength;

out vec4 outColor;

vec3 paletteColor(float t, float smoothCount, int palette) {
  if (palette == 10) {
    if (t < 0.5) return mix(u_customColorStart, u_customColorMiddle, t * 2.0);
    return mix(u_customColorMiddle, u_customColorEnd, (t - 0.5) * 2.0);
  }
  vec3 phase;
  vec3 amplitude;
  vec3 offset;
  if (palette == 1) {
    phase = vec3(0.0, 0.18, 0.34);
    amplitude = vec3(0.48, 0.42, 0.50);
    offset = vec3(0.49, 0.53, 0.52);
  } else if (palette == 2) {
    phase = vec3(0.02, 0.24, 0.44);
    amplitude = vec3(0.50, 0.42, 0.38);
    offset = vec3(0.54, 0.40, 0.34);
  } else if (palette == 3) {
    phase = vec3(0.55, 0.02, 0.1); amplitude = vec3(0.5); offset = vec3(0.5);
  } else if (palette == 4) {
    phase = vec3(0.72, 0.1, 0.42); amplitude = vec3(0.5); offset = vec3(0.5);
  } else if (palette == 5) {
    phase = vec3(0.55, 0.25, 0.05); amplitude = vec3(0.5); offset = vec3(0.5);
  } else if (palette == 6) {
    phase = vec3(0.08, 0.31, 0.55); amplitude = vec3(0.5); offset = vec3(0.5);
  } else if (palette == 7) {
    phase = vec3(0.0, 0.0, 0.0); amplitude = vec3(0.5); offset = vec3(0.5);
  } else if (palette == 8) {
    phase = vec3(0.48, 0.02, 0.82); amplitude = vec3(0.5); offset = vec3(0.5);
  } else if (palette == 9) {
    float line = step(0.5, fract(smoothCount * 0.18));
    return mix(vec3(0.015, 0.025, 0.07), vec3(0.45, 0.85, 1.0), line);
  } else {
    phase = vec3(0.02, 0.12, 0.28);
    amplitude = vec3(0.48, 0.46, 0.44);
    offset = vec3(0.50, 0.50, 0.50);
  }
  vec3 color = clamp(offset + amplitude * cos(6.2831853 * (vec3(t) + phase)), 0.0, 1.0);
  if (palette == 7) color = vec3(dot(color, vec3(0.299, 0.587, 0.114)));
  return color;
}

vec2 complexMultiply(vec2 a, vec2 b) {
  return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

vec3 renderSample(vec2 samplePosition) {
  // gl_FragCoord starts at the lower-left; flip its vertical offset to match
  // the CPU's top-left image convention.
  vec2 offset = samplePosition - 0.5 * u_resolution;
  vec2 point = u_center + vec2(offset.x, offset.y) * u_unitsPerPixel;
  vec2 c = u_family == 1 ? u_juliaConstant : point;
  int degree = u_family == 2 ? 2 : u_power;
  vec2 z = u_family == 1 ? point : vec2(0.0);
  float escapeRadius = max(2.0, length(c));
  float escapedAt = float(u_maxIterations);
  bool escaped = false;
  for (int i = 0; i < u_maxIterations; i++) {
    // Burning Ship reflects each orbit coordinate across both axes before
    // applying its quadratic recurrence.
    vec2 base = u_family == 2 ? abs(z) : z;
    vec2 powered = vec2(1.0, 0.0);
    for (int exponent = 0; exponent < 8; exponent++) {
      if (exponent >= degree) break;
      powered = complexMultiply(powered, base);
    }
    z = powered + c;
    if (dot(z, z) > escapeRadius * escapeRadius) {
      escapedAt = float(i);
      escaped = true;
      break;
    }
  }

  if (!escaped) {
    return vec3(0.008, 0.010, 0.018);
  }

  float magnitude = max(length(z), 1.000001);
  float zoomDepth = max(0.0, log2(0.0035555556 / max(u_unitsPerPixel, 1e-12)));
  float detailBoost = smoothstep(5.0, 10.0, zoomDepth);
  // The loop index is zero-based; +2 gives count plus the smoothing offset.
  float smoothCount = escapedAt + 2.0 - log(log(magnitude)) / log(float(degree));
  float t = fract(max(smoothCount, 0.0) * 0.018 * u_colorFrequency + u_colorPhase);
  vec3 color = paletteColor(t, smoothCount, u_palette);
  float contourFrequency = mix(1.13097, 1.65097, detailBoost);
  float contour = pow(max(cos(smoothCount * contourFrequency), 0.0), mix(24.0, 30.0, detailBoost));
  color = mix(color, vec3(0.92, 0.97, 1.0), contour * u_contourStrength * (1.0 + detailBoost * 0.5));
  color = clamp((color - 0.5) * (u_contrast + detailBoost * 0.12) + 0.5, 0.0, 1.0) * (u_brightness + detailBoost * 0.03);
  return clamp(color, 0.0, 1.0);
}

void main() {
  if (u_samplesPerPixel == 1) {
    outColor = vec4(renderSample(gl_FragCoord.xy), 1.0);
    return;
  }

  // Four samples at a 2x2 grid average subpixel boundaries for export.
  vec3 color = vec3(0.0);
  color += renderSample(gl_FragCoord.xy + vec2(-0.25, -0.25));
  color += renderSample(gl_FragCoord.xy + vec2( 0.25, -0.25));
  color += renderSample(gl_FragCoord.xy + vec2(-0.25,  0.25));
  color += renderSample(gl_FragCoord.xy + vec2( 0.25,  0.25));
  outColor = vec4(color * 0.25, 1.0);
}`

/** Minimal vertex shader drawing one full-screen triangle from gl_VertexID. */
export const FULLSCREEN_VERTEX_SHADER = `#version 300 es
void main() {
  vec2 position = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
}`
