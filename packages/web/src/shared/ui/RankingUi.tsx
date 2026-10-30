import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { isValidName, NAME_MAX, NAME_MIN, type RankingEntry } from '../ranking/Ranking';
import type { Profile } from '../auth/auth';
import type { SaveState } from '../online/hooks';
import { PASSWORD_MIN } from '../online/player';

/** Formata a posição: 1º, 2º... */
export const ordinal = (n: number) => `${n}º`;

/** 'online' = ranking de todos os jogadores (com servidor); 'local' = deste aparelho. */
export type Scope = 'online' | 'local' | 'checking';

export function RankingList({
  entries,
  highlightId,
  youId,
}: {
  entries: RankingEntry[];
  highlightId?: string;
  /** Conta logada: destaca a linha dela. */
  youId?: string;
}) {
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
        <li
          key={e.id}
          className={e.id === highlightId || (youId && e.profileId === youId) ? 'is-you' : undefined}
          data-pos={i + 1}
        >
          <span className="rank-pos">{ordinal(i + 1)}</span>
          <span className="rank-name">
            {e.name}
            {e.profileId && (
              <span className="rank-tag" title="Conta">
                ●
              </span>
            )}
          </span>
          <span className="rank-score">{e.score}</span>
        </li>
      ))}
    </ol>
  );
}

