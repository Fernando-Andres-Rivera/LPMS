function wrapLabel(text: string, maxCharsPerLine = 14): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length > maxCharsPerLine && current) {
      lines.push(current)
      current = word
    } else {
      current = next
    }
  }
  if (current) lines.push(current)
  return lines
}

/** Tick de eje X para gráficos de Pareto: el nombre de la causa se agrupa
 * en varias líneas (en vez de una sola línea larga que se corta o se
 * encima con la siguiente) — usar junto con un XAxis con `height` suficiente
 * para el máximo de líneas esperado. */
export function ParetoAxisTick({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  if (x === undefined || y === undefined || !payload) return null
  const lines = wrapLabel(payload.value)
  return (
    <text x={x} y={y} textAnchor="middle" fontSize={11} fill="var(--color-text-muted)">
      {lines.map((line, i) => (
        <tspan key={i} x={x} dy={i === 0 ? 12 : 13}>
          {line}
        </tspan>
      ))}
    </text>
  )
}
