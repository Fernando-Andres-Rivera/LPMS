import './cascade-system.css'

/**
 * La cascada diaria de reuniones por niveles, dibujada como sistema y no como
 * organigrama: tres niveles, cada uno con su equipo y el tablero que ese nivel
 * realmente mira, y dos corrientes que los recorren — los resultados suben,
 * el soporte baja. Es vectorial (no una imagen) para que se lea nítida en
 * cualquier pantalla y pueda animarse el flujo.
 */

const TIERS = [
  {
    level: 3,
    y: 48,
    lines: ['Gerencia +', 'Director de Planta'],
    accent: '#4F9BE8',
    board: 'tendencia' as const,
  },
  {
    level: 2,
    y: 325,
    lines: ['Líderes de Equipo +', 'Jefe de Producción'],
    accent: '#34C2B3',
    board: 'pareto' as const,
  },
  {
    level: 1,
    y: 602,
    lines: ['Operarios +', 'Líder de Equipo'],
    accent: '#F5A03C',
    board: 'smqdcep' as const,
  },
]

/** Una persona de la reunión. `hat` distingue al piso (casco) de la sala de
 * dirección (sin casco) — la misma señal que se lee de lejos en una planta. */
function Figure({ x, y, s, hat, tone }: { x: number; y: number; s: number; hat: boolean; tone: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M-14 0 C-14 -19 -7 -25 0 -25 C7 -25 14 -19 14 0 Z" fill={tone} />
      <circle cx="0" cy="-34" r="8.6" fill={tone} />
      {hat && <path d="M-11 -37 A11 11 0 0 1 11 -37 Z" fill="#F5A03C" />}
    </g>
  )
}

/** El tablero que mira cada nivel. No son adornos: en N1 se revisa el estado
 * del día por pilar, en N2 dónde se concentra el problema, y en N3 hacia
 * dónde va la tendencia. */
function Board({ kind }: { kind: 'smqdcep' | 'pareto' | 'tendencia' }) {
  if (kind === 'smqdcep') {
    const estados = ['#26A69A', '#26A69A', '#F57C00', '#26A69A', '#D32F2F', '#26A69A', '#26A69A']
    // Todas las barras arrancan de la misma línea base y crecen hacia arriba:
    // si cuelgan de un tope fijo con largos distintos se leen como un gráfico
    // invertido, que es justo lo contrario de lo que muestra un tablero.
    const BASE = 92
    return (
      <g>
        {estados.map((c, i) => {
          const h = 24 + ((i * 13) % 22)
          return (
            <g key={i} transform={`translate(${16 + i * 31} 0)`}>
              <rect x="0" y="14" width="20" height="20" rx="4" fill={c} />
              <rect
                className="cascade-bar"
                x="5"
                y={BASE - h}
                width="10"
                height={h}
                rx="3"
                fill="rgba(255,255,255,0.32)"
                style={{ transformOrigin: `10px ${BASE}px`, animationDelay: `${i * 90}ms` }}
              />
            </g>
          )
        })}
      </g>
    )
  }

  if (kind === 'pareto') {
    const alturas = [56, 44, 33, 24, 17, 11]
    return (
      <g transform="translate(18 8)">
        {alturas.map((h, i) => (
          <rect
            key={i}
            className="cascade-bar"
            x={i * 34}
            y={74 - h}
            width="22"
            height={h}
            rx="3"
            fill={i === 0 ? '#F57C00' : 'rgba(255,255,255,0.34)'}
            style={{ transformOrigin: `${i * 34 + 11}px 74px`, animationDelay: `${i * 90}ms` }}
          />
        ))}
        <path
          className="cascade-trace"
          d="M11 18 L45 30 L79 42 L113 52 L147 60 L181 66"
          fill="none"
          stroke="#34C2B3"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </g>
    )
  }

  return (
    <g transform="translate(18 6)">
      <path d="M0 78 L34 62 L68 68 L102 40 L136 30 L170 12" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="8" strokeLinecap="round" />
      <path
        className="cascade-trace"
        d="M0 78 L34 62 L68 68 L102 40 L136 30 L170 12"
        fill="none"
        stroke="#34C2B3"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle className="cascade-trace-dot" cx="170" cy="12" r="5" fill="#34C2B3" />
    </g>
  )
}

