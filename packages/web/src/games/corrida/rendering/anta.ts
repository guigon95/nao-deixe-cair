/**
 * Anta (Tapirus terrestris), montaria robusta: corpo pesado cinza-amarronzado,
 * focinho curto em tromba, orelhas redondas de borda branca e patas curtas.
 * Desenho original, em coordenadas de tela (`y` = altura dos pés).
 */

const BODY = '#5b4c45';
const BODY_DARK = '#43372f';
const BODY_LIGHT = '#74655c';

export interface AntaLook {
  run: number;
  air: boolean;
}

/** Altura (tela) em que a capivara senta nas costas da anta. */
export const ANTA_SEAT_DRAW = 38;

export function drawAnta(ctx: CanvasRenderingContext2D, x: number, y: number, o: AntaLook): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineCap = 'round';
  const bob = o.air ? 0 : -Math.abs(Math.sin(o.run)) * 1.6;
  // Patas (quatro, curtas e grossas), as de trás mais escuras.
  const legs: Array<[number, number]> = [
    [-22, 0],
    [-12, Math.PI],
    [14, Math.PI],
    [24, 0],
  ];
  legs.forEach(([lx, ph], i) => {
    const a = o.run + ph;
    const sw = o.air ? (i < 2 ? -5 : 5) : Math.sin(a) * 6;
    const lift = o.air ? 4 : Math.max(0, Math.cos(a)) * 4;
    ctx.strokeStyle = i % 2 ? BODY_DARK : BODY;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(lx, -18 + bob);
    ctx.lineTo(lx + sw, -2 - lift);
    ctx.stroke();
  });
  ctx.translate(0, bob);
  // Corpo.
  ctx.fillStyle = BODY;
  ctx.beginPath();
  ctx.ellipse(0, -28, 34, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = BODY_LIGHT;
  ctx.beginPath();
  ctx.ellipse(-4, -36, 22, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Cabeça com tromba curta.
  ctx.fillStyle = BODY;
  ctx.beginPath();
  ctx.ellipse(36, -30, 12, 9, 0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = BODY;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(44, -28);
  ctx.quadraticCurveTo(52, -24, 51, -16);
  ctx.stroke();
  ctx.fillStyle = BODY_DARK;
  ctx.beginPath();
  ctx.arc(51, -15, 2.4, 0, Math.PI * 2);
  ctx.fill();
  // Orelha redonda com borda branca.
  ctx.fillStyle = BODY_DARK;
  ctx.strokeStyle = '#efe6dc';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.ellipse(30, -40, 4.5, 6, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Olho.
  ctx.fillStyle = '#16110d';
  ctx.beginPath();
  ctx.arc(40, -33, 1.7, 0, Math.PI * 2);
  ctx.fill();
  // Rabinho.
  ctx.strokeStyle = BODY_DARK;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-33, -30);
  ctx.lineTo(-38, -24);
  ctx.stroke();
  ctx.restore();
}
