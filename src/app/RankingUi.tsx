import { useEffect, useRef, useState, type FormEvent } from 'react';
import { isValidName, NAME_MAX, NAME_MIN, type RankingEntry, type RankingResult } from '../game/Ranking';
import type { Profile } from '../platform/auth';

/** Formata a posição: 1º, 2º... */
export const ordinal = (n: number) => `${n}º`;

export function RankingList({ entries, highlightId }: { entries: RankingEntry[]; highlightId?: string }) {
  if (entries.length === 0) {
    return (
      <p className="rank-empty">
        Ninguém no ranking ainda.
        <br />
        Jogue uma partida e seja o primeiro.
      </p>
    );
  }
  return (
    <ol className="rank-list">
      {entries.map((e, i) => (
        <li key={e.id} className={e.id === highlightId ? 'is-you' : undefined} data-pos={i + 1}>
          <span className="rank-pos">{ordinal(i + 1)}</span>
          <span className="rank-name">
            {e.name}
            {e.profileId && <span className="rank-tag" title="Perfil">●</span>}
          </span>
          <span className="rank-score">{e.score}</span>
        </li>
      ))}
    </ol>
  );
}

export function RankingPanel({
  entries,
  highlightId,
  onClose,
}: {
  entries: RankingEntry[];
  highlightId?: string;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => closeRef.current?.focus({ preventScroll: true }), []);
  return (
    <section className="panel ranking" data-ui role="dialog" aria-modal="true" aria-labelledby="rank-title">
      <h2 id="rank-title" className="panel-title">Ranking</h2>
      <p className="rank-scope">Melhores pontuações neste aparelho</p>
      <RankingList entries={entries} highlightId={highlightId} />
      <button ref={closeRef} className="btn btn-secondary" onClick={onClose}>
        Voltar
      </button>
    </section>
  );
}

/** Campo de nome reutilizado no login e no “só o nome”. */
function NameForm({
  title,
  hint,
  submitLabel,
  initial,
  onSubmit,
  onCancel,
}: {
  title: string;
  hint: string;
  submitLabel: string;
  initial: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial);
  const [touched, setTouched] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
    inputRef.current?.select();
  }, []);
  const valid = isValidName(name);
  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    setTouched(true);
    if (valid) onSubmit(name);
  };
  return (
    <form className="name-form" onSubmit={submit} noValidate>
      <label className="name-label" htmlFor="player-name">
        {title}
      </label>
      <input
        ref={inputRef}
        id="player-name"
        name="player-name"
        className="name-input"
        type="text"
        inputMode="text"
        autoComplete="nickname"
        autoCapitalize="words"
        enterKeyHint="done"
        maxLength={NAME_MAX}
        value={name}
        placeholder="Seu apelido"
        aria-invalid={touched && !valid}
        aria-describedby="name-hint"
        onChange={(e) => setName(e.target.value)}
      />
      <p id="name-hint" className={`name-hint${touched && !valid ? ' is-error' : ''}`}>
        {touched && !valid ? `Use de ${NAME_MIN} a ${NAME_MAX} caracteres, com pelo menos uma letra ou número.` : hint}
      </p>
      <div className="form-row">
        <button type="button" className="btn btn-link" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-save">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

type SaveMode = 'choose' | 'login' | 'guest';

/**
 * Bloco do fim de jogo: envia a pontuação ao ranking.
 * - Com perfil: salva sozinho e mostra a posição.
 * - Sem perfil: oferece “Entrar” (cria perfil, salva agora e nas próximas)
 *   ou “Só meu nome” (salva esta pontuação com um nome).
 */
export function SaveScore({
  score,
  qualifies,
  threshold,
  profile,
  saved,
  guestName,
  onLogin,
  onGuest,
  onShowRanking,
}: {
  score: number;
  qualifies: boolean;
  threshold: number;
  profile: Profile | null;
  saved: RankingResult | null;
  guestName: string;
  onLogin: (name: string) => void;
  onGuest: (name: string) => void;
  onShowRanking: () => void;
}) {
  const [mode, setMode] = useState<SaveMode>('choose');

  if (saved) {
    return (
      <div className="save-box is-saved" role="status">
        <p className="save-title">
          {ordinal(saved.position)} lugar no ranking
        </p>
        <p className="save-sub">Salvo como {saved.entry.name}</p>
        <button className="btn btn-link" onClick={onShowRanking}>
          Ver ranking
        </button>
      </div>
    );
  }

  if (!qualifies || score <= 0) {
    return (
      <div className="save-box">
        {score > 0 && threshold > 1 && (
          <p className="save-sub">Faltaram {threshold - score} pontos para entrar no ranking.</p>
        )}
        <button className="btn btn-link" onClick={onShowRanking}>
          Ver ranking
        </button>
      </div>
    );
  }

  // Com perfil o salvamento é automático (o pai envia); este estado é só transitório.
  if (profile) return null;

  if (mode === 'login') {
    return (
      <div className="save-box">
        <NameForm
          title="Entrar com um perfil"
          hint="Seu perfil fica salvo neste aparelho e as próximas pontuações entram sozinhas."
          submitLabel="Entrar e salvar"
          initial={guestName}
          onSubmit={onLogin}
          onCancel={() => setMode('choose')}
        />
      </div>
    );
  }

  if (mode === 'guest') {
    return (
      <div className="save-box">
        <NameForm
          title="Seu nome no ranking"
          hint="Só para esta pontuação. Nada de cadastro."
          submitLabel="Salvar"
          initial={guestName}
          onSubmit={onGuest}
          onCancel={() => setMode('choose')}
        />
      </div>
    );
  }

  return (
    <div className="save-box">
      <p className="save-title">Sua pontuação entra no ranking!</p>
      <div className="form-row">
        <button className="btn btn-save" onClick={() => setMode('login')}>
          Entrar
        </button>
        <button className="btn btn-secondary btn-inline" onClick={() => setMode('guest')}>
          Só meu nome
        </button>
      </div>
    </div>
  );
}

/** Tela de login a partir do menu inicial. */
export function LoginPanel({
  initial,
  onLogin,
  onClose,
}: {
  initial: string;
  onLogin: (name: string) => void;
  onClose: () => void;
}) {
  return (
    <section className="panel" data-ui role="dialog" aria-modal="true" aria-label="Entrar">
      <NameForm
        title="Entrar com um perfil"
        hint="Seu perfil fica salvo neste aparelho e suas pontuações entram no ranking sozinhas."
        submitLabel="Entrar"
        initial={initial}
        onSubmit={onLogin}
        onCancel={onClose}
      />
    </section>
  );
}
