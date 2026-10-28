/** Catálogo da loja: visuais de bolinha e de rastro. Só aparência — a colisão é a mesma. */

export type SkinId = 'classica' | 'basquete' | 'sorriso' | 'futebol' | 'gelo' | 'planeta' | 'lava';
export type TrailId = 'padrao' | 'bolhas' | 'arco-iris' | 'estrelas' | 'fogo';

export interface ShopItem<Id extends string> {
  id: Id;
  name: string;
  price: number;
}

export const SKINS: readonly ShopItem<SkinId>[] = [
  { id: 'classica', name: 'Clássica', price: 0 },
  { id: 'basquete', name: 'Basquete', price: 25 },
  { id: 'sorriso', name: 'Sorriso', price: 40 },
  { id: 'futebol', name: 'Futebol', price: 60 },
  { id: 'gelo', name: 'Gelo', price: 90 },
  { id: 'planeta', name: 'Planeta', price: 120 },
  { id: 'lava', name: 'Lava', price: 150 },
];

export const TRAILS: readonly ShopItem<TrailId>[] = [
  { id: 'padrao', name: 'Padrão', price: 0 },
  { id: 'bolhas', name: 'Bolhas', price: 20 },
  { id: 'arco-iris', name: 'Arco-íris', price: 45 },
  { id: 'estrelas', name: 'Estrelas', price: 70 },
  { id: 'fogo', name: 'Fogo', price: 100 },
];
