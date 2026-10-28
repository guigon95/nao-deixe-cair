import { useEffect, useRef } from 'react';
import { GameState } from '../game/types';
import { useGame } from '../hooks/useGame';

export function GameScreen() {
  const { surfaceRef, canvasRef, ui, settings, updateSettings, start, pause, resume, toMenu } = useGame();
  const primaryRef = useRef<HTMLButtonElement | null>(null);

  // Foco no botão principal de cada tela: Enter/Espaço funcionam sem mouse.
  useEffect(() => {
    if (ui.state === GameState.READY || ui.state === GameState.GAME_OVER || ui.state === GameState.PAUSED) {
      primaryRef.current?.focus({ preventScroll: true });
    } else if (document.activeElement instanceof HTMLElement && document.activeElement.closest('[data-ui]')) {
      // Durante a partida, nenhum botão deve “roubar” o Espaço.
      document.activeElement.blur();
    }
  }, [ui.state]);

  const playing = ui.state === GameState.PLAYING || ui.state === GameState.RESUMING;

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

        {ui.state === GameState.READY && (
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
            {ui.best > 0 && <p className="best">Recorde: <strong>{ui.best}</strong></p>}
            <Toggles settings={settings} update={updateSettings} />
          </section>
        )}

        {ui.state === GameState.PAUSED && (
          <section className="panel" data-ui role="dialog" aria-modal="true" aria-labelledby="paused-title">
            <h2 id="paused-title" className="panel-title">Pausado</h2>
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

        {ui.state === GameState.GAME_OVER && (
          <section className="panel gameover" data-ui role="dialog" aria-labelledby="go-title" aria-live="polite">
            <h2 id="go-title" className="panel-title">{ui.isNewRecord ? 'Novo recorde!' : 'Fim de jogo'}</h2>
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
      <button
        className="chip"
        aria-pressed={settings.sound}
        onClick={() => update({ sound: !settings.sound })}
      >
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
