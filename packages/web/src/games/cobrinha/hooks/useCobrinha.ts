import { useCallback, useEffect, useRef, useState } from 'react';
import { SnakeSfx, vibrate } from '../audio';
import { ARENA, GAME_OVER_LINES, ITEMS } from '../game/config';
import { Engine } from '../game/Engine';
import { keyDir, SwipeInput } from '../game/Swipe';
import { GameState } from '../game/types';
import { cellCenter, Renderer } from '../rendering/Renderer';
import { Effects } from '../rendering/effects';
import { effectiveDpr } from '../../../shared/layout/layout';
import { GameLoop } from '../../../shared/loop/GameLoop';
import { loadSettings, saveSettings, type Settings } from '../../../shared/settings/settings';
import { browserStorage } from '../../../shared/storage/storage';

export interface UiState {
  state: GameState;
  score: number;
  best: number;
  isNewRecord: boolean;
  landscape: boolean;
  runId: number;
  /** runId da partida em andamento — usado pelo ranking online. */
  liveRunId: number;
  length: number;
  eaten: number;
  line: string;
}

const MILESTONE_LINES: Record<number, string> = {
  10: 'Já está na bancada!',
  20: 'Virou líder do partido!',
  30: 'Ganhou a faixa!',
  45: 'Ocupa o Plenário inteiro!',
  60: 'Nem cabe no gabinete!',
  80: 'Patrimônio incalculável!',
  100: 'Lenda do cafezinho!',
};

/**
 * Integra a simulação ao React. O React só re-renderiza em mudanças de
 * estado (menu, pausa, fim) — nunca a cada quadro.
 */
