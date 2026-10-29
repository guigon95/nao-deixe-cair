import { describe, expect, it } from 'vitest';
import { SIM } from '../game/config';
import { Engine } from '../game/Engine';
import { Autopilot } from '../game/testing/planner';
import { GameState } from '../game/types';
import { MemoryStorage } from '../../../shared/storage/storage';
import { createRng } from '../../../shared/random';

/** Joga uma partida com o piloto automático por até `seconds` de jogo. */
export function autoplay(seed: number, seconds: number) {
  const e = new Engine({ storage: new MemoryStorage(), seed });
  const pilot = new Autopilot();
  e.start();
  const steps = Math.round(seconds / SIM.fixedDt);
  for (let i = 0; i < steps && e.state === GameState.PLAYING; i++) {
    e.setHolding(pilot.decide(e.runner, e.track.level, e.elapsed));
    e.step(SIM.fixedDt);
  }
  return { e, pilot };
}

describe('justiça do percurso gerado', () => {
  it('um piloto que só pula (sem dash) sobrevive 150 s em 16 sementes', () => {
    const deaths: string[] = [];
    for (let seed = 1; seed <= 16; seed++) {
      const { e } = autoplay(seed, 150);
      if (e.state !== GameState.PLAYING)
        deaths.push(`semente ${seed}: ${e.deathCause} aos ${e.elapsed.toFixed(1)} s (${e.track.history.slice(-3).map((h) => h.id).join(' → ')})`);
    }
    expect(deaths).toEqual([]);
  }, 240_000);

  /**
   * Jogador simulado (não é medição com pessoas): pula no meio da janela,
   * com erro de tempo aleatório e toque ±25 % mais curto/longo. Mostra que há
   * folga de verdade — e que errar mais o tempo cobra seu preço.
   */
  it('jogadores simulados: cuidadoso dura bem mais que o descuidado', () => {
    const median = (lag: number) => {
      const times: number[] = [];
      for (let seed = 1; seed <= 12; seed++) {
        const e = new Engine({ storage: new MemoryStorage(), seed });
        const p = new Autopilot(createRng(seed * 7), lag, 0.25);
        e.start();
        for (let i = 0; i < 150 * 120 && e.state === GameState.PLAYING; i++) {
          e.setHolding(p.decide(e.runner, e.track.level, e.elapsed));
          e.step(SIM.fixedDt);
        }
        times.push(e.elapsed);
      }
      times.sort((a, b) => a - b);
      return (times[5] + times[6]) / 2;
    };
    const careful = median(0.05);
    const sloppy = median(0.14);
    console.info(`duração mediana: cuidadoso (±25 ms) ${careful.toFixed(0)} s · descuidado (±70 ms) ${sloppy.toFixed(0)} s`);
    expect(careful).toBeGreaterThan(60);
    expect(sloppy).toBeLessThan(careful);
    expect(sloppy).toBeGreaterThan(8);
  }, 600_000);
});
