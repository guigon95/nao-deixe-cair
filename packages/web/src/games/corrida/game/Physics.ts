import { BODY, DASH, JUMP, PIT_DEATH_Y, SWARM, TOCA, VINE, type JumpParams } from './config';
import type { Level } from './Level';
import type { Crate, DeathCause, Fruit, Rock, Runner, Spring, Thorns, Vine } from './types';

/** Comandos de UM passo de simulação. */
export interface Controls {
  /** Dedo/tecla pressionado agora. */
  hold: boolean;
  /** Toque começou neste passo (borda). */
  pressed: boolean;
  /** Deslizar para baixo / ↓ neste passo. */
  drop: boolean;
}

/**
 * Efeitos colaterais da física. O motor do jogo marca caixotes quebrados,
 * capins comidos etc.; o piloto automático usa uma versão que só observa.
 */
export interface StepSink {
  jump(r: Runner): void;
  land(r: Runner, hard: boolean): void;
  crate(c: Crate, stomp: boolean, r: Runner): void;
  smash(o: Rock | Thorns, r: Runner): void;
  spring(s: Spring, r: Runner): void;
  fruit(f: Fruit, r: Runner): void;
  grab(v: Vine, r: Runner): void;
  letGo(r: Runner): void;
  /** Saiu da toca (lançada pelo buraco de saída). */
  burrowOut?(r: Runner): void;
}

export const NULL_SINK: StepSink = {
  jump() {},
  land() {},
  crate() {},
  smash() {},
  spring() {},
  fruit() {},
  grab() {},
  letGo() {},
};

/** Metade da largura dos "pés": quanto do corpo precisa estar sobre o apoio. */
const FOOT = 8;
/** Pousar de quina: se o corpo afundou só isto no topo, sobe em vez de bater. */
const STEP_UP = 7;
/** Raio de coleta dos capins (somado à caixa do corpo). */
const FRUIT_R = 13;

export function createRunner(x = 0): Runner {
  return {
    x,
    y: 0,
    prevX: x,
    prevY: 0,
    vy: 0,
    grounded: true,
    airTime: 0,
    jumped: false,
    cut: true,
    glideTime: 0,
    gliding: false,
    fastFall: false,
    dropThrough: 0,
    buffer: 0,
    dash: 0,
    dashTail: 0,
    tank: false,
    swinging: false,
    swAx: 0,
    swAy: 0,
    swL: 1,
    swTh: 0,
    swOm: 0,
    vineCooldown: 0,
    slow: 1,
    landedAt: 10,
    justLanded: false,
  };
}

export function cloneRunner(r: Runner): Runner {
  return { ...r };
}

/** Velocidade horizontal efetiva (u/s). */
export function runnerSpeed(r: Runner, base: number): number {
  return base * r.slow * (r.dash > 0 ? DASH.speedFactor : 1);
}

/**
 * Um passo da física da capivara. Retorna a causa da morte, ou null.
 * Não aloca memória: seguro para rodar 120×/s e para o planejador.
 */
