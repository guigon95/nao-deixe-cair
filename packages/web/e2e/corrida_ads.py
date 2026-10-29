"""
Fluxo de anúncios da Disparada em navegador real, com o provedor SIMULADO de
desenvolvimento (nenhum anúncio real, nenhuma chamada à rede de anúncios).

Uso:  VITE_ADS_PROVIDER=dev npx vite --port 5173      (em outro terminal, na pasta packages/web)
      python3 e2e/corrida_ads.py [http://localhost:5173] [pasta_de_capturas]

Verifica: 1ª derrota sem intersticial; vidas grátis inalteradas; última chance
com "Jogar novamente" principal e anúncio opcional; fechar antes não revive;
ver até o fim revive mantendo pontos e a mesma partida; uma revivida por
partida; intersticial só na 3ª partida concluída, sobre a tela de resultado,
sem duplicar com cliques repetidos; nada de anúncio durante a corrida;
"sem anúncio" mantém o jogo fluindo; layout em celular e desktop.
"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5173"
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else "e2e/screens")
OUT.mkdir(parents=True, exist_ok=True)
URL = BASE + "/corrida/?debug&seed=7&ads=dev"
AD = '[aria-label="Anúncio simulado de desenvolvimento"]'

results = []


def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail else ""))


def st(page):
    return page.evaluate(
        """() => { const e = window.__NDC__.engine; return { state: e.state, runId: e.runId, score: e.score.score,
            meters: e.score.meters, lives: e.livesLeft, revives: e.adRevivesLeft, lastChance: e.lastChance, x: e.runner.x } }"""
    )


def wait_state(page, *states, timeout=5000):
    page.wait_for_function(
        "(s) => window.__NDC__ && s.includes(window.__NDC__.engine.state)", arg=list(states), timeout=timeout
    )


def crash(page):
    """Bate a capivara agora (atalho de teste: o motor real decide vida/última chance/fim)."""
    wait_state(page, "PLAYING", "RESUMING")
    page.wait_for_timeout(250)
    wait_state(page, "PLAYING")
    page.evaluate("() => window.__NDC__.engine.die('rock')")


def use_free_lives(page):
    for _ in range(3):
        crash(page)
        wait_state(page, "CONTINUE")
        page.get_by_role("button", name="CONTINUAR").click()


def open_page(browser, viewport, extra=""):
    ctx = browser.new_context(viewport=viewport)
    page = ctx.new_page()
    # Sessão "antiga": o relógio do intervalo mínimo já passou (sem esperar 2 min no teste).
    # Relógio de parede ajustável (a política usa Date.now; o jogo usa performance.now).
    page.add_init_script("window.__shift = 0; const __now = Date.now; Date.now = () => __now() + window.__shift;")
    page.add_init_script(
        "try { if (!sessionStorage.getItem('ndc:corrida:ads')) sessionStorage.setItem('ndc:corrida:ads', JSON.stringify({runsCompleted:0,runsSinceAd:0,lastAdAt:0,shown:0})) } catch {}"
    )
    page.goto(URL + extra)
    page.wait_for_function("() => !!window.__NDC__")
    return ctx, page


with sync_playwright() as p:
    browser = p.chromium.launch()

    ctx, page = open_page(browser, {"width": 1280, "height": 720})
    page.get_by_role("button", name="CORRER").click()
    wait_state(page, "PLAYING")
    check("menu → corrida começa sem anúncio", page.locator(AD).count() == 0)

    # --- partida 1: vidas grátis iguais a antes, depois última chance ---
    use_free_lives(page)
    check("3 vidas grátis continuam grátis (sem anúncio)", page.locator(AD).count() == 0 and st(page)["lives"] == 0)
    crash(page)
    wait_state(page, "CONTINUE")
    s = st(page)
    check("sem vidas: última chance (partida ainda não encerrada)", s["lastChance"] and s["state"] == "CONTINUE", str(s))
    panel = page.locator(".last-chance")
    check("última chance: Jogar novamente é o botão principal", panel.locator(".btn-primary").inner_text().strip() == "JOGAR NOVAMENTE")
    ad_btn = panel.get_by_role("button", name="▶ Assistir anúncio para continuar")
    ad_btn.wait_for(timeout=4000)
    check("botão do anúncio aparece quando a rede tem anúncio", ad_btn.is_enabled())
    check("foco no principal (Enter não abre anúncio por engano)", page.evaluate("() => document.activeElement?.textContent?.trim()") == "JOGAR NOVAMENTE")
    page.screenshot(path=str(OUT / "ads_last_chance_desktop.png"))

    # Fecha antes do fim → não revive.
    score_before = s["score"]
    ad_btn.click()
    page.locator(AD).wait_for()
    page.get_by_role("button", name="Fechar antes (sem prêmio)").click()
    page.wait_for_timeout(300)
    s = st(page)
    check("fechou antes: continua parada na última chance", s["state"] == "CONTINUE" and s["revives"] == 1, str(s))
    check("fechou antes: mensagem discreta", "fechado antes do fim" in panel.inner_text())
    check("fechou antes: sem segundo pedido simultâneo", panel.locator(".btn-ad").count() == 0)

    # Jogar novamente: 1ª partida concluída → sem intersticial.
    panel.get_by_role("button", name="JOGAR NOVAMENTE").click()
    wait_state(page, "PLAYING", "RESUMING")
    s = st(page)
    check("jogar novamente na 1ª derrota: sem intersticial", page.locator(AD).count() == 0 and s["runId"] == 2, str(s))

    # --- partida 2: revive com recompensa ---
    use_free_lives(page)
    crash(page)
    wait_state(page, "CONTINUE")
    before = st(page)
    page.get_by_role("button", name="▶ Assistir anúncio para continuar").click()
    page.locator(AD).wait_for()
    check("durante o anúncio a partida fica parada", st(page)["state"] == "CONTINUE")
    page.get_by_role("button", name="Ver até o fim (ganha)").click()
    wait_state(page, "PLAYING", "RESUMING")
    after = st(page)
    check(
        "viu até o fim: revive na mesma partida com pontos e distância",
        after["runId"] == before["runId"] and after["score"] == before["score"] and after["meters"] == before["meters"],
        f"{before} → {after}",
    )
    check("revive consumido (1 por partida)", after["revives"] == 0)
    page.wait_for_timeout(600)
    check("nenhum anúncio durante a corrida", page.locator(AD).count() == 0 and page.locator(".last-chance").count() == 0)
    crash(page)
    wait_state(page, "GAME_OVER")
    check("depois do revive, a próxima batida encerra de vez", st(page)["state"] == "GAME_OVER")
    page.get_by_role("button", name="CORRER DE NOVO").click()
    wait_state(page, "PLAYING", "RESUMING")
    check("2ª partida concluída: ainda sem intersticial", page.locator(AD).count() == 0)

    # --- partida 3: ao concluir, o intersticial é devido ---
    use_free_lives(page)
    crash(page)
    wait_state(page, "CONTINUE")
    page.get_by_role("button", name="Ver resultado").click()
    wait_state(page, "GAME_OVER")
    # O anúncio recompensado da partida 2 reiniciou o relógio de 120 s: sem esperar, ainda não é hora.
    page.evaluate("() => { window.__shift += 125000 }")
    btn = page.get_by_role("button", name="CORRER DE NOVO")
    # Clique triplo rápido: um anúncio só.
    page.evaluate("() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='CORRER DE NOVO'); b.click(); b.click(); b.click(); }")
    page.locator(AD).first.wait_for()
    check("3ª partida concluída: intersticial na transição", page.locator(AD).count() == 1, f"painéis={page.locator(AD).count()}")
    check("intersticial sobre a tela de resultado (partida não começou)", st(page)["state"] == "GAME_OVER" and page.locator(".gameover").count() == 1)
    page.screenshot(path=str(OUT / "ads_interstitial.png"))
    page.get_by_role("button", name="Fechar anúncio").click()
    wait_state(page, "PLAYING", "RESUMING")
    check("fechou o intersticial: nova partida começa", st(page)["runId"] == 4)

    # --- partida 4: logo depois, sem anúncio (contagem zerada e intervalo) ---
    use_free_lives(page)
    crash(page)
    wait_state(page, "CONTINUE")
    page.get_by_role("button", name="Ver resultado").click()
    wait_state(page, "GAME_OVER")
    btn.click()
    wait_state(page, "PLAYING", "RESUMING")
    check("intersticial não repete na partida seguinte", page.locator(AD).count() == 0)
    ctx.close()

    # --- sem anúncio disponível ---
    ctx, page = open_page(browser, {"width": 1280, "height": 720}, "&fill=0")
    page.get_by_role("button", name="CORRER").click()
    use_free_lives(page)
    crash(page)
    wait_state(page, "CONTINUE")
    page.get_by_text("Nenhum anúncio disponível agora.").wait_for(timeout=4000)
    check("sem anúncio: mensagem discreta e botão some", page.locator(".last-chance .btn-ad").count() == 0)
    page.get_by_role("button", name="JOGAR NOVAMENTE").click()
    wait_state(page, "PLAYING", "RESUMING")
    check("sem anúncio: jogar novamente segue imediatamente", st(page)["runId"] == 2)
    ctx.close()

    # --- layouts: última chance cabe na tela ---
    for name, vp in [("iphone_deitado", {"width": 932, "height": 430}), ("iphone_em_pe", {"width": 430, "height": 932}), ("desktop", {"width": 1440, "height": 900})]:
        ctx = browser.new_context(viewport=vp, has_touch=name.startswith("iphone"), is_mobile=name.startswith("iphone"))
        page = ctx.new_page()
        page.goto(URL)
        page.wait_for_function("() => !!window.__NDC__")
        page.get_by_role("button", name="CORRER").click()
        use_free_lives(page)
        crash(page)
        wait_state(page, "CONTINUE")
        page.get_by_role("button", name="▶ Assistir anúncio para continuar").wait_for(timeout=4000)
        boxes = [page.locator(".last-chance " + sel).bounding_box() for sel in [".btn-primary", ".btn-ad", ".btn-link"]]
        fits = all(b and b["y"] >= 0 and b["y"] + b["height"] <= vp["height"] + 1 and b["x"] >= 0 and b["x"] + b["width"] <= vp["width"] + 1 for b in boxes)
        check(f"layout {name}: botões da última chance visíveis", fits, str([round(b['y'] + b['height']) if b else None for b in boxes]))
        page.screenshot(path=str(OUT / f"ads_last_chance_{name}.png"))
        ctx.close()

    browser.close()

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} ok")
sys.exit(1 if failed else 0)
