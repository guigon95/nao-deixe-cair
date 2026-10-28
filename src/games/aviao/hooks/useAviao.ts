import { useCallback, useEffect, useRef, useState } from 'react';
import { PlaneSfx, vibrate } from '../audio';
import { schemeFromUrl } from '../game/Controls';
import { Engine } from '../game/Engine';
import { maxLevelSpeed } from '../game/Plane';
import { GameState, type ManeuverKind } from '../game/types';
import { COLORS, Renderer } from '../rendering/Renderer';
import { Effects } from '../rendering/effects';
import { InputController } from '../../../shared/input/InputController';
import { effectiveDpr } from '../../../shared/layout/layout';
import { GameLoop } from '../../../shared/loop/GameLoop';
import { loadSettings, saveSettings, type Settings } from '../../../shared/settings/settings';
import { browserStorage } from '../../../shared/storage/storage';
import { ARENA } from '../game/config';
import { Autopilot } from '../game/testing/autopilot';

export interface UiState {
  state: GameState;
  score: number;
  best: number;
  isNewRecord: boolean;
  landscape: boolean;
  runId: number;
  loops: number;
  maneuvers: number;
  bestMultiplier: number;
  distance: number;
}

export const MANEUVER_NAMES: Record<ManeuverKind, string> = {
  loop: 'LOOP!',
  halfLoop: 'MEIO LOOP!',
  rasante: 'RASANTE!',
  inverted: 'INVERTIDO!',
  stallRecovery: 'RECUPEROU!',
  graze: 'RASPÃO!',
  ring: 'ANEL!',
  roll: 'TONNEAU!',
};

const VMAX = maxLevelSpeed();

/**
 * Integra a simulação ao React. O React só re-renderiza em mudanças de
 * estado (menu, pausa, fim) — nunca a cada quadro.
 */
