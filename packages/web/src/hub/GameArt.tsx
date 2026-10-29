import type { GameId } from '../shared/storage/keys';

/** Ilustrações dos cartões, desenhadas em SVG (sem imagens de terceiros). */
export function GameArt({ id }: { id: GameId }) {
  if (id === 'bolinha') return <BallArt />;
  if (id === 'corrida') return <RunnerArt />;
  return <PlaneArt />;
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

/** Disparada: a capivara pulando o rio do jacaré, capim em arco e o enxame atrás. */
function RunnerArt() {
  return (
    <svg viewBox="0 0 200 120" width="100%" height="100%">
      <defs>
        <linearGradient id="ra-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5fc3f2" />
          <stop offset="1" stopColor="#d8f3c9" />
        </linearGradient>
      </defs>
      <rect width="200" height="120" fill="url(#ra-sky)" />
      <path d="M0 80 Q 30 56 60 72 T 120 66 T 200 70 V120 H0 Z" fill="#8cc9a0" />
      {[18, 70, 176].map((x) => (
        <g key={x}>
          <rect x={x - 2} y="52" width="4" height="40" fill="#3c7d4e" />
          <circle cx={x} cy="50" r="16" fill="#4f9a63" />
        </g>
      ))}
      <rect y="94" width="200" height="26" fill="#8a5a33" />
      <rect y="91" width="200" height="7" fill="#58b548" />
      {/* rio com o jacaré */}
      <rect x="96" y="91" width="56" height="29" fill="#2f86c6" />
      <ellipse cx="128" cy="101" rx="11" ry="2.4" fill="#3f5d2a" />
      <ellipse cx="114" cy="100" rx="4" ry="3" fill="#3f5d2a" />
      <ellipse cx="121" cy="100" rx="4" ry="3" fill="#3f5d2a" />
      <circle cx="114.5" cy="99" r="1.2" fill="#e8f27a" />
      <circle cx="121.5" cy="99" r="1.2" fill="#e8f27a" />
      {[
        [92, 64],
        [108, 50],
        [124, 46],
        [140, 52],
      ].map(([x, y]) => (
        <g key={x} stroke="#b6f04a" strokeWidth="2.2" strokeLinecap="round">
          <circle cx={x} cy={y - 4} r="6" fill="#fffde0" fillOpacity="0.5" stroke="none" />
          <path d={`M${x - 3} ${y} L${x - 5} ${y - 8} M${x} ${y} L${x} ${y - 10} M${x + 3} ${y} L${x + 5} ${y - 8}`} />
        </g>
      ))}
      {[
        [14, 70],
        [22, 82],
        [8, 86],
        [28, 66],
        [18, 58],
        [4, 74],
      ].map(([x, y]) => (
        <ellipse key={`${x}-${y}`} cx={x} cy={y} rx="3" ry="2" fill="#ffcc33" />
      ))}
      <g className="art-bob" transform="translate(84 74) rotate(-8)">
        <path d="M-12 6 L-13 13 M-6 7 L-5 13 M6 7 L5 13 M11 6 L13 12" stroke="#6e4826" strokeWidth="4" strokeLinecap="round" />
        <ellipse cx="-2" cy="0" rx="16" ry="10" fill="#9a6a40" />
        <path d="M6 -12 L18 -12 Q 25 -11 25 -5 Q 25 1 19 1 L8 3 Q 4 -4 6 -12 Z" fill="#9a6a40" />
        <path d="M20 -11 Q 25 -10 25 -5 Q 25 1 20 1.4 Z" fill="#5a3a20" />
        <circle cx="9" cy="-13" r="2.6" fill="#6e4826" />
        <path d="M13.5 -8.6 a1.6 1.6 0 0 0 3 0" stroke="#1b120a" strokeWidth="1.3" fill="none" />
      </g>
    </svg>
  );
}
