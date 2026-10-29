import { MAGNET, SIM } from '../config';
import { speedAt } from '../Difficulty';
import { cloneRunner, stepRunner, type Controls, type StepSink } from '../Physics';
import type { Level } from '../Level';
import type { Runner } from '../types';

/**
 * Planejador de toques: procura uma sequência de pulos que leve a capivara de
 * um estado até uma posição x sem morrer e sem bater em caixote. Usa a mesma
 * função de física do jogo (determinística), então "existe um plano" é uma
 * prova de que o trecho é atravessável — base dos testes de justiça do
 * gerador e do piloto automático.
 *
 * Busca em profundidade: correndo sem tocar, em cada instante com o pé no
 * chão (amostrado a cada 1/60 s) tenta pular com várias durações de toque
 * (toque curto … segurar planando); a cada pouso, recomeça a busca.
 */

export interface Jump {
  /** Passo (contado a partir do início do plano) em que o dedo desce. */
  at: number;
  /** Passos com o dedo pressionado. */
  hold: number;
}

/** Durações de toque testadas (s): toque curto, médios, até o topo, planando. */
export const HOLDS = [1 / 120, 0.1, 0.18, 0.28, 0.4, 0.6, 0.85, 1.3];

interface ProbeSink extends StepSink {
  bad: boolean;
}

function probeSink(): ProbeSink {
  const s: ProbeSink = {
    bad: false,
    jump() {},
    land() {},
    crate(c, stomp) {
      if (!c.broken && !stomp) s.bad = true;
    },
    smash() {},
    spring() {},
    fruit() {},
    grab() {},
    letGo() {},
  };
  return s;
}

export interface PlanOptions {
  /** Até onde o plano precisa chegar (x). */
  goalX: number;
  /** Tempo de partida no início (define a velocidade). */
  elapsed: number;
  /** Velocidade fixa (testes de padrão); sem ela usa a curva de dificuldade. */
  fixedSpeed?: number;
  /**
   * Embalo do ímã no começo do plano: rampa atual (0..1) e segundos de ímã
   * que faltam. O planejador simula a rampa igual ao motor (sobe/desce em
   * MAGNET.boostRamp) para os pulos baterem com a velocidade real.
   */
  boost?: { level: number; magnetLeft: number };
  /** Máximo de pulos encadeados. */
  maxJumps?: number;
  /** Limite de passos simulados (segurança). */
  budget?: number;
  /**
   * Escolhe o 1º pulo no MEIO da janela de pulos possíveis (e não no último
   * instante). É o que um jogador faria; deixa folga para erro de tempo.
   */
  preferCenter?: boolean;
}

const DT = SIM.fixedDt;

export function planRoute(level: Level, start: Runner, opts: PlanOptions): Jump[] | null {
  const maxJumps = opts.maxJumps ?? 6;
  const ctx = {
    level,
    goalX: opts.goalX,
    fixed: opts.fixedSpeed,
    t0: opts.elapsed,
    b0: opts.boost?.level ?? 0,
    mLeft: opts.boost?.magnetLeft ?? 0,
    budget: opts.budget ?? 2_000_000,
    seen: new Set<string>(),
    ctl: { hold: false, pressed: false, drop: false } as Controls,
    sink: probeSink(),
    center: opts.preferCenter ?? false,
  };
  return search(ctx, cloneRunner(start), opts.elapsed, 0, maxJumps);
}

interface Ctx {
  level: Level;
  goalX: number;
  fixed?: number;
  t0: number;
  b0: number;
  mLeft: number;
  budget: number;
  seen: Set<string>;
  ctl: Controls;
  sink: ProbeSink;
  center?: boolean;
}

function speed(ctx: Ctx, t: number) {
  return (ctx.fixed ?? speedAt(t)) * (1 + MAGNET.boost * boostAt(ctx, t));
}

