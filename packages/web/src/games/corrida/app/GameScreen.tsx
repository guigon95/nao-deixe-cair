import { useEffect, useRef, useState } from 'react';
import { CONTINUES, STORAGE } from '../game/config';
import { GameState } from '../game/types';
import { missionText, type Mission } from '../game/Missions';
import { CAUSE_TEXT, useCorrida } from '../hooks/useCorrida';
import { usePlayer, useRanking } from '../../../shared/online/hooks';
import { HubBack } from '../../../shared/ui/HubBack';
import { rewardedAds } from '../../../shared/ads/rewarded';
import { LoginPanel, RankingPanel, SaveScore, WeeklyCallout } from '../../../shared/ui/RankingUi';

type Overlay = 'ranking' | 'login' | null;

export function GameScreen() {
  const { surfaceRef, canvasRef, ui, settings, updateSettings, start, pause, resume, toMenu, continueRun, endRun, dash, playSound, storage, raiseBest } =
    useCorrida();
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

  const [watchingAd, setWatchingAd] = useState(false);
  const [adMessage, setAdMessage] = useState<string | null>(null);
  useEffect(() => {
    if (ui.state !== GameState.CONTINUE) setAdMessage(null);
  }, [ui.state]);
  /** Continuar: (futuramente) assiste ao anúncio e, com a recompensa, volta de onde bateu. */
  const onContinue = async () => {
    if (watchingAd) return;
    playSound('click');
    setWatchingAd(true);
    try {
      const r = await rewardedAds.show('continue');
      if (r === 'rewarded') continueRun();
      else setAdMessage(r === 'dismissed' ? 'Assista ao anúncio até o fim para continuar.' : 'Anúncio indisponível agora. Tente de novo.');
    } finally {
      setWatchingAd(false);
    }
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

        {ui.state === GameState.CONTINUE && (
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
            <button ref={primaryRef} className="btn btn-primary" onClick={onContinue} disabled={watchingAd}>
              {watchingAd ? 'AGUARDE…' : rewardedAds.provider === 'none' ? 'CONTINUAR' : '▶ ASSISTIR E CONTINUAR'}
            </button>
            <p className="continue-hint">
              {adMessage ??
                `Continue daqui com ${ui.score} pontos. ${ui.livesLeft === 1 ? 'Usa sua última vida.' : `Usa 1 das ${ui.livesLeft} vidas.`}`}
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
            <button ref={primaryRef} className="btn btn-primary" onClick={start}>
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
            <button ref={primaryRef} className="btn btn-primary" onClick={start}>
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
  settings: { sound: boolean; reducedMotion: boolean };
  update: (p: Partial<{ sound: boolean; reducedMotion: boolean }>) => void;
}) {
  return (
    <div className="toggles">
      <button className="chip" aria-pressed={settings.sound} onClick={() => update({ sound: !settings.sound })}>
        {settings.sound ? 'Som: ligado' : 'Som: desligado'}
      </button>
      <button
        className="chip"
        aria-pressed={settings.reducedMotion}
        onClick={() => update({ reducedMotion: !settings.reducedMotion })}
      >
        {settings.reducedMotion ? 'Menos movimento: sim' : 'Menos movimento: não'}
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
