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

/** Cuántos caracteres caben por línea antes de tener que partir a la
 * siguiente — un valor fijo asumía el ancho de un gráfico de escritorio;
 * en un celular el mismo gráfico (con las mismas barras) es mucho más
 * angosto, así que cada línea necesita ser más corta o el texto de una
 * etiqueta invade el espacio de la barra vecina. */
function getMaxCharsPerLine(): number {
  if (typeof window === 'undefined') return 14
  const w = window.innerWidth
  if (w < 420) return 7
  if (w < 640) return 10
  return 14
}

/** Tick de eje X para gráficos de Pareto: el nombre de la causa se agrupa
 * en varias líneas (en vez de una sola línea larga que se corta o se
 * encima con la siguiente) — usar junto con un XAxis con `height` suficiente
 * para el máximo de líneas esperado. */
export function ParetoAxisTick({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  if (x === undefined || y === undefined || !payload) return null
  const lines = wrapLabel(payload.value, getMaxCharsPerLine())
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