export function CascadeSystem() {
  return (
    <svg
      className="cascade-system"
      viewBox="0 0 720 840"
      role="img"
      aria-label="La cascada diaria de LPMS: en el Nivel 1 se reúnen operarios y líder de equipo, en el Nivel 2 los líderes de equipo con el jefe de producción, y en el Nivel 3 la gerencia con el director de planta. Los resultados suben de nivel en nivel y el soporte baja."
    >
      <defs>
        <linearGradient id="cascadeUp" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#26A69A" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#34C2B3" stopOpacity="0.95" />
        </linearGradient>
        <linearGradient id="cascadeDown" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4F9BE8" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#2c4d80" stopOpacity="0.15" />
        </linearGradient>
        <filter id="cascadeGlow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="7" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* --- Las dos corrientes: soporte que baja, resultados que suben --- */}
      <g aria-hidden="true">
        <path
          className="cascade-current"
          d="M96 250 C-6 330 -6 690 96 762"
          fill="none"
          stroke="url(#cascadeDown)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          className="cascade-flow cascade-flow--down"
          d="M96 250 C-6 330 -6 690 96 762"
          fill="none"
          stroke="#7FC0F5"
          strokeWidth="4"
          strokeLinecap="round"
          filter="url(#cascadeGlow)"
        />
        <path d="M96 762 l-15 -9 l3 15 Z" fill="#7FC0F5" />

        <path
          className="cascade-current"
          d="M624 762 C726 690 726 330 624 250"
          fill="none"
          stroke="url(#cascadeUp)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          className="cascade-flow cascade-flow--up"
          d="M624 762 C726 690 726 330 624 250"
          fill="none"
          stroke="#6FE3D5"
          strokeWidth="4"
          strokeLinecap="round"
          filter="url(#cascadeGlow)"
        />
        <path d="M624 250 l15 9 l-3 -15 Z" fill="#6FE3D5" />

        <text className="cascade-flow-label" x="34" y="506" transform="rotate(-90 34 506)">
          Soporte
        </text>
        <text className="cascade-flow-label cascade-flow-label--up" x="690" y="506" transform="rotate(90 690 506)">
          Resultados
        </text>
      </g>

      {/* --- Los tres niveles --- */}
      {TIERS.map((tier, i) => (
        <g key={tier.level} className="cascade-tier" style={{ animationDelay: `${(TIERS.length - 1 - i) * 220}ms` }}>
          <rect x="96" y={tier.y} width="528" height="190" rx="18" className="cascade-platform" />
          <rect x="96" y={tier.y} width="4" height="190" rx="2" fill={tier.accent} />

          <text className="cascade-eyebrow" x="122" y={tier.y + 34} fill={tier.accent}>
            NIVEL {tier.level}
          </text>
          <text className="cascade-team" x="122" y={tier.y + 62}>
            <tspan x="122">{tier.lines[0]}</tspan>
            <tspan x="122" dy="23">
              {tier.lines[1]}
            </tspan>
          </text>

          {/* El anillo de luz del piso, como en la reunión real de pie */}
          <ellipse cx="212" cy={tier.y + 158} rx="88" ry="17" fill="none" stroke={tier.accent} strokeWidth="2" opacity="0.5" />
          <ellipse cx="212" cy={tier.y + 158} rx="88" ry="17" fill={tier.accent} opacity="0.1" />

          <Figure x={158} y={tier.y + 158} s={0.94} hat={tier.level === 1} tone="rgba(255,255,255,0.9)" />
          <Figure x={198} y={tier.y + 163} s={1.06} hat={tier.level === 1} tone="rgba(255,255,255,0.72)" />
          <Figure x={240} y={tier.y + 157} s={0.9} hat={tier.level === 1} tone="rgba(255,255,255,0.86)" />
          <Figure x={274} y={tier.y + 162} s={1} hat={tier.level <= 2} tone="rgba(255,255,255,0.66)" />

          {/* El tablero de ese nivel, como una pantalla de reporte */}
          <g transform={`translate(356 ${tier.y + 26})`}>
            <rect width="242" height="138" rx="10" className="cascade-screen" />
            <rect x="10" y="10" width="222" height="14" rx="4" fill="rgba(255,255,255,0.09)" />
            <circle cx="20" cy="17" r="3" fill={tier.accent} />
            <g transform="translate(0 34)">
              <Board kind={tier.board} />
            </g>
            <rect x="104" y="138" width="34" height="9" rx="2" fill="rgba(255,255,255,0.16)" />
          </g>
        </g>
      ))}
    </svg>
  )
}
