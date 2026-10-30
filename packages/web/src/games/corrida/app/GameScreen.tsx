import { useEffect, useRef, useState, type RefObject } from 'react';
import type { OfferStatus } from '../../../shared/monetization';
import { CONTINUES, STORAGE } from '../game/config';
import { GameState } from '../game/types';
import { missionText, type Mission } from '../game/Missions';
import { CAUSE_TEXT, useCorrida } from '../hooks/useCorrida';
import { usePlayer, useRanking } from '../../../shared/online/hooks';
import { HubBack } from '../../../shared/ui/HubBack';
import { LoginPanel, RankingPanel, SaveScore, WeeklyCallout } from '../../../shared/ui/RankingUi';
import { corridaAds, useCorridaAds } from './useAds';
import { shareResult, type ShareData, type ShareOutcome } from './share';

type Overlay = 'ranking' | 'login' | 'rotate' | null;

export function GameScreen() {
  // Pedido de nova partida pelo teclado passa pelo intersticial (ref: o hook de anúncios vem depois).
  const restartRequest = useRef<() => void>(() => {});
  const {
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
    reviveWithReward,
    suspendAudio,
    endRun,
    dash,
    playSound,
    storage,
    raiseBest,
  } = useCorrida({ adRevives: corridaAds.revivesPerRun, onRestartRequest: () => restartRequest.current() });
  const primaryRef = useRef<HTMLButtonElement | null>(null);

  const player = usePlayer(storage);
  const profile = player.profile;
  const online = player.mode === 'online';
  const rank = useRanking({
    game: 'corrida',
    storage,
    localKey: STORAGE.ranking,
    player,
    run: { state: ui.state, runId: ui.runId, liveRunId: ui.liveRunId, score: ui.score },
    onSaved: () => playSound('success'),
  });
  const [overlay, setOverlay] = useState<Overlay>(null);
  // Primeira vez com o celular em pé: aviso animado de que dá para jogar deitado.
  const [rotateSeen, setRotateSeen] = useState(() => {
    try {
      return storage.getItem(STORAGE.rotateSeen) === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (!rotateSeen && ui.portrait && ui.state === GameState.READY && overlay === null) setOverlay('rotate');
  }, [rotateSeen, ui.portrait, ui.state, overlay]);
  const closeRotate = () => {
    try {
      storage.setItem(STORAGE.rotateSeen, '1');
    } catch {
      /* vale só nesta visita */
    }
    setRotateSeen(true);
    playSound('click');
    setOverlay(null);
  };
  // Recorde da conta (servidor) vale em qualquer aparelho.
  const accountBest = player.mode === 'online' && profile?.provider === 'online' ? (rank.me?.best ?? 0) : 0;
  useEffect(() => {
    if (accountBest > 0) raiseBest(accountBest);
  }, [accountBest, raiseBest]);

  useEffect(() => {
    if (ui.state !== GameState.READY && ui.state !== GameState.GAME_OVER) setOverlay(null);
  }, [ui.state]);

  // Foco no botão principal: Enter/Espaço funcionam sem mouse.
  useEffect(() => {
    if (overlay) return;
    if (
      ui.state === GameState.READY ||
      ui.state === GameState.GAME_OVER ||
      ui.state === GameState.PAUSED ||
      ui.state === GameState.CONTINUE
    ) {
      primaryRef.current?.focus({ preventScroll: true });
    } else if (document.activeElement instanceof HTMLElement && document.activeElement.closest('[data-ui]')) {
      document.activeElement.blur();
    }
  }, [ui.state, overlay]);

  const signIn = async (name: string, password: string, create: boolean) => {
    const r = await player.signIn(name, password, create);
    if ('profile' in r) playSound('success');
    return r;
  };
  const logout = () => {
    void player.signOut();
    playSound('click');
  };

  /** Continuar gastando uma vida (grátis, como sempre foi). */
  const onContinue = () => {
    playSound('click');
    continueRun();
  };

  const ads = useCorridaAds({
    state: ui.state,
    liveRunId: ui.liveRunId,
    lastChance: ui.lastChance,
    sound: settings.sound,
    start,
    reviveWithReward,
    suspendAudio,
  });
  const restartNow = ads.playAgain;
  const playAgain = () => {
    playSound('click');
    void restartNow();
  };
  restartRequest.current = () => void ads.playAgain();

  // "Jogar novamente" na última chance: encerra a partida de vez (o ranking e as
  // missões registram o fim) e, no render seguinte, começa outra.
  const [pendingRestart, setPendingRestart] = useState(false);
  useEffect(() => {
    if (!pendingRestart || ui.state !== GameState.GAME_OVER) return;
    setPendingRestart(false);
    void restartNow();
  }, [pendingRestart, ui.state, restartNow]);

  const [adMessage, setAdMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!ui.lastChance) setAdMessage(null);
  }, [ui.lastChance]);
  useEffect(() => {
    if (ads.offerStatus === 'dismissed') setAdMessage('O anúncio foi fechado antes do fim, então a corrida não continua.');
    else if (ads.offerStatus === 'error') setAdMessage('O anúncio não funcionou desta vez.');
  }, [ads.offerStatus]);
  const onWatchAd = () => {
    playSound('click');
    void ads.watchAdToContinue();
  };

  // Aviso de missão cumprida: some sozinho depois de um tempinho.
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  useEffect(() => {
    if (!ui.toast) return;
    setToast(ui.toast);
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [ui.toast]);

  const playing = ui.state === GameState.PLAYING || ui.state === GameState.RESUMING;
  const savedThisRun = rank.save.status === 'saved' ? rank.save.outcome?.result ?? null : null;
  const openRanking = () => {
    playSound('click');
    void rank.refresh();
    setOverlay('ranking');
  };

  return (
    <div className="surface corrida" ref={surfaceRef} data-state={ui.state}>
      <canvas ref={canvasRef} className="game-canvas" aria-hidden="true" />

      <div className="arena-ui">
        {!playing && !overlay && ui.state !== GameState.CONTINUE && <HubBack />}

        {playing && (
          <button className="icon-btn pause-btn" data-ui onClick={pause} aria-label="Pausar">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
              <rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
            </svg>
          </button>
        )}

        {playing && (
          <p className="hud-lives" aria-label={`${ui.livesLeft} de ${CONTINUES.lives} vidas`}>
            {Array.from({ length: CONTINUES.lives }, (_, i) => (
              <span key={i} className={i < ui.livesLeft ? 'heart is-full' : 'heart'} aria-hidden="true">
                ♥
              </span>
            ))}
          </p>
        )}

        {toast && (
          <p key={toast.id} className="mission-toast" role="status">
            <span aria-hidden="true">✔</span> Missão cumprida: {toast.text}
          </p>
        )}

        {ui.state === GameState.CONTINUE && ui.lastChance && (
          <LastChance
            ui={ui}
            primaryRef={primaryRef}
            offerStatus={ads.offerStatus}
            message={adMessage}
            busy={pendingRestart || ads.restarting}
            onPlayAgain={() => {
              if (pendingRestart) return;
              playSound('click');
              setPendingRestart(true);
              endRun();
            }}
            onWatchAd={onWatchAd}
            onSeeResult={() => {
              playSound('click');
              endRun();
            }}
          />
        )}

        {ui.state === GameState.CONTINUE && !ui.lastChance && (
          <section className="panel continue" data-ui role="dialog" aria-modal="true" aria-labelledby="cont-title">
            <h2 id="cont-title" className="panel-title">
              Ops!
            </h2>
            {ui.cause && <p className="cause">{CAUSE_TEXT[ui.cause]}</p>}
            <p className="final-score">
              <span className="label">Pontos</span>
              <span className="value">{ui.score}</span>
            </p>
            <p className="lives" aria-label={`${ui.livesLeft} de ${CONTINUES.lives} vidas`}>
              {Array.from({ length: CONTINUES.lives }, (_, i) => (
                <span key={i} className={i < ui.livesLeft ? 'heart is-full' : 'heart'} aria-hidden="true">
                  ♥
                </span>
              ))}
            </p>
            <button ref={primaryRef} className="btn btn-primary" onClick={onContinue}>
              CONTINUAR
            </button>
            <p className="continue-hint">
              {`Continue daqui com ${ui.score} pontos. ${ui.livesLeft === 1 ? 'Usa sua última vida.' : `Usa 1 das ${ui.livesLeft} vidas.`}`}
            </p>
            <button
              className="btn btn-link"
              onClick={() => {
                playSound('click');
                endRun();
              }}
            >
              Encerrar corrida
            </button>
          </section>
        )}

        {ui.state === GameState.PLAYING && ui.meterFull && (
          <button
            className="dash-btn"
            data-ui
            aria-label="Disparada: correr muito rápido e quebrar obstáculos"
            onPointerDown={(e) => {
              e.preventDefault();
              dash();
            }}
            onClick={(e) => {
              // Teclado/leitor de tela (o toque já disparou no pointerdown).
              if (e.detail === 0) dash();
            }}
          >
            <span className="dash-arrow" aria-hidden="true">
              »
            </span>
            DISPARAR
          </button>
        )}

        {overlay === 'ranking' && (
          <RankingPanel
            entries={rank.entries}
            highlightId={savedThisRun?.entry.id}
            scope={rank.scope}
            me={rank.me}
            weekly={rank.weekly}
            youId={profile?.provider === 'online' ? profile.id : undefined}
            onClose={() => {
              playSound('click');
              setOverlay(null);
            }}
          />
        )}

        {overlay === 'rotate' && <RotateIntro onOk={closeRotate} />}

        {overlay === 'login' && (
          <LoginPanel
            initial={profile?.name ?? rank.guestName}
            online={online}
            onSignIn={async (n, pw, create) => {
              const r = await signIn(n, pw, create);
              if ('error' in r) return r.error;
              setOverlay(null);
              return null;
            }}
            onClose={() => setOverlay(null)}
          />
        )}

        {!overlay && ui.state === GameState.READY && (
          <section className="panel menu" data-ui aria-labelledby="title">
            <h1 id="title" className="title">
              <span className="title-accent">Disparada</span>
            </h1>
            <p className="tagline">A capivara corre sozinha, comendo capim. Fuja dos marimbondos!</p>
            <ul className="controls" aria-label="Controles">
              <li>
                <strong>Toque</strong> pula · <strong>segure</strong> para pular alto e planar · encoste no <strong>cipó</strong> para balançar (toque solta)
              </li>
              <li>
                <strong>Deslize ↓</strong> desce rápido · <strong>deslize →</strong> com 12 capins: DISPARADA
              </li>
              <li className="keys">Teclado: Espaço/↑ · ↓ · → · P pausa</li>
            </ul>
            <MissionList missions={ui.missions} level={ui.missionLevel} />
            <button ref={primaryRef} className="btn btn-primary" onClick={playAgain} aria-busy={ads.restarting || undefined}>
              CORRER
            </button>
            {ui.best > 0 && (
              <p className="best">
                Recorde: <strong>{ui.best}</strong>
              </p>
            )}
            {rank.scope === 'online' && <WeeklyCallout weekly={rank.weekly} onOpen={openRanking} />}
            <div className="menu-row">
              <button className="btn btn-secondary btn-inline" onClick={openRanking}>
                Ranking
              </button>
              {profile ? (
                <p className="who">
                  <span>
                    Jogando como <strong>{profile.name}</strong>
                  </span>
                  <button className="btn btn-link btn-tiny" onClick={logout}>
                    Sair
                  </button>
                </p>
              ) : (
                <button
                  className="btn btn-secondary btn-inline"
                  onClick={() => {
                    playSound('click');
                    setOverlay('login');
                  }}
                >
                  Entrar
                </button>
              )}
            </div>
            <Toggles settings={settings} update={updateSettings} />
          </section>
        )}

        {ui.state === GameState.PAUSED && (
          <section className="panel" data-ui role="dialog" aria-modal="true" aria-labelledby="paused-title">
            <h2 id="paused-title" className="panel-title">
              Pausado
            </h2>
            <button ref={primaryRef} className="btn btn-primary" onClick={resume}>
              CONTINUAR
            </button>
            <button className="btn btn-secondary" onClick={start}>
              Reiniciar
            </button>
            <button className="btn btn-link" onClick={toMenu}>
              Menu inicial
            </button>
            <Toggles settings={settings} update={updateSettings} />
          </section>
        )}

        {!overlay && ui.state === GameState.GAME_OVER && (
          <section className="panel gameover" data-ui role="dialog" aria-labelledby="go-title" aria-live="polite">
            <h2 id="go-title" className="panel-title">
              {ui.isNewRecord ? 'Novo recorde!' : 'Fim da corrida'}
            </h2>
            {ui.cause && <p className="cause">{CAUSE_TEXT[ui.cause]}</p>}
            {ui.isNewRecord && (
              <p className="badge" aria-hidden="true">
                ★ RECORDE ★
              </p>
            )}
            <p className="final-score">
              <span className="label">Pontos</span>
              <span className="value">{ui.score}</span>
            </p>
            <p className="run-stats">
              <span>
                <strong>{ui.meters}</strong> m
              </span>
              <span>
                <strong>{ui.fruits}</strong> {ui.fruits === 1 ? 'capim' : 'capins'}
              </span>
            </p>
            <p className="best">
              Recorde: <strong>{ui.best}</strong>
            </p>
            <MissionList
              missions={ui.missions}
              level={ui.missionLevel}
              justDone={ui.runMissions?.completed}
              leveledUp={ui.runMissions?.leveledUp}
            />
            <SaveScore
              key={ui.runId}
              score={ui.score}
              qualifies={rank.eligibility.qualifies}
              threshold={rank.eligibility.threshold}
              profile={profile}
              save={rank.save}
              online={online}
              guestName={rank.guestName}
              onSignIn={async (n, pw, create) => {
                const r = await signIn(n, pw, create);
                if ('error' in r) return r.error;
                await rank.submitAs(r.profile);
                return null;
              }}
              onGuest={async (n) => {
                const o = await rank.submitGuest(n);
                return o.result ? null : o.message ?? 'Não deu para salvar.';
              }}
              onShowRanking={openRanking}
            />
            <ShareButton
              key={`share-${ui.runId}`}
              data={{
                score: ui.score,
                meters: ui.meters,
                fruits: ui.fruits,
                isNewRecord: ui.isNewRecord,
                weekPosition: savedThisRun?.week?.position,
              }}
              onClick={() => playSound('click')}
            />
            <button ref={primaryRef} className="btn btn-primary" onClick={playAgain} aria-busy={ads.restarting || undefined}>
              CORRER DE NOVO
            </button>
            <button className="btn btn-link" onClick={toMenu}>
              Menu inicial
            </button>
          </section>
        )}
      </div>

      {ui.portrait && (
        <div className="rotate-hint" role="status">
          Deite o celular para ver mais do caminho
        </div>
      )}
    </div>
  );
}

