"""
Teste do Fominha (cobrinha) em navegador real (Chromium headless via Playwright).

Uso:  npm run build && npx vite preview --port 4173   (em outro terminal)
      python3 e2e/cobrinha.py [http://localhost:4173] [pasta_de_capturas]

Verifica, com viewport de celular e toque: deslizes reais (Pointer Events)
nas quatro direções, curvas em "L" num gesto só, teclado (setas/WASD/pausa),
comer e crescer, batida na parede e no corpo, reinício, recorde salvo após
recarregar, pausa ao ocultar a aba, um único laço de animação, o cartão no
hub, os outros jogos abrindo sem erro e capturas de tela.
"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4173"
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else "e2e/screens")
OUT.mkdir(parents=True, exist_ok=True)
URL = BASE + "/cobrinha/?debug&seed=7"

results = []


def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail else ""))


def st(page):
    return page.evaluate(
        """() => { const n = window.__NDC__, e = n.engine; return {
            state: e.state, dir: e.dir, head: e.snake[0], len: e.snake.length, score: e.score,
            best: e.best, items: e.items.length, active: n.loop.activeLoops, runId: e.runId, interval: e.interval } }"""
    )


def freeze(page):
    """Para o relógio da cobrinha (passos só por e.step()) e limpa a mesa: testes determinísticos."""
    page.evaluate("() => { const e = window.__NDC__.engine; e.items = []; e.stepTimer = 0; e.advance = () => {}; }")


def step(page, n=1):
    page.evaluate(f"() => {{ for (let i = 0; i < {n}; i++) window.__NDC__.engine.step(); }}")


def swipe(page, dx, dy, x=180, y=420):
    """Deslize por toque com Pointer Events (o mesmo caminho do dedo)."""
    page.evaluate(
        """([x, y, dx, dy]) => {
            const s = document.querySelector('.surface');
            const opt = (cx, cy) => ({ bubbles: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: cx, clientY: cy });
            s.dispatchEvent(new PointerEvent('pointerdown', opt(x, y)));
            for (let i = 1; i <= 4; i++) s.dispatchEvent(new PointerEvent('pointermove', opt(x + dx * i / 4, y + dy * i / 4)));
            s.dispatchEvent(new PointerEvent('pointerup', opt(x + dx, y + dy)));
        }""",
        [x, y, dx, dy],
    )


def start(page):
    page.click("text=JOGAR")
    page.wait_for_timeout(100)


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(
        viewport={"width": 430, "height": 932},
        device_scale_factor=3,
        is_mobile=True,
        has_touch=True,
        user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    )
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "/api/" not in m.text and "Failed to load resource" not in m.text else None)

    # ---- hub
    page.goto(BASE + "/")
    page.wait_for_timeout(400)
    card = page.locator('[data-game="cobrinha"]')
    check("hub mostra o cartão do Fominha", card.count() == 1)
    for g in ["bolinha", "aviao", "corrida"]:
        check(f"hub mantém o cartão de {g}", page.locator(f'[data-game="{g}"]').count() == 1)
    page.screenshot(path=str(OUT / "cobrinha-hub.png"), full_page=True)
    card.locator("a").click()
    page.wait_for_url("**/cobrinha/")
    check("cartão leva ao jogo", page.url.rstrip("/").endswith("/cobrinha"))

    page.goto(URL)
    page.wait_for_timeout(500)
    page.screenshot(path=str(OUT / "cobrinha-menu.png"))
    check("menu: título e botão JOGAR", page.locator("text=Fominha").first.is_visible() and page.locator("text=JOGAR").is_visible())
    check("menu: voltar ao hub", page.locator(".hub-back").is_visible())

    # ---- movimento por deslize nas 4 direções
    start(page)
    s = st(page)
    check("partida começa", s["state"] == "PLAYING" and s["len"] == 4, str(s))
    check("um único laço de animação", s["active"] == 1)
    freeze(page)
    h0 = st(page)["head"]
    step(page)
    h1 = st(page)["head"]
    check("anda para cima sozinha", h1["y"] == h0["y"] - 1 and h1["x"] == h0["x"])
    swipe(page, -60, 0)
    step(page)
    s = st(page)
    check("deslize para a esquerda", s["dir"] == "left" and s["head"]["x"] == h1["x"] - 1, str(s))
    swipe(page, 0, 60)
    step(page)
    s = st(page)
    check("deslize para baixo", s["dir"] == "down", str(s))
    swipe(page, 60, 0)
    step(page)
    s = st(page)
    check("deslize para a direita", s["dir"] == "right", str(s))
    swipe(page, 0, -60)
    step(page)
    check("deslize para cima", st(page)["dir"] == "up")
    swipe(page, 0, 60)
    step(page)
    check("meia-volta direta é ignorada (não bate)", st(page)["dir"] == "up" and st(page)["state"] == "PLAYING")
    swipe(page, 6, 3)
    check("toque curto não vira", st(page)["dir"] == "up")

    # gesto em L: dois movimentos num mesmo toque
    page.evaluate(
        """() => {
            const s = document.querySelector('.surface');
            const o = (x, y) => ({ bubbles: true, pointerId: 9, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y });
            s.dispatchEvent(new PointerEvent('pointerdown', o(200, 400)));
            s.dispatchEvent(new PointerEvent('pointermove', o(140, 400)));
            s.dispatchEvent(new PointerEvent('pointermove', o(140, 470)));
            s.dispatchEvent(new PointerEvent('pointerup', o(140, 470)));
        }"""
    )
    step(page)
    a = st(page)["dir"]
    step(page)
    b = st(page)["dir"]
    check("gesto em L faz duas curvas", a == "left" and b == "down", f"{a},{b}")

    # ---- teclado
    page.keyboard.press("ArrowRight")
    step(page)
    check("seta direita", st(page)["dir"] == "right")
    page.keyboard.press("KeyW")
    step(page)
    check("W (cima)", st(page)["dir"] == "up")
    page.keyboard.press("KeyA")
    step(page)
    check("A (esquerda)", st(page)["dir"] == "left")
    page.keyboard.press("ArrowDown")
    step(page)
    check("seta baixo", st(page)["dir"] == "down")

    # ---- comer e crescer
    page.evaluate(
        """() => { const e = window.__NDC__.engine, h = e.snake[0];
           e.items = [{ id: 900, kind: 'ouro', x: h.x, y: h.y + 1, age: 0, life: 0 }]; }"""
    )
    before = st(page)
    step(page, 2)
    after = st(page)
    check("comer soma pontos e cresce", after["score"] == before["score"] + 30 and after["len"] == before["len"] + 1, f"{before} -> {after}")
    check("novo item aparece", after["items"] >= 1)
    page.evaluate("() => { window.__NDC__.engine.items = []; }")

    # ---- pausa pelo teclado e pelo botão
    page.keyboard.press("Space")
    page.wait_for_timeout(100)
    check("espaço pausa", st(page)["state"] == "PAUSED")
    page.screenshot(path=str(OUT / "cobrinha-pausa.png"))
    page.click("text=CONTINUAR")
    page.wait_for_timeout(50)
    check("continuar faz contagem", st(page)["state"] == "RESUMING")

    # ---- parede
    page.goto(URL)
    page.wait_for_timeout(300)
    start(page)
    freeze(page)
    step(page, 40)
    s = st(page)
    check("bater na parede encerra", s["state"] == "GAME_OVER", str(s))
    page.wait_for_timeout(500)
    check("tela de fim: pontos, tamanho, jogar novamente, hub",
          page.locator(".final-score").is_visible() and page.locator("text=JOGAR NOVAMENTE").is_visible()
          and page.locator("text=Voltar ao hub").is_visible() and page.locator(".run-stats").inner_text().find("tamanho") >= 0)
    page.screenshot(path=str(OUT / "cobrinha-fim.png"))

    # ---- reinício imediato
    run = st(page)["runId"]
    page.click("text=JOGAR NOVAMENTE")
    page.wait_for_timeout(80)
    s = st(page)
    check("reinício imediato", s["state"] == "PLAYING" and s["runId"] == run + 1 and s["len"] == 4 and s["score"] == 0)
    check("ainda um único laço após reinício", s["active"] == 1)

    # ---- corpo
    freeze(page)
    page.evaluate(
        """() => { const e = window.__NDC__.engine;
           e.snake = [{x:5,y:5},{x:5,y:6},{x:5,y:7},{x:5,y:8},{x:5,y:9},{x:5,y:10}];
           e.prev = e.snake.map(c => ({...c})); e.fill = e.snake.map(() => null); }"""
    )
    page.keyboard.press("ArrowRight"); step(page)
    page.keyboard.press("ArrowDown"); step(page)
    page.keyboard.press("ArrowLeft"); step(page)
    check("bater no próprio corpo encerra", st(page)["state"] == "GAME_OVER")

    # ---- recorde persistente
    page.goto(URL)
    page.wait_for_timeout(300)
    start(page)
    freeze(page)
    page.evaluate("() => { window.__NDC__.engine.score = 777; }")
    step(page, 40)
    page.wait_for_timeout(300)
    page.reload()
    page.wait_for_timeout(400)
    check("recorde salvo após recarregar", st(page)["best"] >= 777 and page.locator(".best").inner_text().find("777") >= 0)
    page.goto(BASE + "/")
    page.wait_for_timeout(300)
    check("recorde aparece no cartão do hub", "777" in page.locator('[data-game="cobrinha"]').inner_text())

    # ---- velocidade sobe
    page.goto(URL)
    page.wait_for_timeout(300)
    start(page)
    i0 = st(page)["interval"]
    page.evaluate(
        """() => { const e = window.__NDC__.engine; e.advance = () => {};
           for (let i = 0; i < 15; i++) { const h = e.snake[0];
             e.items = [{ id: 1000+i, kind: 'chocolate', x: h.x, y: h.y - 1, age: 0, life: 0 }];
             e.step(); e.snake = e.snake.map(c => ({ x: c.x, y: c.y + 1 })); e.prev = e.snake.map(c => ({...c})); } }"""
    )
    check("velocidade aumenta ao comer", st(page)["interval"] < i0, f"{i0} -> {st(page)['interval']}")

    # ---- jogo rodando de verdade (tempo real) e captura
    page.goto(URL)
    page.wait_for_timeout(300)
    start(page)
    page.evaluate(
        """() => { const e = window.__NDC__.engine;
           for (const k of ['dinheiro','ouro','mansao','rachadinha','jatinho','mala']) e.spawn(k);
           e.snake = [{x:7,y:14},{x:7,y:15},{x:7,y:16},{x:7,y:17},{x:6,y:17},{x:5,y:17},{x:4,y:17},{x:4,y:18},{x:4,y:19}];
           e.fill = [null,'dinheiro','ouro','chocolate','rachadinha',null,'mala',null,null];
           e.prev = e.snake.map(c => ({...c})); }"""
    )
    page.wait_for_timeout(350)
    page.screenshot(path=str(OUT / "cobrinha-jogo.png"))
    y0 = st(page)["head"]["y"]
    page.wait_for_timeout(700)
    check("anda sozinha em tempo real", st(page)["head"]["y"] < y0 or st(page)["state"] != "PLAYING")

    # ---- aba oculta pausa
    page.evaluate("() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }")
    page.wait_for_timeout(50)
    check("aba oculta pausa", st(page)["state"] in ("PAUSED", "GAME_OVER"))

    # ---- desktop sem toque
    dctx = browser.new_context(viewport={"width": 1280, "height": 800})
    dp = dctx.new_page()
    dp.on("pageerror", lambda e: errors.append(str(e)))
    dp.goto(URL)
    dp.wait_for_timeout(300)
    dp.keyboard.press("Enter")
    dp.wait_for_timeout(100)
    check("desktop: Enter começa", st(dp)["state"] == "PLAYING")
    dp.screenshot(path=str(OUT / "cobrinha-desktop.png"))

    # ---- outros jogos continuam abrindo
    for g in ["bolinha", "aviao", "corrida"]:
        gp = ctx.new_page()
        gerr = []
        gp.on("pageerror", lambda e: gerr.append(str(e)))
        gp.goto(f"{BASE}/{g}/")
        gp.wait_for_timeout(600)
        ok = gp.locator("canvas").count() >= 1 and gp.locator(".btn-primary").first.is_visible()
        check(f"{g} abre sem erro", ok and not gerr, "; ".join(gerr))
        gp.close()

    check("sem erros de página/console", not errors, " | ".join(errors[:5]))
    browser.close()

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} verificações passaram")
sys.exit(1 if failed else 0)