export function useAviao() {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const storage = useRef(browserStorage()).current;
  const engineRef = useRef<Engine | null>(null);
  const sfxRef = useRef<PlaneSfx | null>(null);
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
    loops: 0,
    maneuvers: 0,
    bestMultiplier: 1,
    distance: 0,
  });

  useEffect(() => {
    const surface = surfaceRef.current;
    const canvas = canvasRef.current;
    if (!surface || !canvas) return;

    const params = new URLSearchParams(location.search);
    const debug = params.has('debug');
    const seedParam = params.get('seed');
    const engine = new Engine({
      storage,
      seed: seedParam ? Number(seedParam) : undefined,
      scheme: schemeFromUrl(location.search),
    });
    const fx = new Effects();
    const sfx = new PlaneSfx();
    const renderer = new Renderer(canvas);
    engineRef.current = engine;
    fxRef.current = fx;
    sfxRef.current = sfx;
    fx.reducedMotion = settingsRef.current.reducedMotion;
    engine.slowmoEnabled = !settingsRef.current.reducedMotion;
    sfx.enabled = settingsRef.current.sound;
    setUi((u) => ({ ...u, best: engine.score.best }));

    const input = new InputController(surface, window, (holding) => {
      engine.setHolding(holding);
      if (holding) {
        fx.pressPulse = 1;
        sfx.unlock();
      }
      if (engine.state === GameState.PLAYING) {
        if (holding) {
          sfx.press();
          vibrate(8);
        } else sfx.release();
      }
    });
    input.setEnabled(false);

    // Deslize vertical (só o esquema B usa): velocidade em unidades de arena por segundo.
    let lastMove = { y: 0, t: 0 };
    const onMove = (ev: PointerEvent) => {
      if (engine.scheme.id !== 'b' || !engine.holding) return;
      const t = ev.timeStamp / 1000;
      const dt = t - lastMove.t;
      const y = ev.clientY / renderer.layout.scale;
      if (dt > 0 && dt < 0.1) engine.swipe((y - lastMove.y) / dt);
      lastMove = { y, t };
    };
    surface.addEventListener('pointermove', onMove);

    let lastTick = 0;
    const unsubscribe = engine.on((e) => {
      switch (e.type) {
        case 'state': {
          const fresh = e.state === GameState.PLAYING && e.previous !== GameState.RESUMING && e.previous !== GameState.PAUSED;
          if (fresh) {
            fx.clear();
            renderer.follow(engine, 0, true);
            sfx.start();
          }
          if (e.state === GameState.RESUMING) lastTick = 0;
          if (e.state === GameState.PLAYING && e.previous === GameState.RESUMING) sfx.tick(true);
          if (e.state !== GameState.PLAYING) sfx.engine(false);
          input.setEnabled(e.state === GameState.PLAYING || e.state === GameState.RESUMING);
          if (e.state === GameState.PLAYING) engine.setHolding(input.isHolding);
          setUi((u) => ({ ...u, state: e.state, best: engine.score.best }));
          break;
        }
        case 'maneuver': {
          const m = e.m;
          const name = MANEUVER_NAMES[m.kind] + (m.kind === 'loop' && m.count > 1 ? ` ×${m.count}` : '');
          const big = m.kind === 'loop' || m.kind === 'halfLoop' || m.kind === 'rasante' || m.kind === 'stallRecovery' || m.multiplier > 2;
          fx.float(m.x, m.y, name, `+${m.points}${m.multiplier > 1 ? `  (×${m.multiplier})` : ''}`, big);
          fx.burst(m.x, m.y, big ? 16 : 8, big ? 150 : 90, [COLORS.combo, '#ffffff', COLORS.plane], 0.6, 2.4);
          fx.comboGlow = 1;
          sfx.maneuver(m.kind, m.multiplier);
          if (big) vibrate(15);
          break;
        }
        case 'comboLost':
          sfx.comboLost();
          break;
        case 'stall':
          if (e.on) sfx.stall();
          break;
        case 'skid':
          if (e.on) {
            sfx.skid();
            fx.burst(e.x, e.y - 4, 6, 70, ['#8fd18f', '#cfe8a9'], 0.4, 2);
          }
          break;
        case 'newRecord':
          fx.float(engine.plane.x, engine.plane.y + 60, 'NOVO RECORDE!', '', true);
          fx.recordGlow = 1;
          sfx.record();
          break;
        case 'crash':
          fx.burst(e.x, e.y, 36, 240, [COLORS.plane, COLORS.wing, '#ffffff', '#555'], 1, 3.2);
          fx.shake = 1;
          fx.flash = 1;
          sfx.crash();
          vibrate([30, 40, 60]);
          setUi((u) => ({
            ...u,
            score: e.score,
            best: e.best,
            isNewRecord: e.isNewRecord,
            runId: engine.runId,
            loops: engine.score.loops,
            maneuvers: engine.score.maneuvers,
            bestMultiplier: engine.score.bestMultiplier,
            distance: Math.round(engine.score.distance / 10),
          }));
          break;
      }
    });

    let demoT = 0;
    // Depuração: `?debug&piloto` liga o piloto automático (capturas e testes de navegador).
    const pilot = debug && params.has('piloto') ? new Autopilot() : null;
    const loop = new GameLoop((dt) => {
      if (pilot && engine.state === GameState.PLAYING) engine.setHolding(pilot.decide(engine));
      engine.advance(dt);
      const st = engine.state;
      const frozen = st === GameState.PAUSED || st === GameState.RESUMING;
      const fdt = Math.min(dt, 0.1);
      const p = engine.plane;
      // Efeitos andam no tempo da simulação (câmera lenta incluída).
      const simDt = engine.slowmo > 0 ? fdt * 0.35 : fdt;
      if (st === GameState.PLAYING) {
        fx.trail(p.x, p.y, p.phi, p.throttle, simDt);
        fx.exhaust(p.x, p.y, p.phi, p.throttle, simDt);
        sfx.engine(true, p.throttle, p.speed / VMAX, engine.slowmo > 0);
      } else if (st === GameState.RESUMING) {
        const n = Math.ceil(engine.resumeCountdown / 0.4);
        if (n !== lastTick && n > 0) {
          lastTick = n;
          sfx.tick();
        }
      } else if (st === GameState.READY) {
        // Menu: avião "parado" planando, para a tela não ficar morta.
        demoT += fdt;
        p.prevPhi = p.phi = Math.sin(demoT * 1.3) * 0.12;
      }
      if (!frozen) {
        fx.update(simDt, p.speed / VMAX);
        renderer.follow(engine, simDt);
      }
      renderer.draw(engine, fx, { showHud: st !== GameState.READY && st !== GameState.GAME_OVER, time: performance.now() / 1000 });
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
    renderer.follow(engine, 0, true);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    ro?.observe(surface);
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);

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
        if ((ev.target as Element | null)?.closest?.('button, input, textarea, form, a')) return;
        sfx.unlock();
        engine.start();
      }
    };
    window.addEventListener('keydown', onKey);

    loop.start();
    if (debug) (window as unknown as Record<string, unknown>).__NDC__ = { engine, loop, input, renderer, fx, Autopilot };

    return () => {
      loop.stop();
      unsubscribe();
      input.dispose();
      surface.removeEventListener('pointermove', onMove);
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
        if (engineRef.current) engineRef.current.slowmoEnabled = !next.reducedMotion;
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

  return { surfaceRef, canvasRef, ui, settings, updateSettings, start, pause, resume, toMenu, playSound, storage };
}
