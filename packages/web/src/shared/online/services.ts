import type { RankingEntry, RankingResult } from '../ranking/Ranking';
import type { GameId } from '../storage/keys';
import { api, ApiError, type Fetcher } from './api';

export interface AccountProfile {
  id: string;
  name: string;
  provider: 'online';
  createdAt: string;
}

interface PlayerDto {
  id: string;
  name: string;
  createdAt: string;
}
const toProfile = (p: PlayerDto): AccountProfile => ({ id: p.id, name: p.name, provider: 'online', createdAt: p.createdAt });

export type RankingPeriod = 'week' | 'all';

export interface WeekInfo {
  start: string;
  /** Quando a semana termina (ISO). */
  end: string;
  lastChampion: { name: string; score: number } | null;
}

export interface OnlineRankingPage {
  period?: RankingPeriod;
  entries: RankingEntry[];
  size: number;
  /** Melhor pontuação e posição de quem está logado (pode estar fora do top 10). */
  me: { best: number; position: number } | null;
  /** Só no ranking semanal. */
  week?: WeekInfo;
}

export interface OnlineResult extends RankingResult {
  personalBest: boolean;
  /** Pontos desta partida (a `entry` é a melhor do jogador). */
  score: number;
  /** Posição e melhor da semana. */
  week?: { position: number; best: number; personalBest: boolean; end: string };
}

/** Tudo o que o front fala com o servidor. Recebe `fetch` para os testes. */
export class OnlineApi {
  constructor(private fetcher?: Fetcher) {}

  private call<T>(path: string, init: { method?: string; body?: unknown } = {}) {
    return api<T>(path, { ...init, fetcher: this.fetcher });
  }

  /** true quando a API e o banco respondem. */
  async available(): Promise<boolean> {
    try {
      const r = await this.call<{ ok: boolean }>('/api/health');
      return r.ok === true;
    } catch {
      return false;
    }
  }

  /** Conta logada; null = ninguém logado. Lança ApiError se o servidor não responder. */
  async me(): Promise<AccountProfile | null> {
    try {
      return toProfile((await this.call<{ player: PlayerDto }>('/api/auth/me')).player);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return null;
      throw e;
    }
  }

  async login(name: string, password: string): Promise<AccountProfile> {
    return toProfile((await this.call<{ player: PlayerDto }>('/api/auth/login', { body: { name, password } })).player);
  }

  async register(name: string, password: string): Promise<AccountProfile> {
    return toProfile((await this.call<{ player: PlayerDto }>('/api/auth/register', { body: { name, password } })).player);
  }

  async logout(): Promise<void> {
    await this.call('/api/auth/logout', { body: {} });
  }

  async ranking(game: GameId, period: RankingPeriod = 'all'): Promise<OnlineRankingPage> {
    return this.call<OnlineRankingPage>(`/api/games/${game}/ranking?period=${period}`);
  }

  async startRun(game: GameId): Promise<string> {
    return (await this.call<{ token: string }>(`/api/games/${game}/runs`, { body: {} })).token;
  }

  async submit(game: GameId, token: string, score: number, name?: string): Promise<OnlineResult> {
    return this.call<OnlineResult>(`/api/games/${game}/scores`, { body: { token, score: Math.floor(score), ...(name ? { name } : {}) } });
  }
}