/** Rampa do embalo no instante t (mesma regra do motor). */
function boostAt(ctx: Ctx, t: number): number {
  if (ctx.b0 <= 0 && ctx.mLeft <= 0) return 0;
  const dt = t - ctx.t0;
  if (dt < ctx.mLeft) return Math.min(1, ctx.b0 + dt / MAGNET.boostRamp);
  const atEnd = Math.min(1, ctx.b0 + ctx.mLeft / MAGNET.boostRamp);
  return Math.max(0, atEnd - (dt - ctx.mLeft) / MAGNET.boostRamp);
}

/**
 * A partir de `r` (no chão ou caindo sem controle), corre sem tocar; em cada
 * ponto de decisão tenta cada pulo. Devolve os pulos (passos relativos ao
 * início desta chamada) ou null.
 */
function search(ctx: Ctx, r0: Runner, t0: number, stepOffset: number, jumpsLeft: number): Jump[] | null {
  const key = `${Math.round(r0.x / 3)}:${Math.round(r0.y)}:${r0.grounded ? 1 : 0}:${Math.round(r0.vy / 50)}`;
  if (ctx.seen.has(key)) return null;
  ctx.seen.add(key);

  // 1) Corre sem tocar até bater (ou chegar), guardando os pontos onde daria para pular.
  const r = cloneRunner(r0);
  let t = t0;
  let steps = 0;
  const ctl = ctx.ctl;
  const points: Array<{ r: Runner; t: number; steps: number }> = [];
  for (;;) {
    // Só conta como chegada com o pé no chão (passar do objetivo no ar, sobre um rio, não vale).
    if (r.x >= ctx.goalX && r.grounded) return [];
    if (steps > MAX_RUN) return []; // nenhum perigo por 5 s
    if (--ctx.budget <= 0) return null;
    const canJump = r.grounded || (!r.jumped && r.airTime <= 0.09);
    if (canJump && steps % 2 === 0) points.push({ r: cloneRunner(r), t, steps });
    ctl.hold = false;
    ctl.pressed = false;
    ctl.drop = false;
    ctx.sink.bad = false;
    const death = stepRunner(r, ctl, ctx.level, speed(ctx, t), DT, ctx.sink);
    t += DT;
    steps++;
    if (death || ctx.sink.bad) break;
  }
  if (jumpsLeft <= 0) return null;
  // 2) Só vale pular pouco antes do perigo: dos pontos mais tardios para os mais cedo.
  if (ctx.center) {
    // Só no primeiro nível: junta todos os pulos que dão certo e fica com o do meio.
    ctx.center = false;
    const ok: Jump[][] = [];
    for (let i = points.length - 1; i >= 0; i--) {
      const p = points[i];
      if (steps - p.steps > LEAD) break;
      // Neste instante, também fica com a duração de toque do meio entre as que funcionam.
      const holds: Jump[][] = [];
      for (const h of HOLDS) {
        const hold = Math.max(1, Math.round(h / DT));
        const res = tryJump(ctx, p.r, p.t, hold);
        if (!res) continue;
        const jump = { at: stepOffset + p.steps, hold };
        if (res.reached) {
          holds.push([jump]);
          continue;
        }
        ctx.seen.clear();
        const rest = search(ctx, res.r, res.t, stepOffset + p.steps + res.steps, jumpsLeft - 1);
        if (rest) holds.push([jump, ...rest]);
      }
      if (holds.length) ok.push(holds[Math.floor(holds.length / 2)]);
      if (ctx.budget <= 0) break;
    }
    return ok.length ? ok[Math.floor(ok.length / 2)] : null;
  }
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i];
    if (steps - p.steps > LEAD) break;
    for (const h of HOLDS) {
      const hold = Math.max(1, Math.round(h / DT));
      const res = tryJump(ctx, p.r, p.t, hold);
      if (!res) continue;
      const jump = { at: stepOffset + p.steps, hold };
      if (res.reached) return [jump];
      const rest = search(ctx, res.r, res.t, stepOffset + p.steps + res.steps, jumpsLeft - 1);
      if (rest) return [jump, ...rest];
      if (ctx.budget <= 0) return null;
    }
  }
  return null;
}

/** Corrida sem tocar simulada no máximo (passos). */
const MAX_RUN = 600;
/** Quão antes do perigo vale tentar pular (passos): ~1,1 s. */
const LEAD = 132;

