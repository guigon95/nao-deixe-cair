import { useCallback, useEffect, useRef, useState } from 'react';
import type { Profile } from '../auth/auth';
import { LocalRanking, type RankingEntry } from '../ranking/Ranking';
import type { GameId } from '../storage/keys';
import type { Storage } from '../storage/storage';
import { PlayerService, type PlayerMode, type PlayerState } from './player';
import { RankingController, type RankingScope, type SubmitOutcome } from './RankingController';

const services = new WeakMap<Storage, PlayerService>();
/** Um PlayerService por página (hub ou jogo), compartilhando o armazenamento. */
export function playerService(storage: Storage): PlayerService {
  let s = services.get(storage);
  if (!s) {
    s = new PlayerService(storage);
    services.set(storage, s);
  }
  return s;
}

export interface PlayerApi extends PlayerState {
  service: PlayerService;
  /** Entra (ou cria a conta). Devolve o perfil ou a mensagem de erro. */
  signIn: (name: string, password: string, create: boolean) => Promise<{ profile: Profile } | { error: string }>;
  signOut: () => Promise<void>;
  /** Reconsulta servidor e sessão (ex.: ao voltar para a aba). */
  recheck: () => void;
}

/** Jogador atual (conta online ou perfil local) para o hub e os jogos. */
export function usePlayer(storage: Storage): PlayerApi {
  const service = playerService(storage);
  const [state, setState] = useState<PlayerState>(() => service.initial());
  const alive = useRef(true);

  const recheck = useCallback(() => {
    void service.check().then((s) => {
      if (alive.current) setState(s);
    });
  }, [service]);

  useEffect(() => {
    alive.current = true;
    recheck();
    return () => {
      alive.current = false;
    };
  }, [recheck]);

  const signIn = useCallback(
    async (name: string, password: string, create: boolean) => {
      const r = await service.signIn(state.mode, name, password, create);
      if ('profile' in r) setState((s) => ({ ...s, profile: r.profile }));
      return r;
    },
    [service, state.mode],
  );

  const signOut = useCallback(async () => {
    await service.signOut(state.mode);
    setState((s) => ({ ...s, profile: s.mode === 'online' ? null : service.local.current() }));
  }, [service, state.mode]);

  return { ...state, service, signIn, signOut, recheck };
}

export interface RunInfo {
  /** Estado do motor (string do enum de cada jogo). */
  state: string;
  /** runId da última partida que terminou (definido no fim). */
  runId: number;
  /** runId da partida em andamento (muda quando uma partida começa). */
  liveRunId: number;
  score: number;
}

export interface SaveState {
  runId: number;
  status: 'idle' | 'saving' | 'saved' | 'error';
  outcome: SubmitOutcome | null;
}

/**
 * Ranking de um jogo integrado ao fim de partida:
 * - pede o token da partida quando ela começa (online);
 * - no fim calcula se entra no ranking e, com conta/perfil, envia sozinho;
 * - convidado envia com `submitGuest(nome)`.
 */
export function useRanking(opts: { game: GameId; storage: Storage; localKey?: string; player: PlayerApi; run: RunInfo; onSaved?: () => void }) {
  const { game, storage, localKey, player, run, onSaved } = opts;
  const [controller] = useState(
    () => new RankingController(game, player.service.api, new LocalRanking(storage, localKey ? { key: localKey } : {})),
  );
  const [entries, setEntries] = useState<RankingEntry[]>(() => controller.entries);
  const [me, setMe] = useState(controller.me);
  const [scope, setScope] = useState<RankingScope | 'checking'>('checking');
  const [eligibility, setEligibility] = useState({ runId: 0, qualifies: false, threshold: 1 });
  const [save, setSave] = useState<SaveState>({ runId: 0, status: 'idle', outcome: null });

  const sync = useCallback(() => {
    setEntries(controller.entries);
    setMe(controller.me);
    setScope(controller.scope);
  }, [controller]);

  const refresh = useCallback(async () => {
    await controller.refresh().catch(() => undefined);
    sync();
  }, [controller, sync]);

  // Modo decidido pelo jogador (servidor encontrado ou não).
  const mode: PlayerMode = player.mode;
  useEffect(() => {
    if (mode === 'checking') return;
    controller.setOnline(mode === 'online');
    void refresh();
  }, [mode, controller, refresh]);

  // Conta mudou: posição "você" muda.
  const profileId = player.profile?.id;
  useEffect(() => {
    if (mode === 'online') void refresh();
  }, [profileId, mode, refresh]);

  // Partida começou → token daquela partida.
  useEffect(() => {
    if (run.liveRunId > 0) controller.runStarted(run.liveRunId);
  }, [run.liveRunId, controller]);

  const doSubmit = useCallback(
    async (runId: number, score: number, name: string, profile: Profile | null) => {
      setSave({ runId, status: 'saving', outcome: null });
      const outcome = await controller.submit(runId, score, { name, profile });
      setSave({ runId, status: outcome.result ? 'saved' : 'error', outcome });
      sync();
      if (outcome.result) onSaved?.();
      return outcome;
    },
    [controller, sync, onSaved],
  );

  // Fim de partida: elegibilidade e envio automático (uma vez por partida).
  const handled = useRef(0);
  useEffect(() => {
    if (run.state !== 'GAME_OVER' || run.runId === handled.current) return;
    handled.current = run.runId;
    const profile = player.profile;
    const qualifies = controller.qualifies(run.score);
    const auto = controller.autoSubmit(run.score, profile);
    setEligibility({ runId: run.runId, qualifies: qualifies || auto, threshold: controller.threshold() });
    if (auto && profile) void doSubmit(run.runId, run.score, profile.name, profile);
  }, [run.state, run.runId, run.score, player.profile, controller, doSubmit]);

  const submitGuest = useCallback(
    (name: string) => {
      player.service.local.rememberGuestName(name);
      return doSubmit(run.runId, run.score, name, null);
    },
    [player.service, doSubmit, run.runId, run.score],
  );

  /** Logou no fim da partida: envia esta partida com a conta. */
  const submitAs = useCallback((profile: Profile) => doSubmit(run.runId, run.score, profile.name, profile), [doSubmit, run.runId, run.score]);

  const thisRun = <T extends { runId: number }>(x: T) => (x.runId === run.runId ? x : null);
  return {
    scope,
    entries,
    me,
    refresh,
    eligibility: thisRun(eligibility) ?? { runId: run.runId, qualifies: false, threshold: 1 },
    save: thisRun(save) ?? { runId: run.runId, status: 'idle' as const, outcome: null },
    submitGuest,
    submitAs,
    guestName: player.service.local.lastGuestName(),
  };
}
