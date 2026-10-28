import { migrateLegacyKeys } from './keys';

export interface Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Armazenamento em memória — usado quando o localStorage está indisponível. */
export class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  getItem(key: string) {
    return this.data.has(key) ? this.data.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}

/**
 * Envolve qualquer Storage para que falhas (modo privado, cota cheia,
 * cookies bloqueados) nunca impeçam o jogo de funcionar.
 */
export class SafeStorage implements Storage {
  private fallback = new MemoryStorage();
  constructor(private inner: Storage | null) {}
  getItem(key: string): string | null {
    try {
      const v = this.inner?.getItem(key);
      if (v !== null && v !== undefined) return v;
    } catch {
      /* ignora: usa fallback */
    }
    return this.fallback.getItem(key);
  }
  setItem(key: string, value: string): void {
    this.fallback.setItem(key, value);
    try {
      this.inner?.setItem(key, value);
    } catch {
      /* ignora: valor fica só na memória */
    }
  }
}

let shared: Storage | null = null;

/**
 * Armazenamento do navegador compartilhado por hub e jogos. Na primeira
 * chamada migra (uma única vez) as chaves antigas `nao-deixe-cair:*`.
 */
export function browserStorage(): Storage {
  if (shared) return shared;
  let ls: Storage | null;
  try {
    ls = typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    ls = null;
  }
  shared = new SafeStorage(ls);
  migrateLegacyKeys(shared);
  return shared;
}
