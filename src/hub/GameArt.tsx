import type { GameId } from '../shared/storage/keys';

/** Ilustrações dos cartões, desenhadas em SVG (sem imagens de terceiros). */
export function GameArt({ id }: { id: GameId }) {
  return id === 'bolinha' ? <BallArt /> : <PlaneArt />;
}

function BallArt() {
  return (
    <svg viewBox="0 0 200 120" width="100%" height="100%">
      <defs>
        <radialGradient id="ba-ball" cx="35%" cy="35%" r="70%">
          <stop offset="0" stopColor="#fff6c7" />
          <stop offset="0.5" stopColor="#ffd23f" />
          <stop offset="1" stopColor="#d99a00" />
        </radialGradient>
      </defs>
      <rect width="200" height="120" fill="#0b1026" />
      {[
        [20, 18],
        [160, 30],
        [120, 96],
        [60, 100],
        [180, 90],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" fill="#c9d3ff" opacity="0.7" />
      ))}
      <rect x="120" y="0" width="26" height="40" rx="5" fill="#ff5577" />
      <rect x="120" y="82" width="26" height="38" rx="5" fill="#ff5577" />
      <path d="M20 86 Q 50 92 64 70" stroke="#ffd23f" strokeWidth="5" fill="none" opacity="0.3" strokeLinecap="round" />
      <circle className="art-bob" cx="70" cy="60" r="12" fill="url(#ba-ball)" />
    </svg>
  );
}

function PlaneArt() {
  return (
    <svg viewBox="0 0 200 120" width="100%" height="100%">
      <defs>
        <linearGradient id="pa-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a6fdb" />
          <stop offset="1" stopColor="#ffb38a" />
        </linearGradient>
      </defs>
      <rect width="200" height="120" fill="url(#pa-sky)" />
      <path d="M0 108 Q 50 92 100 104 T 200 98 V120 H0 Z" fill="#2f8f5b" />
      <ellipse cx="40" cy="30" rx="22" ry="7" fill="#fff" opacity="0.8" />
      <ellipse cx="160" cy="20" rx="16" ry="5" fill="#fff" opacity="0.7" />
      {/* fumaça desenhando um loop */}
      <path
        d="M10 86 C 50 86 70 80 92 62 C 120 38 116 12 96 12 C 74 12 72 40 96 56 C 112 66 130 66 150 58"
        stroke="#fff"
        strokeWidth="5"
        fill="none"
        opacity="0.75"
        strokeLinecap="round"
        strokeDasharray="1 7"
      />
      <g className="art-plane" transform="translate(156 54) rotate(-18)">
        <rect x="-16" y="-4" width="30" height="8" rx="4" fill="#ff7a45" />
        <rect x="-4" y="-12" width="8" height="24" rx="3" fill="#ffd23f" />
        <path d="M-16 -4 L-22 -10 L-18 -1 Z" fill="#ff7a45" />
        <circle cx="16" cy="0" r="2" fill="#333" />
        <rect className="art-prop" x="16" y="-8" width="2" height="16" rx="1" fill="#dfe6ff" />
      </g>
    </svg>
  );
}
