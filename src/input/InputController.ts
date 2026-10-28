/**
 * Entrada unificada via Pointer Events (toque, mouse e caneta) + teclado.
 *
 * - Qualquer ponto da superfície de jogo conta como “segurar”.
 * - Vários dedos são tratados como um só: segura enquanto houver ao menos um.
 * - `setPointerCapture` garante o `pointerup` mesmo se o dedo sair da área.
 * - `pointercancel` / `lostpointercapture` (gesto do sistema, chamada
 *   recebida etc.), perda de foco e aba oculta soltam o controle — a
 *   bolinha nunca fica “presa” subindo.
 * - Gestos nativos (rolagem, zoom, menu de pressão longa, seleção) são
 *   bloqueados só dentro da superfície, via CSS `touch-action: none` e
 *   `preventDefault` em `contextmenu`/`selectstart`.
 */

export interface InputTarget {
  addEventListener(type: string, fn: (e: Event) => void, opts?: AddEventListenerOptions | boolean): void;
  removeEventListener(type: string, fn: (e: Event) => void, opts?: EventListenerOptions | boolean): void;
}

interface PointerLike extends Event {
  pointerId: number;
  pointerType?: string;
  button?: number;
  isPrimary?: boolean;
}

interface KeyLike extends Event {
  code?: string;
  key?: string;
  repeat?: boolean;
}

const HOLD_KEYS = new Set(['Space', 'ArrowUp', 'KeyW']);

export class InputController {
  private pointers = new Set<number>();
  private keys = new Set<string>();
  private holding = false;
  private enabled = true;
  private disposers: Array<() => void> = [];

  constructor(
    surface: InputTarget,
    windowTarget: InputTarget | null,
    private onChange: (holding: boolean) => void,
  ) {
    this.listen(surface, 'pointerdown', this.onDown, { passive: false });
    this.listen(surface, 'pointerup', this.onUp);
    this.listen(surface, 'pointercancel', this.onUp);
    this.listen(surface, 'lostpointercapture', this.onUp);
    this.listen(surface, 'contextmenu', prevent);
    this.listen(surface, 'selectstart', prevent);
    if (windowTarget) {
      this.listen(windowTarget, 'keydown', this.onKeyDown);
      this.listen(windowTarget, 'keyup', this.onKeyUp);
      this.listen(windowTarget, 'blur', this.releaseAll);
      // Segurança extra: um pointerup fora da superfície (sem captura) também solta.
      this.listen(windowTarget, 'pointerup', this.onUp);
    }
  }

  get isHolding() {
    return this.holding;
  }

  /** Desabilitar solta tudo e ignora novos toques (menus, pausa). */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.releaseAll();
  }

  releaseAll = (): void => {
    this.pointers.clear();
    this.keys.clear();
    this.update();
  };

  dispose(): void {
    for (const d of this.disposers) d();
    this.disposers = [];
    this.pointers.clear();
    this.keys.clear();
    this.holding = false;
  }

  private listen(t: InputTarget, type: string, fn: (e: Event) => void, opts?: AddEventListenerOptions) {
    t.addEventListener(type, fn, opts);
    this.disposers.push(() => t.removeEventListener(type, fn, opts));
  }

  private onDown = (ev: Event) => {
    const e = ev as PointerLike;
    if (!this.enabled) return;
    if (isInteractive(e.target)) return; // botões da interface não contam como “segurar”
    if (e.pointerType === 'mouse' && e.button !== undefined && e.button !== 0) return;
    e.preventDefault?.();
    this.pointers.add(e.pointerId);
    const el = e.target as (Element & { setPointerCapture?: (id: number) => void }) | null;
    try {
      el?.setPointerCapture?.(e.pointerId);
    } catch {
      /* alguns navegadores lançam se o ponteiro já foi liberado */
    }
    this.update();
  };

  private onUp = (ev: Event) => {
    const e = ev as PointerLike;
    if (!this.pointers.delete(e.pointerId)) return;
    this.update();
  };

  private onKeyDown = (ev: Event) => {
    const e = ev as KeyLike;
    if (!e.code || !HOLD_KEYS.has(e.code)) return;
    if (isInteractive(e.target) && e.code === 'Space') return; // Espaço num botão = clique
    e.preventDefault?.(); // evita rolar a página com espaço/seta
    if (!this.enabled) return;
    this.keys.add(e.code);
    this.update();
  };

  private onKeyUp = (ev: Event) => {
    const e = ev as KeyLike;
    if (!e.code || !this.keys.delete(e.code)) return;
    this.update();
  };

  private update() {
    const next = this.enabled && (this.pointers.size > 0 || this.keys.size > 0);
    if (next !== this.holding) {
      this.holding = next;
      this.onChange(next);
    }
  }
}

function prevent(e: Event) {
  e.preventDefault();
}

function isInteractive(target: EventTarget | null): boolean {
  const el = target as { closest?: (sel: string) => unknown } | null;
  return !!el?.closest?.('button, a, input, select, textarea, [data-ui]');
}
