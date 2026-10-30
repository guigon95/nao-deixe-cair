/**
 * Deputado Fominha em SVG (menu do jogo e cartão do hub).
 * Personagem fictício e genérico — não representa nenhuma pessoa real.
 */
export function FominhaFace({ size = 96 }: { size?: number }) {
  return (
    <svg viewBox="-60 -64 120 128" width={size} height={size} aria-hidden="true">
      {/* terno, colarinho e gravata */}
      <path d="M-44 64 Q-44 34 -14 30 L14 30 Q44 34 44 64 Z" fill="#23336a" stroke="#141a33" strokeWidth="2" />
      <path d="M-14 30 L0 46 L14 30 L10 24 L-10 24 Z" fill="#fff" />
      <path d="M-4 30 L4 30 L7 54 L0 62 L-7 54 Z" fill="#e8443a" />
      {/* orelhas */}
      <ellipse cx="-42" cy="0" rx="8" ry="12" fill="#f2b48c" stroke="#3a2a2a" strokeWidth="2" />
      <ellipse cx="42" cy="0" rx="8" ry="12" fill="#f2b48c" stroke="#3a2a2a" strokeWidth="2" />
      {/* rosto */}
      <ellipse cx="0" cy="2" rx="42" ry="40" fill="#ffc8a2" stroke="#3a2a2a" strokeWidth="2" />
      {/* cabelo engomado com topete */}
      <path
        d="M-40 -6 Q-46 -42 -6 -44 Q30 -54 42 -18 Q40 -6 36 -4 Q28 -24 2 -24 Q-24 -28 -40 -6 Z"
        fill="#2b2b3a"
        stroke="#141420"
        strokeWidth="2"
      />
      <path d="M-10 -42 Q10 -37 28 -37" stroke="#8c8ca6" strokeWidth="3" fill="none" />
      {/* bochechas */}
      <ellipse cx="-26" cy="14" rx="10" ry="7" fill="#ff6e78" opacity="0.45" />
      <ellipse cx="26" cy="14" rx="10" ry="7" fill="#ff6e78" opacity="0.45" />
      {/* sobrancelhas e olhos */}
      <path d="M-8 -14 L-24 -18 M8 -14 L24 -18" stroke="#2b2b3a" strokeWidth="5" strokeLinecap="round" />
      <ellipse cx="-14" cy="-5" rx="7.5" ry="8.5" fill="#fff" stroke="#3a2a2a" strokeWidth="1.5" />
      <ellipse cx="14" cy="-5" rx="7.5" ry="8.5" fill="#fff" stroke="#3a2a2a" strokeWidth="1.5" />
      <circle className="fominha-eye" cx="-12" cy="-4" r="3.8" fill="#1d1d2b" />
      <circle className="fominha-eye" cx="16" cy="-4" r="3.8" fill="#1d1d2b" />
      {/* nariz */}
      <ellipse cx="0" cy="6" rx="6" ry="5" fill="#f2a07a" />
      {/* sorrisão de campanha */}
      <path d="M-18 18 Q0 34 18 18 Q0 23 -18 18 Z" fill="#7a1e2e" />
      <path d="M-15 18.5 Q0 24 15 18.5 L13 21.5 Q0 27 -13 21.5 Z" fill="#fff" />
    </svg>
  );
}
