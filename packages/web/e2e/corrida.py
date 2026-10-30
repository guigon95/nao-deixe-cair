"""
Teste da Disparada em navegador real (Chromium headless via Playwright).

Uso:  npm run build && npx vite preview --port 4173   (em outro terminal)
      python3 e2e/corrida.py [http://localhost:4173] [pasta_de_capturas]

Verifica com Pointer Events reais: toque pula na hora, segurar planeja,
teclado (Espaço, ↓, →), deslize para a direita e botão de dash, pausa ao
ocultar a aba, um único laço, fim de partida com a causa, ranking (Só meu
nome) separado dos outros jogos, reinício imediato, volta ao hub, piloto
automático correndo 20 s sem bater e layouts em vários tamanhos.
"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4173"
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else "e2e/screens")
OUT.mkdir(parents=True, exist_ok=True)
URL = BASE + "/corrida/?debug&seed=7"

results = []


def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail else ""))


def st(page):
    return page.evaluate(
        """() => { const n = window.__NDC__, e = n.engine, r = e.runner; return {
            state: e.state, x: r.x, y: r.y, vy: r.vy, grounded: r.grounded, gliding: r.gliding, dash: r.dash,
            fast: r.fastFall, score: e.score.score, best: e.score.best, meter: e.meter, swarm: e.swarm,
            elapsed: e.elapsed, active: n.loop.activeLoops, runId: e.runId, cause: e.deathCause } }"""
    )


def wait_grounded(page):
    page.wait_for_function("() => window.__NDC__.engine.runner.grounded", timeout=3000)


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 844, "height": 390}, device_scale_factor=3, has_touch=True, is_mobile=True)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "/api/" not in (m.location or {}).get("url", "") else None)  # sem servidor, o /api falha de propósito

    # Hub: o jogo aparece no catálogo junto dos outros dois.
    page.goto(BASE + "/")
    page.evaluate("() => localStorage.clear()")
    page.reload()
    page.wait_for_selector(".hub-card")
    names = page.locator(".hub-name").all_inner_texts()
    check("hub lista os três jogos", len(names) == 3 and "Disparada" in names, ", ".join(names))
    check("Disparada é o primeiro jogo do hub", names[:1] == ["Disparada"], ", ".join(names))
    page.screenshot(path=str(OUT / "corrida-00-hub.png"))
    page.locator('.hub-card[data-game="corrida"] a').click()
    page.wait_for_selector("text=CORRER")
    check("cartão do hub abre a Disparada", "/corrida/" in page.url)

    page.goto(URL)
    page.wait_for_selector("text=CORRER")
    check("menu da Disparada aparece", page.locator("h1").inner_text().strip() == "Disparada")
    canvas_w = page.evaluate("() => document.querySelector('canvas').width")
    check("canvas usa devicePixelRatio (limitado)", canvas_w >= 844 * 2.4, f"{canvas_w}px")
    page.screenshot(path=str(OUT / "corrida-01-menu.png"))

    page.click("text=CORRER")
    page.wait_for_timeout(250)
    s0 = st(page)
    check("CORRER inicia a partida", s0["state"] == "PLAYING")
    check("um único laço de animação", s0["active"] == 1)
    # Trecho livre de ~16 s para testar os controles sem bater (depois o percurso volta ao normal).
    page.evaluate(
        """() => { const t = window.__NDC__.engine.track, l = t.level;
           l.rocks.length = l.thorns.length = l.crates.length = l.springs.length = l.platforms.length = 0;
           l.ground.length = 0; l.addGround(-800, t.genX + 5000); t.genX += 5000 }"""
    )
    page.wait_for_timeout(300)
    check("a capivara corre sozinha", st(page)["x"] > s0["x"] + 60)

    b = page.locator(".surface").bounding_box()
    cx, cy = b["x"] + b["width"] * 0.5, b["y"] + b["height"] * 0.6

    # Toque curto pula na hora.
    page.mouse.move(cx, cy)
    page.mouse.down()
    page.wait_for_timeout(40)
    s1 = st(page)
    page.mouse.up()
    check("toque pula na hora (≤ 40 ms)", not s1["grounded"] and s1["vy"] > 0, f"vy={s1['vy']:.0f}")
    wait_grounded(page)

    # Segurar: pula alto e plana na descida.
    page.mouse.down()
    page.wait_for_timeout(520)
    s2 = st(page)
    page.screenshot(path=str(OUT / "corrida-02-planando.png"))
    page.mouse.up()
    check("segurar plana na descida", s2["gliding"] and s2["vy"] > -200, f"vy={s2['vy']:.0f} y={s2['y']:.0f}")
    wait_grounded(page)

    # Teclado: Espaço pula; ↓ no ar desce rápido.
    page.keyboard.down("Space")
    page.wait_for_timeout(120)
    page.keyboard.up("Space")
    page.keyboard.press("ArrowDown")
    page.wait_for_timeout(30)
    s3 = st(page)
    check("Espaço pula e ↓ desce rápido", s3["fast"] or s3["grounded"], f"vy={s3['vy']:.0f}")
    wait_grounded(page)

    # Dash: com o medidor cheio, aparece o botão; deslizar → também dispara.
    page.evaluate("() => { window.__NDC__.engine.meter = 12 }")
    page.mouse.down()
    page.wait_for_timeout(30)
    page.mouse.up()  # um toque para o React ver o medidor (evento de fruta não houve)
    page.evaluate("() => window.__NDC__.engine.dash()")
    page.wait_for_timeout(60)
    check("dash pelo motor com medidor cheio", st(page)["dash"] > 0)
    page.wait_for_timeout(1000)
    wait_grounded(page)
    # Força uma fruta para encher (o botão aparece pelo evento do jogo).
    page.evaluate(
        """() => { const e = window.__NDC__.engine, r = e.runner; e.meter = 11;
           e.track.level.fruits.unshift({ x: r.x + 30, y: 17, taken: false, risky: false }) }"""
    )
    page.wait_for_selector(".dash-btn", timeout=2000)
    page.screenshot(path=str(OUT / "corrida-03-dash-pronto.png"))
    btn = page.locator(".dash-btn").bounding_box()
    check("botão DISPARAR ≥ 64 px no canto de baixo", btn["height"] >= 60 and btn["x"] > b["width"] * 0.6)
    page.tap(".dash-btn", force=True)
    page.wait_for_timeout(50)
    s4 = st(page)
    check("botão DISPARAR faz o dash e não pula", s4["dash"] > 0 and s4["vy"] == 0)
    page.screenshot(path=str(OUT / "corrida-04-dash.png"))
    page.wait_for_timeout(1100)
    wait_grounded(page)
    page.evaluate("() => { window.__NDC__.engine.meter = 12 }")
    page.mouse.move(cx - 120, cy)
    page.mouse.down()
    page.mouse.move(cx - 60, cy, steps=2)
    page.mouse.move(cx + 20, cy, steps=2)
    page.mouse.up()
    page.wait_for_timeout(30)
    check("deslizar → dispara o dash", st(page)["dash"] > 0)
    page.wait_for_timeout(1100)

    # Cipó: no ar, encostar agarra; toque solta.
    wait_grounded(page)
    page.evaluate(
        """() => { const e = window.__NDC__.engine, r = e.runner;
           e.track.level.vines.unshift({ ax: r.x + e.runSpeed * 0.3, ay: 300, len: 170 }) }"""
    )
    page.keyboard.down("Space")
    page.wait_for_function("() => window.__NDC__.engine.runner.swinging", timeout=3000)
    page.keyboard.up("Space")
    check("encostar no cipó agarra e balança", st(page)["state"] == "PLAYING")
    page.screenshot(path=str(OUT / "corrida-04b-cipo.png"))
    page.keyboard.press("Space")
    page.wait_for_timeout(30)
    check("toque solta do cipó", not page.evaluate("() => window.__NDC__.engine.runner.swinging"))
    wait_grounded(page)

    # Pausa ao ocultar a aba.
    page.evaluate("() => { Object.defineProperty(document, 'hidden', {value: true, configurable: true}); document.dispatchEvent(new Event('visibilitychange')) }")
    check("aba oculta pausa", st(page)["state"] == "PAUSED")
    x = st(page)["x"]
    page.wait_for_timeout(400)
    check("nada avança pausado", st(page)["x"] == x)
    page.evaluate("() => { Object.defineProperty(document, 'hidden', {value: false, configurable: true}); document.dispatchEvent(new Event('visibilitychange')) }")
    page.screenshot(path=str(OUT / "corrida-05-pausa.png"))
    page.click("text=CONTINUAR")
    page.wait_for_function("() => window.__NDC__.engine.state === 'PLAYING'", timeout=4000)
    check("retomada volta a jogar sem saltar posição", abs(st(page)["x"] - x) < 60)

    # Vidas: corações ao lado da pausa durante a partida.
    check("3 corações na partida", page.locator(".hud-lives .heart.is-full").count() == 3)

    # Sem tocar, a capivara bate: com vida sobrando, aparece a tela de continuar.
    page.wait_for_function("() => window.__NDC__.engine.state === 'CONTINUE'", timeout=45000)
    page.wait_for_timeout(400)
    sc = st(page)
    check("bater com vidas mostra Continuar", page.locator(".continue").count() == 1 and page.locator("text=CONTINUAR").count() == 1, f"causa={sc['cause']}")
    check("tela de continuar mostra pontos e 3 vidas", str(sc["score"]) in page.locator(".continue .final-score").inner_text() and page.locator(".continue .heart.is-full").count() == 3)
    check("sem envio ao ranking ao bater com vidas", page.locator(".save-box").count() == 0)
    page.screenshot(path=str(OUT / "corrida-05b-continuar.png"))
    page.click("text=CONTINUAR")
    page.wait_for_function("() => window.__NDC__.engine.state === 'PLAYING'", timeout=4000)
    sc2 = st(page)
    check("continuar volta de onde parou com os mesmos pontos", sc2["score"] >= sc["score"] and abs(sc2["x"] - sc["x"]) < 400 and sc2["runId"] == sc["runId"])
    check("continuar gasta uma vida", page.locator(".hud-lives .heart.is-full").count() == 2)
    page.wait_for_function("() => window.__NDC__.engine.state === 'CONTINUE'", timeout=45000)
    page.wait_for_timeout(300)
    page.click("text=Encerrar corrida")
    page.wait_for_function("() => window.__NDC__.engine.state === 'GAME_OVER'", timeout=3000)
    page.wait_for_timeout(500)
    s5 = st(page)
    check("batida leva ao fim de jogo", s5["state"] == "GAME_OVER", f"causa={s5['cause']} pontos={s5['score']}")
    check("fim mostra causa, pontos e CORRER DE NOVO", page.locator(".cause").count() == 1 and str(s5["score"]) in page.locator(".final-score").inner_text() and page.locator("text=CORRER DE NOVO").count() == 1)
    page.screenshot(path=str(OUT / "corrida-06-fim.png"))

    if page.locator("text=Só meu nome").count():
        page.click("text=Só meu nome")
        page.fill("#player-name", "Teste Capivara")
        page.press("#player-name", "Enter")
        page.wait_for_selector("text=lugar no ranking")
        check("ranking salva com Só meu nome", page.locator(".save-box.is-saved").count() == 1)
    else:
        check("ranking salva com Só meu nome", False, "pontuação não qualificou")
    rank = page.evaluate("() => JSON.parse(localStorage.getItem('ndc:corrida:ranking') || '[]').length")
    others = page.evaluate("() => [localStorage.getItem('ndc:bolinha:ranking'), localStorage.getItem('ndc:aviao:ranking')]")
    check("ranking da Disparada separado dos outros jogos", rank == 1 and others == [None, None])
    check("recorde salvo", page.evaluate("() => localStorage.getItem('ndc:corrida:best')") == str(s5["score"]))

    run_before = s5["runId"]
    page.click("text=CORRER DE NOVO")
    page.wait_for_timeout(100)
    s6 = st(page)
    check("reinício imediato", s6["state"] == "PLAYING" and s6["runId"] == run_before + 1 and s6["score"] < 10)
    check("reinício não duplica laços", s6["active"] == 1)
    page.keyboard.press("Escape")
    check("Esc pausa", st(page)["state"] == "PAUSED")
    page.click("text=Menu inicial")
    page.wait_for_selector("text=CORRER")
    check("recorde aparece no menu", str(s5["score"]) in page.locator(".best").inner_text())

    # Volta ao hub: o recorde aparece no cartão.
    page.click(".hub-back")
    page.wait_for_selector(".hub-card")
    card = page.locator('.hub-card[data-game="corrida"]').inner_text()
    check("volta ao hub e o cartão mostra o recorde", str(s5["score"]) in card)
    check("sem erros de console", not errors, "; ".join(errors[:3]))
    ctx.close()

    # Piloto automático: 20 s de jogo real sem bater.
    c = browser.new_context(viewport={"width": 1280, "height": 720})
    pg = c.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(BASE + "/corrida/?debug&piloto&seed=11")
    pg.wait_for_selector("text=CORRER")
    pg.click("text=CORRER")
    pg.wait_for_timeout(20000)
    sp = st(pg)
    check("piloto automático corre 20 s sem bater", sp["state"] == "PLAYING" and sp["elapsed"] > 10, f"t={sp['elapsed']:.1f}s pontos={sp['score']}")
    fps = pg.evaluate("""() => new Promise(res => { let n = 0; const t0 = performance.now();
        const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else res(n) }; requestAnimationFrame(f) })""")
    check("quadros por segundo (Chromium headless, sem GPU)", fps >= 30, f"{fps} fps")
    pg.screenshot(path=str(OUT / "corrida-07-piloto.png"))
    check("piloto: sem erros", not errs, "; ".join(errs[:2]))
    c.close()

    # Missões em trios: menu mostra o trio; cumprir mostra aviso e salva; trio completo sobe de nível.
    c = browser.new_context(viewport={"width": 844, "height": 390}, has_touch=True, is_mobile=True)
    pg = c.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(BASE + "/corrida/")
    pg.evaluate("""() => localStorage.setItem('ndc:corrida:missions', JSON.stringify({ v: 1, level: 1, seed: 3, completed: 0,
        slots: [{ kind: 'capimRun', target: 1, progress: 0, done: false }, { kind: 'meters', target: 20, progress: 0, done: false },
                { kind: 'runs', target: 1, progress: 0, done: false }] }))""")
    pg.goto(BASE + "/corrida/?debug&seed=7")
    pg.wait_for_selector("text=CORRER")
    check("sem a opção de menos movimento", pg.locator("text=Menos movimento").count() == 0)
    check("menu mostra as 3 missões e o nível", pg.locator(".menu .missions-list li").count() == 3 and "nível 1" in pg.locator(".menu .missions").inner_text().lower())
    pg.click("text=CORRER")
    pg.wait_for_selector(".mission-toast", timeout=8000)
    check("missão cumprida mostra aviso na corrida", "Missão cumprida" in pg.locator(".mission-toast").inner_text())
    pg.screenshot(path=str(OUT / "corrida-09-missao.png"))
    pg.wait_for_function("() => ['CONTINUE','GAME_OVER'].includes(window.__NDC__.engine.state)", timeout=60000)
    if pg.locator("text=Encerrar corrida").count():
        pg.click("text=Encerrar corrida")
    pg.wait_for_selector(".gameover .missions", timeout=4000)
    txt = pg.locator(".gameover .missions").inner_text()
    check("trio completo sobe de nível no fim", "nível 2" in txt.lower(), txt.replace("\n", " | ")[:80])
    saved = pg.evaluate("() => JSON.parse(localStorage.getItem('ndc:corrida:missions')).level")
    check("nível salvo no aparelho", saved == 2)
    pg.screenshot(path=str(OUT / "corrida-10-nivel.png"))
    check("missões: sem erros", not errs, "; ".join(errs[:2]))
    c.close()

    # Copa das árvores: pular no cipó do padrão "copa" leva lá para cima.
    c = browser.new_context(viewport={"width": 844, "height": 390})
    pg = c.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(BASE + "/corrida/?debug&seed=5")
    pg.wait_for_selector("text=CORRER")
    pg.evaluate("() => { window.__NDC__.engine.track.forced = ['copa'] }")
    pg.click("text=CORRER")
    up = False
    for i in range(500):
        s = pg.evaluate("""() => { const e = window.__NDC__.engine, r = e.runner, v = e.track.level.vines[0];
            return { st: e.state, x: r.x, y: r.y, sw: r.swinging, g: r.grounded, vx: v ? v.ax : null, s: e.speed } }""")
        if s["st"] != "PLAYING":
            break
        if s["vx"] and not s["sw"] and s["g"] and s["y"] < 1 and 0 < s["vx"] - s["x"] < s["s"] * 0.33:
            pg.keyboard.down("Space"); pg.wait_for_timeout(250); pg.keyboard.up("Space")
        if s["g"] and s["y"] > 190:
            up = True
            break
        pg.wait_for_timeout(15)
    check("cipó do padrão copa leva à copa das árvores", up)
    if up:
        pg.wait_for_timeout(200)
        pg.screenshot(path=str(OUT / "corrida-11-copa.png"))
        lift = pg.evaluate("() => window.__NDC__.renderer.lift")
        check("câmera sobe na copa", lift > 30, f"lift={lift:.0f}")
    check("copa: sem erros", not errs, "; ".join(errs[:2]))
    c.close()

    # Ímã de capim: pegar liga o ímã (barra no HUD) e puxa os capins altos.
    c = browser.new_context(viewport={"width": 844, "height": 390})
    pg = c.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(BASE + "/corrida/?debug&seed=5")
    pg.wait_for_selector("text=CORRER")
    pg.click("text=CORRER")
    pg.wait_for_timeout(300)
    pg.evaluate("""() => { const e = window.__NDC__.engine, r = e.runner, l = e.track.level;
        l.rocks.length = l.thorns.length = l.crates.length = l.springs.length = 0;
        l.ground.length = 0; l.addGround(-800, r.x + 6000); e.track.genX = r.x + 6000;
        l.powerups.push({ x: r.x + 120, y: 17, kind: 'magnet', taken: false });
        for (let k = 0; k < 8; k++) l.fruits.push({ x: r.x + 260 + k * 30, y: 150, taken: false, risky: false });
        l.fruits.sort((a, b) => a.x - b.x); }""")
    f0 = pg.evaluate("() => window.__NDC__.engine.score.fruits")
    pg.wait_for_function("() => window.__NDC__.engine.magnet > 0", timeout=4000)
    pg.wait_for_timeout(250)
    pg.screenshot(path=str(OUT / "corrida-12-ima.png"))
    check("música do ímã toca enquanto ele está ligado", pg.evaluate("() => window.__NDC__.sfx.musicPlaying"))
    pg.wait_for_timeout(600)
    check("embalo de +10% com o ímã", abs(pg.evaluate("() => window.__NDC__.engine.speedFactor") - 1.1) < 0.01)
    pg.wait_for_timeout(1500)
    f1 = pg.evaluate("() => window.__NDC__.engine.score.fruits")
    check("ímã puxa os capins altos sem pular", f1 - f0 >= 8, f"{f1 - f0} capins")
    pg.wait_for_function("() => window.__NDC__.engine.magnet === 0", timeout=12000)
    pg.wait_for_timeout(100)
    check("música para quando o ímã acaba", not pg.evaluate("() => window.__NDC__.sfx.musicPlaying"))
    pg.wait_for_timeout(700)
    check("velocidade volta ao normal depois do ímã", pg.evaluate("() => window.__NDC__.engine.speedFactor") == 1)
    check("ímã: sem erros", not errs, "; ".join(errs[:2]))
    c.close()

    # Bote do jacaré: pulando um rio, ele salta da água e fecha a boca abaixo das patas.
    c = browser.new_context(viewport={"width": 844, "height": 390})
    pg = c.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(BASE + "/corrida/?debug&seed=5")
    pg.wait_for_selector("text=CORRER")
    pg.click("text=CORRER")
    pg.wait_for_timeout(200)
    pg.evaluate("""() => { const e = window.__NDC__.engine, r = e.runner, l = e.track.level;
        l.rocks.length = l.thorns.length = l.crates.length = l.springs.length = 0;
        l.ground.length = 0; l.addGround(-800, r.x + 300); l.addGround(r.x + 430, r.x + 20000); e.track.genX = r.x + 20000;
        window.__rv = r.x + 300; window.__bote = 0;
        const g = window.__NDC__.renderer.gators, up = g.update.bind(g);
        g.update = (en, dt) => { up(en, dt); window.__bote += g.events.snap.length } }""")
    for i in range(300):
        s = pg.evaluate("() => { const e = window.__NDC__.engine; return { x: e.runner.x, g: e.runner.grounded, st: e.state } }")
        if s["g"] and window_rv - 40 < s["x"] < window_rv if (window_rv := pg.evaluate("() => window.__rv")) else False:
            pg.keyboard.down("Space"); pg.wait_for_timeout(260); pg.keyboard.up("Space")
        if s["x"] > window_rv + 250 or s["st"] != "PLAYING":
            break
        pg.wait_for_timeout(10)
    check("jacaré dá o bote quando a capivara pula o rio", pg.evaluate("() => window.__bote") >= 1)
    check("o bote não derruba quem pulou certo", pg.evaluate("() => window.__NDC__.engine.state") == "PLAYING")
    check("bote: sem erros", not errs, "; ".join(errs[:2]))
    c.close()

    # Itens especiais aparecem desenhados (não só o círculo de fundo).
    c = browser.new_context(viewport={"width": 844, "height": 390})
    pg = c.new_page()
    pg.goto(BASE + "/corrida/?debug&seed=5")
    pg.wait_for_selector("text=CORRER")
    pg.click("text=CORRER")
    pg.wait_for_timeout(150)
    pg.evaluate("""() => { const e = window.__NDC__.engine, r = e.runner, l = e.track.level;
        l.rocks.length = l.thorns.length = l.crates.length = l.springs.length = 0; l.fruits.length = 0; l.powerups.length = 0;
        l.ground.length = 0; l.addGround(-800, r.x + 20000); e.track.genX = r.x + 20000;
        l.powerups.push({ x: r.x + 420, y: 17, kind: 'golden', taken: false }); }""")
    pg.wait_for_timeout(120)
    gold = pg.evaluate("""() => { const R = window.__NDC__.renderer, e = window.__NDC__.engine, u = e.track.level.powerups[0];
        const cv = document.querySelector('canvas'), ctx = cv.getContext('2d'), k = R.layout.scale * R.dpr;
        const cx = (R.layout.offsetX + R.sx(u.x) * R.layout.scale) * R.dpr, cy = (R.layout.offsetY + R.sy(u.y) * R.layout.scale) * R.dpr;
        const s = Math.round(16 * k), d = ctx.getImageData(Math.round(cx - s), Math.round(cy - s), 2 * s, 2 * s).data;
        let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 140 && d[i + 2] < 90) n++;
        return n; }""")
    check("capim dourado aparece desenhado (tufo dourado)", gold > 40, f"{gold} px dourados")
    c.close()

    # Ema: sai do caixote, a capivara pula nela, fica mais rápida e cai ao bater.
    c = browser.new_context(viewport={"width": 844, "height": 390})
    pg = c.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(BASE + "/corrida/?debug&seed=5")
    pg.wait_for_selector("text=CORRER")
    pg.click("text=CORRER")
    pg.wait_for_timeout(150)
    pg.evaluate("""() => { const e = window.__NDC__.engine, r = e.runner, l = e.track.level;
        l.rocks.length = l.thorns.length = l.crates.length = l.springs.length = 0; l.fruits.length = 0; l.powerups.length = 0;
        l.ground.length = 0; l.addGround(-800, r.x + 20000); e.track.genX = r.x + 20000;
        l.crates.push({ x0: r.x + 260, x1: r.x + 296, top: 36, broken: false, brokenAt: 0, loot: { kind: 'mount', animal: 'ema' } });
        l.rocks.push({ x0: r.x + 1900, x1: r.x + 1934, top: 30, variant: 0, broken: false }); }""")
    pg.wait_for_function("() => window.__NDC__.engine.mount", timeout=4000)
    check("ema: sai do caixote", True)
    pg.wait_for_timeout(500)
    for k in range(40):
        st = pg.evaluate("() => { const e = window.__NDC__.engine; return [e.mount && e.mount.state, e.runner.grounded] }")
        if st[0] == "ridden":
            break
        if st[1]:
            pg.keyboard.down("Space"); pg.wait_for_timeout(120); pg.keyboard.up("Space")
        pg.wait_for_timeout(60)
    check("ema: pulando nela, a capivara monta", pg.evaluate("() => window.__NDC__.engine.riding"))
    pg.wait_for_timeout(500)
    check("ema: montada fica mais rápida", pg.evaluate("() => window.__NDC__.engine.speedFactor") > 1.25)
    pg.wait_for_function("() => !window.__NDC__.engine.riding", timeout=8000)
    pg.wait_for_timeout(300)
    check("ema: bater na pedra derruba da ema sem perder vida", pg.evaluate("() => window.__NDC__.engine.state") == "PLAYING")
    check("ema: sem erros", not errs, "; ".join(errs[:2]))
    c.close()

    # Tucano: pula até ele, é carregada e voa segurando.
    c = browser.new_context(viewport={"width": 844, "height": 390})
    pg = c.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(BASE + "/corrida/?debug&seed=5")
    pg.wait_for_selector("text=CORRER")
    pg.click("text=CORRER")
    pg.wait_for_timeout(150)
    pg.evaluate("""() => { const e = window.__NDC__.engine, r = e.runner, l = e.track.level;
        l.rocks.length = l.thorns.length = l.crates.length = l.springs.length = 0; l.fruits.length = 0; l.powerups.length = 0;
        l.ground.length = 0; l.addGround(-800, r.x + 20000); e.track.genX = r.x + 20000;
        l.crates.push({ x0: r.x + 260, x1: r.x + 296, top: 36, broken: false, brokenAt: 0, loot: { kind: 'mount', animal: 'tucano' } }); }""")
    pg.wait_for_function("() => window.__NDC__.engine.mount", timeout=4000)
    pg.wait_for_timeout(500)
    for k in range(40):
        st = pg.evaluate("() => { const e = window.__NDC__.engine; return [e.mount && e.mount.state, e.runner.grounded] }")
        if st[0] == "ridden":
            break
        if st[1]:
            pg.keyboard.down("Space"); pg.wait_for_timeout(120); pg.keyboard.up("Space")
        pg.wait_for_timeout(60)
    check("tucano: pulando até ele, a capivara é carregada", pg.evaluate("() => window.__NDC__.engine.riding"))
    pg.keyboard.down("Space"); pg.wait_for_timeout(1300)
    check("tucano: segurando, voa alto", pg.evaluate("() => window.__NDC__.engine.runner.y") > 180)
    pg.keyboard.up("Space")
    check("tucano: sem erros", not errs, "; ".join(errs[:2]))
    c.close()

    # Tora rolando: vem na direção da capivara; um pulo na hora certa passa.
    c = browser.new_context(viewport={"width": 844, "height": 390})
    pg = c.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(BASE + "/corrida/?debug&seed=5")
    pg.wait_for_selector("text=CORRER")
    pg.click("text=CORRER")
    pg.wait_for_timeout(150)
    pg.evaluate("""() => { const e = window.__NDC__.engine, r = e.runner, l = e.track.level;
        l.rocks.length = l.thorns.length = l.crates.length = l.springs.length = 0; l.fruits.length = 0; l.powerups.length = 0; l.logs.length = 0;
        l.ground.length = 0; l.addGround(-800, r.x + 20000); e.track.genX = r.x + 20000;
        const v = e.speed, meet = r.x + 2.2 * v, lead = 1.4 * v;
        l.logs.push({ x0: meet + 0.7 * lead, trig: meet - lead, k: 0.7, r: 18, broken: false, rolling: false, passed: false });
        window.__meet = meet; }""")
    pg.wait_for_function("() => window.__NDC__.engine.track.level.logs[0].rolling", timeout=4000)
    check("tora: começa a rolar quando a capivara chega perto", True)
    x0 = pg.evaluate("() => window.__NDC__.engine.runner.x")
    pg.wait_for_timeout(300)
    check("tora: rola na direção da capivara", pg.evaluate("() => { const e = window.__NDC__.engine, t = e.track.level.logs[0]; return t.x0 - t.k * (e.runner.x - t.trig) < t.x0 - 50 }"))
    pg.wait_for_function("() => window.__NDC__.engine.runner.x > window.__meet - 0.24 * window.__NDC__.engine.speed", timeout=4000)
    pg.keyboard.down("Space"); pg.wait_for_timeout(60); pg.keyboard.up("Space")
    pg.wait_for_timeout(900)
    check("tora: pulando na hora certa, passa por cima", pg.evaluate("() => window.__NDC__.engine.state") == "PLAYING"
          and pg.evaluate("() => window.__NDC__.engine.track.level.logs[0]?.passed ?? true"))
    check("tora: sem erros", not errs, "; ".join(errs[:2]))
    c.close()

    # Toca: buraco escondido sob folhas, túnel com capim e saída que lança de volta.
    c = browser.new_context(viewport={"width": 844, "height": 390})
    pg = c.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(BASE + "/corrida/?debug&seed=5")
    pg.wait_for_selector("text=CORRER")
    pg.click("text=CORRER")
    pg.wait_for_timeout(150)
    pg.evaluate("""() => { const e = window.__NDC__.engine, r = e.runner, l = e.track.level;
        l.rocks.length = l.thorns.length = l.crates.length = l.springs.length = l.platforms.length = l.vines.length = 0;
        l.fruits.length = 0; l.powerups.length = 0; l.burrows.length = 0;
        const v = e.speed, x0 = r.x + 300, X = (t) => x0 + t * v;
        l.ground.length = 0; l.addGround(-800, X(0)); l.addGround(X(0.4), X(3.3)); l.addGround(X(3.72), X(40));
        l.burrows.push({ x0: X(0), holeEnd: X(0.4), exitStart: X(3.3), x1: X(3.72), floor: -170, roof: -90, opened: false });
        for (let i = 0; i < 8; i++) l.fruits.push({ x: X(0.6 + i * 0.3), y: -153, taken: false, risky: false });
        l.rocks.push({ x0: X(1.2), x1: X(1.2) + 34, top: 30, variant: 0, broken: false });
        e.track.genX = X(40); window.__T = { x0, v, f0: e.score.fruits }; }""")
    pg.wait_for_function("() => window.__NDC__.engine.inBurrow", timeout=4000)
    check("toca: cai no buraco escondido", True)
    pg.wait_for_timeout(500)
    check("toca: câmera desce para mostrar o túnel", pg.evaluate("() => window.__NDC__.renderer.lift") < -90)
    pg.wait_for_function("() => !window.__NDC__.engine.inBurrow || window.__NDC__.engine.state !== 'PLAYING'", timeout=6000)
    pg.wait_for_timeout(900)
    st = pg.evaluate("() => { const e = window.__NDC__.engine; return { st: e.state, y: e.runner.y, f: e.score.fruits - window.__T.f0 } }")
    check("toca: sai pela saída e volta à superfície", st["st"] == "PLAYING" and st["y"] >= 0, str(st))
    check("toca: come o capim lá de baixo", st["f"] >= 8, f"{st['f']} capins")
    check("toca: sem erros", not errs, "; ".join(errs[:2]))
    c.close()

    # Layouts.
    for (w, h, name, touch) in [
        (390, 844, "iphone-em-pe", True),
        (844, 390, "iphone-deitado", True),
        (932, 430, "promax-deitado", True),
        (667, 375, "pequeno-deitado", True),
        (1024, 768, "tablet", True),
        (1280, 800, "desktop", False),
    ]:
        c = browser.new_context(viewport={"width": w, "height": h}, has_touch=touch, is_mobile=touch)
        pg = c.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(URL)
        pg.wait_for_selector("text=CORRER")
        menu = pg.locator(".menu").bounding_box()
        fits = menu["y"] >= -1 and menu["y"] + menu["height"] <= h + 1 and menu["x"] >= -1 and menu["x"] + menu["width"] <= w + 1
        check(f"{name} {w}x{h}: menu cabe na tela", fits)
        btn = pg.locator("text=CORRER").bounding_box()
        check(f"{name}: botão CORRER visível", btn["y"] + btn["height"] <= h and btn["height"] >= 44)
        pg.screenshot(path=str(OUT / f"corrida-menu-{name}-{w}x{h}.png"))
        pg.click("text=CORRER")
        pg.wait_for_timeout(1200)
        pg.screenshot(path=str(OUT / f"corrida-jogo-{name}-{w}x{h}.png"))
        pause = pg.locator(".pause-btn").bounding_box()
        check(f"{name}: botão de pausa visível e ≥ 44px", pause and pause["width"] >= 44 and pause["x"] >= 0 and pause["y"] >= 0)
        if name == "iphone-em-pe":
            check("celular em pé sugere deitar", pg.locator(".rotate-hint").count() == 1)
        elif touch:
            check(f"{name}: deitado não mostra aviso", pg.locator(".rotate-hint").count() == 0)
        check(f"{name}: sem erros", not errs, "; ".join(errs[:2]))
        c.close()

    browser.close()

ok = sum(1 for r in results if r[1])
print(f"\n{ok}/{len(results)} verificações passaram")
sys.exit(0 if ok == len(results) else 1)
