import { useCallback, useEffect, useRef, useState } from 'react';
import { ARENA } from '../game/config';
import { difficultyAt } from '../game/Difficulty';
import { GameEngine } from '../game/GameEngine';
import { GameLoop } from '../game/GameLoop';
import { browserStorage } from '../game/ScoreManager';
import { GameState } from '../game/types';
import { InputController } from '../input/InputController';
import { Sfx } from '../platform/audio';
import { loadSettings, saveSettings, type Settings } from '../platform/settings';
import { CanvasRenderer, COLORS } from '../rendering/CanvasRenderer';
import { Effects } from '../rendering/effects';
import { effectiveDpr } from '../rendering/layout';

export interface UiState {
  state: GameState;
  score: number;
  best: number;
  isNewRecord: boolean;
  landscape: boolean;
}

/**
 * Integra a simulação ao React. O React só re-renderiza em mudanças de
 * estado (menu, pausa, fim de partida) — nunca a cada quadro. Pontuação
 * e HUD em tempo real são desenhados direto no Canvas.
 */
export function useGame() {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const storage = useRef(browserStorage()).current;
  const engineRef = useRef<GameEngine | null>(null);
  const sfxRef = useRef<Sfx | null>(null);
  const fxRef = useRef<Effects | null>(null);

  const [settings, setSettings] = useState<Settings>(() => loadSettings(storage));
  const settingsRef = useRef(settings);
  const [ui, setUi] = useState<UiState>({ state: GameState.READY, score: 0, best: 0, isNewRecord: false, landscape: false });

  useEffect(() => {
    const surface = surfaceRef.current;
    const canvas = canvasRef.current;
    if (!surface || !canvas) return;

    const debug = new URLSearchParams(location.search).has('debug');
    const seedParam = new URLSearchParams(location.search).get('seed');
    const engine = new GameEngine({ storage, seed: seedParam ? Number(seedParam) : undefined });
    const fx = new Effects();
    const sfx = new Sfx();
    const renderer = new CanvasRenderer(canvas);
    engineRef.current = engine;
    fxRef.current = fx;
    sfxRef.current = sfx;
    fx.reducedMotion = settingsRef.current.reducedMotion;
    sfx.enabled = settingsRef.current.sound;

    setUi((u) => ({ ...u, best: engine.score.best }));

    const input = new InputController(surface, window, (holding) => {
      engine.setHolding(holding);
      if (holding) {
        fx.pressPulse = 1;
        sfx.unlock();
      }
    });
    input.setEnabled(false);

    const unsubscribe = engine.on((e) => {
      switch (e.type) {
        case 'state':
          input.setEnabled(e.state === GameState.PLAYING || e.state === GameState.RESUMING);
          if (e.state === GameState.PLAYING && e.previous !== GameState.RESUMING && e.previous !== GameState.PAUSED) {
            fx.clear();
          }
          if (e.state === GameState.PLAYING) engine.setHolding(input.isHolding);
          setUi((u) => ({ ...u, state: e.state, best: engine.score.best }));
          break;
        case 'pass': {
          const b = e.barrier;
          fx.float(b.x + b.width / 2, (b.gapTop + b.gapBottom) / 2, '+5');
          fx.emit(b.x + b.width, (b.gapTop + b.gapBottom) / 2, 6, 70, [COLORS.passed, '#ffffff'], 0.4, 2);
          sfx.pass();
          break;
        }
        case 'newRecord':
          fx.float(ARENA.width / 2, ARENA.height * 0.3, 'NOVO RECORDE!', true);
          fx.recordGlow = 1;
          fx.emit(engine.ball.x, engine.ball.y, 18, 160, [COLORS.record, COLORS.ball, '#ffffff'], 0.8, 3);
          sfx.record();
          break;
        case 'crash':
          fx.emit(e.x, e.y, 34, 230, [COLORS.ball, COLORS.barrier, '#ffffff'], 0.9, 3.2);
          fx.shake = 1;
          fx.flash = 1;
          sfx.crash();
          setUi((u) => ({ ...u, score: e.score, best: e.best, isNewRecord: e.isNewRecord }));
          break;
      }
    });

    const loop = new GameLoop((dt) => {
      engine.advance(dt);
      const st = engine.state;
      const frozen = st === GameState.PAUSED || st === GameState.RESUMING;
      const fdt = Math.min(dt, 0.1);
      if (st === GameState.PLAYING) {
        fx.recordTrail(engine.ball.y, fdt);
        if (engine.holding) fx.thrust(engine.ball.x, engine.ball.y, engine.ball.radius, fdt);
      }
      const scroll = st === GameState.PLAYING ? difficultyAt(engine.elapsed).speed : 40;
      if (!frozen) fx.update(fdt, scroll);
      renderer.draw(engine, fx, { showHud: st !== GameState.READY, time: 0 });
    });

    // Tamanho do canvas acompanha a superfície (rotação, barra de endereço, janela).
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

    // Aba oculta ou janela sem foco: pausa com segurança, nada avança em segundo plano.
    const onHidden = () => {
      input.releaseAll();
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
      if (ev.repeat) return;
      if (ev.code === 'Escape' || ev.code === 'KeyP') {
        if (engine.state === GameState.PLAYING || engine.state === GameState.RESUMING) engine.pause();
        else if (engine.state === GameState.PAUSED) engine.resume();
      } else if (ev.code === 'Enter' && (engine.state === GameState.READY || engine.state === GameState.GAME_OVER)) {
        if ((ev.target as Element | null)?.closest?.('button')) return; // o botão já trata
        sfx.unlock();
        engine.start();
      }
    };
    window.addEventListener('keydown', onKey);

    loop.start();

    if (debug) (window as unknown as Record<string, unknown>).__NDC__ = { engine, loop, input, renderer };

    return () => {
      loop.stop();
      unsubscribe();
      input.dispose();
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

  const updateSettings = useCallback(
    (patch: Partial<Settings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        settingsRef.current = next;
        saveSettings(storage, next);
        if (fxRef.current) fxRef.current.reducedMotion = next.reducedMotion;
        if (sfxRef.current) {
          sfxRef.current.enabled = next.sound;
          if (next.sound) sfxRef.current.unlock();
        }
        return next;
      });
    },
    [storage],
  );

  return { surfaceRef, canvasRef, ui, settings, updateSettings, start, pause, resume, toMenu };
}
