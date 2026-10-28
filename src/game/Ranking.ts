import type { Storage } from './types';

export interface RankingEntry {
  id: string;
  name: string;
  score: number;
  /** Data ISO (yyyy-mm-dd). */
  date: string;
  /** Perfil que fez a pontuação; ausente quando foi só com nome. */
  profileId?: string;
}

export interface RankingResult {
  entry: RankingEntry;
  /** Posição 1-based no ranking. */
  position: number;
}

/**
 * Contrato do ranking. Hoje a implementação é local (neste aparelho);
 * um ranking online pode implementar a mesma interface depois, sem mudar a UI.
 */
export interface RankingService {
  readonly scope: 'local' | 'online';
  list(): RankingEntry[];
  /** Pontuação mínima para entrar no ranking agora (0 = qualquer pontuação > 0 entra). */
  threshold(): number;
  qualifies(score: number): boolean;
  submit(name: string, score: number, profileId?: string): RankingResult | null;
}

export const RANKING_KEY = 'nao-deixe-cair:ranking';
export const RANKING_SIZE = 10;
export const NAME_MIN = 2;
export const NAME_MAX = 16;

/** Limpa o nome digitado: tira controles e espaços repetidos, limita o tamanho. */
export function sanitizeName(raw: string): string {
  return (
    raw
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f<>]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, NAME_MAX)
      .trim()
  );
}

export function isValidName(raw: string): boolean {
  const n = sanitizeName(raw);
  return n.length >= NAME_MIN && /[\p{L}\p{N}]/u.test(n);
}

function newId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  } catch {
    /* segue para o fallback */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function today(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** Ranking persistido no navegador (localStorage), top 10. */
export class LocalRanking implements RankingService {
  readonly scope = 'local' as const;
  private entries: RankingEntry[];

  constructor(
    private storage: Storage,
    private size = RANKING_SIZE,
    private clock: () => Date = () => new Date(),
  ) {
    this.entries = this.load();
  }

  list(): RankingEntry[] {
    return this.entries.slice();
  }

  threshold(): number {
    if (this.entries.length < this.size) return 1;
    return this.entries[this.entries.length - 1].score + 1;
  }

  qualifies(score: number): boolean {
    return Number.isFinite(score) && score > 0 && score >= this.threshold();
  }

  submit(name: string, score: number, profileId?: string): RankingResult | null {
    const clean = sanitizeName(name);
    if (!isValidName(clean) || !this.qualifies(score)) return null;
    const entry: RankingEntry = { id: newId(), name: clean, score: Math.floor(score), date: today(this.clock()) };
    if (profileId) entry.profileId = profileId;
    // Empate: quem chegou antes fica na frente (inserção estável).
    let i = this.entries.findIndex((e) => e.score < entry.score);
    if (i < 0) i = this.entries.length;
    this.entries.splice(i, 0, entry);
    this.entries.length = Math.min(this.entries.length, this.size);
    this.save();
    return { entry, position: i + 1 };
  }

  private load(): RankingEntry[] {
    try {
      const raw = this.storage.getItem(RANKING_KEY);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(
          (e): e is RankingEntry =>
            !!e &&
            typeof e === 'object' &&
            typeof (e as RankingEntry).name === 'string' &&
            typeof (e as RankingEntry).score === 'number' &&
            Number.isFinite((e as RankingEntry).score) &&
            (e as RankingEntry).score > 0,
        )
        .map((e) => ({
          id: typeof e.id === 'string' ? e.id : newId(),
          name: sanitizeName(e.name) || 'Jogador',
          score: Math.floor(e.score),
          date: typeof e.date === 'string' ? e.date : '',
          ...(typeof e.profileId === 'string' ? { profileId: e.profileId } : {}),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, this.size);
    } catch {
      return [];
    }
  }

  private save(): void {
    try {
      this.storage.setItem(RANKING_KEY, JSON.stringify(this.entries));
    } catch {
      /* ranking fica só na memória desta sessão */
    }
  }
}
