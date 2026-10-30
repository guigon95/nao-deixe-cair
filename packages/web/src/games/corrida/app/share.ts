import { drawCapivara } from '../rendering/capivara';

/** O que vai na imagem de compartilhar. */
export interface ShareData {
  score: number;
  meters: number;
  fruits: number;
  isNewRecord: boolean;
  /** Posição no ranking da semana (online), se houver. */
  weekPosition?: number;
  name?: string;
}

export const SHARE_URL = 'https://nao-deixe-cair.vercel.app/corrida/';
const SIZE = 1080;

export function shareText(d: ShareData): string {
  const pos = d.weekPosition ? ` e fiquei em ${d.weekPosition}º na semana` : '';
  return `Fiz ${d.score} pontos na Disparada correndo ${d.meters} m de capivara${pos}! Consegue me passar? 🦫🌿`;
}

/** Desenha o cartão (1080×1080) com a capivara e o resultado. */
export function drawShareCard(ctx: CanvasRenderingContext2D, d: ShareData): void {
  const S = SIZE;
  // Céu e morros.
  const sky = ctx.createLinearGradient(0, 0, 0, S);
  sky.addColorStop(0, '#5cc2f2');
  sky.addColorStop(0.62, '#bfe9d8');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#8cc9a0';
  ctx.beginPath();
  ctx.moveTo(0, 700);
  ctx.quadraticCurveTo(270, 600, 540, 680);
  ctx.quadraticCurveTo(810, 760, S, 650);
  ctx.lineTo(S, S);
  ctx.lineTo(0, S);
  ctx.fill();
  // Chão.
  ctx.fillStyle = '#57b84a';
  ctx.fillRect(0, 820, S, 26);
  ctx.fillStyle = '#8a5a32';
  ctx.fillRect(0, 846, S, S - 846);
  // Capins em arco e a capivara pulando.
  ctx.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    const a = Math.PI * (0.15 + i * 0.17);
    const cx = 620 + Math.cos(a) * -260;
    const cy = 640 - Math.sin(a) * 150;
    ctx.fillStyle = 'rgba(255, 248, 214, 0.9)';
    ctx.beginPath();
    ctx.arc(cx, cy, 26, 0, Math.PI * 2);
    ctx.fill();
    for (const [dx, h, lean, col] of [
      [-9, 26, -7, '#2f7d32'],
      [-3, 32, -2, '#57b84a'],
      [3, 32, 3, '#2f7d32'],
      [9, 26, 8, '#57b84a'],
    ] as const) {
      ctx.strokeStyle = col;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(cx + dx * 0.8, cy + 13);
      ctx.quadraticCurveTo(cx + dx + lean * 0.4, cy + 13 - h * 0.6, cx + dx + lean, cy + 13 - h);
      ctx.stroke();
    }
    ctx.fillStyle = '#e0a03a';
    ctx.fillRect(cx - 11, cy + 6, 22, 7);
  }
  ctx.save();
  ctx.translate(560, 790);
  ctx.rotate(-0.12);
  ctx.scale(6.2, 6.2);
  drawCapivara(ctx, 0, 0, { pose: 'rise', run: 0, squash: 0, time: 0, tilt: 0 });
  ctx.restore();
  // Título.
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';
  ctx.font = '900 110px system-ui, sans-serif';
  ctx.lineWidth = 14;
  ctx.strokeStyle = 'rgba(40, 25, 5, 0.55)';
  ctx.strokeText('DISPARADA', S / 2, 150);
  ctx.fillStyle = '#ffb347';
  ctx.fillText('DISPARADA', S / 2, 150);
  // Pontos.
  ctx.font = '900 200px system-ui, sans-serif';
  ctx.lineWidth = 16;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.strokeText(String(d.score), S / 2, 360);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(d.score), S / 2, 360);
  ctx.font = '800 48px system-ui, sans-serif';
  ctx.lineWidth = 8;
  const sub = `pontos · ${d.meters} m · ${d.fruits} ${d.fruits === 1 ? 'capim' : 'capins'}`;
  ctx.strokeText(sub, S / 2, 430);
  ctx.fillText(sub, S / 2, 430);
  // Selo de recorde / posição na semana.
  const badge = d.isNewRecord ? '★ NOVO RECORDE ★' : d.weekPosition ? `🏆 ${d.weekPosition}º DA SEMANA` : null;
  if (badge) {
    ctx.font = '900 46px system-ui, sans-serif';
    const w = ctx.measureText(badge).width + 60;
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.roundRect(S / 2 - w / 2, 465, w, 70, 35);
    ctx.fill();
    ctx.fillStyle = '#3a240f';
    ctx.fillText(badge, S / 2, 517);
  }
  // Desafio e link.
  ctx.font = '900 54px system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = 10;
  ctx.strokeStyle = 'rgba(40, 25, 5, 0.6)';
  ctx.strokeText('Consegue me passar?', S / 2, 940);
  ctx.fillText('Consegue me passar?', S / 2, 940);
  ctx.font = '700 36px system-ui, sans-serif';
  ctx.fillStyle = '#ffe9c4';
  ctx.fillText('nao-deixe-cair.vercel.app', S / 2, 1010);
}

/** Gera a imagem PNG do cartão. */
export async function shareImage(d: ShareData): Promise<Blob | null> {
  const c = document.createElement('canvas');
  c.width = SIZE;
  c.height = SIZE;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  drawShareCard(ctx, d);
  return new Promise((res) => c.toBlob((b) => res(b), 'image/png'));
}

export type ShareOutcome = 'shared' | 'cancelled' | 'downloaded' | 'copied' | 'failed';

/**
 * Compartilha: com o menu do celular (imagem + texto), quando dá; senão baixa
 * a imagem e copia o texto com o link.
 */
export async function shareResult(d: ShareData): Promise<ShareOutcome> {
  const text = shareText(d);
  const blob = await shareImage(d).catch(() => null);
  const file = blob ? new File([blob], 'disparada.png', { type: 'image/png' }) : null;
  const nav = navigator as Navigator & { canShare?: (data: { files?: File[] }) => boolean };
  try {
    if (file && nav.share && nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], text: `${text}\n${SHARE_URL}`, title: 'Disparada' });
      return 'shared';
    }
    if (nav.share) {
      await nav.share({ text, url: SHARE_URL, title: 'Disparada' });
      return 'shared';
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
  }
  // Sem menu de compartilhar: baixa a imagem e copia o texto.
  try {
    if (blob) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'disparada.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }
    await navigator.clipboard?.writeText(`${text}\n${SHARE_URL}`).catch(() => undefined);
    return blob ? 'downloaded' : 'copied';
  } catch {
    return 'failed';
  }
}