/** "2d 5h", "5h 20min", "12min" até o fim da semana. */
export function timeLeft(endIso: string, now = Date.now()): string {
  const ms = Math.max(0, new Date(endIso).getTime() - now);
  const min = Math.floor(ms / 60_000);
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}min`;
  return `${Math.max(1, m)}min`;
}

export interface WeeklyData {
  entries: RankingEntry[];
  me: { best: number; position: number } | null;
  week: { end: string; lastChampion: { name: string; score: number } | null } | null;
}

type RankTab = 'week' | 'all';

export function RankingPanel({
  entries,
  highlightId,
  scope = 'local',
  me,
  weekly,
  youId,
  onClose,
}: {
  entries: RankingEntry[];
  highlightId?: string;
  scope?: Scope;
  /** Melhor do jogador logado (online), para mostrar a posição mesmo fora do top 10. */
  me?: { best: number; position: number } | null;
  /** Ranking da semana (online). Com ele, o painel abre na aba "Semana". */
  weekly?: WeeklyData;
  youId?: string;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => closeRef.current?.focus({ preventScroll: true }), []);
  const hasWeek = scope === 'online' && !!weekly;
  const [tab, setTab] = useState<RankTab>(hasWeek ? 'week' : 'all');
  const showWeek = hasWeek && tab === 'week';
  const list = showWeek ? weekly!.entries : entries;
  const mine = showWeek ? weekly!.me : me;
  return (
    <section className="panel ranking" data-ui role="dialog" aria-modal="true" aria-labelledby="rank-title">
      <h2 id="rank-title" className="panel-title">
        Ranking
      </h2>
      {hasWeek && (
        <div className="shop-tabs rank-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'week'} className="chip" onClick={() => setTab('week')}>
            Semana
          </button>
          <button role="tab" aria-selected={tab === 'all'} className="chip" onClick={() => setTab('all')}>
            Geral
          </button>
        </div>
      )}
      <p className="rank-scope" data-scope={scope} data-tab={showWeek ? 'week' : 'all'}>
        {showWeek
          ? weekly!.week
            ? `Termina em ${timeLeft(weekly!.week.end)} · zera toda segunda`
            : 'Melhores desta semana'
          : scope === 'online'
            ? 'Melhores de todos os tempos'
            : 'Melhores pontuações neste aparelho'}
      </p>
      {showWeek && weekly!.week?.lastChampion && (
        <p className="rank-champion">
          🏆 Campeão da semana passada: <strong>{weekly!.week.lastChampion.name}</strong> ({weekly!.week.lastChampion.score})
        </p>
      )}
      {showWeek && list.length === 0 ? (
        <p className="rank-empty">
          Ninguém jogou esta semana ainda.
          <br />
          Jogue agora e comece em 1º!
        </p>
      ) : (
        <RankingList entries={list} highlightId={highlightId} youId={youId} />
      )}
      {scope === 'online' && mine && mine.position > list.length && (
        <p className="rank-me">
          Você: <strong>{ordinal(mine.position)}</strong> lugar com <strong>{mine.best}</strong>
        </p>
      )}
      <button ref={closeRef} className="btn btn-secondary" onClick={onClose}>
        Voltar
      </button>
    </section>
  );
}

/**
 * Chamada no menu para disputar a semana: sua posição, ou quanto falta
 * para o top 10, e quando a semana termina.
 */
export function WeeklyCallout({ weekly, onOpen }: { weekly: WeeklyData; onOpen: () => void }) {
  const { entries, me, week } = weekly;
  const left = week ? ` · termina em ${timeLeft(week.end)}` : '';
  let text: string;
  if (me && me.position === 1) text = `Você é o 1º da semana! Defenda o topo${left}`;
  else if (me && me.position <= 10) text = `Você é o ${ordinal(me.position)} da semana — o 1º tem ${entries[0]?.score ?? '?'}${left}`;
  else if (entries.length < 10) text = `Ainda tem vaga no top 10 da semana${left}`;
  else text = `Top 10 da semana a partir de ${entries[entries.length - 1].score + 1} pontos${left}`;
  return (
    <button className="weekly-callout" onClick={onOpen}>
      <span aria-hidden="true">🏆</span> {text}
    </button>
  );
}

/**
 * Formulário de apelido (e senha, quando há servidor).
 * `onSubmit` devolve a mensagem de erro, ou null se deu certo.
 */
function NameForm({
  title,
  hint,
  submitLabel,
  initial,
  withPassword = false,
  newPassword = false,
  onSubmit,
  onCancel,
  footer,
}: {
  title: string;
  hint: string;
  submitLabel: string;
  initial: string;
  withPassword?: boolean;
  /** Criando conta: o gerenciador de senhas sugere uma senha nova. */
  newPassword?: boolean;
  onSubmit: (name: string, password: string) => Promise<string | null> | string | null | void;
  onCancel: () => void;
  footer?: ReactNode;
}) {
  const [name, setName] = useState(initial);
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
    inputRef.current?.select();
  }, []);
  const validName = isValidName(name);
  const validPassword = !withPassword || password.length >= PASSWORD_MIN;
  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    setTouched(true);
    setError(null);
    if (!validName || !validPassword || busy) return;
    setBusy(true);
    try {
      const err = await onSubmit(name, password);
      if (err) setError(err);
    } finally {
      setBusy(false);
    }
  };
  const nameMsg = touched && !validName ? `Use de ${NAME_MIN} a ${NAME_MAX} caracteres, com pelo menos uma letra ou número.` : null;
  const pwMsg = touched && !validPassword ? `A senha precisa ter pelo menos ${PASSWORD_MIN} caracteres.` : null;
  const message = error ?? nameMsg ?? pwMsg;
  return (
    <form className="name-form" onSubmit={submit} noValidate aria-busy={busy}>
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
        autoComplete={withPassword ? 'username' : 'nickname'}
        autoCapitalize="words"
        enterKeyHint={withPassword ? 'next' : 'done'}
        maxLength={NAME_MAX}
        value={name}
        placeholder="Seu apelido"
        aria-invalid={!!nameMsg}
        aria-describedby="name-hint"
        onChange={(e) => setName(e.target.value)}
      />
      {withPassword && (
        <input
          id="player-password"
          name="player-password"
          className="name-input"
          type="password"
          autoComplete={newPassword ? 'new-password' : 'current-password'}
          enterKeyHint="done"
          maxLength={72}
          value={password}
          placeholder="Senha"
          aria-label="Senha"
          aria-invalid={!!pwMsg}
          aria-describedby="name-hint"
          onChange={(e) => setPassword(e.target.value)}
        />
      )}
      <p id="name-hint" className={`name-hint${message ? ' is-error' : ''}`} role={error ? 'alert' : undefined}>
        {message ?? hint}
      </p>
      <div className="form-row">
        <button type="button" className="btn btn-link" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-save" disabled={busy}>
          {busy ? 'Aguarde…' : submitLabel}
        </button>
      </div>
      {footer}
    </form>
  );
}

/** Formulário de entrada: conta online (apelido + senha) ou perfil local (só apelido). */
function AccountForm({
  online,
  initial,
  saveAfter,
  onSignIn,
  onCancel,
}: {
  online: boolean;
  initial: string;
  /** No fim da partida: os botões dizem "… e salvar". */
  saveAfter: boolean;
  onSignIn: (name: string, password: string, create: boolean) => Promise<string | null> | string | null | void;
  onCancel: () => void;
}) {
  // Primeiro o login; quem não tem conta toca em "Criar conta".
  const [create, setCreate] = useState(false);
  const suffix = saveAfter ? ' e salvar' : '';
  if (!online) {
    return (
      <NameForm
        title="Entrar com um perfil"
        hint={
          saveAfter
            ? 'Seu perfil fica salvo neste aparelho e as próximas pontuações entram sozinhas.'
            : 'Seu perfil fica salvo neste aparelho e suas pontuações entram no ranking sozinhas.'
        }
        submitLabel={`Entrar${suffix}`}
        initial={initial}
        onSubmit={(n) => onSignIn(n, '', false)}
        onCancel={onCancel}
      />
    );
  }
  return (
    <NameForm
      key={create ? 'create' : 'login'}
      title={create ? 'Criar sua conta' : 'Entrar na sua conta'}
      hint={
        create
          ? 'Escolha um apelido e uma senha. Sua conta vale em qualquer aparelho e suas pontuações entram no ranking sozinhas.'
          : 'Use o apelido e a senha da sua conta. Você continua conectado neste aparelho.'
      }
      submitLabel={create ? `Criar conta${suffix}` : `Entrar${suffix}`}
      initial={initial}
      withPassword
      newPassword={create}
      onSubmit={(n, p) => onSignIn(n, p, create)}
      onCancel={onCancel}
      footer={
        <div className="account-switch">
          <span className="account-switch-q">{create ? 'Já tem conta?' : 'Ainda não tem conta?'}</span>
          <button type="button" className="btn btn-secondary btn-inline account-switch-btn" onClick={() => setCreate((c) => !c)}>
            {create ? 'Entrar' : 'Criar conta'}
          </button>
        </div>
      }
    />
  );
}

type SaveMode = 'choose' | 'login' | 'guest';

/**
 * Bloco do fim de jogo: envia a pontuação ao ranking.
 * - Com conta/perfil: salva sozinho e mostra a posição.
 * - Sem: oferece “Entrar” (salva agora e nas próximas) ou “Só meu nome”.
 */
export function SaveScore({
  score,
  qualifies,
  threshold,
  profile,
  save,
  online,
  guestName,
  onSignIn,
  onGuest,
  onShowRanking,
}: {
  score: number;
  qualifies: boolean;
  threshold: number;
  profile: Profile | null;
  save: SaveState;
  online: boolean;
  guestName: string;
  /** Entra (ou cria conta) e salva esta partida; devolve erro ou null. */
  onSignIn: (name: string, password: string, create: boolean) => Promise<string | null> | string | null | void;
  /** Salva só com o nome; devolve erro ou null. */
  onGuest: (name: string) => Promise<string | null> | string | null | void;
  onShowRanking: () => void;
}) {
  const [mode, setMode] = useState<SaveMode>('choose');
  const result = save.outcome?.result ?? null;

  if (save.status === 'saved' && result) {
    const kept = result.personalBest === false;
    const week = result.week;
    return (
      <div className={`save-box is-saved${week?.position === 1 ? ' is-champion' : ''}`} role="status">
        <p className="save-title">
          {week
            ? week.position === 1
              ? '🏆 1º lugar da semana!'
              : `${ordinal(week.position)} lugar na semana`
            : `${ordinal(result.position)} lugar no ranking`}
        </p>
        <p className="save-sub">
          {week && `${ordinal(result.position)} no geral · `}
          {week && !week.personalBest
            ? `seu melhor da semana continua ${week.best}`
            : kept
              ? `Seu melhor continua ${result.entry.score} pontos`
              : `Salvo como ${result.entry.name}`}
          {save.outcome?.message ? ` · ${save.outcome.message}` : ''}
        </p>
        <button className="btn btn-link" onClick={onShowRanking}>
          Ver ranking
        </button>
      </div>
    );
  }

  // Envio automático (com conta): o formulário do convidado mostra o próprio "Aguarde…".
  if (save.status === 'saving' && profile) {
    return (
      <div className="save-box" role="status">
        <p className="save-sub">Salvando no ranking…</p>
      </div>
    );
  }

  // Envio automático (com conta) que falhou: mostra o motivo.
  if (save.status === 'error' && profile) {
    return (
      <div className="save-box" role="alert">
        <p className="save-sub is-error">{save.outcome?.message ?? 'Não deu para salvar.'}</p>
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
          <p className="save-sub">
            Faltaram {threshold - score} pontos para entrar no {online ? 'top 10 da semana' : 'ranking'}.
          </p>
        )}
        <button className="btn btn-link" onClick={onShowRanking}>
          Ver ranking
        </button>
      </div>
    );
  }

  // Com perfil o salvamento é automático (o hook envia); este estado é só transitório.
  if (profile) return null;

  if (mode === 'login') {
    return (
      <div className="save-box">
        <AccountForm online={online} initial={guestName} saveAfter onSignIn={onSignIn} onCancel={() => setMode('choose')} />
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
          onSubmit={(n) => onGuest(n)}
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

/** Tela de login a partir do menu inicial (ou do hub). */
export function LoginPanel({
  initial,
  online,
  onSignIn,
  onClose,
}: {
  initial: string;
  online: boolean;
  /** Devolve a mensagem de erro, ou null se entrou (quem chama fecha o painel). */
  onSignIn: (name: string, password: string, create: boolean) => Promise<string | null> | string | null | void;
  onClose: () => void;
}) {
  return (
    <section className="panel" data-ui role="dialog" aria-modal="true" aria-label="Entrar">
      <AccountForm online={online} initial={initial} saveAfter={false} onSignIn={onSignIn} onCancel={onClose} />
    </section>
  );
}