function Toggles({
  settings,
  update,
}: {
  settings: { sound: boolean };
  update: (p: Partial<{ sound: boolean }>) => void;
}) {
  return (
    <div className="toggles">
      <button className="chip" aria-pressed={settings.sound} onClick={() => update({ sound: !settings.sound })}>
        {settings.sound ? 'Som: ligado' : 'Som: desligado'}
      </button>
    </div>
  );
}

/** Trio de missões com progresso; no fim da corrida destaca as que acabou de cumprir. */
function MissionList({
  missions,
  level,
  justDone,
  leveledUp,
}: {
  missions: Mission[];
  level: number;
  justDone?: string[];
  leveledUp?: boolean;
}) {
  if (!missions.length) return null;
  return (
    <section className="missions" aria-label={`Missões, nível ${level}`}>
      <p className="missions-head">
        {leveledUp ? (
          <strong className="level-up">Subiu para o nível {level}! Novas missões:</strong>
        ) : (
          <>
            Missões <span className="missions-level">Nível {level}</span>
          </>
        )}
      </p>
      <ol className="missions-list">
        {missions.map((m) => (
          <li key={m.kind} className={m.done ? 'is-done' : undefined} data-new={justDone?.includes(m.kind) && !leveledUp ? '' : undefined}>
            <span className="mission-check" aria-hidden="true">
              {m.done ? '✔' : ''}
            </span>
            <span className="mission-text">{missionText(m)}</span>
            {!m.done && m.target > 1 && (
              <span className="mission-progress">
                {m.progress}/{m.target}
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * Fim das vidas com revive por anúncio disponível. "Jogar novamente" é o
 * principal; ver o anúncio é uma escolha secundária e explícita.
 */
function LastChance({
  ui,
  primaryRef,
  offerStatus,
  message,
  busy,
  onPlayAgain,
  onWatchAd,
  onSeeResult,
}: {
  ui: { score: number; best: number; meters: number; fruits: number; cause: keyof typeof CAUSE_TEXT | null };
  primaryRef: RefObject<HTMLButtonElement | null>;
  offerStatus: OfferStatus;
  message: string | null;
  busy: boolean;
  onPlayAgain: () => void;
  onWatchAd: () => void;
  onSeeResult: () => void;
}) {
  const offering = offerStatus === 'loading' || offerStatus === 'ready' || offerStatus === 'showing';
  const note =
    message ??
    (offerStatus === 'ready'
      ? `Assista a um anúncio curto e continue daqui com ${ui.score} pontos (uma vez por corrida).`
      : offerStatus === 'unavailable' || offerStatus === 'cancelled'
        ? 'Nenhum anúncio disponível agora.'
        : null);
  return (
    <section className="panel continue last-chance" data-ui role="dialog" aria-modal="true" aria-labelledby="lc-title">
      <h2 id="lc-title" className="panel-title">
        Fim das vidas
      </h2>
      {ui.cause && <p className="cause">{CAUSE_TEXT[ui.cause]}</p>}
      <p className="final-score">
        <span className="label">Pontos</span>
        <span className="value">{ui.score}</span>
      </p>
      <p className="run-stats">
        <span>
          <strong>{ui.meters}</strong> m
        </span>
        <span>
          Recorde <strong>{ui.best}</strong>
        </span>
      </p>
      <button ref={primaryRef} className="btn btn-primary" onClick={onPlayAgain} disabled={busy}>
        JOGAR NOVAMENTE
      </button>
      {offering && (
        <button
          className="btn btn-secondary btn-ad"
          onClick={onWatchAd}
          disabled={offerStatus !== 'ready'}
          aria-busy={offerStatus !== 'ready' || undefined}
        >
          {offerStatus === 'loading' ? 'Preparando anúncio…' : offerStatus === 'showing' ? 'Anúncio em andamento…' : '▶ Assistir anúncio para continuar'}
        </button>
      )}
      {note && (
        <p className="continue-hint" role="status">
          {note}
        </p>
      )}
      <button className="btn btn-link" onClick={onSeeResult}>
        Ver resultado
      </button>
    </section>
  );
}

/**
 * Aviso de entrada: um celular girando de em pé para deitado (e voltando)
 * mostra que dá para jogar na horizontal. Some no "Entendi" e não volta.
 */
function RotateIntro({ onOk }: { onOk: () => void }) {
  const okRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => okRef.current?.focus({ preventScroll: true }), []);
  return (
    <section className="panel rotate-intro" data-ui role="dialog" aria-modal="true" aria-labelledby="rotate-title">
      <div className="rotate-phone" aria-hidden="true">
        <svg viewBox="-40 -40 80 80" width="132" height="132">
          <g className="rotate-phone-body">
            <rect x="-17" y="-30" width="34" height="60" rx="6" fill="#1d2440" stroke="#cfd8ff" strokeWidth="2.5" />
            {/* Tela em pé: pouco caminho à vista. */}
            <g className="rotate-screen-portrait">
              <rect x="-13" y="-24" width="26" height="46" rx="2" fill="#8fd0a0" />
              <rect x="-13" y="12" width="26" height="10" fill="#8a5a32" />
              <rect x="-13" y="10" width="26" height="3" fill="#57b84a" />
              <g transform="translate(-3 10)">
                <ellipse cx="0" cy="-4" rx="5" ry="3.2" fill="#9c6a3f" />
                <rect x="3" y="-7.5" width="5" height="4.2" rx="1.6" fill="#8d5e37" />
              </g>
            </g>
            {/* Tela deitada: o jogo se ajusta e mostra mais do caminho (pedra, capins). */}
            <g className="rotate-screen-landscape" transform="translate(0 -1) rotate(-90)">
              <rect x="-23" y="-13" width="46" height="26" rx="2" fill="#8fd0a0" />
              <rect x="-23" y="6" width="46" height="7" fill="#8a5a32" />
              <rect x="-23" y="4.5" width="46" height="2.5" fill="#57b84a" />
              <g transform="translate(-13 5)">
                <ellipse cx="0" cy="-3.4" rx="4.4" ry="2.8" fill="#9c6a3f" />
                <rect x="2.6" y="-6.6" width="4.4" height="3.8" rx="1.4" fill="#8d5e37" />
              </g>
              <path d="M7 4.5 Q9 0 11 4.5 Z" fill="#8b8f98" />
              <circle cx="-2" cy="-1" r="1.6" fill="#b6f04a" />
              <circle cx="2" cy="-3" r="1.6" fill="#b6f04a" />
              <circle cx="17" cy="0" r="1.6" fill="#b6f04a" />
            </g>
            <circle cx="0" cy="26" r="1.6" fill="#cfd8ff" />
          </g>
          <path className="rotate-arrow" d="M 26 -20 A 32 32 0 0 1 30 12" fill="none" stroke="#ffd23f" strokeWidth="3" strokeLinecap="round" />
          <path className="rotate-arrow" d="M 30 12 l -6 -3 M 30 12 l 3 -6" stroke="#ffd23f" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </div>
      <h2 id="rotate-title" className="panel-title">
        Dá para jogar deitado!
      </h2>
      <p className="rotate-text">Vire o celular na horizontal para ver mais do caminho. Em pé também funciona.</p>
      <button ref={okRef} className="btn btn-primary" onClick={onOk}>
        OK, ENTENDI
      </button>
    </section>
  );
}

/** Botão de compartilhar o resultado (imagem para o WhatsApp etc.). */
function ShareButton({ data, onClick }: { data: ShareData; onClick: () => void }) {
  const [state, setState] = useState<'idle' | 'busy' | ShareOutcome>('idle');
  const msg: Partial<Record<ShareOutcome, string>> = {
    downloaded: 'Imagem salva e texto copiado: é só colar no WhatsApp!',
    copied: 'Texto com o link copiado!',
    failed: 'Não deu para compartilhar aqui.',
  };
  return (
    <div className="share-box">
      <button
        className="btn btn-secondary share-btn"
        disabled={state === 'busy'}
        onClick={async () => {
          onClick();
          setState('busy');
          setState(await shareResult(data));
        }}
      >
        <span aria-hidden="true">📤</span> {state === 'busy' ? 'Preparando…' : 'COMPARTILHAR'}
      </button>
      {state !== 'idle' && state !== 'busy' && msg[state] && (
        <p className="share-msg" role="status">
          {msg[state]}
        </p>
      )}
    </div>
  );
}