export function useCobrinha() {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const storage = useRef(browserStorage()).current;
  const engineRef = useRef<Engine | null>(null);
  const sfxRef = useRef<SnakeSfx | null>(null);
  const fxRef = useRef<Effects | null>(null);

  const [settings, setSettings] = useState<Settings>(() => loadSettings(storage));
  const settingsRef = useRef(settings);
  const [ui, setUi] = useState<UiState>({
    state: GameState.READY,
    score: 0,
    best: 0,
    isNewRecord: false,
    landscape: false,
    runId: 0,
    liveRunId: 0,
    length: 0,
    eaten: 0,
    line: GAME_OVER_LINES[0],
  });

  useEffect(() => {
    const surface = surfaceRef.current;
    const canvas = canvasRef.current;
    if (!surface || !canvas) return;

    const params = new URLSearchParams(location.search);
    const debug = params.has('debug');
    const seedParam = params.get('seed');
    const engine = new Engine({ storage, seed: seedParam ? Number(seedParam) : undefined });
    const fx = new Effects();
    const sfx = new SnakeSfx();
    const renderer = new Renderer(canvas);
    engineRef.current = engine;
    fxRef.current = fx;
    sfxRef.current = sfx;
    fx.reducedMotion = settingsRef.current.reducedMotion;
    sfx.enabled = settingsRef.current.sound;
    setUi((u) => ({ ...u, best: engine.best }));

    const swipe = new SwipeInput(surface, (d) => {
      sfx.unlock();
      engine.turn(d);
    });
    swipe.setEnabled(false);

    const unsubscribe = engine.on((e) => {
      switch (e.type) {
        case 'state': {
          if (e.state === GameState.PLAYING && e.previous === GameState.READY) fx.clear();
          if (e.state === GameState.PLAYING && e.previous === GameState.GAME_OVER) fx.clear();
          if (e.state === GameState.PLAYING && (e.previous === GameState.READY || e.previous === GameState.GAME_OVER)) sfx.start();
          if (e.state === GameState.PLAYING && e.previous === GameState.RESUMING) sfx.tick(true);
          swipe.setEnabled(e.state === GameState.PLAYING || e.state === GameState.RESUMING);
          setUi((u) => ({ ...u, state: e.state, best: engine.best, liveRunId: engine.runId }));
          break;
        }
        case 'turn':
          sfx.turn();
          break;
        case 'eat': {
          const spec = ITEMS[e.item.kind];
          const p = cellCenter(e.item.x, e.item.y);
          const rare = spec.life > 0;
          const money = e.item.kind === 'dinheiro' || e.item.kind === 'rachadinha' || e.item.kind === 'mala';
          fx.burst(p.x, p.y, rare ? 22 : 12, rare ? 160 : 110, [spec.color, '#ffffff', '#ffd23f'], 0.6, 2.4, money ? 6 : 0);
          fx.float(
            p.x,
            p.y - 14,
            `+${e.points}`,
            rare || e.item.kind === 'rachadinha' ? spec.name.toUpperCase() : e.multiplier > 1 ? '×2' : '',
            spec.color === '#8b4a2b' ? '#ffcf9a' : spec.color,
            rare,
          );
          sfx.eat(e.item.kind, e.multiplier);
          vibrate(rare ? 20 : 8);
          break;
        }
        case 'spawn':
          if (e.item.life > 0) sfx.spawnRare();
          break;
        case 'expire': {
          const p = cellCenter(e.item.x, e.item.y);
          fx.burst(p.x, p.y, 8, 60, ['#ffffff', ITEMS[e.item.kind].color], 0.4);
          fx.float(p.x, p.y - 10, 'SUMIU!', '', '#ffffff');
          sfx.expire();
          break;
        }
        case 'multiplier':
          if (e.on) fx.showBanner('PONTOS EM DOBRO!', 'A mala chegou cheia');
          break;
        case 'milestone': {
          fx.showBanner(`TAMANHO ${e.length}!`, MILESTONE_LINES[e.length] ?? '');
          const h = cellCenter(engine.snake[0].x, engine.snake[0].y);
          fx.burst(h.x, h.y, 30, 200, ['#ffd23f', '#ff7eb6', '#7fd3ff', '#9be15d'], 0.9, 2.6, 10);
          sfx.milestone();
          vibrate([10, 30, 10]);
          break;
        }
        case 'newRecord':
          fx.float(ARENA.width / 2, 100, 'NOVO RECORDE!', '', '#ffd23f', true);
          sfx.record();
          break;
        case 'crash': {
          const h = cellCenter(engine.snake[0].x, engine.snake[0].y);
          fx.burst(h.x, h.y, 34, 220, ['#23336a', '#ffc8a2', '#ffffff', '#e8443a'], 0.9, 3, 12);
          fx.shake = 1;
          fx.flash = 1;
          sfx.crash();
          vibrate([30, 40, 70]);
          const line = GAME_OVER_LINES[Math.floor(Math.random() * GAME_OVER_LINES.length)];
          setUi((u) => ({
            ...u,
            score: e.score,
            best: e.best,
            isNewRecord: e.isNewRecord,
            runId: engine.runId,
            length: e.length,
            eaten: engine.eaten,
            line,
          }));
          break;
        }
      }
    });

    const loop = new GameLoop((dt) => {
      engine.advance(dt);
      const st = engine.state;
      const fdt = Math.min(dt, 0.1);
      if (st !== GameState.PAUSED && st !== GameState.RESUMING) fx.update(fdt);
      renderer.draw(engine, fx, { time: performance.now() / 1000, showHud: st !== GameState.READY && st !== GameState.GAME_OVER });
    });

    const resize = () => {
      const rect = surface.getBoundingClientRect();
      renderer.resize(rect.width, rect.height, effectiveDpr(window.devicePixelRatio));
      const l = renderer.layout;
      surface.style.setProperty('--arena-left', `${l.offsetX}px`);
      surface.style.setProperty('--arena-top', `${l.offsetY}px`);
      surface.style.setProperty('--arena-w', `${ARENA.width * l.scale}px`);
      surface.style.setProperty('--arena-h', `${ARENA.height * l.scale}px`);
      surface.style.setProperty('--u', `${l.scale}px`);
      const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
      setUi((u) => (u.landscape === (l.landscape && coarse) ? u : { ...u, landscape: l.landscape && coarse }));
    };
    resize();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    ro?.observe(surface);
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);

    const onHidden = () => {
      engine.pause();
      loop.resetClock();
      if (document.hidden) sfx.suspend();
    };
    const onVisibility = () => {
      if (document.hidden) onHidden();
      else loop.resetClock();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onHidden);
    window.addEventListener('pagehide', onHidden);

    const onKey = (ev: KeyboardEvent) => {
      const d = keyDir(ev.code);
      if (d && (engine.state === GameState.PLAYING || engine.state === GameState.RESUMING)) {
        ev.preventDefault();
        sfx.unlock();
        engine.turn(d);
        return;
      }
      if (ev.repeat) return;
      if (ev.code === 'Space' || ev.code === 'Escape' || ev.code === 'KeyP') {
        if (engine.state === GameState.PLAYING || engine.state === GameState.RESUMING) {
          ev.preventDefault();
          engine.pause();
          return;
        }
        if (engine.state === GameState.PAUSED && ev.code !== 'Space') {
          // Espaço com foco no botão "Continuar" já aciona o botão; aqui só P/Esc.
          sfx.unlock();
          engine.resume();
        }
      } else if (ev.code === 'Enter' && (engine.state === GameState.READY || engine.state === GameState.GAME_OVER)) {
        if ((ev.target as Element | null)?.closest?.('button, input, textarea, form, a')) return;
        sfx.unlock();
        engine.start();
      }
    };
    window.addEventListener('keydown', onKey);

    loop.start();
    if (debug) (window as unknown as Record<string, unknown>).__NDC__ = { engine, loop, renderer, fx };

    return () => {
      loop.stop();
      unsubscribe();
      swipe.dispose();
      ro?.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', resize);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onHidden);
      window.removeEventListener('pagehide', onHidden);
      window.removeEventListener('keydown', onKey);
      sfx.suspend();
      engineRef.current = null;
    };
  }, [storage]);

  const start = useCallback(() => {
    sfxRef.current?.unlock();
    engineRef.current?.start();
  }, []);
  const pause = useCallback(() => engineRef.current?.pause(), []);
  const resume = useCallback(() => {
    sfxRef.current?.unlock();
    engineRef.current?.resume();
  }, []);
  const toMenu = useCallback(() => engineRef.current?.toMenu(), []);
  const raiseBest = useCallback((n: number) => {
    const e = engineRef.current;
    if (e?.raiseBest(n)) setUi((u) => ({ ...u, best: e.best }));
  }, []);
  const playSound = useCallback((name: 'click' | 'success') => {
    sfxRef.current?.unlock();
    sfxRef.current?.[name]();
  }, []);

  const updateSettings = useCallback(
    (patch: Partial<Settings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        settingsRef.current = next;
        saveSettings(storage, next);
        if (fxRef.current) fxRef.current.reducedMotion = next.reducedMotion;
        if (sfxRef.current) {
          sfxRef.current.enabled = next.sound;
          if (next.sound) {
            sfxRef.current.unlock();
            sfxRef.current.click();
          }
        }
        return next;
      });
    },
    [storage],
  );

  return { surfaceRef, canvasRef, ui, settings, updateSettings, start, pause, resume, toMenu, playSound, storage, raiseBest };
}
