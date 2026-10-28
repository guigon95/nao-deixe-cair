import { useEffect, useRef, useState } from 'react';
import { STORAGE } from '../game/config';
import { GameState } from '../game/types';
import { useAviao } from '../hooks/useAviao';
import { usePlayer, useRanking } from '../../../shared/online/hooks';
import { HubBack } from '../../../shared/ui/HubBack';
import { LoginPanel, RankingPanel, SaveScore } from '../../../shared/ui/RankingUi';

type Overlay = 'ranking' | 'login' | null;

export function GameScreen() {
  const { surfaceRef, canvasRef, ui, settings, updateSettings, start, pause, resume, toMenu, playSound, storage, physics } =
    useAviao();
  const primaryRef = useRef<HTMLButtonElement | null>(null);

  const player = usePlayer(storage);
  const profile = player.profile;
  const online = player.mode === 'online';
  const rank = useRanking({
    game: 'aviao',
    storage,
    localKey: STORAGE.ranking,
    player,
    run: { state: ui.state, runId: ui.runId, liveRunId: ui.liveRunId, score: ui.score },
    onSaved: () => playSound('success'),
  });
  const [overlay, setOverlay] = useState<Overlay>(null);

  useEffect(() => {
    if (ui.state !== GameState.READY && ui.state !== GameState.GAME_OVER) setOverlay(null);
  }, [ui.state]);

  // Foco no botão principal: Enter/Espaço funcionam sem mouse.
  useEffect(() => {
    if (overlay) return;
    if (ui.state === GameState.READY || ui.state === GameState.GAME_OVER || ui.state === GameState.PAUSED) {
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

  const playing = ui.state === GameState.PLAYING || ui.state === GameState.RESUMING;
  const savedThisRun = rank.save.status === 'saved' ? rank.save.outcome?.result ?? null : null;
  const openRanking = () => {
    playSound('click');
    void rank.refresh();
    setOverlay('ranking');
  };

  return (
    <div className="surface aviao" ref={surfaceRef} data-state={ui.state}>
      <canvas ref={canvasRef} className="game-canvas" aria-hidden="true" />

      <div className="arena-ui">
        {!playing && !overlay && <HubBack />}

        {playing && (
          <button className="icon-btn pause-btn" data-ui onClick={pause} aria-label="Pausar">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
              <rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
            </svg>
          </button>
        )}

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
              <span className="title-accent">Acrobata</span>
            </h1>
            <div className="demo demo-plane" aria-hidden="true">
              {physics === 'voo' && <span className="demo-loop" />}
              <span className={physics === 'voo' ? 'demo-jet' : 'demo-jet demo-bob'} />
            </div>
            {physics === 'voo' ? (
              <p className="howto">
                <strong>Segure</strong> para subir — quanto mais tempo, mais alto.
                <br />
                <strong>Solte</strong> para mergulhar e ganhar velocidade.
                <br />
                <strong>Loop:</strong> toque e, logo em seguida, <strong>toque e segure</strong>.
              </p>
            ) : (
              <p className="howto">
                <strong>Segure</strong> para subir. <strong>Solte</strong> para cair.
                <br />
                Desvie de balões, pássaros e torres e não encoste no chão.
              </p>
            )}
            <button ref={primaryRef} className="btn btn-primary" onClick={start}>
              DECOLAR
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

        {!overlay && ui.state === GameState.GAME_OVER && (
          <section className="panel gameover" data-ui role="dialog" aria-labelledby="go-title" aria-live="polite">
            <h2 id="go-title" className="panel-title">
              {ui.isNewRecord ? 'Novo recorde!' : 'Fim de voo'}
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
            <p className="run-stats">
              <span>
                <strong>{ui.distance}</strong> m
              </span>
              {physics === 'voo' ? (
                <span>
                  <strong>{ui.loops}</strong> {ui.loops === 1 ? 'loop' : 'loops'}
                </span>
              ) : (
                <span>
                  <strong>{ui.maneuvers}</strong> {ui.maneuvers === 1 ? 'manobra' : 'manobras'}
                </span>
              )}
              <span>
                combo <strong>×{ui.bestMultiplier}</strong>
              </span>
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
              VOAR DE NOVO
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
