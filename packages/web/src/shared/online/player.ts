import { LocalAuthProvider, type Profile } from '../auth/auth';
import { isValidName, sanitizeName } from '../ranking/Ranking';
import { HUB_KEYS } from '../storage/keys';
import type { Storage } from '../storage/storage';
import { ApiError } from './api';
import { OnlineApi } from './services';

export type PlayerMode = 'checking' | 'online' | 'local';

export interface PlayerState {
  mode: PlayerMode;
  profile: Profile | null;
}

export const PASSWORD_MIN = 6;

/**
 * Quem está jogando — vale para o hub e todos os jogos.
 * - Com servidor: conta com apelido + senha (sessão em cookie httpOnly).
 * - Sem servidor (offline, hospedagem estática): o perfil local de antes.
 */
export class PlayerService {
  readonly api: OnlineApi;
  readonly local: LocalAuthProvider;

  constructor(
    private storage: Storage,
    api?: OnlineApi,
  ) {
    this.api = api ?? new OnlineApi();
    this.local = new LocalAuthProvider(storage);
  }

  /** O que mostrar antes de falar com o servidor (sem piscar "Entrar"). */
  initial(): PlayerState {
    return { mode: 'checking', profile: this.cachedAccount() ?? this.local.current() };
  }

  /**
   * Descobre se há servidor e quem está logado. O banco pode estar "acordando"
   * (plano gratuito dorme parado) ou a rede pode falhar por um instante: tenta
   * de novo algumas vezes antes de desistir, para não pedir login à toa.
   */
  async check(): Promise<PlayerState> {
    for (let attempt = 0; attempt <= this.retryDelays.length; attempt++) {
      if (attempt > 0) await this.wait(this.retryDelays[attempt - 1]);
      // health só responde 200 quando a API E o banco estão de pé
      if (!(await this.api.available())) continue;
      try {
        const me = await this.api.me();
        this.cacheAccount(me);
        return { mode: 'online', profile: me };
      } catch (e) {
        // erro de verdade do servidor (não de rede nem 5xx): online sem conta
        if (e instanceof ApiError && !e.unavailable && e.status < 500) return { mode: 'online', profile: null };
      }
    }
    // Servidor fora do ar: quem já tinha entrado continua aparecendo como
    // conectado (as pontuações ficam neste aparelho até o servidor voltar).
    return { mode: 'local', profile: this.cachedAccount() ?? this.local.current() };
  }

  /** Esperas entre as tentativas de falar com o servidor (ms). */
  retryDelays: number[] = [1200, 3000];
  private wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  /** Entra (ou cria a conta). Retorna o perfil ou a mensagem de erro. */
  async signIn(mode: PlayerMode, name: string, password: string, create: boolean): Promise<{ profile: Profile } | { error: string }> {
    if (mode !== 'online') {
      const p = this.local.signIn(name);
      return p ? { profile: p } : { error: 'Apelido inválido.' };
    }
    if (!isValidName(name)) return { error: 'Use de 2 a 16 caracteres, com pelo menos uma letra ou número.' };
    if (password.length < PASSWORD_MIN) return { error: `A senha precisa ter pelo menos ${PASSWORD_MIN} caracteres.` };
    try {
      const p = create ? await this.api.register(sanitizeName(name), password) : await this.api.login(sanitizeName(name), password);
      this.cacheAccount(p);
      return { profile: p };
    } catch (e) {
      if (e instanceof ApiError && e.unavailable) return { error: 'Sem conexão com o servidor. Tente de novo.' };
      return { error: e instanceof Error ? e.message : 'Não deu para entrar.' };
    }
  }

  async signOut(mode: PlayerMode): Promise<void> {
    this.cacheAccount(null);
    if (mode === 'online') await this.api.logout().catch(() => undefined);
    else this.local.signOut();
  }

  private cachedAccount(): Profile | null {
    try {
      const raw = this.storage.getItem(HUB_KEYS.account);
      if (!raw) return null;
      const p = JSON.parse(raw) as Partial<Profile>;
      if (typeof p.id !== 'string' || typeof p.name !== 'string') return null;
      return { id: p.id, name: p.name, provider: 'online', createdAt: typeof p.createdAt === 'string' ? p.createdAt : '' };
    } catch {
      return null;
    }
  }

  private cacheAccount(p: Profile | null): void {
    try {
      this.storage.setItem(HUB_KEYS.account, p ? JSON.stringify(p) : '');
    } catch {
      /* ignora */
    }
  }
}
