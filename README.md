# Não Deixe Cair — hub de jogos de um toque

Hub de jogos casuais para navegador (prioridade para celular). Cada jogo fica na sua pasta e **um único build publica todos**.

| Jogo | Pasta / rota | Como se joga |
|---|---|---|
| **Bolinha** (nome provisório) | `bolinha/` | Segure para subir, solte para cair. Passe pelos vãos das barreiras. |
| **Acrobata** | `aviao/` | Segure para subir (quanto mais tempo, mais alto), solte para mergulhar, toque + toque e segure dá um loop. Encadeie manobras. |

React 19 + TypeScript estrito + Vite (multi-página) + Canvas 2D. Sem backend, sem contas reais, sem anúncios, sem analytics. Sons sintetizados com Web Audio (sem arquivos de terceiros). Funciona offline depois de carregado.

## Rodar no Windows (ou em qualquer sistema)

```bash
npm install
npm run dev          # http://localhost:5173 → hub; /bolinha/ e /aviao/ são os jogos
```

O `npm run dev` também abre na rede local (`server.host`), então dá para testar no celular pelo IP do computador (ex.: `http://192.168.0.10:5173`).

## Testes e qualidade

```bash
npm test             # Vitest: física, colisão, geradores, manobras, combo, estados, migração de chaves
npm run lint         # ESLint
npm run typecheck    # TypeScript estrito
```

Testes em navegador real (Python + Playwright com Chromium):

```bash
npm run build && npx vite preview --port 4173      # em outro terminal
python e2e/hub.py http://localhost:4173 e2e/screens             # hub, migração, perfil compartilhado
python e2e/bolinha_smoke.py http://localhost:4173 e2e/screens   # bolinha: controles, pausa, layouts
python e2e/bolinha_ranking.py http://localhost:4173 e2e/screens # bolinha: ranking, perfil, sons
python e2e/aviao.py http://localhost:4173 e2e/screens           # acrobata: controle, loop, fim, ranking, layouts
```

(No Windows use `python`; no Linux/macOS, `python3`. Primeira vez: `pip install playwright` e `python -m playwright install chromium`.)

## Build de produção e publicação

```bash
npm run build        # gera dist/ com o hub e TODOS os jogos
npm run preview      # confere o build localmente
```

`dist/` é 100 % estático e usa caminhos relativos (`base: './'`), então funciona em qualquer hospedagem estática, inclusive em subpasta. **Publique sempre a pasta `dist/` inteira** — o deploy é de tudo junto:

- **Netlify / Cloudflare Pages / Vercel:** comando `npm run build`, pasta de saída `dist`.
- **GitHub Pages:** action oficial `actions/deploy-pages` com `path: dist` (ou envie o conteúdo de `dist/` para a branch `gh-pages`).
- **itch.io:** compacte o conteúdo de `dist/` em .zip e envie como projeto HTML.

## Dados dos jogadores (localStorage)

| Chave | O quê |
|---|---|
| `ndc:profile`, `ndc:guest-name` | perfil local e último nome — **do hub, vale para todos os jogos** |
| `ndc:settings` | som e "menos movimento" (compartilhado) |
| `ndc:<jogo>:best`, `ndc:<jogo>:ranking` | recorde e top 10 **de cada jogo** |

Na primeira abertura depois da atualização, `migrateLegacyKeys` copia **uma única vez** as chaves antigas `nao-deixe-cair:*` para as novas (sem apagar as antigas e sem sobrescrever valores novos). Ninguém perde recorde, ranking nem perfil.

Ranking e perfil seguem as interfaces `RankingService` (`src/shared/ranking/Ranking.ts`) e `AuthProvider` (`src/shared/auth/auth.ts`): um backend futuro implementa as mesmas interfaces sem mudar as telas.

## Arquitetura

```
index.html              hub (escolha de jogos)
bolinha/index.html      entrada do jogo da bolinha
aviao/index.html        entrada do Acrobata
src/
  hub/                  tela do hub: cartões com ilustração em SVG, recorde e perfil
  shared/               o que os jogos compartilham
    loop/               GameLoop (rAF único e idempotente)
    input/              InputController (Pointer Events + teclado, pointercancel, perda de foco)
    audio/              SynthAudio (desbloqueio, iOS em modo "playback", sons de interface)
    layout/             arena lógica 360×640 escalada sem esticar, devicePixelRatio
    storage/            SafeStorage + chaves + migração
    ranking/ auth/ settings/ ui/   ranking local, perfil, configurações, telas de ranking, botão "Jogos"
    games.ts            catálogo do hub
  games/
    bolinha/            motor, física, obstáculos, render e telas da bolinha
    aviao/              motor, física de voo, mundo, manobras, render, som e telas do Acrobata
e2e/                    testes de navegador (hub + um por jogo)
```

