import type { AdProvider, InterstitialCallbacks, RewardedCallbacks } from '../types';

/**
 * SOMENTE DESENVOLVIMENTO (`npm run dev` com VITE_ADS_PROVIDER=dev ou `?ads=dev`).
 *
 * Simula a rede para testar o fluxo do jogo sem conta de anúncios: mostra um
 * painel claramente marcado "ANÚNCIO SIMULADO — DESENVOLVIMENTO" com botões
 * para ver até o fim, fechar antes ou responder "sem anúncio".
 * `resolveConfig` nunca escolhe este provedor num build de produção, e o
 * índice só o instancia sob `import.meta.env.DEV`.
 *
 * Na URL: `&fill=0` simula "sem anúncio disponível".
 */
export class DevSimulatedProvider implements AdProvider {
  readonly id = 'dev' as const;
  private fill = true;

  init(): void {
    this.fill = new URLSearchParams(location.search).get('fill') !== '0';
    console.info('[ads] provedor SIMULADO de desenvolvimento ativo (nenhum anúncio real).');
  }

  isReady(): boolean {
    return true;
  }

  setSound(): void {}

  interstitial(name: string, cb: InterstitialCallbacks): void {
    if (!this.fill) {
      setTimeout(() => cb.done({ shown: false, status: 'noAdPreloaded' }), 150);
      return;
    }
    cb.adStarted();
    panel(`Intersticial simulado (${name})`, [
      {
        label: 'Fechar anúncio',
        run: () => {
          cb.adEnded();
          cb.done({ shown: true, status: 'viewed' });
        },
      },
    ]);
  }

  rewarded(name: string, cb: RewardedCallbacks): void {
    if (!this.fill) {
      setTimeout(() => cb.done({ status: 'noAdPreloaded' }), 400);
      return;
    }
    setTimeout(() => {
      cb.available(() => {
        cb.adStarted();
        panel(`Anúncio com recompensa simulado (${name})`, [
          {
            label: 'Ver até o fim (ganha)',
            run: () => {
              cb.viewed();
              cb.adEnded();
              cb.done({ status: 'viewed' });
            },
          },
          {
            label: 'Fechar antes (sem prêmio)',
            run: () => {
              cb.dismissed();
              cb.adEnded();
              cb.done({ status: 'dismissed' });
            },
          },
        ]);
      });
    }, 400);
  }
}

function panel(title: string, actions: { label: string; run: () => void }[]): void {
  const box = document.createElement('div');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'Anúncio simulado de desenvolvimento');
  box.style.cssText =
    'position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;' +
    'background:repeating-linear-gradient(45deg,#222 0 14px,#333 14px 28px);color:#fff;font:600 16px system-ui;text-align:center;padding:24px';
  const h = document.createElement('p');
  h.textContent = 'ANÚNCIO SIMULADO — DESENVOLVIMENTO';
  h.style.cssText = 'font-size:20px;color:#ffd23f;margin:0';
  const sub = document.createElement('p');
  sub.textContent = title;
  sub.style.margin = '0';
  box.append(h, sub);
  for (const a of actions) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = a.label;
    b.style.cssText = 'font:600 16px system-ui;padding:12px 20px;border-radius:10px;border:0;cursor:pointer;min-width:240px';
    b.onclick = () => {
      box.remove();
      a.run();
    };
    box.append(b);
  }
  document.body.append(box);
}
