import { ARCADE, FLIGHT, type FlightParams } from './config';
import { DEFAULT_PHYSICS, verticalAcceleration, type PhysicsParams } from '../../bolinha/game/Physics';

/** Estado do avião (coordenadas de mundo, y para cima). */
export interface PlaneState {
  x: number;
  y: number;
  /** Posição no passo anterior — para interpolar o desenho. */
  prevX: number;
  prevY: number;
  /** Velocidade escalar ao longo da trajetória (u/s). */
  speed: number;
  /** Ângulo da trajetória (rad), contínuo (sem "dar a volta" em 2π): loops somam. */
  phi: number;
  prevPhi: number;
  /** Rotação atual do nariz (rad/s), para efeitos e detecção. */
  turnRate: number;
  /** Velocidade vertical (u/s, para cima) — usada no modo "bolinha". */
  vy: number;
  /** Potência do motor 0..1. */
  throttle: number;
  /** Quanto o jogador está puxando agora 0..1 (após a rampa). */
  pull: number;
  /** 0 = voando normal, 1 = estol completo. */
  stall: number;
  /** Fator do ar rarefeito 0..1 (1 = ar normal). */
  air: number;
  /** Encostado no chão (rasante/rolando). */
  onGround: boolean;
}

/** Comando dos controles para um passo. */
export interface FlightCommand {
  /** Potência desejada 0..1. */
  throttle: number;
  /** Puxada do manche: 0..1 puxa; valores negativos (até −1) empurram o nariz para baixo. */
  pull: number;
}