Para adicionar um jogo: uma pasta em `src/games/`, um `<jogo>/index.html`, uma entrada em `vite.config.ts` (`build.rollupOptions.input`) e uma em `src/shared/games.ts`.

URLs de diagnóstico (nos dois jogos): `?debug` expõe `window.__NDC__`; `?seed=N` fixa a semente. No Acrobata: `?controle=a` ou `?controle=b` ligam os esquemas antigos e `?debug&piloto` liga o piloto automático.

---

## Acrobata (jogo do avião)

### Controle: esquema C — "segurar sobe, toque + toque e segure dá o loop"

- **Segurar** = motor no máximo e o nariz sobe até ~35–40° e **fica lá**: quanto mais tempo segurar, mais alto o avião vai (~200 u por segundo, 3 s ≈ 540 u). Nunca vira loop sem querer. Se o avião estiver lento, o ângulo diminui sozinho para não estolar.
- **Soltar** = marcha lenta e o nariz desce na hora até um mergulho firme (~43°), como a bolinha caindo: aponta para baixo em ~0,24 s e desce a ~200 u/s. Segurar de novo inverte para cima em ~0,27 s.
- **Loop = toque + toque e segure**: um toque curto (até 0,2 s) e, em até 0,3 s, outro toque que fica pressionado por 0,25 s. Aí começa a puxada total até passar da volta completa (~2 s). Até o loop começar o avião já está subindo, e quem continua segurando sai do loop subindo. Dois toques curtos em ritmo (o jeito de jogar a bolinha) **não** dão loop.
- **Estol**: devagar e de nariz alto (por exemplo, um loop sem velocidade), a asa para de sustentar; aparece "ESTOL!", o nariz cai e o avião se recupera sozinho se houver altura.
- Nos primeiros segundos de cada partida, uma dica na tela lembra os três gestos.

Histórico: o primeiro esquema escolhido (A, "segurar = acelerar e puxar o nariz") fazia qualquer toque longo virar loop e não deixava subir alto. Ele continua em `?controle=a`, e o B (gestos: toque duplo = tonneau, deslizar = loop) em `?controle=b`, para comparar.

Comparação em `src/games/aviao/game/testing/compareControls.ts`, com jogadores **simulados** (perfis de toque supostos, não medições com pessoas):

| Critério | A (puxar) | B (gestos) | **C (atual)** |
|---|---|---|---|
| Toque → nariz gira 5° | 42 ms | 92 ms | **42 ms** |
| Loops de propósito bem-sucedidos | 100 % (segurando) | 75 % (deslize) | **100 % (toque + toque e segure)** |
| Segurar 3 s: quanto sobe / vira loop? | 179 u / **sim** | 421 u / não | **552 u / não** |
| Manobras sem querer por minuto de toques frenéticos | 0 | 36,4 tonneaus | **0** |

Uma versão anterior do C usava dois toques rápidos para o loop; com o mergulho firme, o ritmo frenético disparava ~20 loops sem querer por minuto. Exigir que o segundo toque fique pressionado resolveu: 0 acidentais e 100 % dos loops de propósito. O custo é ~0,25 s entre o segundo toque e o início do loop (nesse tempo o avião já está subindo).

### Manobras e pontuação

| Manobra | Como é detectada | Pontos base |
|---|---|---|
| Loop | trajetória sobe 360° líquidos (sobe-desce não soma; giro ajudado pelo estol não conta) | 100 |
| Meio loop | 180° e saída nivelada por 0,35 s | 40 |
| Voo invertido | ≥ 0,6 s de cabeça para baixo (pago ao endireitar) | 30 por segundo |
| Rasante | < 34 u do chão acima de 300 u/s e depois subir acima de 90 u | 40 |
| Recuperação de estol | sair de um estol e voltar a voar | 60 |
| Raspão | passar a menos de 16 u de um obstáculo sem bater (uma vez por obstáculo) | 25 |
| Anel | atravessar a abertura (anel alto, que pede loop: ×2) | 50 / 100 |

