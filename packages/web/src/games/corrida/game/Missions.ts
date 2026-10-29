import type { Storage } from '../../../shared/storage/storage';
import { createRng } from '../../../shared/random';

/**
 * Missões em trios (como em Jetpack Joyride / Subway Surfers): sempre há 3
 * objetivos ativos. Cumprir os três sobe o "nível da capivara" e sorteia um
 * trio novo, um pouco mais difícil. Missões "numa corrida" recomeçam a cada
 * partida (continuar depois de bater é a mesma corrida); as "no total" somam
 * entre partidas. Tudo salvo neste aparelho (`ndc:corrida:missions`).
 *
 * Não muda a pontuação do ranking: é progressão pessoal.
 */

export type MissionKind =
  | 'capimRun'
  | 'capimTotal'
  | 'meters'
  | 'vines'
  | 'stomps'
  | 'dashes'
  | 'smashes'
  | 'springs'
  | 'noCrate'
  | 'noDash'
  | 'glide'
  | 'winter'
  | 'canopy'
  | 'magnets'
  | 'runs';

interface MissionDef {
  kind: MissionKind;
  /** 'run' = numa corrida; 'total' = somando partidas. */
  scope: 'run' | 'total';
  /** Alvo no nível 1 e quanto cresce por nível (fração). */
  base: number;
  growth: number;
  /** Arredonda o alvo para múltiplos disto. */
  round: number;
  /** Nível mínimo para aparecer. */
  minLevel: number;
  text(n: number): string;
}

export const MISSION_DEFS: readonly MissionDef[] = [
  { kind: 'capimRun', scope: 'run', base: 25, growth: 0.3, round: 5, minLevel: 1, text: (n) => `Coma ${n} capins numa corrida` },
  { kind: 'capimTotal', scope: 'total', base: 100, growth: 0.4, round: 10, minLevel: 1, text: (n) => `Coma ${n} capins no total` },
  { kind: 'meters', scope: 'run', base: 500, growth: 0.3, round: 50, minLevel: 1, text: (n) => `Corra ${n} m numa corrida` },
  { kind: 'vines', scope: 'run', base: 2, growth: 0.35, round: 1, minLevel: 1, text: (n) => `Balance em ${n} cipós numa corrida` },
  { kind: 'stomps', scope: 'total', base: 3, growth: 0.35, round: 1, minLevel: 1, text: (n) => `Pise em ${n} caixotes` },
  { kind: 'springs', scope: 'total', base: 3, growth: 0.35, round: 1, minLevel: 1, text: (n) => `Seja lançada por ${n} flores-mola` },
  { kind: 'dashes', scope: 'total', base: 2, growth: 0.35, round: 1, minLevel: 1, text: (n) => `Use a Disparada ${n} vezes` },
  { kind: 'runs', scope: 'total', base: 3, growth: 0.3, round: 1, minLevel: 1, text: (n) => `Jogue ${n} corridas` },
  { kind: 'smashes', scope: 'total', base: 3, growth: 0.35, round: 1, minLevel: 2, text: (n) => `Quebre ${n} pedras ou espinhos na Disparada` },
  { kind: 'glide', scope: 'run', base: 4, growth: 0.3, round: 1, minLevel: 2, text: (n) => `Plane por ${n} s numa corrida` },
  { kind: 'noCrate', scope: 'run', base: 400, growth: 0.3, round: 50, minLevel: 2, text: (n) => `Corra ${n} m sem bater em caixote` },
  { kind: 'noDash', scope: 'run', base: 700, growth: 0.3, round: 50, minLevel: 3, text: (n) => `Corra ${n} m sem usar a Disparada` },
  { kind: 'canopy', scope: 'total', base: 2, growth: 0.4, round: 1, minLevel: 2, text: (n) => `Chegue à copa das árvores ${n} vezes` },
  { kind: 'magnets', scope: 'total', base: 2, growth: 0.4, round: 1, minLevel: 2, text: (n) => `Pegue ${n} ímãs de capim` },
  { kind: 'winter', scope: 'run', base: 1, growth: 0, round: 1, minLevel: 3, text: () => 'Chegue ao inverno numa corrida' },
];

export interface Mission {
  kind: MissionKind;
  target: number;
  progress: number;
  done: boolean;
}

export interface MissionsSave {
  v: 1;
  level: number;
  /** Semente do próximo sorteio (trio novo reproduzível). */
  seed: number;
  slots: Mission[];
  /** Missões cumpridas desde sempre. */
  completed: number;
}

/** Metros em que o inverno chega à tela (meio da 1ª transição para o inverno). */
export const WINTER_METERS = 1650;

const KEY = 'ndc:corrida:missions';

export function defOf(kind: MissionKind): MissionDef {
  return MISSION_DEFS.find((d) => d.kind === kind)!;
}

export function missionText(m: Mission): string {
  return defOf(m.kind).text(m.target);
}

export function targetFor(def: MissionDef, level: number): number {
  const raw = def.base * (1 + def.growth * (level - 1));
  return Math.max(def.round, Math.round(raw / def.round) * def.round);
}

/** Sorteia 3 missões de tipos diferentes, permitidas no nível. */
export function drawTrio(level: number, seed: number, avoid: readonly MissionKind[] = []): Mission[] {
  const rng = createRng(seed);
  const pool = MISSION_DEFS.filter((d) => d.minLevel <= level);
  const fresh = pool.filter((d) => !avoid.includes(d.kind));
  const source = fresh.length >= 3 ? fresh : pool;
  const picked: MissionDef[] = [];
  while (picked.length < 3) {
    const d = source[Math.floor(rng() * source.length)];
    if (!picked.includes(d)) picked.push(d);
  }
  return picked.map((d) => ({ kind: d.kind, target: targetFor(d, level), progress: 0, done: false }));
}

