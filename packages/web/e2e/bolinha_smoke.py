"""
Teste de fumaça em navegador real (Chromium headless via Playwright).

Uso:  npm run build && npx vite preview --port 4173   (em outro terminal)
      python3 e2e/bolinha_smoke.py [http://localhost:4173] [pasta_de_capturas]

Verifica: carregamento sem erros de console, tela inicial, partida iniciando
por toque, bolinha subindo ao segurar e caindo ao soltar (Pointer Events
reais), barreiras se movendo da direita para a esquerda, pausa ao ocultar a
aba, game over, recorde persistido após recarregar e layout em vários
tamanhos de tela. Gera capturas para inspeção visual.
"""
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4173"
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else "e2e/screens")
OUT.mkdir(parents=True, exist_ok=True)
URL = BASE + "/bolinha/?debug&seed=7"

results = []


def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail else ""))


def state(page):
    return page.evaluate(
        """() => { const e = window.__NDC__.engine; return {
            state: e.state, y: e.ball.y, vy: e.ball.vy, elapsed: e.elapsed,
            score: e.score.score, best: e.score.best, loops: window.__NDC__.loop.activeLoops,
            bx: e.obstacles.barriers.map(b => b.x) } }"""
    )


def arena_center(page):
    return page.evaluate(
        """() => { const r = document.querySelector('.arena-ui').getBoundingClientRect();
                   return { x: r.left + r.width * 0.6, y: r.top + r.height * 0.5, w: r.width, h: r.height,
                            left: r.left, top: r.top } }"""
    )


