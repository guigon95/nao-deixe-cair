import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '../../../shared/storage/storage';
import { ITEMS, SPEED, START_LENGTH, STORAGE } from '../game/config';
import { Engine, RESUME_TIME } from '../game/Engine';
import { GameState, type EngineEvent } from '../game/types';

function make(seed = 1) {
  const storage = new MemoryStorage();
  const e = new Engine({ storage, seed });
  const events: EngineEvent[] = [];
  e.on((ev) => events.push(ev));
  return { e, storage, events };
}

/** Tira os itens da mesa para testar movimento sem comer nada por acaso. */
function clearItems(e: Engine) {
  e.items = [];
}

describe('movimento', () => {
  it('começa de pé, apontando para cima, com o tamanho inicial', () => {
    const { e } = make();
    e.start();
    expect(e.state).toBe(GameState.PLAYING);
    expect(e.length).toBe(START_LENGTH);
    expect(e.dir).toBe('up');
    expect(e.items.length).toBe(1);
  });

  it('anda uma célula por passo nas quatro direções', () => {
    const { e } = make();
    e.start();
    clearItems(e);
    const h0 = { ...e.snake[0] };
    e.step();
    expect(e.snake[0]).toEqual({ x: h0.x, y: h0.y - 1 });
    e.turn('left');
    e.step();
    expect(e.snake[0]).toEqual({ x: h0.x - 1, y: h0.y - 1 });
    e.turn('down');
    e.step();
    expect(e.snake[0]).toEqual({ x: h0.x - 1, y: h0.y });
    e.turn('right');
    e.step();
    e.step();
    expect(e.snake[0]).toEqual({ x: h0.x + 1, y: h0.y });
    expect(e.length).toBe(START_LENGTH);
  });

  it('o tempo avança passos no intervalo configurado', () => {
    const { e } = make();
    e.start();
    clearItems(e);
    const y0 = e.snake[0].y;
    for (let i = 0; i < 3; i++) e.advance(SPEED.startStep);
    e.advance(0.001);
    expect(e.snake[0].y).toBe(y0 - 3);
  });

  it('ignora meia-volta direta e a mesma direção', () => {
    const { e } = make();
    e.start();
    expect(e.turn('down')).toBe(false);
    expect(e.turn('up')).toBe(false);
    expect(e.turn('left')).toBe(true);
  });

  it('duas curvas rápidas fazem um U sem bater no corpo', () => {
    const { e } = make();
    e.start();
    clearItems(e);
    e.step();
    e.turn('left');
    e.turn('down'); // comparada com "left" da fila, não com "up"
    e.step();
    e.step();
    expect(e.state).toBe(GameState.PLAYING);
    expect(e.dir).toBe('down');
  });

  it('meia-volta pela fila também é recusada (esquerda e depois direita)', () => {
    const { e } = make();
    e.start();
    e.turn('left');
    expect(e.turn('right')).toBe(false);
  });

  it('não aceita curvas fora da partida', () => {
    const { e } = make();
    expect(e.turn('left')).toBe(false);
  });
});

describe('colisões', () => {
  it('bater na parede encerra a partida', () => {
    const { e, events } = make();
    e.start();
    clearItems(e);
    for (let i = 0; i < 40 && e.state === GameState.PLAYING; i++) e.step();
    expect(e.state).toBe(GameState.GAME_OVER);
    const crash = events.find((x) => x.type === 'crash');
    expect(crash && crash.type === 'crash' && crash.reason).toBe('wall');
    expect(e.snake[0].y).toBe(0);
  });

  it('bater no próprio corpo encerra a partida', () => {
    const { e, events } = make();
    e.start();
    clearItems(e);
    // corpo comprido em linha reta para um quadrado de 3x3 fechar na cabeça
    e.snake = [
      { x: 5, y: 5 },
      { x: 5, y: 6 },
      { x: 5, y: 7 },
      { x: 5, y: 8 },
      { x: 5, y: 9 },
      { x: 5, y: 10 },
    ];
    e.fill = e.snake.map(() => null);
    e.prev = e.snake.map((c) => ({ ...c }));
    e.turn('right');
    e.step();
    e.turn('down');
    e.step();
    e.turn('left');
    e.step(); // volta para (5,6), ainda ocupada
    expect(e.state).toBe(GameState.GAME_OVER);
    const crash = events.find((x) => x.type === 'crash');
    expect(crash && crash.type === 'crash' && crash.reason).toBe('self');
  });

  it('pode entrar na célula de onde o rabo está saindo', () => {
    const { e } = make();
    e.start();
    clearItems(e);
    e.snake = [
      { x: 5, y: 5 },
      { x: 6, y: 5 },
      { x: 6, y: 6 },
      { x: 5, y: 6 },
    ];
    e.fill = e.snake.map(() => null);
    e.prev = e.snake.map((c) => ({ ...c }));
    e.dir = e.movedDir = 'left';
    e.turn('down');
    e.step(); // cabeça vai para (5,6), onde estava a ponta do rabo
    expect(e.state).toBe(GameState.PLAYING);
  });
});

