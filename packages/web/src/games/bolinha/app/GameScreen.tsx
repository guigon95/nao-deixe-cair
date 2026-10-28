import { useEffect, useRef, useState } from 'react';
import { GameState } from '../game/types';
import { useGame } from '../hooks/useGame';
import { usePlayer, useRanking } from '../../../shared/online/hooks';
import { HubBack } from '../../../shared/ui/HubBack';
import { rewardedAds } from '../../../shared/ads/rewarded';
import { CONTINUES } from '../game/config';
import { LoginPanel, RankingPanel, SaveScore } from '../../../shared/ui/RankingUi';

type Overlay = 'ranking' | 'login' | null;

export function GameScreen() {
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
    endRun,
    playSound,
    storage,
  } = useGame();
  const primaryRef = useRef<HTMLButtonElement | null>(null);

  const player = usePlayer(storage);
  const profile = player.profile;
  const online = player.mode === 'online';
  const rank = useRanking({
    game: 'bolinha',
    storage,
    player,
    run: { state: ui.state, runId: ui.runId, liveRunId: ui.liveRunId, score: ui.score },
    onSaved: () => playSound('success'),
  });
  const [overlay, setOverlay] = useState<Overlay>(null);

  useEffect(() => {
    if (ui.state !== GameState.READY && ui.state !== GameState.GAME_OVER) setOverlay(null);
  }, [ui.state]);

  // Foco no botão principal de cada tela: Enter/Espaço funcionam sem mouse.
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
      // Durante a partida, nenhum botão deve “roubar” o Espaço.
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

  const playing = ui.state === GameState.PLAYING || ui.state === GameState.RESUMING;
  const savedThisRun = rank.save.status === 'saved' ? rank.save.outcome?.result ?? null : null;
  const openRanking = () => {
    playSound('click');
    void rank.refresh();
    setOverlay('ranking');
  };

  return (
    <div className="surface" ref={surfaceRef} data-state={ui.state}>
      <canvas ref={canvasRef} className="game-canvas" aria-hidden="true" />

      <div className="arena-ui">
        {playing && (
          <button className="icon-btn pause-btn" data-ui onClick={pause} aria-label="Pausar">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
              <rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
            </svg>
          </button>
        )}

        {!playing && !overlay && ui.state !== GameState.CONTINUE && <HubBack />}

        {overlay === 'ranking' && (
          <RankingPanel
            entries={rank.entries}
            highlightId={savedThisRun?.entry.id}
            scope={rank.scope}
            me={rank.me}
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
              <span>Não Deixe</span>
              <span className="title-accent">Cair</span>
            </h1>
            <div className="demo" aria-hidden="true">
              <span className="demo-ball" />
            </div>
            <p className="howto">
              <strong>Segure</strong> para subir. <strong>Solte</strong> para cair.
              <br />
              Passe pelos vãos das barreiras.
            </p>
            <button ref={primaryRef} className="btn btn-primary" onClick={start}>
              JOGAR
            </button>
            {ui.best > 0 && (
              <p className="best">
                Recorde: <strong>{ui.best}</strong>
              </p>
            )}
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

        {ui.state === GameState.CONTINUE && (
          <section className="panel continue" data-ui role="dialog" aria-modal="true" aria-labelledby="cont-title">
            <h2 id="cont-title" className="panel-title">
              Bateu!
            </h2>
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
                `Continue de onde parou com ${ui.score} pontos. ${ui.livesLeft === 1 ? 'Usa sua última vida.' : `Usa 1 das ${ui.livesLeft} vidas.`}`}
            </p>
            <button
              className="btn btn-link"
              onClick={() => {
                playSound('click');
                endRun();
              }}
            >
              Encerrar partida
            </button>
          </section>
        )}

        {!overlay && ui.state === GameState.GAME_OVER && (
          <section className="panel gameover" data-ui role="dialog" aria-labelledby="go-title" aria-live="polite">
            <h2 id="go-title" className="panel-title">
              {ui.isNewRecord ? 'Novo recorde!' : 'Fim de jogo'}
            </h2>
            {ui.isNewRecord && (
              <p className="badge" aria-hidden="true">
                ★ RECORDE ★
              </p>
            )}
            <p className="final-score">
              <span className="label">Pontos</span>
              <span className="value">{ui.score}</span>
            </p>
            <p className="best">
              Recorde: <strong>{ui.best}</strong>
            </p>
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
                // acabou de entrar: envia esta partida com a conta
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
              JOGAR DE NOVO
            </button>
            <button className="btn btn-link" onClick={toMenu}>
              Menu inicial
            </button>
          </section>
        )}
      </div>

      {ui.landscape && (
        <div className="rotate-hint" role="status">
          Gire o aparelho para a vertical para jogar melhor
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