export function stepRunner(
  r: Runner,
  ctl: Controls,
  level: Level,
  baseSpeed: number,
  dt: number,
  sink: StepSink = NULL_SINK,
  P: JumpParams = JUMP,
): DeathCause | null {
  r.prevX = r.x;
  r.prevY = r.y;
  r.justLanded = false;
  r.landedAt += dt;
  if (r.slow < 1) r.slow = Math.min(1, r.slow + ((1 - SWARM.slowFactor) / SWARM.slowRecover) * dt);
  if (r.dropThrough > 0) r.dropThrough -= dt;
  if (r.dashTail > 0) r.dashTail -= dt;
  if (r.vineCooldown > 0) r.vineCooldown -= dt;

  if (r.swinging) {
    swingStep(r, ctl, dt, sink);
    return collide(r, level, sink);
  }

  // ── comandos ──
  if (ctl.pressed) r.buffer = P.jumpBuffer;
  else if (r.buffer > 0) r.buffer = Math.max(0, r.buffer - dt);

  const dashing = r.dash > 0;
  const canJump = r.grounded || (!r.jumped && r.airTime <= P.coyote);
  if (r.buffer > 0 && canJump && !dashing) {
    r.vy = P.jumpVelocity;
    r.grounded = false;
    r.jumped = true;
    r.cut = false;
    r.buffer = 0;
    r.airTime = 0;
    r.glideTime = 0;
    r.fastFall = false;
    sink.jump(r);
  }
  // Pulo variável: soltar subindo corta a subida (toque curto = pulo baixo).
  if (!ctl.hold && !r.cut && r.vy > P.releaseVelocity && r.airTime >= P.minCut) {
    r.vy = P.releaseVelocity;
    r.cut = true;
  }
  if (ctl.drop && !dashing) {
    if (r.grounded) {
      r.dropThrough = 0.2; // desce do galho (no chão não faz nada)
    } else if (!r.fastFall) {
      r.vy = -P.fastFallVelocity;
      r.fastFall = true;
      r.gliding = false;
    }
  }

  // ── movimento ──
  if (dashing) {
    r.dash -= dt;
    r.vy = 0;
    r.gliding = false;
    if (r.dash <= 0) {
      r.dash = 0;
      r.dashTail = DASH.tail;
      if (!r.grounded) {
        r.vy = DASH.exitVelocity;
        r.cut = true;
        r.jumped = true;
        r.glideTime = 0;
      }
    }
  } else if (!r.grounded && P.fly) {
    // Voando de tucano: segurar sobe batendo as asas; soltar desce planando.
    r.airTime += dt;
    r.gliding = false;
    if (ctl.hold && !r.fastFall) r.vy = Math.min(P.fly.rise, r.vy + P.fly.lift * dt);
    else r.vy = Math.max(r.vy - P.fly.gravity * dt, r.fastFall ? -P.fastFallVelocity : -P.fly.maxFall);
  } else if (!r.grounded) {
    r.airTime += dt;
    r.gliding = ctl.hold && r.vy <= 0 && !r.fastFall && r.glideTime < P.glideMax;
    if (r.gliding) {
      r.vy = Math.max(r.vy - P.glideGravity * dt, -P.glideMaxFall);
      r.glideTime += dt;
    } else {
      r.vy -= (r.vy > 0 ? P.gravityUp : P.gravityDown) * dt;
      r.vy = Math.max(r.vy, r.fastFall ? -P.fastFallVelocity : -P.maxFall);
    }
  }

  r.x += runnerSpeed(r, baseSpeed) * dt;
  if (!r.grounded) r.y += r.vy * dt;
  if (P.fly && r.y > P.fly.ceiling) {
    r.y = P.fly.ceiling;
    if (r.vy > 0) r.vy = 0;
  }

  // ── apoio (chão, pedras, galhos) ──
  if (r.grounded) {
    if (!supportAt(level, r, r.y)) {
      r.grounded = false;
      r.airTime = 0;
      r.jumped = false;
      r.vy = 0;
    }
  } else if (r.vy <= 0) {
    const top = findLanding(level, r, sink);
    if (top !== null) {
      const hard = r.vy < -900;
      r.y = top;
      r.vy = 0;
      r.grounded = true;
      r.jumped = false;
      r.cut = true;
      r.airTime = 0;
      r.glideTime = 0;
      r.gliding = false;
      r.fastFall = false;
      r.justLanded = true;
      r.landedAt = 0;
      sink.land(r, hard);
      // Toque guardado: pula assim que pousa.
      if (r.buffer > 0 && r.dash <= 0) {
        r.vy = P.jumpVelocity;
        r.grounded = false;
        r.jumped = true;
        r.cut = false;
        r.buffer = 0;
        r.airTime = 0;
        sink.jump(r);
      }
    }
  }

  // ── toca: teto baixo e saída que lança de volta à superfície ──
  if (r.y < 0 && level.burrows.length) burrowStep(r, level, sink);

  // ── cipó: encostou no ar → agarra ──
  if (!r.grounded && r.dash <= 0 && r.vineCooldown <= 0) {
    const cy = r.y + BODY_CENTER;
    for (const v of level.vines) {
      if (v.ax - VINE.grabReach > r.x) break;
      if (Math.abs(r.x - v.ax) > VINE.grabReach) continue;
      if (cy > v.ay - v.len * 0.3 || cy < v.ay - v.len - 10) continue;
      grabVine(r, v, runnerSpeed(r, baseSpeed), sink);
      break;
    }
  }

  return collide(r, level, sink);
}

/** Dentro da toca: o teto segura o pulo; no buraco de saída, lança para cima. */
function burrowStep(r: Runner, level: Level, sink: StepSink): void {
  for (const b of level.burrows) {
    if (b.x0 > r.x + FOOT) break;
    if (b.x1 + FOOT < r.x) continue;
    if (r.x > b.holeEnd && r.x < b.exitStart && r.y + BODY.height > b.roof) {
      r.y = b.roof - BODY.height;
      if (r.vy > 0) r.vy = 0;
    }
    if (r.x >= b.exitStart + TOCA.launchAfter && r.y < TOCA.below && (r.vy <= 0 || r.dash > 0)) {
      if (r.dash > 0) {
        r.dash = 0;
        r.dashTail = DASH.tail;
      }
      r.vy = TOCA.exitVelocity;
      r.grounded = false;
      r.jumped = true;
      r.cut = true;
      r.airTime = 0;
      r.glideTime = 0;
      r.gliding = false;
      r.fastFall = false;
      r.dropThrough = 0;
      r.buffer = 0;
      sink.burrowOut?.(r);
    }
    return;
  }
}

