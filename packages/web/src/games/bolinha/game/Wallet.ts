import { gameKey } from '../../../shared/storage/keys';
import type { Storage } from '../../../shared/storage/storage';
import { SKINS, TRAILS, type SkinId, type TrailId } from './cosmetics';

export const WALLET_KEY = gameKey('bolinha', 'wallet');

export interface WalletState {
  coins: number;
  /** Itens comprados (ids de bolinhas e rastros). */
  owned: string[];
  skin: SkinId;
  trail: TrailId;
}

const FREE: string[] = [...SKINS, ...TRAILS].filter((i) => i.price === 0).map((i) => i.id);
const DEFAULT: WalletState = { coins: 0, owned: FREE, skin: 'classica', trail: 'padrao' };

/**
 * Carteira de moedas e itens da loja, salva neste aparelho.
 * Cada moeda é gravada na hora em que é pega (não se perde se a aba fechar).
 */
export class Wallet {
  private state: WalletState;

  constructor(private storage: Storage) {
    this.state = this.load();
  }

  get(): WalletState {
    return { ...this.state, owned: [...this.state.owned] };
  }

  get coins() {
    return this.state.coins;
  }

  owns(id: string): boolean {
    return this.state.owned.includes(id);
  }

  add(n: number): void {
    if (!(n > 0)) return;
    this.state.coins += Math.floor(n);
    this.save();
  }

  /** Compra um item. Retorna false se já tem, não existe ou falta moeda. */
  buy(id: string): boolean {
    const item = [...SKINS, ...TRAILS].find((i) => i.id === id);
    if (!item || this.owns(id) || this.state.coins < item.price) return false;
    this.state.coins -= item.price;
    this.state.owned.push(id);
    this.save();
    return true;
  }

  /** Usa um item que já tem. */
  equip(id: string): boolean {
    if (!this.owns(id)) return false;
    if (SKINS.some((s) => s.id === id)) this.state.skin = id as SkinId;
    else if (TRAILS.some((t) => t.id === id)) this.state.trail = id as TrailId;
    else return false;
    this.save();
    return true;
  }

  private load(): WalletState {
    try {
      const raw = this.storage.getItem(WALLET_KEY);
      if (!raw) return { ...DEFAULT, owned: [...FREE] };
      const p = JSON.parse(raw) as Partial<WalletState>;
      const owned = Array.isArray(p.owned) ? p.owned.filter((x): x is string => typeof x === 'string') : [];
      for (const f of FREE) if (!owned.includes(f)) owned.push(f);
      const coins = typeof p.coins === 'number' && Number.isFinite(p.coins) && p.coins >= 0 ? Math.floor(p.coins) : 0;
      const skin = SKINS.some((s) => s.id === p.skin) && owned.includes(p.skin!) ? (p.skin as SkinId) : 'classica';
      const trail = TRAILS.some((t) => t.id === p.trail) && owned.includes(p.trail!) ? (p.trail as TrailId) : 'padrao';
      return { coins, owned, skin, trail };
    } catch {
      return { ...DEFAULT, owned: [...FREE] };
    }
  }

  private save(): void {
    try {
      this.storage.setItem(WALLET_KEY, JSON.stringify(this.state));
    } catch {
      /* fica só na memória desta sessão */
    }
  }
}
