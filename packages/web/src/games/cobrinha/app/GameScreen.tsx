import { useEffect, useRef, useState } from 'react';
import { STORAGE } from '../game/config';
import { GameState } from '../game/types';
import { useCobrinha } from '../hooks/useCobrinha';
import { FominhaFace } from './FominhaArt';
import { usePlayer, useRanking } from '../../../shared/online/hooks';
import { HubBack } from '../../../shared/ui/HubBack';
import { LoginPanel, RankingPanel, SaveScore, WeeklyCallout } from '../../../shared/ui/RankingUi';

type Overlay = 'ranking' | 'login' | null;

export function GameScreen() {
  const { surfaceRef, canvasRef, ui, settings, updateSettings, start, pause, resume, toMenu, playSound, storage, raiseBest } =
    useCobrinha();
  const primaryRef = useRef<HTMLButtonElement | null>(null);

  const player = usePlayer(storage);
  const profile = player.profile;
  const online = player.mode === 'online';
  const rank = useRanking({
    game: 'cobrinha',
    storage,
    localKey: STORAGE.ranking,
    player,
    run: { state: ui.state, runId: ui.runId, liveRunId: ui.liveRunId, score: ui.score },
    onSaved: () => playSound('success'),
  });
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [shared, setShared] = useState<'idle' | 'copied'>('idle');
  const accountBest = player.mode === 'online' && profile?.provider === 'online' ? (rank.me?.best ?? 0) : 0;
  useEffect(() => {
    if (accountBest > 0) raiseBest(accountBest);
  }, [accountBest, raiseBest]);

  useEffect(() => {
    if (ui.state !== GameState.READY && ui.state !== GameState.GAME_OVER) setOverlay(null);
    setShared('idle');
  }, [ui.state]);

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

  const share = async () => {
    playSound('click');
    const text = `Fiz ${ui.score} pontos no Fominha e a cobrinha chegou a tamanho ${ui.length}! Duvido você comer mais.`;
    const url = location.href.split('?')[0];
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Fominha', text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      setShared('copied');
    } catch {
      /* usuário cancelou ou sem permissão */
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
    <div className="surface cobrinha" ref={surfaceRef} data-state={ui.state}>
      <canvas ref={canvasRef} className="game-canvas" aria-hidden="true" />

      <div className="arena-ui">
        {!playing && !overlay && ui.state !== GameState.PAUSED && <HubBack />}

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
            <div className="fominha-hero">
              <FominhaFace size={92} />
            </div>
            <h1 id="title" className="title">
              <span className="title-accent">Fominha</span>
            </h1>
            <p className="subtitle">Quanto mais come, maior fica!</p>
            <p className="howto">
              <strong>Deslize</strong> o dedo para virar. Coma tudo que aparecer e cresça!
              <br />
              Não bata na parede nem no próprio rabo.
            </p>
            <ul className="menu-items" aria-label="Itens">
              <li>🍫 10</li>
              <li>💵 20</li>
              <li>🥇 30</li>
              <li>✂️💵 40</li>
              <li>🏛️ 50</li>
              <li>✈️ 70</li>
              <li>💼 ×2</li>
            </ul>
            <button ref={primaryRef} className="btn btn-primary" onClick={start}>
              JOGAR
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
            <p className="disclaimer">Sátira com personagem fictício. Qualquer semelhança é mera coincidência.</p>
          </section>
        )}

        {ui.state === GameState.PAUSED && (
          <section className="panel" data-ui role="dialog" aria-modal="true" aria-labelledby="paused-title">
            <h2 id="paused-title" className="panel-title">
              Sessão suspensa
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
              {ui.isNewRecord ? 'Novo recorde!' : ui.line}
            </h2>
            {ui.isNewRecord && (
              <p className="badge" aria-hidden="true">
                ★ RECORDE ★
              </p>
            )}
            {ui.isNewRecord && <p className="go-line">{ui.line}</p>}
            <p className="final-score">
              <span className="label">Pontos</span>
              <span className="value">{ui.score}</span>
            </p>
            <p className="run-stats">
              <span>
                tamanho <strong>{ui.length}</strong>
              </span>
              <span>
                <strong>{ui.eaten}</strong> {ui.eaten === 1 ? 'item' : 'itens'}
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
              JOGAR NOVAMENTE
            </button>
            <div className="menu-row">
              <button className="btn btn-secondary btn-inline" onClick={() => void share()}>
                {shared === 'copied' ? 'Copiado!' : 'Compartilhar'}
              </button>
              <a className="btn btn-secondary btn-inline" href="../">
                Voltar ao hub
              </a>
            </div>
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
