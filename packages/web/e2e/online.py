"""
Teste em navegador real do modo ONLINE: contas, sessão, ranking compartilhado entre aparelhos.
Precisa da API e do banco no ar:
  npm run dev -w @ndc/server                         # API em :4000 (packages/server/.env)
  npm run build -w @ndc/web && API_PROXY_TARGET=http://localhost:4000 npx vite preview --port 4174   (em packages/web)
  python3 e2e/online.py http://localhost:4174 e2e/screens
Use um banco de teste vazio: o teste cria contas.
"""
import sys, random
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4174"
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else "e2e/screens"); OUT.mkdir(parents=True, exist_ok=True)
SUF = str(random.randint(100, 999))
NAME_A, NAME_B, PW = f"Gui{SUF}", f"Bia{SUF}", "senha123"
results = []
def check(name, cond, detail=""):
    results.append(bool(cond)); print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail else ""))

def die(page, barriers=2):
    """Leva a partida a GAME_OVER com alguns pontos (passa N barreiras e depois cai)."""
    page.evaluate("""(n) => new Promise(res => { const e = window.__NDC__.engine;
      function f(){ if (e.state === 'GAME_OVER') return res(); if (e.state === 'CONTINUE') e.endRun();
        if (e.score.barriers < n) { const b = e.obstacles.barriers.find(b => b.x + b.width > e.ball.x - 14);
          if (b) { e.ball.y = (b.gapTop + b.gapBottom) / 2; e.ball.vy = 0; } }
        requestAnimationFrame(f); } requestAnimationFrame(f); })""", barriers)

def device(br):
    ctx = br.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    page = ctx.new_page(); errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    return ctx, page, errs

