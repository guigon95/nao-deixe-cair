import { useEffect, useRef, useState } from 'react';
import { SKINS, TRAILS, type SkinId, type TrailId } from '../game/cosmetics';
import type { WalletState } from '../game/Wallet';
import { drawSkin, drawTrailDot } from '../rendering/skins';

type Tab = 'bolinhas' | 'rastros';

export function CoinIcon() {
  return <span className="coin-icon" aria-hidden="true" />;
}

/** Prévia desenhada com o mesmo código do jogo. */
function Preview({ kind, id }: { kind: Tab; id: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const css = 64;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    c.width = c.height = css * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, css, css);
    const r = 11;
    if (kind === 'rastros') {
      for (let i = 9; i >= 0; i--) {
        const t = 1 - i / 10;
        drawTrailDot(ctx, id as TrailId, 40 - i * 4.2, 32 + Math.sin(i * 0.6) * 5, r, t, i, 0.4);
      }
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.translate(44, 32);
      drawSkin(ctx, 'classica', r);
      ctx.restore();
    } else {
      ctx.save();
      ctx.translate(32, 32);
      drawSkin(ctx, id as SkinId, id === 'planeta' ? r * 1.1 : r * 1.35, 0.3);
      ctx.restore();
    }
  }, [kind, id]);
  return <canvas ref={ref} className="shop-preview" width={64} height={64} aria-hidden="true" />;
}

export function ShopPanel({ shop, onBuy, onClose }: { shop: WalletState; onBuy: (id: string) => boolean; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('bolinhas');
  const closeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => closeRef.current?.focus({ preventScroll: true }), []);
  const items = tab === 'bolinhas' ? SKINS : TRAILS;
  const equipped = tab === 'bolinhas' ? shop.skin : shop.trail;
  return (
    <section className="panel shop" data-ui role="dialog" aria-modal="true" aria-labelledby="shop-title">
      <div className="shop-head">
        <h2 id="shop-title" className="panel-title">
          Loja
        </h2>
        <p className="shop-coins" aria-label={`${shop.coins} moedas`}>
          <CoinIcon /> <strong>{shop.coins}</strong>
        </p>
      </div>
      <div className="shop-tabs" role="tablist">
        {(['bolinhas', 'rastros'] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className="chip" onClick={() => setTab(t)}>
            {t === 'bolinhas' ? 'Bolinhas' : 'Rastros'}
          </button>
        ))}
      </div>
      <ul className="shop-grid">
        {items.map((it) => {
          const owned = shop.owned.includes(it.id);
          const using = equipped === it.id;
          const missing = it.price - shop.coins;
          return (
            <li key={it.id} className={`shop-item${using ? ' is-using' : ''}`} data-item={it.id}>
              <Preview kind={tab} id={it.id} />
              <span className="shop-name">{it.name}</span>
              {using ? (
                <span className="shop-state">Em uso</span>
              ) : owned ? (
                <button className="btn btn-secondary btn-tiny shop-btn" onClick={() => onBuy(it.id)}>
                  Usar
                </button>
              ) : (
                <button
                  className="btn btn-save btn-tiny shop-btn"
                  disabled={missing > 0}
                  onClick={() => onBuy(it.id)}
                  aria-label={missing > 0 ? `${it.name}: faltam ${missing} moedas` : `Comprar ${it.name} por ${it.price} moedas`}
                >
                  <CoinIcon /> {it.price}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <p className="shop-hint">Pegue moedas no caminho para comprar. Só muda o visual — a bolinha continua do mesmo tamanho.</p>
      <button ref={closeRef} className="btn btn-secondary" onClick={onClose}>
        Voltar
      </button>
    </section>
  );
}
