import { useCallback, useEffect, useRef, useState } from 'react';
import { MUSIC, RunnerSfx, vibrate } from '../audio';
import { ARENA, SWARM } from '../game/config';
import { Engine } from '../game/Engine';
import { Missions, missionText, type Mission } from '../game/Missions';
import { SwipeDetector } from '../game/Gestures';
import { Autopilot } from '../game/testing/planner';
import { GameState, type DeathCause } from '../game/types';
import { Effects } from '../rendering/effects';
import { rainAt } from '../rendering/weather';
import { WATER_Y } from '../rendering/gators';
import { COLORS, Renderer } from '../rendering/Renderer';
import { InputController } from '../../../shared/input/InputController';
import { effectiveDpr } from '../../../shared/layout/layout';
import { GameLoop } from '../../../shared/loop/GameLoop';
import { loadSettings, saveSettings, systemPrefersReducedMotion, type Settings } from '../../../shared/settings/settings';
import { browserStorage } from '../../../shared/storage/storage';

export interface UiState {
  state: GameState;
  score: number;
  best: number;
  isNewRecord: boolean;
  /** Celular em pé: mostra o aviso para deitar. */
  portrait: boolean;
  runId: number;
  /** runId da partida em andamento — usado pelo ranking online. */
  liveRunId: number;
  meters: number;
  fruits: number;
  cause: DeathCause | null;
  meterFull: boolean;
  /** Vidas que ainda dá para gastar continuando nesta partida. */
  livesLeft: number;
  /** Missões (cópia para a tela) e o nível da capivara. */
  missions: Mission[];
  missionLevel: number;
  /** Aviso de missão cumprida durante a corrida. */
  toast: { id: number; text: string } | null;
  /** Fim da corrida: missões cumpridas nela e se subiu de nível. */
  runMissions: { completed: string[]; leveledUp: boolean } | null;
}

export const CAUSE_TEXT: Record<DeathCause, string> = {
  rock: 'Trombou numa pedra',
  thorns: 'Caiu nos espinhos',
  river: 'O jacaré pegou!',
  swarm: 'Os marimbondos alcançaram',
};

const RAINBOW = ['#ff5a5a', '#ffb347', '#ffe95a', '#6be36b', '#5ac8ff', '#c77dff'];
const DROP_KEYS = new Set(['ArrowDown', 'KeyS']);
const DASH_KEYS = new Set(['ArrowRight', 'KeyD', 'ShiftLeft', 'ShiftRight']);

function isInteractive(target: EventTarget | null): boolean {
  const el = target as { closest?: (sel: string) => unknown } | null;
  return !!el?.closest?.('button, a, input, select, textarea, [data-ui]');
}

/**
 * Liga a simulação ao React. O React só re-renderiza em mudanças de estado
 * (menu, pausa, fim, medidor cheio) — nunca a cada quadro.
 */
