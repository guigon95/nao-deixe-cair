"""
Teste em navegador real do ranking, do perfil e dos sons.
Uso: npm run build && npx vite preview --port 4173 ; python3 e2e/bolinha_ranking.py [url] [pasta_capturas]
"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4173"
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else "e2e/screens"); OUT.mkdir(parents=True, exist_ok=True)
URL = BASE + "/bolinha/?debug&seed=7"
results = []
def check(name, cond, detail=""):
    results.append(bool(cond)); print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail else ""))

AUDIO_SPY = """
  const O = window.AudioContext; window.__osc = 0;
  window.AudioContext = class extends O { createOscillator(){ window.__osc++; return super.createOscillator(); } };
"""

def die(page):
    """Leva a partida a GAME_OVER com alguns pontos (passa 2 barreiras e depois cai)."""
    page.evaluate("""() => new Promise(res => { const e = window.__NDC__.engine; let n = 0;
      function f(){ n++;
        if (e.state === 'GAME_OVER') return res(); if (e.state === 'CONTINUE') e.endRun();
        if (e.score.barriers < 2) { const b = e.obstacles.barriers.find(b => b.x + b.width > e.ball.x - 14);
          if (b) { e.ball.y = (b.gapTop + b.gapBottom) / 2; e.ball.vy = 0; } }
        requestAnimationFrame(f); } requestAnimationFrame(f); })""")

with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    ctx.add_init_script(AUDIO_SPY)
    page = ctx.new_page(); errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL); page.wait_for_selector("text=JOGAR")

    page.tap("text=Ranking"); page.wait_for_timeout(150)
    check("ranking vazio mostra estado inicial", page.locator(".rank-empty").count() == 1)
    page.screenshot(path=str(OUT / "r1-ranking-empty.png"))
    page.tap("text=Voltar")

    page.tap("text=JOGAR"); page.wait_for_timeout(200)
    osc_start = page.evaluate("window.__osc")
    check("som de início toca", osc_start >= 3, f"{osc_start} osciladores")
    die(page); page.wait_for_timeout(400)
    check("som de passagem e colisão tocaram", page.evaluate("window.__osc") > osc_start + 2)
    score = int(page.locator(".final-score .value").inner_text())
    check("fim de jogo oferece Entrar ou Só meu nome",
          page.locator(".save-box >> text=Entrar").count() == 1 and page.locator("text=Só meu nome").count() == 1, f"pontos={score}")
    page.screenshot(path=str(OUT / "r2-gameover-choose.png"))

    page.tap("text=Só meu nome"); page.wait_for_timeout(100)
    check("campo de nome recebe foco", page.evaluate("document.activeElement.id") == "player-name")
    page.keyboard.type("Wally W")  # W não pode ser engolido pelo controle do jogo
    check("dá para digitar W/espaço no nome", page.input_value("#player-name") == "Wally W")
    page.screenshot(path=str(OUT / "r3-guest-name.png"))
    page.keyboard.press("Enter"); page.wait_for_timeout(150)
    check("Enter salva (não reinicia a partida)", page.evaluate("window.__NDC__.engine.state") == "GAME_OVER")
    check("mostra a posição salva", "1º lugar" in page.locator(".save-box").inner_text())
    page.screenshot(path=str(OUT / "r4-saved.png"))

    # Segunda partida: entrar com perfil -> salva e fica logado.
    page.tap("text=JOGAR DE NOVO"); page.wait_for_timeout(100)
    die(page); page.wait_for_timeout(300)
    page.locator(".save-box >> text=Entrar").tap(); page.wait_for_timeout(100)
    check("login sugere o último nome", page.input_value("#player-name") == "Wally W")
    page.fill("#player-name", "Gui")
    page.tap("text=Entrar e salvar"); page.wait_for_timeout(150)
    check("login salva a pontuação", "lugar no ranking" in page.locator(".save-box").inner_text())

    # Terceira partida: logado -> salva sozinho.
    page.tap("text=JOGAR DE NOVO"); page.wait_for_timeout(100)
    die(page); page.wait_for_timeout(300)
    check("logado: salva automaticamente", "Salvo como Gui" in page.locator(".save-box").inner_text())
    page.tap("text=Ver ranking"); page.wait_for_timeout(150)
    rows = page.locator(".rank-list li").count()
    check("ranking lista as 3 partidas", rows == 3, f"{rows} linhas")
    check("destaca a pontuação atual", page.locator(".rank-list li.is-you").count() == 1)
    page.screenshot(path=str(OUT / "r5-ranking.png"))

    page.reload(); page.wait_for_selector("text=JOGAR")
    check("perfil continua após recarregar", "Gui" in page.locator(".who").inner_text())
    page.tap("text=Ranking"); page.wait_for_timeout(100)
    check("ranking continua após recarregar", page.locator(".rank-list li").count() == 3)
    page.tap("text=Voltar")
    page.screenshot(path=str(OUT / "r6-menu-logged.png"))
    page.tap("text=Sair"); page.wait_for_timeout(100)
    check("sair volta a mostrar Entrar", page.locator(".menu >> text=Entrar").count() == 1)
    check("sem erros de página", not errors, "; ".join(errors[:2]))
    ctx.close()

    # Tela pequena: fim de jogo com formulário precisa caber/rolar.
    ctx = br.new_context(viewport={"width": 320, "height": 480}, is_mobile=True, has_touch=True, device_scale_factor=2)
    page = ctx.new_page(); page.goto(URL); page.wait_for_selector("text=JOGAR")
    page.tap("text=JOGAR"); die(page); page.wait_for_timeout(300)
    page.tap("text=Só meu nome"); page.wait_for_timeout(100)
    page.screenshot(path=str(OUT / "r7-small-form.png"))
    m = page.evaluate("""() => { const p = document.querySelector('.panel'); const a = document.querySelector('.arena-ui').getBoundingClientRect();
        const r = p.getBoundingClientRect(); return { fits: r.top >= a.top - 1 && r.bottom <= a.bottom + 1, scrolls: p.scrollHeight > p.clientHeight } }""")
    check("320×480: painel dentro da arena (rola se precisar)", m["fits"], str(m))
    ctx.close(); br.close()

print(f"\n{sum(results)}/{len(results)} verificações passaram"); sys.exit(0 if all(results) else 1)