- Distância: 1 ponto a cada 40 u.
- **Combo**: cada manobra a menos de 4 s da anterior sobe o multiplicador (×2, ×3… até ×8). Passar 4 s sem manobra zera; a batida encerra a partida.
- Recorde pessoal e top 10 próprios do Acrobata; o fluxo de fim de partida é o mesmo da bolinha (**Entrar** ou **Só meu nome**).

### Mundo e dificuldade

- O mundo é gerado em trechos de 420 u. Cada trecho tem um **corredor livre** cujo centro varia no máximo uma rampa voável; entre trechos ele é interpolado. Obstáculos (balões, pássaros que patrulham, torres) só nascem fora do **envelope** do corredor — um teste confere isso em 25 sementes, e um piloto automático que só segue o corredor sobrevive 120 s em 20 sementes.
- Chão: rasante permitido (até ~30° de ângulo com o relevo, com 0,12 s de tolerância); bico no chão, voo invertido no chão ou perder a velocidade de voo encostado no chão = batida.
- Teto suave: acima de 1050 u o ar fica rarefeito e o motor perde força (sem parede).
- Começo livre (1600 u) com anéis no caminho; depois a curva sobe até ~36 000 u (~2,5 min): corredor de 380 → 200 u, 1,3 → 5,5 obstáculos por trecho, mais pássaros, menos folga.

### Parâmetros finais (`src/games/aviao/game/config.ts`)

| Física | Valor | | Mundo (`World.ts`) | Valor |
|---|---|---|---|---|
| gravidade | 400 u/s² | | largura do trecho | 420 u |
| motor máx. | 560 u/s² | | corredor (início → fim) | 380 → 200 u |
| arrasto | 0,0028·v² (vel. máx. nivelada ≈ 447 u/s) | | variação máx. do centro | 80 → 190 u/trecho |
| correção de nível | 0,0068·v² (sustenta sozinha a ≈ 243 u/s) | | obstáculos por trecho | 1,3 → 5,5 |
| puxada / empurrada | 0,0115·v² / 0,024·v², limite 6 g | | folga extra no começo | 80 → 0 u |
| estol | < 105 u/s (transição até 136 u/s) | | início livre | 1600 u |
| potência | sobe 5/s, cai 3,2/s, marcha lenta 12 % | | rampa até o máximo | 36 000 u |

### Sensação de jogo

- Motor contínuo baseado no "zumbido do propulsor" original (serra grave num passa-baixa com Q≈6), com base de 62–100 Hz, seno sub-oitava e LFO de 8–15 Hz no volume (as pás da hélice); sobe de tom e brilho com potência e velocidade.
- Um som por manobra (subindo um semitom por nível de combo), sininho nos anéis, "fiu" no raspão, aviso de estol, combo perdido, batida grave e abafada (sem ruído alto).
- Fumaça de acrobacia que fica no céu e desenha o loop, escapamento, faíscas, linhas de velocidade, câmera que se afasta com velocidade e altura sem girar, hélice e "squash" no toque, tremida no estol, câmera lenta de 0,16 s nas manobras grandes (desligada com **Menos movimento**), vibração no Android.
- Pools de tamanho fixo para fumaça, partículas, textos, obstáculos e anéis.

## Bolinha

Parâmetros em `src/games/bolinha/game/config.ts` e `Difficulty.ts`. Detalhes do jogo, do ranking e do som estão nos comentários do código e nos testes (`src/games/bolinha/__tests__`).

## Limitações conhecidas

- A calibragem do Acrobata foi feita com simulação e testes em Chromium (desktop e emulação de celular), **não em aparelho físico**. O ajuste fino de sensação (força da puxada, rasante, sons no alto-falante do iPhone) precisa de partidas reais.
- A duração das partidas foi estimada com um "jogador casual" simulado (reação de 0,15–0,25 s e erros aleatórios): mediana entre ~27 s (descuidado) e ~85 s (cuidadoso). Jogadores reais podem diferir.
- iOS não tem `navigator.vibrate`: lá a vibração simplesmente não acontece.
- Ranking e perfil são locais ao aparelho/navegador (sem backend).