export function useCorrida() {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const storage = useRef(browserStorage()).current;
  const engineRef = useRef<Engine | null>(null);
  const sfxRef = useRef<RunnerSfx | null>(null);
  const fxRef = useRef<Effects | null>(null);

  const [settings, setSettings] = useState<Settings>(() => loadSettings(storage));
  const settingsRef = useRef(settings);
  const [ui, setUi] = useState<UiState>({
    state: GameState.READY,
    score: 0,
    best: 0,
    isNewRecord: false,
    portrait: false,
    runId: 0,
    liveRunId: 0,
    meters: 0,
    fruits: 0,
    cause: null,
    meterFull: false,
    livesLeft: 0,
    missions: [],
    missionLevel: 1,
    toast: null,
    runMissions: null,
  });

  useEffect(() => {
    const surface = surfaceRef.current;
    const canvas = canvasRef.current;
    if (!surface || !canvas) return;

    const params = new URLSearchParams(location.search);
    const debug = params.has('debug');
    const seedParam = params.get('seed');
    const engine = new Engine({ storage, seed: seedParam ? Number(seedParam) : undefined });
    const missions = new Missions(storage);
    const snapshot = () => ({ missions: missions.slots.map((m) => ({ ...m })), missionLevel: missions.level });
    let runDone: string[] = [];
    let toastId = 0;
    let lastRun = 0;
    /** Batidas desde que a música do ímã (re)começou (as patas acompanham o forró); null = sem ímã. */
    let beat: number | null = null;
    /** Missões cumpridas agora: aviso na tela, som e cópia nova para a interface. */
    const completed = (list: Mission[]) => {
      if (!list.length) return;
      for (const m of list) runDone.push(m.kind);
      sfx.success();
      vibrate(12);
      const text = list.length === 1 ? missionText(list[0]) : `${list.length} missões`;
      setUi((u) => ({ ...u, ...snapshot(), toast: { id: ++toastId, text } }));
    };
    const finishRun = () => {
      const r = missions.endRun();
      for (const m of r.completed) runDone.push(m.kind);
      setUi((u) => ({ ...u, ...snapshot(), runMissions: { completed: runDone, leveledUp: r.leveledUp } }));
    };
    setUi((u) => ({ ...u, ...snapshot() }));
    const fx = new Effects();
    const sfx = new RunnerSfx();
    const renderer = new Renderer(canvas);
    engineRef.current = engine;
    fxRef.current = fx;
    sfxRef.current = sfx;
    // Sem botão de "menos movimento" neste jogo: só respeita o ajuste de acessibilidade do aparelho.
    fx.reducedMotion = systemPrefersReducedMotion();
    sfx.enabled = settingsRef.current.sound;
    setUi((u) => ({ ...u, best: engine.score.best }));

    const tryDash = () => {
      if (engine.dash()) sfx.unlock();
    };

    const input = new InputController(surface, window, (holding) => {
      engine.setHolding(holding);
      if (holding) {
        fx.pressPulse = 1;
        sfx.unlock();
      }
    });
    input.setEnabled(false);

    // Deslizes (o toque já pulou; o deslize só acrescenta a ação).
    const swipes = new SwipeDetector();
    const onDown = (ev: PointerEvent) => {
      if (isInteractive(ev.target)) return;
      swipes.down(ev.pointerId, ev.clientX, ev.clientY, ev.timeStamp / 1000);
    };
    const onMove = (ev: PointerEvent) => {
      if (engine.state !== GameState.PLAYING) return;
      const s = swipes.move(ev.pointerId, ev.clientX, ev.clientY, ev.timeStamp / 1000);
      if (s === 'drop') engine.drop();
      else if (s === 'dash') tryDash();
    };
    const onUp = (ev: PointerEvent) => swipes.up(ev.pointerId);
    surface.addEventListener('pointerdown', onDown);
    surface.addEventListener('pointermove', onMove);
    surface.addEventListener('pointerup', onUp);
    surface.addEventListener('pointercancel', onUp);

    const unsubscribe = engine.on((e) => {
      switch (e.type) {
        case 'state': {
          // Corrida nova = runId novo (vale também para "Reiniciar" na pausa).
          const fresh = e.state === GameState.PLAYING && engine.runId !== lastRun;
          if (fresh) {
            lastRun = engine.runId;
            runDone = [];
            missions.startRun();
            setUi((u) => ({ ...u, ...snapshot(), runMissions: null, toast: null }));
          }
          // Fim de verdade (ou desistiu pelo menu no meio): fecha a corrida das missões.
          if (e.state === GameState.GAME_OVER || (e.state === GameState.READY && e.previous !== GameState.READY)) finishRun();
          if (fresh) {
            fx.clear();
            renderer.weather.reset();
            renderer.gators.reset();
            renderer.follow(engine, 0, true);
            sfx.start();
          }
          if (e.state === GameState.PLAYING && e.previous === GameState.RESUMING) sfx.tick(true);
          if (e.state !== GameState.PLAYING) {
            sfx.buzz(0);
            sfx.rain(0);
            // Música e patas param juntas e recomeçam juntas ao voltar a jogar.
            sfx.musicStop();
            beat = null;
          }
          input.setEnabled(e.state === GameState.PLAYING || e.state === GameState.RESUMING);
          swipes.clear();
          setUi((u) => ({ ...u, state: e.state, best: engine.score.best, liveRunId: engine.runId, meterFull: engine.meterFull, livesLeft: engine.livesLeft }));
          break;
        }
        case 'jump':
          sfx.jump();
          vibrate(6);
          break;
        case 'land':
          if (e.hard) {
            sfx.land(true);
            fx.burst(e.x, e.y + 2, 6, 90, ['#d9c49a', '#b89b6a'], 0.35, 2.5, true);
          }
          break;
        case 'glide':
          if (e.on) sfx.glide();
          break;
        case 'fastFall':
          sfx.fastFall();
          break;
        case 'fruit':
          completed(missions.capim());
          sfx.fruit(e.streak);
          fx.burst(e.x, e.y, 5, 70, ['#b6f04a', '#ffffff'], 0.35, 2, false);
          if (e.meterFull) {
            sfx.meterFull();
            fx.meterGlow = 1;
            setUi((u) => ({ ...u, meterFull: true }));
          }
          break;
        case 'crate':
          completed(missions.crate(e.stomp));
          sfx.crate(e.stomp);
          fx.burst(e.x, e.y, 14, 180, [COLORS.crate, COLORS.crateDark, '#e8b47a'], 0.6, 3.2, true);
          if (!e.stomp) {
            fx.shake = 0.4;
            fx.float(e.x, e.y + 40, 'ATRASOU!', false, '#ff9a9a');
            vibrate(20);
          } else fx.float(e.x, e.y + 40, '+10', false, '#fff2a8');
          break;
        case 'smash':
          completed(missions.smash());
          sfx.smash();
          fx.burst(e.x, e.y, 16, 220, [COLORS.rock, COLORS.rockDark, COLORS.rockLight], 0.7, 3.5, true);
          fx.float(e.x, e.y + 50, '+10', false, '#fff2a8');
          break;
        case 'spring':
          completed(missions.spring());
          sfx.spring();
          fx.burst(e.x, e.y, 8, 120, [COLORS.petal, '#ffd23f'], 0.5, 2.6, false);
          break;
        case 'magnet':
          sfx.magnet(e.on);
          if (e.on) {
            completed(missions.magnet());
            fx.float(e.x + 30, e.y + 60, 'ÍMÃ DE CAPIM!', true, '#ff9a9a');
            fx.burst(e.x, e.y, 10, 120, ['#e8322f', '#ffffff', '#ffd23f'], 0.5, 2.5, false);
            vibrate(12);
          }
          break;
        case 'canopy':
          completed(missions.canopy());
          fx.float(e.x + 40, e.y + 70, 'COPA DAS ÁRVORES!', true, '#c8f58a');
          sfx.canopy();
          break;
        case 'vine':
          if (e.on) completed(missions.vine());
          sfx.vine(e.on);
          if (e.on) vibrate(8);
          break;
        case 'dash':
          if (e.on) completed(missions.dash());
          if (e.on) {
            sfx.dash();
            fx.flash = 0.35;
            vibrate(15);
            setUi((u) => ({ ...u, meterFull: false }));
          }
          break;
        case 'newRecord':
          fx.float(engine.runner.x + 40, engine.runner.y + 100, 'NOVO RECORDE!', true, '#ffe36b');
          sfx.record();
          break;
        case 'death':
          if (e.cause === 'river') sfx.splash();
          sfx.crash();
          fx.shake = 1;
          fx.flash = e.cause === 'river' ? 0.2 : 0.7;
          fx.burst(e.x, e.y + 17, 20, 200, e.cause === 'river' ? ['#9fdcff', '#ffffff'] : ['#9a6a40', '#ffffff', '#6e4826'], 0.8, 3, true);
          vibrate([30, 40, 60]);
          setUi((u) => ({
            ...u,
            score: e.score,
            best: e.best,
            isNewRecord: e.isNewRecord,
            runId: engine.runId,
            meters: engine.score.meters,
            fruits: engine.score.fruits,
            cause: e.cause,
            meterFull: false,
            livesLeft: e.livesLeft,
          }));
          break;
        case 'continue':
          fx.clear();
          renderer.gators.reset();
          renderer.follow(engine, 0, true);
          setUi((u) => ({ ...u, livesLeft: e.livesLeft, cause: null }));
          break;
      }
    });

    // `?debug&piloto` liga o piloto automático (capturas e testes de navegador).
    const pilot = debug && params.has('piloto') ? new Autopilot() : null;
    let sparkle = 0;
    const loop = new GameLoop((dt) => {
      if (pilot && engine.state === GameState.PLAYING) {
        // O piloto decide a cada passo fixo: avança passo a passo.
        let acc = Math.min(dt, 0.1);
        while (acc >= 1 / 120 && engine.state === GameState.PLAYING) {
          engine.setHolding(pilot.decide(engine.runner, engine.track.level, engine.elapsed, { level: engine.boost, magnetLeft: engine.magnet }));
          engine.advance(1 / 120);
          acc -= 1 / 120;
        }
      } else engine.advance(dt);
      const st = engine.state;
      const fdt = Math.min(dt, 0.1);
      const frozen = st === GameState.PAUSED || st === GameState.RESUMING;
      if (st === GameState.PLAYING) {
        completed(missions.tick(engine.score.meters, engine.runner.gliding ? fdt : 0));
        const r = engine.runner;
        if (r.grounded) fx.dust(r.x, r.y, engine.runSpeed, fdt);
        const near = engine.swarm < SWARM.warn * 1.3 ? 1 - engine.swarm / (SWARM.warn * 1.3) : 0;
        // Com o ímã: música acelerada e zumbido do enxame mais baixo por baixo dela.
        if (engine.magnet > 0) {
          sfx.musicTick(engine.magnet);
          const bpm = engine.magnet < 2 ? MUSIC.bpm * MUSIC.finalRush : MUSIC.bpm;
          beat = (beat ?? 0) + (fdt * bpm) / 60;
          // Rastro de brilho colorido atrás da capivara (estilo "estrela" de jogo de plataforma).
          sparkle -= fdt;
          if (sparkle <= 0 && !fx.reducedMotion) {
            sparkle = 0.04;
            const r = engine.runner;
            fx.burst(r.x - 14, r.y + 10 + Math.random() * 24, 2, 60, RAINBOW, 0.45, 3, false);
          }
        }
        else {
          sfx.musicStop();
          beat = null;
        }
        sfx.buzz(sfx.musicPlaying ? near * 0.4 : near);
      }
      if (!frozen) {
        const active = st === GameState.PLAYING || st === GameState.GAME_OVER || st === GameState.CONTINUE;
        renderer.weather.update(fdt, active ? rainAt(engine.score.meters, engine.runId) : 0, fx.reducedMotion);
        // Bote do jacaré: respingo ao sair da água, "nhac" ao fechar a boca.
        renderer.gators.update(engine, fdt);
        for (const em of renderer.gators.events.emerge) {
          fx.burst(em.x, WATER_Y + 2, 10, 160, ['#9fdcff', '#ffffff'], 0.55, 2.6, true);
          sfx.splashSmall();
        }
        for (const sn of renderer.gators.events.snap) {
          sfx.chomp();
          if (sn.kind === 'bote') {
            vibrate(10);
            if (sn.gap < 40) fx.float(sn.x + 30, sn.y + 60, 'UFA!', false, '#c8f58a');
          }
        }
        // No inverno a "chuva" vira nevasca: sem trovão e com chiado bem mais baixo.
        if (renderer.weather.thunder && !renderer.winter) sfx.thunder();
        sfx.rain(st === GameState.PLAYING ? renderer.weather.rain * (renderer.winter ? 0.3 : 1) : 0);
        fx.update(fdt);
        renderer.follow(engine, fdt);
      }
      renderer.draw(engine, fx, { beat: st === GameState.PLAYING ? beat : null, showHud: st !== GameState.READY && st !== GameState.GAME_OVER && st !== GameState.CONTINUE, time: performance.now() / 1000 });
    });

    const resize = () => {
      const rect = surface.getBoundingClientRect();
      renderer.resize(rect.width, rect.height, effectiveDpr(window.devicePixelRatio));
      const l = renderer.layout;
      // A interface usa a superfície inteira (os painéis não cabem na faixa da arena em pé).
      const u = Math.max(0.75, Math.min(1.45, Math.min(rect.width / 360, rect.height / 400)));
      surface.style.setProperty('--arena-left', '0px');
      surface.style.setProperty('--arena-top', '0px');
      surface.style.setProperty('--arena-w', `${rect.width}px`);
      surface.style.setProperty('--arena-h', `${rect.height}px`);
      surface.style.setProperty('--u', `${u}px`);
      surface.style.setProperty('--game-top', `${l.offsetY}px`);
      surface.style.setProperty('--game-h', `${ARENA.height * l.scale}px`);
      const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
      const portrait = coarse && rect.height > rect.width * 1.1;
      setUi((u2) => (u2.portrait === portrait ? u2 : { ...u2, portrait }));
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
        return;
      }
      if (engine.state === GameState.PLAYING && !isInteractive(ev.target)) {
        if (DROP_KEYS.has(ev.code)) {
          ev.preventDefault();
          engine.drop();
        } else if (DASH_KEYS.has(ev.code)) {
          ev.preventDefault();
          tryDash();
        }
        return;
      }
      if (ev.code === 'Enter' && (engine.state === GameState.READY || engine.state === GameState.GAME_OVER)) {
        if ((ev.target as Element | null)?.closest?.('button, input, textarea, form, a')) return;
        sfx.unlock();
        engine.start();
      }
    };
    window.addEventListener('keydown', onKey);

    loop.start();
    if (debug) (window as unknown as Record<string, unknown>).__NDC__ = { engine, loop, input, renderer, fx, sfx };

    return () => {
      loop.stop();
      unsubscribe();
      input.dispose();
      surface.removeEventListener('pointerdown', onDown);
      surface.removeEventListener('pointermove', onMove);
      surface.removeEventListener('pointerup', onUp);
      surface.removeEventListener('pointercancel', onUp);
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
  const continueRun = useCallback(() => {
    sfxRef.current?.unlock();
    engineRef.current?.continueRun();
  }, []);
  const endRun = useCallback(() => engineRef.current?.endRun(), []);
  const dash = useCallback(() => {
    sfxRef.current?.unlock();
    engineRef.current?.dash();
  }, []);
  /** Recorde da conta (servidor) também vale neste aparelho: só sobe. */
  const raiseBest = useCallback((n: number) => {
    const e = engineRef.current;
    if (e?.score.raiseBest(n)) setUi((u) => ({ ...u, best: e.score.best }));
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

  return { surfaceRef, canvasRef, ui, settings, updateSettings, start, pause, resume, toMenu, continueRun, endRun, dash, playSound, storage, raiseBest };
}
