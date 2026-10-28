import { isValidName, sanitizeName } from '../game/Ranking';
import type { Storage } from '../game/types';

export interface Profile {
  id: string;
  name: string;
  /** De onde vem a identidade. Hoje só 'local'; depois, ex.: 'google'. */
  provider: 'local';
  createdAt: string;
}

/**
 * Contrato de autenticação. A versão atual é um perfil salvo neste aparelho
 * (sem servidor, sem senha). Um provedor real (Google, e-mail etc.) pode
 * implementar a mesma interface quando houver backend, sem mudar as telas.
 */
export interface AuthProvider {
  current(): Profile | null;
  signIn(name: string): Profile | null;
  signOut(): void;
  /** Último nome usado por convidado, para sugerir no campo. */
  lastGuestName(): string;
  rememberGuestName(name: string): void;
}

const PROFILE_KEY = 'nao-deixe-cair:profile';
const GUEST_KEY = 'nao-deixe-cair:guest-name';

export class LocalAuthProvider implements AuthProvider {
  private profile: Profile | null;

  constructor(private storage: Storage) {
    this.profile = this.load();
  }

  current(): Profile | null {
    return this.profile;
  }

  signIn(name: string): Profile | null {
    if (!isValidName(name)) return null;
    const clean = sanitizeName(name);
    this.profile = {
      id: this.profile?.id ?? `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      name: clean,
      provider: 'local',
      createdAt: this.profile?.createdAt ?? new Date().toISOString(),
    };
    try {
      this.storage.setItem(PROFILE_KEY, JSON.stringify(this.profile));
    } catch {
      /* perfil vale só nesta sessão */
    }
    return this.profile;
  }

  signOut(): void {
    this.profile = null;
    try {
      this.storage.setItem(PROFILE_KEY, '');
    } catch {
      /* ignora */
    }
  }

  lastGuestName(): string {
    try {
      return sanitizeName(this.storage.getItem(GUEST_KEY) ?? '');
    } catch {
      return '';
    }
  }

  rememberGuestName(name: string): void {
    try {
      this.storage.setItem(GUEST_KEY, sanitizeName(name));
    } catch {
      /* ignora */
    }
  }

  private load(): Profile | null {
    try {
      const raw = this.storage.getItem(PROFILE_KEY);
      if (!raw) return null;
      const p = JSON.parse(raw) as Partial<Profile>;
      if (typeof p.id !== 'string' || typeof p.name !== 'string' || !isValidName(p.name)) return null;
      return {
        id: p.id,
        name: sanitizeName(p.name),
        provider: 'local',
        createdAt: typeof p.createdAt === 'string' ? p.createdAt : '',
      };
    } catch {
      return null;
    }
  }
}
