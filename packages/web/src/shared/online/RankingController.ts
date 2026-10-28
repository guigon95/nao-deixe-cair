import { LocalRanking, RANKING_SIZE, type RankingEntry, type RankingResult } from '../ranking/Ranking';
import type { GameId } from '../storage/keys';
import { ApiError } from './api';
import type { OnlineApi, OnlineResult } from './services';

export type RankingScope = 'online' | 'local';

export interface SubmitOutcome {
  result: (RankingResult & Partial<Pick<OnlineResult, 'personalBest' | 'score'>>) | null;
  /** Mensagem para o jogador quando não deu para salvar (ou salvou só aqui). */
  message?: string;
  /** true = servidor fora do ar; salvou (se deu) só neste aparelho. */
  offline?: boolean;
}

/** Tokens com mais de 1 h são trocados no início da partida (o servidor aceita até 6 h). */
const TOKEN_MAX_AGE_MS = 60 * 60 * 1000;

/**
 * Ranking de um jogo, online quando há servidor e local quando não há.
 * Sem React: as telas usam através do hook `useRanking`; os testes, direto.
 *
 * Partidas online: o token assinado é pedido ANTES da partida começar
 * (pré-busca), para o "JOGAR" nunca esperar a rede. No início de cada partida
 * o token pré-buscado passa a ser o daquela partida e um novo é pedido.
 */
export class RankingController {
  scope: RankingScope = 'local';
  entries: RankingEntry[];
  me: { best: number; position: number } | null = null;

  private next: { token: Promise<string | null>; at: number } | null = null;
  private byRun = new Map<number, Promise<string | null>>();

  constructor(
    private game: GameId,
    private api: OnlineApi,
    private local: LocalRanking,
    private now: () => number = () => Date.now(),
  ) {
    this.entries = local.list();
  }

  /** Liga/desliga o modo online (decidido por quem checa o servidor). */
  setOnline(online: boolean): void {
    this.scope = online ? 'online' : 'local';
    if (!online) {
      this.entries = this.local.list();
      this.me = null;
      this.next = null;
    } else this.prefetch();
  }

  /** Recarrega o ranking. Se o servidor cair, passa para o local. */
  async refresh(): Promise<void> {
    if (this.scope !== 'online') {
      this.entries = this.local.list();
      return;
    }
    try {
      const page = await this.api.ranking(this.game);
      this.entries = page.entries;
      this.me = page.me;
    } catch (e) {
      if (e instanceof ApiError && e.unavailable) this.setOnline(false);
      else throw e;
    }
  }

  threshold(): number {
    if (this.entries.length < RANKING_SIZE) return 1;
    return this.entries[this.entries.length - 1].score + 1;
  }

  qualifies(score: number): boolean {
    return Number.isFinite(score) && score > 0 && score >= this.threshold();
  }

  /**
   * Deve enviar sozinho no fim da partida? Com conta online, sempre (o
   * servidor guarda o histórico e calcula a posição); com perfil local, só se
   * entrar no top 10 deste aparelho.
   */
  autoSubmit(score: number, profile: { provider: 'local' | 'online' } | null): boolean {
    if (!profile || score <= 0) return false;
    if (this.scope === 'online' && profile.provider === 'online') return true;
    return this.qualifies(score);
  }

  /** Chamado quando uma partida começa (runId do motor). */
  runStarted(runId: number): void {
    if (this.scope !== 'online') return;
    const fresh = this.next && this.now() - this.next.at < TOKEN_MAX_AGE_MS ? this.next.token : this.fetchToken();
    this.byRun.set(runId, fresh);
    // guarda só as últimas partidas
    for (const k of this.byRun.keys()) if (k < runId - 5) this.byRun.delete(k);
    this.next = null;
    this.prefetch();
  }

  async submit(runId: number, score: number, opts: { name: string; profile: { id: string; provider: 'local' | 'online' } | null }): Promise<SubmitOutcome> {
    if (this.scope !== 'online' || opts.profile?.provider === 'local') return this.submitLocal(score, opts);
    try {
      let token = (await this.byRun.get(runId)) ?? null;
      if (!token) token = await this.api.startRun(this.game);
      const isGuest = !opts.profile;
      const res = await this.api.submit(this.game, token, score, isGuest ? opts.name : undefined);
      this.byRun.delete(runId);
      await this.refresh().catch(() => undefined);
      return { result: res };
    } catch (e) {
      if (e instanceof ApiError && e.unavailable) {
        this.setOnline(false);
        const local = this.submitLocal(score, { name: opts.name, profile: null });
        return {
          result: local.result,
          offline: true,
          message: local.result ? 'Sem conexão: salvo só neste aparelho.' : 'Sem conexão com o servidor: não deu para salvar.',
        };
      }
      return { result: null, message: e instanceof Error ? e.message : 'Não deu para salvar.' };
    }
  }

  private submitLocal(score: number, opts: { name: string; profile: { id: string } | null }): SubmitOutcome {
    const result = this.local.submit(opts.name, score, opts.profile?.id);
    this.entries = this.local.list();
    return { result };
  }

  private prefetch(): void {
    if (this.scope === 'online' && !this.next) this.next = { token: this.fetchToken(), at: this.now() };
  }

  private fetchToken(): Promise<string | null> {
    return this.api.startRun(this.game).catch(() => null);
  }
}
