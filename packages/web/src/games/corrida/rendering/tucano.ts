/**
 * Tucano (Ramphastos toco): corpo preto, papo branco, bico enorme laranja com
 * ponta preta, olho com anel azul e asas batendo. Desenho original, em
 * coordenadas de tela (`y` = altura das patas, que seguram a capivara).
 */

export interface TucanoLook {
  /** Fase da batida de asas (rad). */
  flap: number;
  /** Piscando (cansado, nos últimos segundos). */
  blink: boolean;
}

export function drawTucano(ctx: CanvasRenderingContext2D, x: number, y: number, o: TucanoLook): void {
  ctx.save();
  if (o.blink) ctx.globalAlpha = 0.45;
  ctx.translate(x, y);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Patinhas (seguram as costas da capivara).
  ctx.strokeStyle = '#5a6c86';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-4, -10);
  ctx.lineTo(-6, 0);
  ctx.moveTo(4, -10);
  ctx.lineTo(4, 0);
  ctx.stroke();
  // Asa de trás.
  const wing = Math.sin(o.flap);
  ctx.fillStyle = '#141414';
  ctx.beginPath();
  ctx.moveTo(-4, -22);
  ctx.quadraticCurveTo(-22, -30 - wing * 16, -30, -22 - wing * 22);
  ctx.quadraticCurveTo(-16, -18, -2, -16);
  ctx.closePath();
  ctx.fill();
  // Rabo com a pena vermelha embaixo.
  ctx.fillStyle = '#d7263d';
  ctx.beginPath();
  ctx.ellipse(-14, -12, 5, 3, 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#141414';
  ctx.beginPath();
  ctx.moveTo(-12, -18);
  ctx.lineTo(-26, -8);
  ctx.lineTo(-22, -4);
  ctx.lineTo(-8, -12);
  ctx.closePath();
  ctx.fill();
  // Corpo.
  ctx.beginPath();
  ctx.ellipse(0, -20, 13, 11, -0.15, 0, Math.PI * 2);
  ctx.fill();
  // Papo branco-amarelado.
  ctx.fillStyle = '#fff4d6';
  ctx.beginPath();
  ctx.ellipse(8, -24, 6, 7, -0.2, 0, Math.PI * 2);
  ctx.fill();
  // Cabeça.
  ctx.fillStyle = '#141414';
  ctx.beginPath();
  ctx.arc(9, -31, 7, 0, Math.PI * 2);
  ctx.fill();
  // Bico enorme.
  ctx.fillStyle = '#ff8a1c';
  ctx.beginPath();
  ctx.moveTo(13, -36);
  ctx.quadraticCurveTo(30, -38, 38, -28);
  ctx.quadraticCurveTo(28, -27, 14, -27);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffc93c';
  ctx.beginPath();
  ctx.moveTo(14, -35);
  ctx.quadraticCurveTo(24, -36, 30, -33);
  ctx.lineTo(15, -32);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#141414';
  ctx.beginPath();
  ctx.moveTo(33, -32);
  ctx.quadraticCurveTo(37, -31, 38, -28);
  ctx.lineTo(34, -28);
  ctx.closePath();
  ctx.fill();
  // Olho com anel azul.
  ctx.fillStyle = '#3d8bff';
  ctx.beginPath();
  ctx.arc(10, -32, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0b0b0b';
  ctx.beginPath();
  ctx.arc(10.5, -32, 1.4, 0, Math.PI * 2);
  ctx.fill();
  // Asa da frente.
  ctx.fillStyle = '#222222';
  ctx.beginPath();
  ctx.moveTo(-2, -24);
  ctx.quadraticCurveTo(-14, -34 - wing * 20, -24, -30 - wing * 26);
  ctx.quadraticCurveTo(-10, -22, 2, -18);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