with sync_playwright() as p:
    br = p.chromium.launch()

    # --- Aparelho A: cria conta no hub, joga, pontuação entra sozinha ---
    ctxA, a, errA = device(br)
    a.goto(BASE + "/"); a.wait_for_selector(".hub-foot[data-mode='online']", timeout=8000)
    check("hub detecta o servidor", True)
    a.tap(".hub-profile >> text=Entrar"); a.wait_for_timeout(150)
    check("login online pede senha e começa em Entrar, com botão de criar conta",
          a.locator("#player-password").count() == 1 and a.locator("text=Entrar na sua conta").count() == 1
          and a.locator(".account-switch-btn >> text=Criar conta").count() == 1)
    a.tap(".account-switch-btn"); a.wait_for_timeout(100)
    check("botão Criar conta troca para o cadastro", a.locator("text=Criar sua conta").count() == 1)
    a.fill("#player-name", NAME_A); a.fill("#player-password", "123"); a.tap("button[type=submit]"); a.wait_for_timeout(150)
    check("senha curta mostra erro sem chamar o servidor", "6 caracteres" in a.locator("#name-hint").inner_text())
    a.fill("#player-password", PW); a.tap("button[type=submit]")
    a.wait_for_selector(f".who >> text={NAME_A}", timeout=5000)
    check("conta criada: hub mostra o apelido", True)
    a.screenshot(path=str(OUT / "o1-hub-logged.png"))

    a.goto(BASE + "/bolinha/?debug&seed=7"); a.wait_for_selector("text=JOGAR")
    a.wait_for_selector(f".menu >> text={NAME_A}", timeout=5000)
    check("a sessão vale no jogo (cookie)", True)
    a.wait_for_timeout(300)  # pré-busca do token
    a.tap("text=JOGAR"); a.wait_for_timeout(1200); die(a); a.wait_for_timeout(200)
    scoreA = int(a.locator(".final-score .value").inner_text())
    a.wait_for_selector(".save-box.is-saved", timeout=5000)
    check("com conta a pontuação entra sozinha no ranking online", "1º lugar" in a.locator(".save-box").inner_text(), f"pontos={scoreA}")
    a.screenshot(path=str(OUT / "o2-auto-saved.png"))

    # segunda partida pior: o melhor continua
    a.tap("text=JOGAR DE NOVO"); a.wait_for_timeout(1500); die(a, 0); a.wait_for_timeout(200)
    a.wait_for_selector(".save-box.is-saved, .save-box .is-error", timeout=5000)
    txt = a.locator(".save-box").inner_text()
    check("partida pior mantém o melhor", "continua" in txt or int(a.locator(".final-score .value").inner_text()) > scoreA, txt.replace("\n", " | "))

    # --- Aparelho B: convidado ---
    ctxB, b, errB = device(br)
    b.goto(BASE + "/bolinha/?debug&seed=7"); b.wait_for_selector("text=JOGAR"); b.wait_for_timeout(500)
    b.tap("text=Ranking"); b.wait_for_selector(".rank-list li", timeout=5000)
    check("outro aparelho vê o ranking de todos", NAME_A in b.locator(".rank-list").inner_text()
          and b.locator(".rank-scope[data-scope='online']").count() == 1)
    b.screenshot(path=str(OUT / "o3-ranking-other-device.png"))
    b.tap("text=Voltar")
    b.tap("text=JOGAR"); b.wait_for_timeout(1500); die(b, 4); b.wait_for_timeout(200)
    scoreB = int(b.locator(".final-score .value").inner_text())
    b.screenshot(path=str(OUT / "o3b-guest-gameover.png"))
    b.tap("text=Só meu nome"); b.fill("#player-name", NAME_A.lower()); b.keyboard.press("Enter")
    b.wait_for_selector("#name-hint.is-error", timeout=5000)
    check("convidado não pode usar o apelido de uma conta", "conta" in b.locator("#name-hint").inner_text(), b.locator("#name-hint").inner_text())
    b.fill("#player-name", NAME_B); b.keyboard.press("Enter")
    b.wait_for_selector(".save-box.is-saved", timeout=5000)
    check("convidado salva só com o nome", f"Salvo como {NAME_B}" in b.locator(".save-box").inner_text(), f"pontos={scoreB}")

    # A recarrega o ranking e vê B
    a.tap("text=Ver ranking"); a.wait_for_timeout(800)
    rows = a.locator(".rank-list li").all_inner_texts()
    check("ranking abre na aba Semana, com quanto falta para acabar",
          a.locator(".rank-scope[data-tab='week']").count() == 1 and "Termina em" in a.locator(".rank-scope").inner_text())
    check("ranking global tem os dois, um por jogador", len(rows) == 2 and any(NAME_B in r for r in rows), " / ".join(r.replace("\n", " ") for r in rows))
    check("a linha da conta logada fica destacada", a.locator(".rank-list li.is-you").count() == 1)
    a.screenshot(path=str(OUT / "o4-ranking-global.png"))

    a.tap("text=Geral"); a.wait_for_timeout(150)
    check("aba Geral mostra o ranking de todos os tempos", a.locator(".rank-scope[data-tab='all']").count() == 1 and a.locator(".rank-list li").count() == 2)
    a.tap("text=Voltar"); a.tap("text=Menu inicial"); a.wait_for_timeout(300)
    check("menu chama para a disputa da semana", a.locator(".weekly-callout").count() == 1 and "semana" in a.locator(".weekly-callout").inner_text(),
          a.locator(".weekly-callout").inner_text() if a.locator(".weekly-callout").count() else "")
    a.screenshot(path=str(OUT / "o6-menu-weekly.png"))

    # B entra na conta de A (outro aparelho)
    b.tap("text=Menu inicial"); b.wait_for_timeout(200)
    b.tap(".menu >> text=Entrar"); b.wait_for_timeout(100)
    b.fill("#player-name", NAME_A); b.fill("#player-password", "errada99"); b.tap("button[type=submit]")
    b.wait_for_selector("#name-hint.is-error", timeout=5000)
    check("senha errada mostra erro", "incorretos" in b.locator("#name-hint").inner_text())
    b.fill("#player-password", PW); b.tap("button[type=submit]")
    b.wait_for_selector(f".menu >> text={NAME_A}", timeout=5000)
    check("entra na mesma conta em outro aparelho", True)
    b.screenshot(path=str(OUT / "o5-login-other-device.png"))

    # ranking por jogo
    b.goto(BASE + "/aviao/"); b.wait_for_selector("text=DECOLAR")
    b.wait_for_selector(f".menu >> text={NAME_A}", timeout=5000)
    b.tap("text=Ranking"); b.wait_for_timeout(600)
    check("Acrobata tem ranking online próprio", b.locator(".rank-scope[data-scope='online']").count() == 1 and NAME_B not in b.locator(".panel").inner_text())

    # anti-trapaça direto na API
    r = b.evaluate("""async () => {
      const h = {'x-ndc-csrf':'1','content-type':'application/json'};
      const t = (await (await fetch('/api/games/bolinha/runs', {method:'POST', headers:h, body:'{}'})).json()).token;
      const s = await fetch('/api/games/bolinha/scores', {method:'POST', headers:h, body: JSON.stringify({token:t, score: 99999})});
      return s.status; }""")
    check("API recusa pontuação impossível", r == 422, f"status {r}")

    # sair
    b.tap("text=Voltar"); b.tap(".menu >> text=Sair"); b.wait_for_timeout(500)
    b.reload(); b.wait_for_selector("text=DECOLAR"); b.wait_for_timeout(800)
    check("sair encerra a sessão", b.locator(".menu >> text=Entrar").count() == 1)

    check("sem erros de página", not errA and not errB, "; ".join((errA + errB)[:3]))
    br.close()

print(f"\n{sum(results)}/{len(results)} verificações passaram")
sys.exit(0 if all(results) else 1)
