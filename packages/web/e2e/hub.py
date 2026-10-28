"""
Teste do hub em navegador real (Chromium headless via Playwright).

Uso:  npm run build && npx vite preview --port 4173   (em outro terminal)
      python3 e2e/hub.py [http://localhost:4173] [pasta_de_capturas]

Verifica: hub abre sem erros, lista os jogos, entra em cada um e volta pelo
botão "Jogos"; migração das chaves antigas (recorde e perfil aparecem no
hub); perfil compartilhado entre hub e jogos; layout em vários tamanhos.
"""
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4173"
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else "e2e/screens")
OUT.mkdir(parents=True, exist_ok=True)

results = []


def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail else ""))


LEGACY = {
    "nao-deixe-cair:best": "42",
    "nao-deixe-cair:profile": json.dumps({"id": "local-x", "name": "Bia", "provider": "local", "createdAt": "2026-10-01"}),
    "nao-deixe-cair:ranking": json.dumps([{"id": "a", "name": "Bia", "score": 42, "date": "2026-10-01", "profileId": "local-x"}]),
}

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3, has_touch=True, is_mobile=True)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "/api/" not in (m.location or {}).get("url", "") else None)  # sem servidor, o /api falha de propósito

    # Dados de um jogador da versão antiga (antes do hub).
    page.goto(BASE + "/")
    page.evaluate("(d) => { localStorage.clear(); for (const [k, v] of Object.entries(d)) localStorage.setItem(k, v) }", LEGACY)
    page.reload()
    page.wait_for_selector(".hub-card")

    names = page.locator(".hub-name").all_inner_texts()
    check("hub lista os jogos", len(names) >= 2, ", ".join(names))
    bol = page.locator('.hub-card[data-game="bolinha"]')
    check("migração: recorde antigo aparece no cartão da bolinha", "42" in bol.inner_text())
    check("migração: perfil antigo aparece logado no hub", "Bia" in page.locator(".hub-profile").inner_text())
    check("chave nova gravada", page.evaluate("() => localStorage.getItem('ndc:bolinha:best')") == "42")
    page.screenshot(path=str(OUT / "hub-01-390x844.png"))

    # Entra na bolinha e volta.
    bol.locator("a").click()
    page.wait_for_selector("text=JOGAR")
    check("entra na bolinha", "/bolinha/" in page.url)
    check("bolinha reconhece o perfil do hub", "Bia" in page.locator(".who").inner_text())
    check("bolinha mostra o recorde migrado", "42" in page.locator(".best").inner_text())
    page.click(".hub-back")
    page.wait_for_selector(".hub-card")
    check("botão Jogos volta ao hub", page.url.rstrip("/") == BASE.rstrip("/"))

    # Entra no avião e volta.
    page.locator('.hub-card[data-game="aviao"] a').click()
    page.wait_for_selector(".hub-back")
    check("entra no avião", "/aviao/" in page.url)
    page.screenshot(path=str(OUT / "hub-02-aviao.png"))
    page.click(".hub-back")
    page.wait_for_selector(".hub-card")
    check("volta do avião ao hub", page.url.rstrip("/") == BASE.rstrip("/"))

    # Sair no hub reflete nos jogos.
    page.click("text=Sair")
    check("sair no hub mostra Entrar", page.locator(".hub-profile button", has_text="Entrar").count() == 1)
    page.click(".hub-profile >> text=Entrar")
    page.fill("#player-name", "Caio")
    page.press("#player-name", "Enter")
    page.wait_for_selector("text=Caio")
    page.goto(BASE + "/bolinha/")
    page.wait_for_selector("text=JOGAR")
    check("perfil criado no hub vale na bolinha", "Caio" in page.locator(".who").inner_text())

    check("sem erros de console", not errors, "; ".join(errors[:3]))
    ctx.close()

    for (w, h, name) in [(320, 480, "small"), (412, 915, "android"), (768, 1024, "tablet"), (844, 390, "landscape"), (1280, 800, "desktop")]:
        c = browser.new_context(viewport={"width": w, "height": h})
        pg = c.new_page()
        pg.goto(BASE + "/")
        pg.wait_for_selector(".hub-card")
        sw = pg.evaluate("() => document.documentElement.scrollWidth")
        check(f"hub {name} {w}x{h}: sem rolagem horizontal", sw <= w, f"scrollWidth={sw}")
        btn = pg.locator(".hub-play").first.bounding_box()
        check(f"hub {name}: botão de jogar ≥ 44px", btn and btn["height"] >= 44, f"{btn and round(btn['height'])}px")
        pg.screenshot(path=str(OUT / f"hub-{name}-{w}x{h}.png"), full_page=True)
        c.close()

    browser.close()

ok = sum(1 for r in results if r[1])
print(f"\n{ok}/{len(results)} verificações passaram")
sys.exit(0 if ok == len(results) else 1)
