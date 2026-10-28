import { useEffect, useState } from 'react';
import { GAMES, readBest, type GameInfo } from '../shared/games';
import { browserStorage } from '../shared/storage/storage';
import { LoginPanel } from '../shared/ui/RankingUi';
import { usePlayer } from '../shared/online/hooks';
import { GameArt } from './GameArt';

/**
 * Tela inicial do hub: um cartão por jogo, com ilustração em código,
 * recorde pessoal e um botão grande de jogar. O perfil é do hub e vale
 * para todos os jogos.
 */
export function Hub() {
  const [storage] = useState(() => browserStorage());
  const player = usePlayer(storage);
  const { profile, recheck } = player;
  const [login, setLogin] = useState(false);
  const [bests, setBests] = useState(() => Object.fromEntries(GAMES.map((g) => [g.id, readBest(storage, g.id)])));

  // Ao voltar de um jogo pelo botão "voltar" do navegador (bfcache), atualiza recordes e perfil.
  useEffect(() => {
    const refresh = () => {
      setBests(Object.fromEntries(GAMES.map((g) => [g.id, readBest(storage, g.id)])));
      recheck();
    };
    window.addEventListener('pageshow', refresh);
    return () => window.removeEventListener('pageshow', refresh);
  }, [storage, recheck]);

  return (
    <main className="hub">
      <header className="hub-head">
        <h1 className="hub-title">
          <span>Não Deixe</span> <span className="title-accent">Cair</span>
        </h1>
        <p className="hub-sub">Jogos de um toque. Escolha um e bata seu recorde.</p>
        <div className="hub-profile">
          {profile ? (
            <p className="who">
              <span>
                Jogando como <strong>{profile.name}</strong>
              </span>
              <button
                className="btn btn-link btn-tiny"
                onClick={() => void player.signOut()}
              >
                Sair
              </button>
            </p>
          ) : (
            <button className="btn btn-secondary btn-inline" onClick={() => setLogin(true)}>
              Entrar
            </button>
          )}
        </div>
      </header>

      <ul className="hub-grid">
        {GAMES.map((g) => (
          <GameCard key={g.id} game={g} best={bests[g.id] ?? 0} />
        ))}
      </ul>

      <footer className="hub-foot" data-mode={player.mode}>
        {player.mode === 'online'
          ? 'Ranking de todos os jogadores. Sua conta vale em qualquer aparelho.'
          : player.mode === 'local'
            ? 'Sem conexão com o servidor: recordes, ranking e perfil ficam salvos neste aparelho.'
            : 'Recordes salvos neste aparelho.'}
      </footer>

      {login && (
        <div className="hub-modal" data-ui>
          <LoginPanel
            initial={player.service.local.lastGuestName()}
            online={player.mode === 'online'}
            onSignIn={async (n, pw, create) => {
              const r = await player.signIn(n, pw, create);
              if ('error' in r) return r.error;
              setLogin(false);
              return null;
            }}
            onClose={() => setLogin(false)}
          />
        </div>
      )}
    </main>
  );
}

function GameCard({ game, best }: { game: GameInfo; best: number }) {
  return (
    <li className="hub-card" style={{ ['--accent' as string]: game.accent }} data-game={game.id}>
      <a className="hub-card-link" href={game.href} aria-label={`Jogar ${game.name}`}>
        <div className="hub-art" aria-hidden="true">
          <GameArt id={game.id} />
        </div>
        <div className="hub-info">
          <h2 className="hub-name">{game.name}</h2>
          <p className="hub-tagline">{game.tagline}</p>
          <p className="hub-best">
            {best > 0 ? (
              <>
                Recorde: <strong>{best}</strong>
              </>
            ) : (
              'Sem recorde ainda'
            )}
          </p>
          <span className="btn btn-primary hub-play">JOGAR</span>
        </div>
      </a>
    </li>
  );
}
