interface Branch {
  readonly x: number
  readonly y: number
  readonly length: number
  readonly angle: number
}

/** Draw a binary fractal tree into a 2D canvas at the requested recursion depth. */
export function renderFractalTree(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  iterations: number,
): void {
  context.clearRect(0, 0, width, height)
  context.fillStyle = '#07090e'
  context.fillRect(0, 0, width, height)
  context.lineCap = 'round'

  let branches: Branch[] = [{ x: width / 2, y: height * 0.94, length: height * 0.25, angle: -Math.PI / 2 }]
  for (let level = 0; level < iterations; level += 1) {
    context.beginPath()
    const nextBranches: Branch[] = []
    for (const branch of branches) {
      const endX = branch.x + Math.cos(branch.angle) * branch.length
      const endY = branch.y + Math.sin(branch.angle) * branch.length
      context.moveTo(branch.x, branch.y)
      context.lineTo(endX, endY)

      if (level + 1 < iterations) {
        const spread = 0.46 + (level % 3) * 0.025
        const nextLength = branch.length * 0.72
        nextBranches.push(
          { x: endX, y: endY, length: nextLength, angle: branch.angle - spread },
          { x: endX, y: endY, length: nextLength, angle: branch.angle + spread },
        )
      }
    }
    context.strokeStyle = `hsl(${28 + (level / Math.max(1, iterations - 1)) * 120} 78% ${58 + (level / Math.max(1, iterations - 1)) * 16}%)`
    context.lineWidth = Math.max(0.7, 9 * Math.pow(0.72, level))
    context.stroke()
    branches = nextBranches
  }
}