describe('comer e crescer', () => {
  it('comer um item soma pontos e cresce no passo seguinte', () => {
    const { e, events } = make();
    e.start();
    clearItems(e);
    const h = e.snake[0];
    e.items.push({ id: 99, kind: 'dinheiro', x: h.x, y: h.y - 1, age: 0, life: 0 });
    e.step();
    expect(e.score).toBe(ITEMS.dinheiro.points);
    expect(e.length).toBe(START_LENGTH);
    e.step();
    expect(e.length).toBe(START_LENGTH + 1);
    expect(e.fill[1]).toBe('dinheiro');
    expect(events.some((x) => x.type === 'eat')).toBe(true);
    // sempre volta a ter um item comum na mesa
    expect(e.items.some((it) => it.life === 0)).toBe(true);
  });

  it('itens grandes crescem dois segmentos', () => {
    const { e } = make();
    e.start();
    clearItems(e);
    const h = e.snake[0];
    e.items.push({ id: 99, kind: 'rachadinha', x: h.x, y: h.y - 1, age: 0, life: 0 });
    e.step();
    e.step();
    e.step();
    expect(e.length).toBe(START_LENGTH + 2);
  });

  it('a mala dobra os pontos por um tempo', () => {
    const { e } = make();
    e.start();
    clearItems(e);
    const h = e.snake[0];
    e.items.push({ id: 1, kind: 'mala', x: h.x, y: h.y - 1, age: 0, life: 7 });
    e.items.push({ id: 2, kind: 'ouro', x: h.x, y: h.y - 2, age: 0, life: 0 });
    e.step();
    expect(e.multiplier).toBe(2);
    e.step();
    expect(e.score).toBe(ITEMS.mala.points + ITEMS.ouro.points * 2);
  });

  it('a velocidade aumenta com os itens comidos, até um limite', () => {
    const { e } = make();
    e.start();
    const before = e.interval;
    for (let i = 0; i < 200 && e.state === GameState.PLAYING; i++) {
      clearItems(e);
      const h = e.snake[0];
      e.items.push({ id: 1000 + i, kind: 'chocolate', x: h.x, y: h.y - 1, age: 0, life: 0 });
      e.step();
      // volta para baixo para não bater no teto: teleporta a cabeça (só para medir velocidade)
      e.snake = e.snake.map((c) => ({ x: c.x, y: c.y + 1 }));
    }
    expect(e.interval).toBeLessThan(before);
    expect(e.interval).toBeGreaterThanOrEqual(SPEED.minStep);
  });

  it('itens raros somem se não forem pegos', () => {
    const { e, events } = make();
    e.start();
    clearItems(e);
    e.items.push({ id: 5, kind: 'jatinho', x: 0, y: 0, age: 0, life: 1 });
    e.turn('left');
    e.advance(0.05);
    for (let i = 0; i < 12; i++) e.advance(0.1);
    expect(e.items.find((it) => it.id === 5)).toBeUndefined();
    expect(events.some((x) => x.type === 'expire')).toBe(true);
  });
});

describe('geração de itens', () => {
  it('nunca nasce em cima da cobrinha nem de outro item', () => {
    for (let seed = 1; seed < 40; seed++) {
      const { e } = make(seed);
      e.start();
      for (let k = 0; k < 30; k++) e.spawn('chocolate');
      const cells = new Set(e.snake.map((c) => `${c.x},${c.y}`));
      const seen = new Set<string>();
      for (const it of e.items) {
        const k = `${it.x},${it.y}`;
        expect(cells.has(k)).toBe(false);
        expect(seen.has(k)).toBe(false);
        seen.add(k);
        expect(it.x).toBeGreaterThanOrEqual(0);
        expect(it.x).toBeLessThan(e.cols);
        expect(it.y).toBeGreaterThanOrEqual(0);
        expect(it.y).toBeLessThan(e.rows);
      }
    }
  });

  it('raros só aparecem quando a cobrinha já cresceu', () => {
    const { e } = make();
    e.start();
    for (let i = 0; i < 50; i++) expect(['chocolate', 'dinheiro']).toContain(e.pickKind(false));
    expect(e.pickKind(true)).toBeNull();
  });

  it('com a mesa cheia, não trava', () => {
    const { e } = make();
    e.start();
    for (let k = 0; k < 600; k++) e.spawn('chocolate');
    expect(e.spawn('chocolate')).toBeNull();
  });
});

describe('pausa, reinício e recorde', () => {
  it('pausa congela e a retomada tem contagem', () => {
    const { e } = make();
    e.start();
    clearItems(e);
    const y = e.snake[0].y;
    e.pause();
    e.advance(1);
    expect(e.snake[0].y).toBe(y);
    e.resume();
    expect(e.state).toBe(GameState.RESUMING);
    e.advance(RESUME_TIME / 2);
    expect(e.state).toBe(GameState.RESUMING);
    for (let t = 0; t < RESUME_TIME; t += 0.1) e.advance(0.1);
    expect(e.state).toBe(GameState.PLAYING);
  });

  it('reiniciar zera tudo e muda o runId', () => {
    const { e } = make();
    e.start();
    e.score = 123;
    for (let i = 0; i < 40 && e.state === GameState.PLAYING; i++) e.step();
    const run = e.runId;
    e.start();
    expect(e.runId).toBe(run + 1);
    expect(e.score).toBe(0);
    expect(e.length).toBe(START_LENGTH);
    expect(e.state).toBe(GameState.PLAYING);
  });

  it('o recorde é salvo e lido do armazenamento', () => {
    const { e, storage } = make();
    e.start();
    clearItems(e);
    e.score = 250;
    for (let i = 0; i < 40 && e.state === GameState.PLAYING; i++) e.step();
    expect(storage.getItem(STORAGE.best)).toBe('250');
    const again = new Engine({ storage, seed: 2 });
    expect(again.best).toBe(250);
  });

  it('raiseBest só sobe', () => {
    const { e } = make();
    expect(e.raiseBest(100)).toBe(true);
    expect(e.raiseBest(50)).toBe(false);
    expect(e.best).toBe(100);
  });
});
