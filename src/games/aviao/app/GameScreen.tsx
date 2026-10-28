import { useCallback, useEffect, useRef, useState } from 'react';
import { STORAGE } from '../game/config';
import { GameState } from '../game/types';
import { useAviao } from '../hooks/useAviao';
import { LocalAuthProvider, type Profile } from '../../../shared/auth/auth';
import { LocalRanking, type RankingEntry, type RankingResult } from '../../../shared/ranking/Ranking';
import { HubBack } from '../../../shared/ui/HubBack';
import { LoginPanel, RankingPanel, SaveScore } from '../../../shared/ui/RankingUi';

type Overlay = 'ranking' | 'login' | null;

export function GameScreen() {
  const { surfaceRef, canvasRef, ui, settings, updateSettings, start, pause, resume, toMenu, playSound, storage } =
    useAviao();
  const primaryRef = useRef<HTMLButtonElement | null>(null);

  const [ranking] = useState(() => new LocalRanking(storage, { key: STORAGE.ranking }));
  const [auth] = useState(() => new LocalAuthProvider(storage));
  const [profile, setProfile] = useState<Profile | null>(() => auth.current());
  const [entries, setEntries] = useState<RankingEntry[]>(() => ranking.list());
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [saved, setSaved] = useState<{ runId: number; result: RankingResult } | null>(null);
  const [eligibility, setEligibility] = useState({ runId: 0, qualifies: false, threshold: 1 });

  const submit = useCallback(
    (name: string, profileId?: string) => {
      const result = ranking.submit(name, ui.score, profileId);
      if (result) {
        setSaved({ runId: ui.runId, result });
        setEntries(ranking.list());
        playSound('success');
      }
      return result;
    },
    [ranking, ui.score, ui.runId, playSound],
  );

  // Fim de partida: calcula se entra no ranking; com perfil, salva sozinho.
  useEffect(() => {
    if (ui.state !== GameState.GAME_OVER || ui.runId === eligibility.runId) return;
    const qualifies = ranking.qualifies(ui.score);
    setEligibility({ runId: ui.runId, qualifies, threshold: ranking.threshold() });
    if (qualifies && profile) submit(profile.name, profile.id);
  }, [ui.state, ui.runId, ui.score, eligibility.runId, ranking, profile, submit]);

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

  const login = (name: string) => {
    const p = auth.signIn(name);
    if (!p) return;
    setProfile(p);
    playSound('success');
    return p;
  };
  const logout = () => {
    auth.signOut();
    setProfile(null);
    playSound('click');
  };

  const playing = ui.state === GameState.PLAYING || ui.state === GameState.RESUMING;
  const savedThisRun = saved && saved.runId === ui.runId ? saved.result : null;
  const eligibleThisRun = eligibility.runId === ui.runId ? eligibility : { qualifies: false, threshold: 1 };
  const openRanking = () => {
    playSound('click');
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
            entries={entries}
            highlightId={savedThisRun?.entry.id}
            onClose={() => {
              playSound('click');
              setOverlay(null);
            }}
          />
        )}

        {overlay === 'login' && (
          <LoginPanel
            initial={auth.lastGuestName()}
            onLogin={(n) => {
              if (login(n)) setOverlay(null);
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
              <span className="demo-loop" />
              <span className="demo-jet" />
            </div>
            <p className="howto">
              <strong>Segure</strong> para subir — quanto mais tempo, mais alto.
              <br />
              <strong>Solte</strong> para mergulhar e ganhar velocidade.
              <br />
              <strong>Loop:</strong> toque e, logo em seguida, <strong>toque e segure</strong>.
            </p>
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
              <span>
                <strong>{ui.loops}</strong> {ui.loops === 1 ? 'loop' : 'loops'}
              </span>
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
              qualifies={eligibleThisRun.qualifies}
              threshold={eligibleThisRun.threshold}
              profile={profile}
              saved={savedThisRun}
              guestName={auth.lastGuestName()}
              onLogin={(n) => {
                const p = login(n);
                if (p) submit(p.name, p.id);
              }}
              onGuest={(n) => {
                auth.rememberGuestName(n);
                submit(n);
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