export function createPlane(x: number, y: number, speed: number): PlaneState {
  return {
    x,
    y,
    prevX: x,
    prevY: y,
    speed,
    phi: 0,
    prevPhi: 0,
    turnRate: 0,
    vy: 0,
    throttle: 0.5,
    pull: 0,
    stall: 0,
    air: 1,
    onGround: false,
  };
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

function smoothstep(e0: number, e1: number, x: number) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Fator 0..1 do ar rarefeito na altitude `y` (acima do teto suave o motor perde força). */
export function airFactor(y: number, p: FlightParams = FLIGHT): number {
  if (y <= p.thinAirStart) return 1;
  const t = clamp((y - p.thinAirStart) / (p.thinAirEnd - p.thinAirStart), 0, 1);
  return 1 - t * (1 - p.thinAirMin);
}

/** 1 = asa sustentando normal; 0 = estol completo. */
export function liftFactor(speed: number, p: FlightParams = FLIGHT): number {
  return smoothstep(p.stallSpeed, p.stallSpeed * (1 + p.stallBand), speed);
}

/**
 * Aceleração de sustentação (u/s²) — cresce com velocidade², some no estol,
 * limitada por maxG. Exportada para testes.
 */
export function liftAccel(speed: number, pull: number, air = 1, p: FlightParams = FLIGHT) {
  const lf = liftFactor(speed, p) * air;
  const v2 = speed * speed;
  const trim = v2 * p.cTrim * lf;
  const pullLift = v2 * (pull >= 0 ? p.cPull : p.cPush) * pull * lf;
  const cap = p.maxG * p.gravity;
  const total = Math.min(trim + pullLift, cap);
  // Se o limite cortou, a parte do jogador encolhe primeiro (a correção de nível é preservada).
  // Empurrar (puxada negativa) só tira sustentação.
  return { trim: Math.min(trim, cap), pull: total - Math.min(trim, cap) };
}

/**
 * Componente da correção de nível na direção da cabine (u/s²).
 * - Voando para a frente: proporcional a cosφ — empurra a trajetória ao nível.
 * - Voando para trás (invertido): mais fraca e no sentido de nivelar invertido.
 * - Em mergulho íngreme: sempre puxa para a cabine, saindo do mergulho
 *   para a frente (nunca prende o avião num mergulho vertical).
 */
export function passiveLift(trim: number, cos: number, sin: number, p: FlightParams = FLIGHT): number {
  const level = cos >= 0 ? trim * cos : trim * cos * p.invertedTrim;
  const dive = smoothstep(-0.2, -0.6, sin);
  if (dive <= 0) return level;
  const recover = trim * Math.max(Math.abs(cos), p.diveRecoveryMin);
  return level + (recover - level) * dive;
}

/** Rotação "para baixo" no estol: gira pelo lado mais curto até o nariz apontar para o chão. */
function stallRotation(phi: number): number {
  // Diferença entre a trajetória e "apontando para baixo" (−π/2), em (−π, π].
  let d = -Math.PI / 2 - phi;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  // Exatamente na vertical para cima: segue o sentido do loop (para trás, por cima).
  if (Math.abs(Math.abs(d) - Math.PI) < 1e-3) return 1;
  return Math.sign(d) * Math.min(1, Math.abs(d) / 0.6);
}

/**
 * Um passo de voo. Pura e determinística: a mesma entrada dá o mesmo
 * resultado em qualquer taxa de quadros (quem chama usa passo fixo).
 *
 * Rotação do nariz:
 *   ω = (correção de nível − g·cosφ + puxada)/v  +  estol
 * - Sem tocar, `trim` empurra a trajetória para o nível e a gravidade para
 *   baixo: rápido o avião se nivela; devagar, o nariz cai (mergulho).
 * - Puxar soma sustentação na direção da cabine: sobe em curva; se mantido
 *   com velocidade, o nariz continua girando e o loop se fecha sozinho.
 * - Abaixo da velocidade de estol a asa para de sustentar e o nariz cai
 *   girando até a velocidade voltar.
 * Velocidade:  dv = potência − arrasto·v² − arrasto da puxada − g·senφ.
 */
export function stepPlane(s: PlaneState, cmd: FlightCommand, dt: number, p: FlightParams = FLIGHT): void {
  s.prevX = s.x;
  s.prevY = s.y;
  s.prevPhi = s.phi;

  // Potência: sobe rápido ao segurar, cai um pouco mais devagar ao soltar.
  const target = Math.max(p.idle, clamp(cmd.throttle, 0, 1));
  if (s.throttle < target) s.throttle = Math.min(target, s.throttle + p.throttleUp * dt);
  else s.throttle = Math.max(target, s.throttle - p.throttleDown * dt);
  // A puxada responde quase na hora (rampa de ~40 ms só para não dar tranco).
  const pullTarget = clamp(cmd.pull, -1, 1);
  s.pull += clamp(pullTarget - s.pull, -dt * 25, dt * 25);

  const air = airFactor(s.y, p);
  s.air = air;
  const v = Math.max(s.speed, p.minSpeed);
  const lift = liftAccel(v, s.pull, air, p);
  s.stall = 1 - liftFactor(v, p);

  const cos = Math.cos(s.phi);
  const sin = Math.sin(s.phi);
  let omega = (passiveLift(lift.trim, cos, sin, p) - p.gravity * cos + lift.pull) / v;
  omega += s.stall * p.stallPitchRate * stallRotation(s.phi);
  omega = clamp(omega, -p.maxTurnRate, p.maxTurnRate);
  s.turnRate = omega;
  s.phi += omega * dt;

  const accel = s.throttle * p.thrust * air - p.drag * v * v - p.pullDrag * v * Math.abs(s.pull) * liftFactor(v, p) - p.gravity * sin;
  s.speed = Math.max(p.minSpeed, s.speed + accel * dt);

  s.x += Math.cos(s.phi) * s.speed * dt;
  s.y += Math.sin(s.phi) * s.speed * dt;
}

/** Velocidade máxima em voo nivelado com potência total (para normalizar efeitos e som). */
export function maxLevelSpeed(p: FlightParams = FLIGHT): number {
  return Math.sqrt(p.thrust / p.drag);
}

/** Velocidade em que a correção de nível sozinha sustenta o avião. */
export function trimLevelSpeed(p: FlightParams = FLIGHT): number {
  return Math.sqrt(p.gravity / p.cTrim);
}

/**
 * Passo no modo "bolinha": a velocidade vertical segue a MESMA função do
 * jogo da bolinha (gravidade, propulsão, reforço na inversão e limites de
 * velocidade), só com o eixo invertido (aqui y cresce para cima). A
 * velocidade horizontal é dada de fora (curva de velocidade da bolinha).
 * O ângulo do nariz é só visual: acompanha a direção do movimento.
 */
export function stepArcade(
  s: PlaneState,
  holding: boolean,
  forwardSpeed: number,
  dt: number,
  p: PhysicsParams = DEFAULT_PHYSICS,
  ceiling: number = ARCADE.ceiling,
): void {
  s.prevX = s.x;
  s.prevY = s.y;
  s.prevPhi = s.phi;
  // vy da bolinha (para baixo) = −vy do avião (para cima).
  let vyDown = -s.vy;
  vyDown += verticalAcceleration(vyDown, holding, p) * dt;
  if (vyDown < -p.maxRiseSpeed) vyDown = -p.maxRiseSpeed;
  if (vyDown > p.maxFallSpeed) vyDown = p.maxFallSpeed;
  s.vy = -vyDown;
  s.y += s.vy * dt;
  if (s.y > ceiling) {
    s.y = ceiling;
    if (s.vy > 0) s.vy = 0; // como a borda da bolinha: anula só o que levaria para fora
  }
  s.x += forwardSpeed * dt;
  s.speed = Math.hypot(forwardSpeed, s.vy);
  s.phi = Math.atan2(s.vy, forwardSpeed);
  s.turnRate = dt > 0 ? (s.phi - s.prevPhi) / dt : 0;
  // Potência só para som e efeitos (rampa curta).
  const target = holding ? 1 : FLIGHT.idle;
  s.throttle += Math.max(-ARCADE.throttleRate * dt, Math.min(ARCADE.throttleRate * dt, target - s.throttle));
  s.pull = holding ? 1 : 0;
  s.stall = 0;
  s.air = 1;
  s.onGround = false;
}
