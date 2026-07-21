import './improvement-cycle.css'

/**
 * Firma visual de LPMS: el ciclo de mejora continua PDCA
 * (Planear · Hacer · Verificar · Actuar) girando lentamente, con una
 * tendencia ascendente al centro — la esencia del negocio, no un adorno.
 * Pensada para ir sobre el azul del hero. Se detiene con prefers-reduced-motion.
 */
export function ImprovementCycle({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`improvement-cycle ${className}`}
      viewBox="0 0 200 200"
      role="img"
      aria-label="Ciclo de mejora continua PDCA con tendencia ascendente"
    >
      <defs>
        <linearGradient id="ci-arc" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#34c2b3" />
          <stop offset="1" stopColor="#8fe6db" />
        </linearGradient>
        <linearGradient id="ci-bar" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="rgba(255,255,255,0.55)" />
          <stop offset="1" stopColor="#8fe6db" />
        </linearGradient>
      </defs>

      {/* Letras P D C A en los cuatro puntos — quietas mientras el ciclo gira. */}
      <g className="improvement-cycle__labels">
        <text x="100" y="15" textAnchor="middle">P</text>
        <text x="188" y="105" textAnchor="middle">D</text>
        <text x="100" y="196" textAnchor="middle">C</text>
        <text x="12" y="105" textAnchor="middle">A</text>
      </g>

      <g className="improvement-cycle__ring">
        {/* Pista base tenue */}
        <circle cx="100" cy="100" r="76" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="9" />
        {/* Arco de avance que recorre el ciclo */}
        <circle
          cx="100"
          cy="100"
          r="76"
          fill="none"
          stroke="url(#ci-arc)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray="334 478"
          transform="rotate(-90 100 100)"
        />
        {/* Punto guía con destello, siempre al frente del arco */}
        <circle cx="27.7" cy="123.5" r="6.5" fill="#ffffff" className="improvement-cycle__lead" />
      </g>

      {/* Tendencia ascendente al centro — el resultado que sube. */}
      <g className="improvement-cycle__bars">
        <rect x="79" y="112" width="9" height="16" rx="1.5" fill="url(#ci-bar)" />
        <rect x="91" y="104" width="9" height="24" rx="1.5" fill="url(#ci-bar)" />
        <rect x="103" y="96" width="9" height="32" rx="1.5" fill="url(#ci-bar)" />
        <rect x="115" y="86" width="9" height="42" rx="1.5" fill="url(#ci-bar)" />
        <path
          d="M77 118 L120 82"
          stroke="#ffffff"
          strokeWidth="2.4"
          strokeLinecap="round"
          fill="none"
          opacity="0.85"
        />
        <path d="M112 82 L121 81 L120 90" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.85" />
      </g>
    </svg>
  )
}
