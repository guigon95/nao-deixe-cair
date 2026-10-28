import { useCallback, useEffect, useRef, useState } from 'react';
import type { Profile } from '../../../shared/auth/auth';
import { ApiError } from '../../../shared/online/api';
import type { CloudWallet, OnlineApi } from '../../../shared/online/services';
import { accountWalletKey, WALLET_KEY, type WalletState } from '../game/Wallet';
import type { Storage } from '../../../shared/storage/storage';

/**
 * Carteira na nuvem para quem tem conta:
 * - ao entrar, busca a carteira da conta (e, na primeira vez, leva para ela
 *   as moedas e itens que estavam só neste aparelho);
 * - compras vão para o servidor (que confere o saldo);
 * - as moedas de cada partida são creditadas junto com a pontuação.
 * Sem conta (ou sem servidor), tudo continua só no aparelho.
 */
export function useCloudWallet(opts: {
  api: OnlineApi;
  storage: Storage;
  account: Profile | null;
  setWalletKey: (key: string) => void;
  applyWallet: (w: CloudWallet, feedbackItem?: string) => void;
  localBuy: (id: string) => boolean;
}) {
  const { api, storage, account, setWalletKey, applyWallet, localBuy } = opts;
  const [message, setMessage] = useState<string | null>(null);
  const accountId = account?.id ?? null;
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    if (!accountId) {
      setWalletKey(WALLET_KEY);
      return;
    }
    // abre na hora com a cópia local da conta; depois confirma com o servidor
    setWalletKey(accountWalletKey(accountId));
    void (async () => {
      try {
        let w = await api.wallet('bolinha');
        if (!w.imported) {
          const device = readDeviceWallet(storage);
          const r = await api.importWallet('bolinha', device);
          w = r.wallet;
          if (r.imported && (device.coins > 0 || device.owned.length > 2)) {
            // as moedas do aparelho foram para a conta: não ficam duplicadas aqui
            storage.setItem(WALLET_KEY, '');
            if (alive.current) setMessage(`Suas ${device.coins} moedas e itens deste aparelho agora estão na sua conta.`);
          }
        }
        if (alive.current) applyWallet(w);
      } catch {
        /* sem conexão: segue com a cópia local da conta */
      }
    })();
    return () => {
      alive.current = false;
    };
  }, [accountId, api, storage, setWalletKey, applyWallet]);

  /** Comprar/usar: com conta passa pelo servidor; sem conta, local. */
  const buy = useCallback(
    async (id: string) => {
      setMessage(null);
      if (!accountId) {
        localBuy(id);
        return;
      }
      try {
        applyWallet(await api.buy('bolinha', id), id);
      } catch (e) {
        setMessage(
          e instanceof ApiError && e.unavailable
            ? 'Sem conexão: a loja da conta precisa de internet.'
            : e instanceof Error
              ? e.message
              : 'Não deu para comprar agora.',
        );
      }
    },
    [accountId, api, applyWallet, localBuy],
  );

  return { buy, message, clearMessage: () => setMessage(null) };
}

function readDeviceWallet(storage: Storage): Pick<WalletState, 'coins' | 'owned' | 'skin' | 'trail'> {
  try {
    const raw = storage.getItem(WALLET_KEY);
    const p = raw ? (JSON.parse(raw) as Partial<WalletState>) : {};
    return {
      coins: typeof p.coins === 'number' && p.coins > 0 ? Math.floor(p.coins) : 0,
      owned: Array.isArray(p.owned) ? p.owned.filter((x) => typeof x === 'string') : [],
      skin: typeof p.skin === 'string' ? p.skin : 'classica',
      trail: typeof p.trail === 'string' ? p.trail : 'padrao',
    };
  } catch {
    return { coins: 0, owned: [], skin: 'classica', trail: 'padrao' };
  }
}
