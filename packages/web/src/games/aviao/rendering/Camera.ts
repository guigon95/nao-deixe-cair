import { ARENA, CAMERA } from '../game/config';

/**
 * Câmera suave: segue o avião sem girar (nada de enjoo), afasta com a
 * velocidade e com a altura (para o chão continuar à vista) e olha um
 * pouco à frente na direção do voo.
 */
export class Camera {
  /** Ponto do mundo que fica no centro vertical e em CAMERA.planeX na horizontal. */
  x = 0;
  y = 0;
  zoom = 1;

  reset(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.zoom = 1;
  }

  update(px: number, py: number, phi: number, speedNorm: number, altitude: number, dt: number, snap = false): void {
    const zSpeed = CAMERA.zoomSlow + (CAMERA.zoomFast - CAMERA.zoomSlow) * Math.min(1, Math.max(0, speedNorm));
    // Altura: o chão precisa caber na metade de baixo da tela.
    const zAlt = (ARENA.height * 0.42) / Math.max(1, altitude + 110);
    const targetZoom = Math.max(CAMERA.zoomMin, Math.min(zSpeed, zAlt));
    // Olha à frente na direção do voo (menos na vertical, para não balançar nos loops).
    const tx = px + Math.cos(phi) * 30;
    const ty = py + Math.sin(phi) * 18;
    if (snap) {
      this.x = tx;
      this.y = ty;
      this.zoom = targetZoom;
      return;
    }
    const k = 1 - Math.exp(-CAMERA.follow * dt);
    const kz = 1 - Math.exp(-CAMERA.zoomFollow * dt);
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * k;
    this.zoom += (targetZoom - this.zoom) * kz;
    // Nunca deixa o avião sair da tela, mesmo numa guinada brusca.
    const halfW = (ARENA.width / 2) / this.zoom - 30;
    const halfH = (ARENA.height / 2) / this.zoom - 40;
    const dx = px - this.x;
    const dy = py - this.y;
    if (dx > halfW) this.x = px - halfW;
    if (dx < -halfW * 0.6) this.x = px + halfW * 0.6;
    if (dy > halfH) this.y = py - halfH;
    if (dy < -halfH) this.y = py + halfH;
  }

  /** Mundo → arena (x para a direita, y para baixo). */
  sx(wx: number): number {
    return ARENA.width * CAMERA.planeX + (wx - this.x) * this.zoom;
  }

  sy(wy: number): number {
    return ARENA.height * 0.5 - (wy - this.y) * this.zoom;
  }

  /** Arena → mundo (x). */
  wx(sx: number): number {
    return this.x + (sx - ARENA.width * CAMERA.planeX) / this.zoom;
  }
}
