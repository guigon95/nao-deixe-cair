"""
Carteira na nuvem e recorde da conta, com dois aparelhos.
Precisa da API e do banco no ar (veja e2e/online.py):
  python3 e2e/cloud_wallet.py http://localhost:4174 e2e/screens
"""
import sys, random
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4174"
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else "e2e/screens"); OUT.mkdir(parents=True, exist_ok=True)
NAME, PW = f"Nuvem{random.randint(100, 999)}", "senha123"
results = []
def check(name, cond, detail=""):
    results.append(bool(cond)); print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail else ""))

CHASE = """() => { const e = window.__NDC__.engine; window.__stop = false;
  function f(){ if (window.__stop) return;
    const c = e.coins.coins.find(c => c.active && c.x > e.ball.x - 4 && c.x - e.ball.x < 30);
    if (c) { e.ball.y = c.y; e.ball.vy = 0; }
    else { const b = e.obstacles.barriers.find(b => b.x + b.width > e.ball.x - 14);
      if (b) { e.ball.y = (b.gapTop + b.gapBottom)/2; e.ball.vy = 0; } }
    requestAnimationFrame(f); } requestAnimationFrame(f); }"""
END = """() => new Promise(res => { window.__stop = true; const e = window.__NDC__.engine;
  const b = e.obstacles.barriers.find(b => b.x > e.ball.x); if (b) { b.x = e.ball.x - b.width/2; e.ball.y = b.gapTop - 30; }
  function f(){ if (e.state === 'GAME_OVER') return res(); if (e.state === 'CONTINUE') e.endRun(); requestAnimationFrame(f);} f(); })"""

def device(br):
    ctx = br.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    page = ctx.new_page(); errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    return page, errs

def shop_coins(page):
    page.tap(".shop-open"); page.wait_for_timeout(500)
    n = int(page.locator(".shop-coins strong").inner_text())
    return n

with sync_playwright() as p:
    br = p.chromium.launch()
    a, errA = device(br)
    a.goto(BASE + "/bolinha/?debug&seed=4"); a.wait_for_selector("text=JOGAR")
    # moedas guardadas só neste aparelho, antes de ter conta
    a.evaluate("""() => localStorage.setItem('ndc:bolinha:wallet', JSON.stringify({coins: 80, owned: ['classica','padrao','bolhas'], skin: 'classica', trail: 'bolhas'}))""")
    a.reload(); a.wait_for_selector("text=JOGAR"); a.wait_for_timeout(500)
    a.tap(".menu >> text=Entrar"); a.wait_for_timeout(100)
    a.tap(".account-switch-btn"); a.wait_for_timeout(100)
    a.fill("#player-name", NAME); a.fill("#player-password", PW); a.tap("button[type=submit]")
    a.wait_for_selector(f".menu >> text={NAME}", timeout=5000); a.wait_for_timeout(1200)
    coins = shop_coins(a)
    check("ao criar a conta, as moedas do aparelho vão para a nuvem", coins == 80, f"{coins} moedas")
    check("avisa que as moedas foram para a conta", a.locator(".shop-msg").count() == 1, a.locator(".shop-msg").inner_text() if a.locator(".shop-msg").count() else "")
    check("loja diz que está salvo na conta", "salvos na sua conta" in a.locator(".shop-hint").inner_text())
    a.tap("[data-item=basquete] .shop-btn"); a.wait_for_timeout(800)
    check("compra pela nuvem desconta o saldo", int(a.locator(".shop-coins strong").inner_text()) == 55)
    a.screenshot(path=str(OUT / "w1-shop-cloud.png"))
    a.tap("text=Voltar")
    # joga e pega moedas: entram na carteira da conta junto com a pontuação
    a.wait_for_timeout(300); a.tap("text=JOGAR"); a.wait_for_timeout(200)
    a.evaluate(CHASE); a.wait_for_timeout(14000); a.evaluate(END); a.wait_for_timeout(1500)
    got = a.evaluate("window.__NDC__.engine.coins.collected")
    score = int(a.locator(".final-score .value").inner_text())
    check("pegou moedas na partida", got > 0, f"{got} moedas, {score} pontos")
    a.tap("text=Menu inicial"); a.wait_for_timeout(300)
    coins_a = shop_coins(a); a.tap("text=Voltar")
    check("saldo da conta = 55 + moedas da partida", coins_a == 55 + got, f"{coins_a}")

    # outro aparelho: mesma conta, mesmas moedas, itens e recorde
    b, errB = device(br)
    b.goto(BASE + "/bolinha/?debug&seed=9"); b.wait_for_selector("text=JOGAR"); b.wait_for_timeout(500)
    check("aparelho novo começa sem moedas", int(b.locator(".shop-open").inner_text().split()[-1]) == 0)
    b.tap(".menu >> text=Entrar")
    b.fill("#player-name", NAME); b.fill("#player-password", PW); b.tap("button[type=submit]")
    b.wait_for_selector(f".menu >> text={NAME}", timeout=5000); b.wait_for_timeout(1500)
    best_b = int(b.locator(".menu .best strong").inner_text()) if b.locator(".menu .best strong").count() else 0
    check("recorde da conta aparece no outro aparelho", best_b == score, f"recorde {best_b}, esperado {score}")
    coins_b = shop_coins(b)
    check("mesmas moedas no outro aparelho", coins_b == coins_a, f"{coins_b}")
    check("item comprado aparece em uso no outro aparelho", b.locator("[data-item=basquete].is-using").count() == 1)
    b.screenshot(path=str(OUT / "w2-other-device.png"))
    b.tap("text=Voltar")
    b.tap(".menu >> text=Sair"); b.wait_for_timeout(600)
    check("ao sair, volta a carteira do aparelho", int(b.locator(".shop-open").inner_text().split()[-1]) == 0)
    check("sem erros de página", not errA and not errB, "; ".join((errA + errB)[:3]))
    br.close()

print(f"\n{sum(results)}/{len(results)} verificações passaram")
sys.exit(0 if all(results) else 1)