/** Centro do corpo acima dos pés (onde as patas seguram o cipó). */
const BODY_CENTER = 18;

function grabVine(r: Runner, v: Vine, vx: number, sink: StepSink): void {
  const cy = r.y + BODY_CENTER;
  const L = Math.max(v.len * 0.4, Math.min(v.len, Math.hypot(r.x - v.ax, v.ay - cy)));
  const th = Math.asin(Math.max(-0.9, Math.min(0.9, (r.x - v.ax) / L)));
  // Velocidade tangencial; garante energia para chegar ao ângulo de soltar.
  const vt = vx * Math.cos(th) + r.vy * Math.sin(th);
  const need = Math.sqrt((2 * VINE.gravity * (Math.cos(th) - Math.cos(VINE.releaseAngle)) + 0) / L) * VINE.minEnergy;
  r.swinging = true;
  r.swAx = v.ax;
  r.swAy = v.ay;
  r.swL = L;
  r.swTh = th;
  r.swOm = Math.max(vt / L, Number.isFinite(need) ? need : 0, 0.8);
  r.vy = 0;
  r.gliding = false;
  r.fastFall = false;
  r.buffer = 0;
  placeOnVine(r);
  sink.grab(v, r);
}

function placeOnVine(r: Runner): void {
  r.x = r.swAx + r.swL * Math.sin(r.swTh);
  r.y = r.swAy - r.swL * Math.cos(r.swTh) - BODY_CENTER;
}

/** Pêndulo; toque solta com impulso, ↓ solta sem impulso, e no fim do balanço solta sozinha. */
function swingStep(r: Runner, ctl: Controls, dt: number, sink: StepSink): void {
  if (ctl.pressed || ctl.drop) {
    letGo(r, !ctl.drop, sink);
    return;
  }
  r.swOm += (-(VINE.gravity / r.swL) * Math.sin(r.swTh)) * dt;
  r.swTh += r.swOm * dt;
  placeOnVine(r);
  if (r.swTh >= VINE.releaseAngle && r.swOm > 0) letGo(r, true, sink);
}

function letGo(r: Runner, boost: boolean, sink: StepSink): void {
  const vt = r.swL * r.swOm;
  r.swinging = false;
  r.vy = vt * Math.sin(r.swTh) + (boost ? VINE.releaseBoost : 0);
  r.grounded = false;
  r.jumped = true;
  r.cut = true;
  r.airTime = 0;
  r.glideTime = 0;
  r.fastFall = false;
  r.vineCooldown = VINE.cooldown;
  sink.letGo(r);
}

/** Colisões laterais, coleta e queda no rio (comum a correr e balançar). */
function collide(r: Runner, level: Level, sink: StepSink): DeathCause | null {
  // ── colisões laterais ──
  const left = r.x - BODY.halfWidth;
  const right = r.x + BODY.halfWidth;
  const bottom = r.y;
  const top = r.y + BODY.height;
  const dash = r.dash > 0 || r.dashTail > 0;

  for (const rock of level.rocks) {
    if (rock.x0 > right) break;
    if (rock.broken || rock.x1 < left) continue;
    if (bottom >= rock.top - 0.5 || top <= 0) continue;
    // Quina: afundou pouco no topo descendo → sobe na pedra.
    if (!r.grounded && r.vy <= 0 && bottom >= rock.top - STEP_UP) {
      r.y = rock.top;
      r.vy = 0;
      r.grounded = true;
      r.jumped = false;
      r.cut = true;
      r.airTime = 0;
      r.glideTime = 0;
      r.gliding = false;
      r.fastFall = false;
      r.justLanded = true;
      r.landedAt = 0;
      sink.land(r, false);
      continue;
    }
    if (dash) {
      sink.smash(rock, r);
      continue;
    }
    return 'rock';
  }

  for (const t of level.thorns) {
    if (t.x0 > right - 3) break;
    if (t.broken || t.x1 < left + 3) continue;
    if (bottom >= t.top - 2 || top <= 0) continue;
    if (dash || r.tank) {
      sink.smash(t, r);
      continue;
    }
    return 'thorns';
  }

  for (const c of level.crates) {
    if (c.x0 > right) break;
    if (c.broken || c.x1 < left) continue;
    if (bottom >= c.top || top <= 0) continue;
    sink.crate(c, false, r);
  }

  // Flor-mola: encostar já lança (correndo por cima ou caindo).
  if (r.vy <= 0) {
    for (const s of level.springs) {
      if (s.x0 > right - 4) break;
      if (s.x1 < left + 4 || bottom > s.top || top <= 0) continue;
      launchSpring(r, s, sink);
      break;
    }
  }

  // ── capins ──
  for (const f of level.fruits) {
    if (f.x - FRUIT_R > right) break;
    if (f.taken || f.x + FRUIT_R < left) continue;
    if (f.y + FRUIT_R < bottom || f.y - FRUIT_R > top) continue;
    sink.fruit(f, r);
  }

  if (!r.grounded && !r.swinging && r.y < PIT_DEATH_Y && !level.burrowAt(r.x)) return 'river';
  return null;
}