export interface RunStats {
  meters: number;
  /** Metros desde a última batida em caixote / último dash. */
  sinceCrate: number;
  sinceDash: number;
}

export class Missions {
  state: MissionsSave;
  /** Contadores da corrida atual. */
  private run = { capim: 0, vines: 0, glide: 0, meters: 0, sinceCrate: 0, sinceDash: 0, crateAt: 0, dashAt: 0 };
  private inRun = false;

  constructor(private storage: Storage) {
    this.state = this.load();
  }

  get slots(): readonly Mission[] {
    return this.state.slots;
  }

  get level(): number {
    return this.state.level;
  }

  get allDone(): boolean {
    return this.state.slots.every((m) => m.done);
  }

  /** Começo de uma corrida nova (continuar não chama isto). */
  startRun(): void {
    this.inRun = true;
    this.run = { capim: 0, vines: 0, glide: 0, meters: 0, sinceCrate: 0, sinceDash: 0, crateAt: 0, dashAt: 0 };
    for (const m of this.state.slots) if (!m.done && defOf(m.kind).scope === 'run') m.progress = 0;
  }

  /** Eventos do motor. Devolve as missões cumpridas agora (para o aviso na tela). */
  capim(): Mission[] {
    this.run.capim++;
    return this.bump({ capimRun: this.run.capim }, { capimTotal: 1 });
  }

  vine(): Mission[] {
    this.run.vines++;
    return this.bump({ vines: this.run.vines }, {});
  }

  crate(stomp: boolean): Mission[] {
    if (!stomp) this.run.crateAt = this.run.meters;
    return stomp ? this.bump({}, { stomps: 1 }) : [];
  }

  smash(): Mission[] {
    return this.bump({}, { smashes: 1 });
  }

  magnet(): Mission[] {
    return this.bump({}, { magnets: 1 });
  }

  canopy(): Mission[] {
    return this.bump({}, { canopy: 1 });
  }

  spring(): Mission[] {
    return this.bump({}, { springs: 1 });
  }

  dash(): Mission[] {
    this.run.dashAt = this.run.meters;
    return this.bump({}, { dashes: 1 });
  }

  /** A cada quadro jogando: metros da corrida e tempo planando (s). */
  tick(meters: number, glidingDt: number): Mission[] {
    if (!this.inRun) return [];
    this.run.meters = meters;
    this.run.glide += glidingDt;
    return this.bump(
      {
        meters,
        noCrate: meters - this.run.crateAt,
        noDash: meters - this.run.dashAt,
        glide: Math.floor(this.run.glide),
        winter: meters >= WINTER_METERS ? 1 : 0,
      },
      {},
    );
  }

  /**
   * Fim de verdade da corrida (não a batida com vida sobrando). Conta a
   * partida; se o trio estiver completo, sobe de nível e sorteia o próximo.
   * Devolve o que aconteceu para a tela de fim.
   */
  endRun(): { completed: Mission[]; leveledUp: boolean; level: number } {
    if (!this.inRun) return { completed: [], leveledUp: false, level: this.state.level };
    this.inRun = false;
    const completed = this.bump({}, { runs: 1 });
    let leveledUp = false;
    if (this.allDone) {
      leveledUp = true;
      this.state.level++;
      const avoid = this.state.slots.map((m) => m.kind);
      this.state.seed = (this.state.seed * 1664525 + 1013904223) >>> 0;
      this.state.slots = drawTrio(this.state.level, this.state.seed, avoid);
    }
    this.save();
    return { completed, leveledUp, level: this.state.level };
  }

  /** Atualiza progresso: `best` = valor máximo nesta corrida; `add` = soma no total. */
  private bump(best: Partial<Record<MissionKind, number>>, add: Partial<Record<MissionKind, number>>): Mission[] {
    const done: Mission[] = [];
    for (const m of this.state.slots) {
      if (m.done) continue;
      const b = best[m.kind];
      const a = add[m.kind];
      if (b !== undefined) m.progress = Math.max(m.progress, Math.min(m.target, b));
      if (a !== undefined) m.progress = Math.min(m.target, m.progress + a);
      if (m.progress >= m.target) {
        m.done = true;
        this.state.completed++;
        done.push(m);
      }
    }
    if (done.length) this.save();
    return done;
  }

  private save(): void {
    try {
      this.storage.setItem(KEY, JSON.stringify(this.state));
    } catch {
      /* fica só nesta sessão */
    }
  }

  private load(): MissionsSave {
    try {
      const raw = this.storage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw) as MissionsSave;
        const valid =
          s &&
          s.v === 1 &&
          Number.isInteger(s.level) &&
          s.level >= 1 &&
          Array.isArray(s.slots) &&
          s.slots.length === 3 &&
          s.slots.every((m) => MISSION_DEFS.some((d) => d.kind === m.kind) && m.target > 0 && m.progress >= 0);
        if (valid) return { ...s, completed: s.completed || 0, seed: s.seed >>> 0 };
      }
    } catch {
      /* dado estragado: recomeça */
    }
    const seed = 0x51ed;
    return { v: 1, level: 1, seed, slots: drawTrio(1, seed), completed: 0 };
  }
}
