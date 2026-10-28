import { useCallback, useEffect, useRef, useState } from 'react';
import { ARENA } from '../game/config';
import { difficultyAt } from '../game/Difficulty';
import { GameEngine } from '../game/GameEngine';
import { GameLoop } from '../../../shared/loop/GameLoop';
import { browserStorage } from '../game/ScoreManager';
import { GameState } from '../game/types';
import { InputController } from '../../../shared/input/InputController';
import { Sfx } from '../audio';
import { loadSettings, saveSettings, type Settings } from '../../../shared/settings/settings';
import { CanvasRenderer, COLORS } from '../rendering/CanvasRenderer';
import { Effects } from '../rendering/effects';
import { SCENE_NAMES, sceneryAt, weightOf } from '../rendering/scenery';
import { Wallet, type WalletState } from '../game/Wallet';
import { TRAILS } from '../game/cosmetics';
import { effectiveDpr } from '../../../shared/layout/layout';

export interface UiState {
  state: GameState;
  score: number;
  best: number;
  isNewRecord: boolean;
  landscape: boolean;
  /** Identificador da partida que terminou (para enviar ao ranking uma única vez). */
  runId: number;
  /** runId da partida em andamento (muda quando uma partida começa) — usado pelo ranking online. */
  liveRunId: number;
  /** Vidas restantes para continuar de onde parou (nesta partida). */
  livesLeft: number;
  /** Moedas pegas na última partida. */
  runCoins: number;
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
  const [ui, setUi] = useState<UiState>({
    state: GameState.READY,
    score: 0,
    best: 0,
    isNewRecord: false,
    landscape: false,
    runId: 0,
    liveRunId: 0,
    livesLeft: 0,
    runCoins: 0,
  });
  const wallet = useRef<Wallet | null>(null);
  if (!wallet.current) wallet.current = new Wallet(storage);
  /** Carteira e itens da loja (re-renderiza quando muda). */
  const [shop, setShop] = useState<WalletState>(() => wallet.current!.get());
  const rendererRef = useRef<CanvasRenderer | null>(null);

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
    rendererRef.current = renderer;
    {
      const w = wallet.current!.get();
      renderer.look = { skin: w.skin, trail: w.trail };
      sfx.style = w.trail;
    }
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
      if (engine.state === GameState.PLAYING) {
        if (holding) sfx.press();
        else sfx.release();
      }
    });
    input.setEnabled(false);

    let combo = 0;
    let lastTick = 0;
    let coinStreak = 0;
    let lastCoinAt = -10;
    /** Segundos até o próximo grito de macaco (só na selva, de vez em quando). */
    let monkeyIn = 6 + Math.random() * 6;
    /** Último cenário anunciado nesta partida ("SELVA!" quando ela começa a chegar). */
    let sceneShown = sceneryAt(0).to;
    const unsubscribe = engine.on((e) => {
      switch (e.type) {
        case 'state':
          if (e.state === GameState.PLAYING && e.previous !== GameState.RESUMING && e.previous !== GameState.PAUSED) {
            combo = 0;
            sfx.start();
          }
          if (e.state === GameState.RESUMING) lastTick = 0;
          if (e.state === GameState.PLAYING && e.previous === GameState.RESUMING) sfx.tick(true);
          if (e.state !== GameState.PLAYING) sfx.thrust(false);
          input.setEnabled(e.state === GameState.PLAYING || e.state === GameState.RESUMING);
          if (e.state === GameState.PLAYING && e.previous !== GameState.RESUMING && e.previous !== GameState.PAUSED) {
            fx.clear();
            sceneShown = sceneryAt(0).to;
            coinStreak = 0;
            monkeyIn = 6 + Math.random() * 6;
          }
          if (e.state === GameState.PLAYING) engine.setHolding(input.isHolding);
          setUi((u) => ({ ...u, state: e.state, best: engine.score.best, liveRunId: engine.runId, livesLeft: engine.livesLeft }));
          break;
        case 'pass': {
          const b = e.barrier;
          fx.float(b.x + b.width / 2, (b.gapTop + b.gapBottom) / 2, '+5');
          fx.emit(b.x + b.width, (b.gapTop + b.gapBottom) / 2, 6, 70, [COLORS.passed, '#ffffff'], 0.4, 2);
          sfx.pass(combo++);
          break;
        }
        case 'coin': {
          // grava na hora: a moeda não se perde se a aba fechar
          wallet.current!.add(1);
          coinStreak = fx.clock - lastCoinAt < 3 ? coinStreak + 1 : 0;
          lastCoinAt = fx.clock;
          sfx.coin(coinStreak);
          fx.float(e.x, e.y - 12, '+1');
          fx.emit(e.x, e.y, 8, 80, ['#ffcc33', '#fff1a8'], 0.35, 2);
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
          combo = 0;
          setUi((u) => ({ ...u, score: e.score, best: e.best, isNewRecord: e.isNewRecord, runId: engine.runId, livesLeft: e.livesLeft, runCoins: engine.coins.collected }));
          setShop(wallet.current!.get());
          break;
      }
    });

    const loop = new GameLoop((dt) => {
      engine.advance(dt);
      const st = engine.state;
      const frozen = st === GameState.PAUSED || st === GameState.RESUMING;
      const fdt = Math.min(dt, 0.1);
      if (st === GameState.PLAYING) {
        const mix = sceneryAt(engine.score.score);
        const scene = mix.to;
        // Macaquinho gritando de vez em quando (baixinho), só com a selva já bem visível.
        if (weightOf(mix, 'selva') > 0.6) {
          monkeyIn -= fdt;
          if (monkeyIn <= 0) {
            sfx.monkey();
            monkeyIn = 14 + Math.random() * 16;
          }
        }
        if (scene !== sceneShown) {
          sceneShown = scene;
          fx.float(ARENA.width / 2, ARENA.height * 0.36, SCENE_NAMES[scene], true);
        }
        fx.recordTrail(engine.ball.y, fdt);
        if (engine.holding) fx.thrust(engine.ball.x, engine.ball.y, engine.ball.radius, fdt);
        sfx.thrust(engine.holding, Math.max(0, Math.min(1, -engine.ball.vy / 430)));
      } else if (st === GameState.RESUMING) {
        const n = Math.ceil(engine.resumeCountdown / 0.4);
        if (n !== lastTick && n > 0) {
          lastTick = n;
          sfx.tick();
        }
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
        // Botões e campos de texto (nome no ranking) tratam o próprio Enter.
        if ((ev.target as Element | null)?.closest?.('button, input, textarea, form')) return;
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
  /** Gasta uma vida e continua de onde bateu (depois do anúncio, quando houver). */
  const continueRun = useCallback(() => {
    sfxRef.current?.unlock();
    return engineRef.current?.continueRun() ?? false;
  }, []);
  /** Encerra a partida sem continuar. */
  const endRun = useCallback(() => engineRef.current?.endRun(), []);
  const playSound = useCallback((name: 'click' | 'success') => {
    sfxRef.current?.unlock();
    sfxRef.current?.[name]();
  }, []);

  /** Aplica o visual e o som da carteira atual e atualiza a tela da loja. */
  const syncLook = useCallback((feedbackItem?: string) => {
    const st = wallet.current!.get();
    if (rendererRef.current) rendererRef.current.look = { skin: st.skin, trail: st.trail };
    const sfx = sfxRef.current;
    if (sfx) {
      sfx.style = st.trail;
      if (feedbackItem) {
        sfx.unlock();
        // prévia: ao escolher um rastro, toca o som do toque dele
        if (TRAILS.some((t) => t.id === feedbackItem)) sfx.press();
        else sfx.success();
      }
    }
    setShop(st);
  }, []);

  /** Troca de carteira: a do aparelho (sem conta) ou a cópia local da conta. */
  const setWalletKey = useCallback(
    (key: string) => {
      wallet.current!.switchTo(key);
      syncLook();
    },
    [syncLook],
  );

  /** Carteira que veio do servidor (conta). */
  const applyWallet = useCallback(
    (w: { coins: number; owned: string[]; skin: string; trail: string }, feedbackItem?: string) => {
      wallet.current!.replace(w);
      syncLook(feedbackItem);
    },
    [syncLook],
  );

  /** Recorde da conta (servidor) também vale aqui: só sobe. */
  const raiseBest = useCallback((n: number) => {
    const e = engineRef.current;
    if (e?.score.raiseBest(n)) setUi((u) => ({ ...u, best: e.score.best }));
  }, []);

  /** Loja: compra (se tiver moedas) e já usa o item. */
  const buyItem = useCallback((id: string) => {
    const w = wallet.current!;
    const ok = w.owns(id) || w.buy(id);
    if (ok) w.equip(id);
    syncLook(ok ? id : undefined);
    return ok;
  }, [syncLook]);

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
            sfxRef.current.click(); // bipe de teste: confirma que o som está saindo
          }
        }
        return next;
      });
    },
    [storage],
  );

  return {
    surfaceRef,
    canvasRef,
    ui,
    settings,
    updateSettings,
    start,
    pause,
    resume,
    toMenu,
    continueRun,
    endRun,
    playSound,
    storage,
    shop,
    buyItem,
    setWalletKey,
    applyWallet,
    raiseBest,
  };
}