function launchSpring(r: Runner, s: Spring, sink: StepSink): void {
  r.y = Math.max(r.y, s.top);
  r.vy = JUMP.springVelocity;
  r.grounded = false;
  r.jumped = true;
  r.cut = true;
  r.glideTime = 0;
  r.fastFall = false;
  r.dropThrough = 0;
  sink.spring(s, r);
}

function pick(best: number | null, top: number, from: number, to: number): number | null {
  return top <= from && top >= to && (best === null || top > best) ? top : best;
}

/** Há apoio exatamente na altura `y` sob os pés? */
function supportAt(level: Level, r: Runner, y: number): boolean {
  const a = r.x - FOOT;
  const b = r.x + FOOT;
  if (y === 0) {
    for (const g of level.ground) {
      if (g.x0 > b) break;
      if (g.x1 >= a) return true;
    }
  }
  for (const rock of level.rocks) {
    if (rock.x0 > b) break;
    if (!rock.broken && rock.x1 >= a && Math.abs(rock.top - y) < 0.5) return true;
  }
  if (r.dropThrough <= 0) {
    for (const p of level.platforms) {
      if (p.x0 > b) break;
      if (p.x1 >= a && Math.abs(p.y - y) < 0.5) return true;
    }
  }
  if (y < 0) {
    for (const u of level.burrows) {
      if (u.x0 > b) break;
      if (u.x1 >= a && Math.abs(u.floor - y) < 0.5) return true;
    }
  }
  return false;
}

/**
 * Procura onde a capivara pousa neste passo (caindo): o apoio mais alto cujo
 * topo foi cruzado entre a posição anterior e a atual. Caixotes e flores
 * não seguram: quicam (e o quicar já resolve o passo).
 */
function findLanding(level: Level, r: Runner, sink: StepSink): number | null {
  const a = r.x - FOOT;
  const b = r.x + FOOT;
  const from = r.prevY + 0.01;
  const to = r.y;
  let best: number | null = null;
  for (const g of level.ground) {
    if (g.x0 > b) break;
    if (g.x1 >= a) best = pick(best, 0, from, to);
  }
  for (const rock of level.rocks) {
    if (rock.x0 > b) break;
    if (!rock.broken && rock.x1 >= a) best = pick(best, rock.top, from, to);
  }
  if (r.dropThrough <= 0) {
    for (const p of level.platforms) {
      if (p.x0 > b) break;
      if (p.x1 >= a) best = pick(best, p.y, from, to);
    }
  }
  for (const u of level.burrows) {
    if (u.x0 > b) break;
    if (u.x1 >= a) best = pick(best, u.floor, from, to);
  }
  // Quicar: caixote (pisão) e flor-mola, se estiverem acima do apoio encontrado.
  const hb = r.x - BODY.halfWidth + 2;
  const he = r.x + BODY.halfWidth - 2;
  for (const s of level.springs) {
    if (s.x0 > he) break;
    if (s.x1 < hb) continue;
    if (s.top <= from && s.top >= to && (best === null || s.top >= best)) {
      launchSpring(r, s, sink);
      return null;
    }
  }
  for (const c of level.crates) {
    if (c.x0 > he) break;
    if (c.broken || c.x1 < hb) continue;
    if (c.top <= from && c.top >= to && (best === null || c.top >= best)) {
      r.y = c.top;
      r.vy = JUMP.crateBounceVelocity;
      r.jumped = true;
      r.cut = true;
      r.glideTime = 0;
      r.fastFall = false;
      sink.crate(c, true, r);
      return null;
    }
  }
  return best;
}
