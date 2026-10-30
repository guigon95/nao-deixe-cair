/**
 * A capivara (personagem do jogo), desenhada com Canvas 2D — sem imagens.
 * Fiel à de verdade: corpo de barril com a garupa mais alta, sem rabo, pelo
 * grosso marrom-avermelhado (barriga mais clara), cabeção retangular de
 * focinho alto e rombudo com a glândula escura em cima, olhos e orelhinhas
 * no alto da cabeça e patas com pés escuros. Para planar, segura uma folha de bananeira.
 * Coordenadas da arena (y para baixo); (x, y) = pés.
 */

export type Pose = 'run' | 'rise' | 'fall' | 'glide' | 'dash' | 'dead' | 'idle';

export interface CapivaraLook {
  pose: Pose;
  /** Fase da corrida (rad). */
  run: number;
  /** 0..1: amassado do pouso / toque. */
  squash: number;
  /** Tempo (s), para o balanço da folha. */
  time: number;
  /** Rotação do corpo (derrota, inclinação). */
  tilt: number;
}

export const CAPIVARA = {
  /** Pelo: dorso mais escuro e avermelhado, barriga mais clara e amarelada. */
  back: '#7f5232',
  body: '#9c6a3f',
  belly: '#c39860',
  bodyDark: '#5b3a1f',
  feet: '#3d2715',
  snout: '#4a2f1b',
  /** "Morrillo": a glândula escura em cima do focinho. */
  gland: '#2f1d10',
  leaf: '#4caf50',
  leafDark: '#2e7d32',
} as const;

/** Quadril (x, y) e fase de cada perna: traseiras (coxa grossa) e dianteiras. */
const LEGS: ReadonlyArray<readonly [number, number, number, boolean]> = [
  // x, y do quadril, fase, é traseira
  [-15, -12, 0, true],
  [7, -11, Math.PI, false],
  [-11, -12, Math.PI, true],
  [11, -11, 0, false],
];

export function drawCapivara(ctx: CanvasRenderingContext2D, x: number, y: number, o: CapivaraLook): void {
  ctx.save();
  ctx.translate(x, y);
  const sq = o.squash;
  ctx.scale(1 + sq * 0.12, 1 - sq * 0.18);
  const bob = o.pose === 'run' || o.pose === 'idle' ? -Math.abs(Math.sin(o.run)) * 1.8 : 0;
  ctx.translate(0, bob);
  if (o.tilt) {
    ctx.translate(0, -17);
    ctx.rotate(o.tilt);
    ctx.translate(0, 17);
  }

  // Planando: em pé, segurando a folha com as patas da frente.
  if (o.pose === 'glide') {
    drawGlider(ctx, o);
    ctx.restore();
    return;
  }

  // ── pernas: as de longe primeiro (mais escuras), depois as de perto ──
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const far of [true, false]) {
    for (let i = 0; i < LEGS.length; i++) {
      if ((i >= 2) !== far) continue;
      const [hx, hy, ph, hind] = LEGS[i];
      let ang = 0;
      let len = hind ? 9 : 9.5;
      if (o.pose === 'run' || o.pose === 'idle') ang = Math.sin(o.run + ph) * 0.8;
      else if (o.pose === 'rise') {
        ang = hind ? 0.9 : -0.9;
        len -= 2;
      } else if (o.pose === 'fall') {
        ang = hind ? -0.25 : 0.25;
        len += 0.5;
      } else if (o.pose === 'dash') {
        ang = hind ? 1.1 : -1.15;
        len -= 1;
      } else if (o.pose === 'dead') ang = i % 2 ? 1.4 : -1.4;
      const fx = hx + Math.sin(ang) * len;
      const fy = hy + Math.cos(ang) * len;
      ctx.strokeStyle = far ? CAPIVARA.bodyDark : '#875832';
      ctx.lineWidth = hind ? 6 : 5;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(fx, fy);
      ctx.stroke();
      // Pé escuro (meio palmado).
      ctx.fillStyle = CAPIVARA.feet;
      ctx.beginPath();
      ctx.ellipse(fx + 1.2, fy, 3.4, 1.8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (far) drawBody(ctx, o);
  }

  drawHead(ctx, o);
  ctx.restore();
}

/** Corpo de barril, garupa alta e redonda (sem rabo), pelo grosso. */
function drawBody(ctx: CanvasRenderingContext2D, o: CapivaraLook): void {
  const lean = o.pose === 'rise' ? -0.08 : o.pose === 'fall' ? 0.06 : 0;
  ctx.save();
  ctx.rotate(lean);
  const g = ctx.createLinearGradient(0, -33, 0, -8);
  g.addColorStop(0, CAPIVARA.back);
  g.addColorStop(0.55, CAPIVARA.body);
  g.addColorStop(1, CAPIVARA.belly);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(12, -12); // peito
  ctx.quadraticCurveTo(14, -22, 8, -27); // ombro
  ctx.quadraticCurveTo(-4, -32, -15, -31); // costas subindo para a garupa
  ctx.quadraticCurveTo(-25, -29, -24, -18); // garupa redonda
  ctx.quadraticCurveTo(-23, -9, -14, -9); // coxa
  ctx.quadraticCurveTo(-2, -7, 12, -12); // barriga
  ctx.closePath();
  ctx.fill();
  // Coxa traseira marcada.
  ctx.strokeStyle = 'rgba(60, 35, 15, 0.35)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(-15, -17, 7.5, -0.4, Math.PI * 0.75);
  ctx.stroke();
  // Pelo grosso: tracinhos nas costas e no flanco.
  ctx.strokeStyle = 'rgba(55, 32, 14, 0.28)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  for (const [fx, fy] of FUR) {
    ctx.moveTo(fx, fy);
    ctx.quadraticCurveTo(fx - 1.6, fy + 0.8, fx - 2.2, fy + 2.2);
  }
  ctx.stroke();
  // Brilho suave no dorso (pelo volumoso).
  ctx.strokeStyle = 'rgba(255, 220, 170, 0.18)';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-18, -27.5);
  ctx.quadraticCurveTo(-6, -30.5, 5, -26.5);
  ctx.stroke();
  ctx.restore();
}

