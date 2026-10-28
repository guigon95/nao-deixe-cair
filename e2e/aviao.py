"""
Teste do Acrobata em navegador real (Chromium headless via Playwright).

Uso:  npm run build && npx vite preview --port 4173   (em outro terminal)
      python3 e2e/aviao.py [http://localhost:4173] [pasta_de_capturas]

Verifica com Pointer Events reais: segurar acelera e sobe cada vez mais alto
sem virar loop, soltar desacelera, toque + toque-e-segure registra um loop (toques curtos
em ritmo não), a batida leva ao fim de jogo, o reinício é
imediato, o ranking funciona (Só meu nome), pausa ao ocultar a aba, um único
laço de animação, sem erros de console e layouts em vários tamanhos.
"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4173"
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else "e2e/screens")
OUT.mkdir(parents=True, exist_ok=True)
URL = BASE + "/aviao/?debug&seed=7"

results = []


def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail else ""))


def st(page):
    return page.evaluate(
        """() => { const n = window.__NDC__, e = n.engine; return {
            state: e.state, throttle: e.plane.throttle, speed: e.plane.speed, x: e.plane.x, y: e.plane.y,
            phi: e.plane.phi, loops: e.score.loops, score: e.score.score, best: e.score.best,
            maneuvers: e.score.maneuvers, active: n.loop.activeLoops, runId: e.runId } }"""
    )


def surface_center(page):
    b = page.locator(".surface").bounding_box()
    return b["x"] + b["width"] / 2, b["y"] + b["height"] * 0.75


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3, has_touch=True, is_mobile=True)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

    page.goto(BASE + "/")
    page.evaluate("() => localStorage.clear()")
    page.goto(URL)
    page.wait_for_selector("text=DECOLAR")
    check("menu do Acrobata aparece", page.locator("h1").inner_text().strip() == "Acrobata")
    canvas_w = page.evaluate("() => document.querySelector('canvas').width")
    check("canvas usa devicePixelRatio", canvas_w >= 390 * 2.5, f"{canvas_w}px")
    page.screenshot(path=str(OUT / "aviao-01-menu.png"))

    page.click("text=DECOLAR")
    page.wait_for_timeout(300)
    s0 = st(page)
    check("DECOLAR inicia a partida", s0["state"] == "PLAYING")
    check("um único laço de animação", s0["active"] == 1)

    cx, cy = surface_center(page)
    page.mouse.move(cx, cy)
    page.mouse.down()
    page.wait_for_timeout(250)
    s1 = st(page)
    check("segurar acelera (potência sobe)", s1["throttle"] > 0.8, f"{s0['throttle']:.2f}→{s1['throttle']:.2f}")
    check("segurar levanta o nariz", s1["phi"] - s0["phi"] > 0.3, f"phi {s0['phi']:.2f}→{s1['phi']:.2f}")
    page.wait_for_timeout(1750)
    s1b = st(page)
    check("segurar 2 s sobe bem mais alto", s1b["y"] - s0["y"] > 300, f"subiu {s1b['y'] - s0['y']:.0f} u")
    check("segurar muito não vira loop", s1b["loops"] == 0 and s1b["phi"] < 1.2, f"phi={s1b['phi']:.2f}")
    page.screenshot(path=str(OUT / "aviao-02-subindo.png"))
    page.mouse.up()
    page.wait_for_timeout(350)
    s2 = st(page)
    check("soltar desacelera (potência cai)", s2["throttle"] < 0.5, f"{s2['throttle']:.2f}")
    # Dois toques curtos (ritmo frenético) NÃO dão loop.
    for _ in range(4):
        page.mouse.down(); page.wait_for_timeout(70); page.mouse.up(); page.wait_for_timeout(110)
    page.wait_for_timeout(300)
    check("toques rápidos curtos não dão loop", st(page)["loops"] == 0)
    page.mouse.down(); page.wait_for_timeout(500); page.mouse.up()
    page.wait_for_timeout(500)
    # Toque + toque-e-segure com Pointer Events reais → loop.
    page.mouse.down(); page.wait_for_timeout(80); page.mouse.up()
    page.wait_for_timeout(100)
    page.mouse.down(); page.wait_for_timeout(500); page.mouse.up()
    page.wait_for_timeout(600)
    page.screenshot(path=str(OUT / "aviao-02b-loop.png"))
    page.wait_for_function("() => window.__NDC__.engine.score.loops >= 1", timeout=4000)
    s2b = st(page)
    check("toque + toque-e-segure registra um loop", s2b["loops"] >= 1, f"loops={s2b['loops']} pontos={s2b['score']}")
    page.wait_for_timeout(300)
    page.screenshot(path=str(OUT / "aviao-03-pos-loop.png"))

    # Pausa ao ocultar a aba.
    page.evaluate("() => { Object.defineProperty(document, 'hidden', {value: true, configurable: true}); document.dispatchEvent(new Event('visibilitychange')) }")
    check("aba oculta pausa", st(page)["state"] == "PAUSED")
    x = st(page)["x"]
    page.wait_for_timeout(400)
    check("nada avança pausado", st(page)["x"] == x)
    page.evaluate("() => { Object.defineProperty(document, 'hidden', {value: false, configurable: true}); document.dispatchEvent(new Event('visibilitychange')) }")
    page.screenshot(path=str(OUT / "aviao-04-pausa.png"))
    page.click("text=CONTINUAR")
    page.wait_for_function("() => window.__NDC__.engine.state === 'PLAYING'", timeout=4000)
    check("retomada volta a jogar", st(page)["state"] == "PLAYING")

    # Batida: sem tocar, o avião plana até o chão; perde a velocidade e bate.
    page.wait_for_function("() => window.__NDC__.engine.state === 'GAME_OVER'", timeout=40000)
    page.wait_for_timeout(500)
    s3 = st(page)
    check("batida leva ao fim de jogo", s3["state"] == "GAME_OVER", f"pontos={s3['score']}")
    check("fim mostra pontos e VOAR DE NOVO", page.locator("text=VOAR DE NOVO").count() == 1 and str(s3["score"]) in page.locator(".final-score").inner_text())
    page.screenshot(path=str(OUT / "aviao-05-fim.png"))

    # Ranking: Só meu nome.
    if page.locator("text=Só meu nome").count():
        page.click("text=Só meu nome")
        page.fill("#player-name", "Teste Aviao")
        page.press("#player-name", "Enter")
        page.wait_for_selector("text=lugar no ranking")
        check("ranking salva com Só meu nome", page.locator(".save-box.is-saved").count() == 1)
        page.screenshot(path=str(OUT / "aviao-06-ranking-salvo.png"))
    else:
        check("ranking salva com Só meu nome", False, "pontuação não qualificou")
    rank = page.evaluate("() => JSON.parse(localStorage.getItem('ndc:aviao:ranking') || '[]').length")
    check("ranking do avião separado da bolinha", rank == 1 and page.evaluate("() => localStorage.getItem('ndc:bolinha:ranking')") is None)
    check("recorde do avião salvo", page.evaluate("() => localStorage.getItem('ndc:aviao:best')") == str(s3["score"]))

    run_before = s3["runId"]
    page.click("text=VOAR DE NOVO")
    page.wait_for_timeout(100)
    s4 = st(page)
    check("reinício imediato", s4["state"] == "PLAYING" and s4["runId"] == run_before + 1 and s4["score"] < 5)
    check("reinício não duplica laços", s4["active"] == 1)

    # Teclado (desktop): Esc pausa.
    page.keyboard.press("Escape")
    check("Esc pausa", st(page)["state"] == "PAUSED")
    page.click("text=Menu inicial")
    page.wait_for_selector("text=DECOLAR")
    check("recorde aparece no menu", str(s3["score"]) in page.locator(".best").inner_text())
    check("sem erros de console", not errors, "; ".join(errors[:3]))
    ctx.close()

    # Layouts.
    for (w, h, name, touch) in [
        (320, 480, "small", True),
        (390, 844, "iphone", True),
        (412, 915, "android", True),
        (768, 1024, "tablet", True),
        (844, 390, "landscape", True),
        (1280, 800, "desktop", False),
    ]:
        c = browser.new_context(viewport={"width": w, "height": h}, has_touch=touch, is_mobile=touch)
        pg = c.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(URL)
        pg.wait_for_selector("text=DECOLAR")
        menu = pg.locator(".menu").bounding_box()
        arena = pg.locator(".arena-ui").bounding_box()
        inside = menu["y"] >= arena["y"] - 1 and menu["y"] + menu["height"] <= arena["y"] + arena["height"] + 1
        check(f"{name} {w}x{h}: menu dentro da arena", inside)
        pg.screenshot(path=str(OUT / f"aviao-menu-{name}-{w}x{h}.png"))
        pg.click("text=DECOLAR")
        pg.wait_for_timeout(400)
        b = pg.locator(".surface").bounding_box()
        pg.mouse.move(b["x"] + b["width"] / 2, b["y"] + b["height"] * 0.7)
        pg.mouse.down()
        pg.wait_for_timeout(900)
        pg.screenshot(path=str(OUT / f"aviao-voo-{name}-{w}x{h}.png"))
        pg.mouse.up()
        pause = pg.locator(".pause-btn").bounding_box()
        check(f"{name}: botão de pausa visível e ≥ 44px", pause and pause["width"] >= 44 and pause["x"] >= 0 and pause["y"] >= 0)
        if name == "landscape":
            check("celular deitado sugere girar", pg.locator(".rotate-hint").count() == 1)
        check(f"{name}: sem erros", not errs, "; ".join(errs[:2]))
        c.close()

    browser.close()

ok = sum(1 for r in results if r[1])
print(f"\n{ok}/{len(results)} verificações passaram")
sys.exit(0 if ok == len(results) else 1)