/** Simula um pulo (toque de `holdSteps` passos) até pousar ou chegar ao objetivo. */
function tryJump(ctx: Ctx, r0: Runner, t0: number, holdSteps: number): { r: Runner; t: number; steps: number; reached: boolean } | null {
  const r = cloneRunner(r0);
  const ctl = ctx.ctl;
  let t = t0;
  for (let i = 0; i < 600; i++) {
    if (--ctx.budget <= 0) return null;
    ctl.hold = i < holdSteps;
    ctl.pressed = i === 0;
    ctl.drop = false;
    ctx.sink.bad = false;
    const death = stepRunner(r, ctl, ctx.level, speed(ctx, t), DT, ctx.sink);
    t += DT;
    if (death || ctx.sink.bad) return null;
    // Pousou (depois de soltar): devolve o controle para a busca.
    if (i > 0 && r.grounded && i >= holdSteps) return { r, t, steps: i + 1, reached: r.x >= ctx.goalX };
  }
  return null;
}

/**
 * Piloto automático: replaneja a cada pouso e executa o primeiro pulo do
 * plano. Usado nos testes de justiça (o percurso real, gerado em várias
 * sementes, é atravessável) e em `?debug&piloto`.
 */
export class Autopilot {
  private plan: Jump[] | null = null;
  private stepInPlan = 0;
  /** Quantas vezes o planejador não achou caminho (só para diagnóstico). */
  failures = 0;
  lookahead = 760;

  /**
   * Sem argumentos: piloto perfeito (pula no último instante possível).
   * Com `rng`: jogador simulado — pula no meio da janela, com erro de tempo
   * de até ±lag/2 s e duração do toque variando ±holdJitter.
   */
  constructor(
    private readonly rng?: () => number,
    private readonly lag = 0,
    private readonly holdJitter = 0,
  ) {}

  private cooldown = 0;
  private boost = { level: 0, magnetLeft: 0 };

  /**
   * Decide se o dedo deve estar pressionado no próximo passo. `boost` = estado
   * do embalo do ímã no motor (para planejar com a velocidade certa).
   */
  decide(r: Runner, level: Level, elapsed: number, boost?: { level: number; magnetLeft: number }): boolean {
    // Pegou um ímã agora: a velocidade vai mudar, então replaneja.
    const picked = !!boost && boost.magnetLeft > this.boost.magnetLeft + 0.05;
    this.boost = boost ? { level: boost.level, magnetLeft: boost.magnetLeft } : { level: 0, magnetLeft: 0 };
    let j = this.plan?.[0];
    const executing = !!j && this.stepInPlan >= j.at && this.stepInPlan < j.at + j.hold;
    if (!executing) {
      const empty = !this.plan || this.plan.length === 0;
      if (r.justLanded || picked || (empty && --this.cooldown <= 0)) {
        this.replan(r, level, elapsed);
        this.cooldown = 6;
        j = this.plan?.[0];
      }
    }
    let hold = false;
    if (j) {
      hold = this.stepInPlan >= j.at && this.stepInPlan < j.at + j.hold;
      // Pulo executado: o próximo do plano continua contado do mesmo início.
      if (this.stepInPlan + 1 >= j.at + j.hold) this.plan!.shift();
    }
    this.stepInPlan++;
    return hold;
  }

  private replan(r: Runner, level: Level, elapsed: number) {
    this.stepInPlan = 0;
    this.plan = planRoute(level, r, { goalX: r.x + this.lookahead, elapsed, maxJumps: 5, budget: 400_000, preferCenter: !!this.rng, boost: this.boost });
    if (!this.plan) {
      this.failures++;
      this.plan = [];
    }
    const j = this.plan[0];
    if (j && this.rng) {
      j.at = Math.max(0, j.at + Math.round(((this.rng() - 0.5) * this.lag) / DT));
      j.hold = Math.max(1, Math.round(j.hold * (1 + (this.rng() * 2 - 1) * this.holdJitter)));
      this.plan.length = 1; // o resto é replanejado no pouso
    }
  }
}