/** Tracinhos do pelo (posições fixas). */
const FUR: ReadonlyArray<readonly [number, number]> = [
  [-16, -28.5],
  [-9, -29.6],
  [-2, -28.8],
  [-20, -21],
  [-6, -23],
];

/** Cabeção retangular, focinho alto e rombudo, olhos e orelhas no alto. */
function drawHead(ctx: CanvasRenderingContext2D, o: CapivaraLook): void {
  const g = ctx.createLinearGradient(0, -37, 0, -14);
  g.addColorStop(0, CAPIVARA.back);
  g.addColorStop(1, CAPIVARA.body);
  // Orelha (atrás da cabeça, pequena e redonda).
  ctx.fillStyle = CAPIVARA.bodyDark;
  ctx.beginPath();
  ctx.ellipse(9.5, -35, 3.2, 3.6, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#7a4a2e';
  ctx.beginPath();
  ctx.ellipse(10, -34.6, 1.5, 1.9, -0.3, 0, Math.PI * 2);
  ctx.fill();
  // Cabeça e pescoço grosso.
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(4, -28);
  ctx.quadraticCurveTo(6, -35, 14, -35.5); // alto da cabeça
  ctx.lineTo(25, -34); // testa reta
  ctx.quadraticCurveTo(31, -33.5, 33, -29); // começo do focinho
  ctx.quadraticCurveTo(35, -24, 33.5, -19); // ponta rombuda
  ctx.quadraticCurveTo(32, -15.5, 27, -15.5); // queixo
  ctx.quadraticCurveTo(19, -15, 13, -13); // mandíbula
  ctx.quadraticCurveTo(6, -15, 4, -28);
  ctx.closePath();
  ctx.fill();
  // Focinho mais escuro e a glândula (morrillo) em cima.
  ctx.fillStyle = CAPIVARA.snout;
  ctx.beginPath();
  ctx.moveTo(27.5, -33.6);
  ctx.quadraticCurveTo(31, -33.5, 33, -29);
  ctx.quadraticCurveTo(35, -24, 33.5, -19);
  ctx.quadraticCurveTo(32, -15.5, 28, -15.6);
  ctx.quadraticCurveTo(29.5, -25, 27.5, -33.6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(47, 29, 16, 0.75)';
  ctx.beginPath();
  ctx.ellipse(24.5, -33.4, 2.6, 1.1, 0.05, 0, Math.PI * 2);
  ctx.fill();
  // Narina no alto da ponta, boca e bigodes.
  ctx.fillStyle = '#160d06';
  ctx.beginPath();
  ctx.ellipse(32.2, -26.5, 0.9, 1.6, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#1d120a';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(33, -19.5);
  ctx.quadraticCurveTo(31, -18.2, 28.5, -18.8);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(30, 18, 8, 0.6)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(31, -22);
  ctx.lineTo(36.5, -23.5);
  ctx.moveTo(31, -21);
  ctx.lineTo(36.5, -20.5);
  ctx.stroke();
  // Olho pequeno, alto e recuado na cabeça.
  const ex = 17.5;
  const ey = -30.5;
  if (o.pose === 'dead') {
    ctx.strokeStyle = '#1b120a';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(ex - 1.6, ey - 1.6);
    ctx.lineTo(ex + 1.6, ey + 1.6);
    ctx.moveTo(ex + 1.6, ey - 1.6);
    ctx.lineTo(ex - 1.6, ey + 1.6);
    ctx.stroke();
  } else if (o.pose === 'run' || o.pose === 'idle') {
    // Pálpebra pesada: a calma de sempre.
    ctx.fillStyle = '#1b120a';
    ctx.beginPath();
    ctx.ellipse(ex, ey + 0.3, 1.7, 1.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = CAPIVARA.bodyDark;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(ex - 2.4, ey - 0.4);
    ctx.quadraticCurveTo(ex, ey - 1.6, ex + 2.4, ey - 0.4);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#1b120a';
    ctx.beginPath();
    ctx.arc(ex, ey, 1.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ex + 0.6, ey - 0.6, 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Planando: a capivara fica em pé, com as patas de trás penduradas e as da
 * frente erguidas segurando o talo da folha de bananeira acima da cabeça.
 */
function drawGlider(ctx: CanvasRenderingContext2D, o: CapivaraLook): void {
  const t = o.time;
  const swing = Math.sin(t * 5) * 0.12;
  // Patas de trás penduradas (balançam com o vento).
  ctx.lineCap = 'round';
  for (const [hx, ph, far] of [
    [-5, 0, true],
    [3, 1.3, false],
  ] as const) {
    const a = swing + Math.sin(t * 7 + ph) * 0.1;
    const fx = hx + Math.sin(a) * 9;
    const fy = -13 + Math.cos(a) * 9;
    ctx.strokeStyle = far ? CAPIVARA.bodyDark : '#875832';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(hx, -13);
    ctx.lineTo(fx, fy);
    ctx.stroke();
    ctx.fillStyle = CAPIVARA.feet;
    ctx.beginPath();
    ctx.ellipse(fx + 1, fy, 3.2, 1.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Braços erguidos (por trás da cabeça) até o talo, acima da cabeça.
  const grip = { x: 4, y: -66 };
  ctx.strokeStyle = CAPIVARA.bodyDark;
  ctx.lineWidth = 4.6;
  ctx.beginPath();
  ctx.moveTo(-5, -38);
  ctx.quadraticCurveTo(-8, -54, grip.x - 2, grip.y + 3);
  ctx.stroke();
  ctx.strokeStyle = '#875832';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(1, -39);
  ctx.quadraticCurveTo(-1, -55, grip.x + 1, grip.y + 2);
  ctx.stroke();
  // Corpo em pé: barriga clara virada para frente, dorso escuro atrás.
  const g = ctx.createLinearGradient(-12, 0, 12, 0);
  g.addColorStop(0, CAPIVARA.back);
  g.addColorStop(0.55, CAPIVARA.body);
  g.addColorStop(1, CAPIVARA.belly);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-2, -42); // nuca
  ctx.quadraticCurveTo(-13, -38, -12, -24); // costas
  ctx.quadraticCurveTo(-12, -10, -2, -10); // garupa embaixo
  ctx.quadraticCurveTo(9, -10, 10, -22); // barriga
  ctx.quadraticCurveTo(11, -36, 6, -42); // peito
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(55, 32, 14, 0.28)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-9, -32);
  ctx.quadraticCurveTo(-10, -30, -9.5, -28);
  ctx.moveTo(-8, -22);
  ctx.quadraticCurveTo(-9, -20, -8.5, -18);
  ctx.stroke();
  // Cabeça no alto, olhando para frente (olho aberto: atenta ao vento).
  ctx.save();
  ctx.translate(-6, -21);
  ctx.rotate(-0.08);
  drawHead(ctx, { ...o, pose: 'fall' });
  ctx.restore();
  drawLeaf(ctx, t, grip.x, grip.y);
  // Patinhas fechadas no talo.
  ctx.fillStyle = CAPIVARA.feet;
  ctx.beginPath();
  ctx.ellipse(grip.x - 1, grip.y + 3, 2.6, 2, 0, 0, Math.PI * 2);
  ctx.ellipse(grip.x + 1.5, grip.y + 1, 2.6, 2, 0, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Folha de bananeira com vento: a borda ondula (mais na ponta de trás, que
 * recebe o vento), a folha inclina e arqueia com as rajadas, e uns fiapos de
 * vento passam por ela.
 */
function drawLeaf(ctx: CanvasRenderingContext2D, time: number, gx: number, gy: number): void {
  // Talo das patas até o meio da folha.
  const gust = Math.sin(time * 2.3) * 0.5 + Math.sin(time * 5.1) * 0.25;
  const top = { x: gx - 2 + gust * 1.5, y: gy - 14 };
  ctx.strokeStyle = CAPIVARA.leafDark;
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(gx, gy + 6);
  ctx.quadraticCurveTo(gx + 1, gy - 6, top.x, top.y);
  ctx.stroke();
  ctx.save();
  ctx.translate(top.x, top.y - 2);
  // Inclina com a rajada (a frente levanta um pouco) e treme.
  ctx.rotate(-0.1 + gust * 0.07 + Math.sin(time * 13) * 0.02);
  const L = 34;
  const N = 16;
  // Arqueado: pontas descem; com a rajada, a de trás sobe.
  const bend = 5 + gust * 3;
  const edge = (u: number, side: number) => {
    // u de -1 (trás, esquerda) a 1 (frente, direita)
    const w = 9.5 * Math.sqrt(Math.max(0, 1 - u * u));
    const tail = (1 - u) / 2; // 1 na ponta de trás
    const ripple = Math.sin(u * 9 + time * 16) * (0.6 + 2.4 * tail) + Math.sin(u * 17 - time * 23) * 0.6 * tail;
    return { x: u * L, y: bend * u * u - side * w + ripple };
  };
  ctx.fillStyle = CAPIVARA.leaf;
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const p = edge(-1 + (2 * i) / N, 1);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  for (let i = N; i >= 0; i--) {
    const p = edge(-1 + (2 * i) / N, -1);
    ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.fill();
  // Nervura e rasgos (acompanham o arco e a ondulação).
  ctx.strokeStyle = CAPIVARA.leafDark;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const u = -1 + (2 * i) / N;
    const p = edge(u, 0);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  for (let k = -3; k <= 3; k++) {
    if (k === 0) continue;
    const u = k / 4;
    const a = edge(u, 0);
    const b = edge(u + 0.12, -0.85);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
  // Brilho da folha.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let i = 3; i <= N - 3; i++) {
    const p = edge(-1 + (2 * i) / N, 0.6);
    if (i === 3) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  ctx.restore();
  // Fiapos de vento passando por cima da folha (da frente para trás).
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.lineWidth = 1.3;
  for (let k = 0; k < 3; k++) {
    const ph = (time * 1.6 + k / 3) % 1;
    const wx = top.x + 44 - ph * 96;
    const wy = top.y - 16 + k * 7 + Math.sin(ph * 6 + k) * 2;
    const len = 10 + k * 3;
    ctx.globalAlpha = Math.sin(ph * Math.PI);
    ctx.beginPath();
    ctx.moveTo(wx, wy);
    ctx.quadraticCurveTo(wx - len * 0.5, wy - 2, wx - len, wy);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