with sync_playwright() as p:
    browser = p.chromium.launch()

    # ---------- Celular (toque) ----------
    ctx = browser.new_context(
        viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True
    )
    page = ctx.new_page()
    errors = []
    page.on("console", lambda m: m.type == "error" and "/api/" not in (m.location or {}).get("url", "") and errors.append(m.text))  # sem servidor, o /api falha de propósito
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL)
    page.wait_for_selector("text=JOGAR")
    page.wait_for_timeout(400)
    page.screenshot(path=str(OUT / "01-menu-mobile.png"))
    check("tela inicial mostra título, instrução e botão JOGAR",
          page.locator("h1").inner_text().replace("\n", " ").strip() == "Não Deixe Cair"
          and page.locator(".howto").count() == 1)
    dpr_ok = page.evaluate("() => document.querySelector('canvas').width === Math.round(document.querySelector('canvas').getBoundingClientRect().width * Math.min(devicePixelRatio, 2.5))")
    check("canvas usa devicePixelRatio (nitidez)", dpr_ok)

    page.tap("text=JOGAR")
    page.wait_for_timeout(100)
    s0 = state(page)
    check("toque em JOGAR inicia a partida", s0["state"] == "PLAYING", s0["state"])
    check("apenas um laço de animação ativo", s0["loops"] == 1)

    # Segurar com um ponteiro real (CDP touch) e medir a subida.
    c = arena_center(page)
    cdp = ctx.new_cdp_session(page)
    def touch(kind, x=c["x"], y=c["y"]):
        pts = [] if kind == "touchEnd" else [{"x": x, "y": y, "id": 1}]
        cdp.send("Input.dispatchTouchEvent", {"type": kind, "touchPoints": pts})

    y_before = state(page)["y"]
    touch("touchStart")
    # A bolinha pode estar caindo no instante do toque: espera ela inverter e subir.
    page.wait_for_timeout(500)
    s1 = state(page)
    check("segurar faz a bolinha subir", s1["y"] < y_before - 10 and s1["vy"] < 0, f"{y_before:.0f}→{s1['y']:.0f}")
    page.screenshot(path=str(OUT / "02-playing-hold.png"))
    touch("touchEnd")
    page.wait_for_timeout(450)
    s2 = state(page)
    check("soltar faz a bolinha cair", s2["vy"] > 0 or s2["y"] > s1["y"] + 20, f"{s1['y']:.0f}→{s2['y']:.0f}")
    check("barreiras se movem da direita para a esquerda",
          len(s2["bx"]) > 0 and min(s2["bx"]) < min(s0["bx"]), f"{min(s0['bx']):.0f}→{min(s2['bx']):.0f}")
    check("pontuação avança com o tempo", s2["score"] >= 0 and s2["elapsed"] > 0.6)

    # Aba oculta → pausa.
    page.evaluate("""() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
                              document.dispatchEvent(new Event('visibilitychange')); }""")
    page.wait_for_timeout(50)
    sp = state(page)
    page.wait_for_timeout(500)
    sp2 = state(page)
    check("aba oculta pausa a partida", sp["state"] == "PAUSED")
    check("nada avança em pausa", sp["elapsed"] == sp2["elapsed"] and sp["y"] == sp2["y"])
    page.evaluate("""() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
                              document.dispatchEvent(new Event('visibilitychange')); }""")
    page.screenshot(path=str(OUT / "03-paused.png"))
    check("tela de pausa oferece continuar e reiniciar",
          page.locator("text=CONTINUAR").count() == 1 and page.locator("text=Reiniciar").count() == 1)
    page.tap("text=CONTINUAR")
    page.wait_for_timeout(250)
    check("retomada passa por contagem", state(page)["state"] == "RESUMING")
    page.screenshot(path=str(OUT / "04-resuming.png"))
    for _ in range(30):  # contagem de ~1,2 s; o tempo real do navegador sem tela varia
        if state(page)["state"] == "PLAYING":
            break
        page.wait_for_timeout(100)
    check("após a contagem volta a jogar", state(page)["state"] == "PLAYING")

    # Deixar cair até colidir (sem tocar): com vidas, oferece continuar de onde parou.
    def wait_state(target, tries=100):
        for _ in range(tries):
            if state(page)["state"] == target:
                return True
            page.wait_for_timeout(100)
        return False
    check("colisão com vidas leva à tela de continuar", wait_state("CONTINUE"))
    page.wait_for_timeout(300)
    page.screenshot(path=str(OUT / "05a-continue.png"))
    check("tela de continuar mostra 3 vidas e os botões",
          page.locator(".lives .heart.is-full").count() == 3 and page.locator(".continue >> text=CONTINUAR").count() == 1
          and page.locator("text=Encerrar partida").count() == 1)
    before = state(page)["score"]
    page.tap(".continue >> text=CONTINUAR"); page.wait_for_timeout(150)
    check("continuar passa pela contagem e mantém os pontos", state(page)["state"] == "RESUMING" and state(page)["score"] == before)
    check("volta a jogar depois da contagem", wait_state("PLAYING", 40))
    lives = page.evaluate("window.__NDC__.engine.livesLeft")
    check("continuar gasta uma vida", lives == 2, f"vidas={lives}")
    page.screenshot(path=str(OUT / "05b-after-continue.png"))
    check("bateu de novo → continuar com 2 vidas", wait_state("CONTINUE") and page.locator(".lives .heart.is-full").count() == 2)
    page.tap("text=Encerrar partida")
    sg = state(page)
    check("encerrar leva ao fim de jogo", sg["state"] == "GAME_OVER")
    page.wait_for_timeout(300)
    page.screenshot(path=str(OUT / "05-gameover.png"))
    check("fim de jogo mostra pontos, recorde e JOGAR DE NOVO",
          page.locator(".final-score .value").count() == 1 and page.locator("text=JOGAR DE NOVO").count() == 1)
    best_shown = int(page.locator(".gameover .best strong").inner_text())
    frozen = state(page)["score"]
    page.wait_for_timeout(400)
    check("pontuação congelada após o fim", state(page)["score"] == frozen)

    page.tap("text=JOGAR DE NOVO")
    page.wait_for_timeout(80)
    sr = state(page)
    check("reinício imediato com um toque", sr["state"] == "PLAYING" and sr["elapsed"] < 0.2)
    check("reinício não duplica laços", sr["loops"] == 1)

    stored = page.evaluate("() => localStorage.getItem('ndc:bolinha:best')")
    page.reload()
    page.wait_for_selector("text=JOGAR")
    check("recorde salvo e exibido após recarregar",
          stored is not None and int(stored) == best_shown and page.locator(".menu .best strong").inner_text() == str(best_shown),
          f"salvo={stored} exibido={best_shown}")
    check("sem erros de console (celular)", not errors, "; ".join(errors[:3]))
    ctx.close()

    # ---------- Desktop (mouse + teclado) ----------
    ctx = browser.new_context(viewport={"width": 1280, "height": 800})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL)
    page.wait_for_selector("text=JOGAR")
    page.screenshot(path=str(OUT / "06-menu-desktop.png"))
    page.keyboard.press("Enter")  # foco está no JOGAR
    page.wait_for_timeout(80)
    check("Enter inicia pelo teclado", state(page)["state"] == "PLAYING")
    c = arena_center(page)
    page.mouse.move(c["x"], c["y"])
    y0 = state(page)["y"]
    page.mouse.down()
    page.wait_for_timeout(300)
    check("mouse pressionado faz subir", state(page)["y"] < y0 - 15)
    page.mouse.up()
    page.wait_for_timeout(200)
    check("soltar o mouse faz cair", state(page)["vy"] > 0)
    page.keyboard.down("Space")
    page.wait_for_timeout(250)
    check("Espaço também faz subir", state(page)["vy"] < 0)
    page.keyboard.up("Space")
    page.keyboard.press("Escape")
    page.wait_for_timeout(50)
    check("Esc pausa", state(page)["state"] == "PAUSED")
    page.screenshot(path=str(OUT / "07-desktop-paused.png"))
    check("sem erros de console (desktop)", not errors, "; ".join(errors[:3]))
    ctx.close()

    # ---------- Layouts ----------
    for (w, h, name, mobile) in [(320, 480, "08-small-320x480", True), (844, 390, "09-landscape-phone", True),
                                 (768, 1024, "10-tablet", True), (412, 915, "11-android-tall", True)]:
        ctx = browser.new_context(viewport={"width": w, "height": h}, is_mobile=mobile, has_touch=mobile,
                                  device_scale_factor=2)
        page = ctx.new_page()
        page.goto(URL)
        page.wait_for_selector("text=JOGAR")
        page.wait_for_timeout(250)
        box = page.evaluate("""() => { const p = document.querySelector('.panel').getBoundingClientRect();
                                       const b = [...document.querySelectorAll('.panel button')].map(e => e.getBoundingClientRect());
                                       return { top: p.top, bottom: p.bottom, left: p.left, right: p.right,
                                                minBtnH: Math.min(...b.map(r => r.height)) } }""")
        inside = box["top"] >= 0 and box["bottom"] <= h and box["left"] >= 0 and box["right"] <= w
        check(f"{name}: menu inteiro visível", inside, json.dumps({k: round(v) for k, v in box.items()}))
        check(f"{name}: botões com altura de toque ≥ 36px", box["minBtnH"] >= 36, f"{box['minBtnH']:.0f}px")
        page.screenshot(path=str(OUT / f"{name}-menu.png"))
        page.tap("text=JOGAR")
        page.wait_for_timeout(1200)
        page.screenshot(path=str(OUT / f"{name}-play.png"))
        hud_ok = page.evaluate("() => { const r = document.querySelector('.pause-btn').getBoundingClientRect(); return r.top >= 0 && r.left >= 0 }")
        check(f"{name}: HUD/botão de pausa não cortado", hud_ok)
        if name == "09-landscape-phone":
            check(f"{name}: sugere girar para vertical", page.locator(".rotate-hint").count() == 1)
        ctx.close()

    browser.close()

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} verificações passaram")
sys.exit(1 if failed else 0)
