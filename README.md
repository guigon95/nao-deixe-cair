# Não Deixe Cair — hub de jogos de um toque

Hub de jogos casuais para navegador (prioridade para celular). Cada jogo fica na sua pasta e **um único build publica todos**.

| Jogo | Pasta / rota | Como se joga |
|---|---|---|
| **Bolinha** (nome provisório) | `bolinha/` | Segure para subir, solte para cair. Passe pelos vãos das barreiras. |
| **Acrobata** | `aviao/` | Segure para subir, solte para cair (mesma física da bolinha). Desvie de balões, pássaros e torres e não encoste no chão. |
| **Disparada** (nome provisório) | `corrida/` | Corrida infinita lateral com uma capivara: toque pula, segure para pular alto e planar. Coma capim, pule o rio do jacaré e fuja dos marimbondos. |

React 19 + TypeScript estrito + Vite (multi-página) + Canvas 2D no front; **API Fastify + Prisma + Postgres** para contas e ranking de todos os jogadores (mesmo padrão do AquaOps). Sem anúncios, sem analytics. Sons sintetizados com Web Audio. Sem servidor (offline ou hospedagem estática) tudo continua funcionando com ranking e perfil locais.

```
packages/web      hub + jogos (Vite)          → serviço "web" na Vercel
packages/server   API: contas, sessões, ranking → serviço "server" na Vercel (/api/*)
```

## Rodar no Windows (ou em qualquer sistema)

```bash
npm install
npm run dev:web      # só o front: http://localhost:5173 (sem API → ranking local)
```

Com o backend (precisa de um Postgres — local, Docker ou um banco Neon de desenvolvimento):

```bash
copy packages\server\.env.example packages\server\.env   # (cp no Linux/macOS) e ajuste DATABASE_URL
npm run db:migrate   # cria as tabelas
npm run dev          # API em :4000 + front em :5173 (o Vite repassa /api para a API)
```

O front abre também na rede local (`server.host`), então dá para testar no celular pelo IP do computador (ex.: `http://192.168.0.10:5173`).

## Testes e qualidade

```bash
npm test             # Vitest: jogos + cliente online (web) e API contra Postgres real (server)
npm run lint         # ESLint
npm run typecheck    # TypeScript estrito
```

Os testes do servidor usam o banco de `TEST_DATABASE_URL` (padrão `postgresql://postgres:postgres@localhost:5432/ndc_test`) e apagam os dados dele a cada teste — nunca aponte para produção.

Testes em navegador real (Python + Playwright com Chromium):

```bash
cd packages/web
npm run build && npx vite preview --port 4173      # em outro terminal; sem API = modo local
python e2e/hub.py http://localhost:4173 e2e/screens             # hub, migração, perfil compartilhado
python e2e/bolinha_smoke.py http://localhost:4173 e2e/screens   # bolinha: controles, pausa, layouts
python e2e/bolinha_ranking.py http://localhost:4173 e2e/screens # bolinha: ranking local, perfil, sons
python e2e/aviao.py http://localhost:4173 e2e/screens           # acrobata: controle, loop, fim, ranking, layouts
python e2e/corrida.py http://localhost:4173 e2e/screens         # disparada: toque/segurar/teclado/deslize, dash, fim, ranking, hub, piloto, layouts

# modo online (API rodando em :4000 com um banco de teste vazio)
API_PROXY_TARGET=http://localhost:4000 npx vite preview --port 4174
python e2e/online.py http://localhost:4174 e2e/screens          # contas, sessão, ranking entre 2 aparelhos
```

(No Windows use `python`; no Linux/macOS, `python3`. Primeira vez: `pip install playwright` e `python -m playwright install chromium`.)

## Backend: contas e ranking online

API em `packages/server` (Fastify 5 + Prisma 6 + Postgres), no mesmo formato do AquaOps.

| Rota | O quê |
|---|---|
| `GET /api/health` | 200 só quando API **e** banco respondem — o front usa isso para decidir entre modo online e local |
| `POST /api/auth/register` · `login` · `logout`, `GET /api/auth/me` | conta com apelido + senha (bcrypt), sessão em cookie `httpOnly` |
| `GET /api/games/:jogo/ranking` | top 10 do jogo (melhor de cada conta + convidados) e, com sessão, a posição do jogador |
| `POST /api/games/:jogo/runs` | token assinado do início da partida |
| `POST /api/games/:jogo/scores` | envia a pontuação com o token |

Ranking semanal (é o que aparece primeiro):

- A semana vai de **segunda 00:00 a domingo 23:59, horário de Brasília**, e zera toda segunda. `GET /api/games/:jogo/ranking?period=week` devolve o top 10 da semana, sua posição, quando termina e o **campeão da semana passada**; `period=all` é o geral.
- Cada envio responde a posição na semana e no geral ("🏆 1º lugar da semana!" / "3º na semana · 12º no geral").
- Convidados entram se ficarem no **top 10 da semana** (bem mais alcançável que o geral).
- No menu, um aviso chama para a disputa: "Você é o 2º da semana — o 1º tem 27", "Ainda tem vaga no top 10 da semana" ou "Top 10 a partir de N pontos", sempre com quanto falta para a semana acabar.

Regras:

- **Apelido único** sem diferenciar maiúscula nem acento ("Zé" = "ze"); 2–16 caracteres, as mesmas regras do front. Senha com 6+ caracteres.
- **Com conta**, toda partida é guardada e o ranking usa a melhor; a posição aparece mesmo fora do top 10. **Sem conta** ("Só meu nome"), a pontuação só entra se for top 10, e o nome não pode ser o de uma conta.
- **Anti-trapaça simples**: cada partida pega um token assinado (HMAC com `APP_SECRET`) ao começar; o envio confere assinatura, jogo, validade (6 h), uso único e um teto de pontos por segundo de partida por jogo (`src/lib/games.ts`). Não impede um trapaceiro determinado (o jogo roda no navegador), mas barra o `fetch` com 99999 pontos.
- Proteções do AquaOps: header anti-CSRF (`x-ndc-csrf`) em toda escrita, limite de tentativas (10/min no login), helmet, logs sem cookies.
- O front pede o token **antes** da partida (pré-busca) para o JOGAR nunca esperar a rede. Se o servidor cair no meio, a pontuação é salva neste aparelho e o jogo avisa.

Variáveis (`packages/server/.env.example`): `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `APP_SECRET`, `SESSION_TTL_DAYS` (padrão 180).

## Build de produção e publicação

```bash
npm run build        # gera o Prisma Client, empacota a API e gera packages/web/dist com o hub e TODOS os jogos
```

**Vercel (recomendado):** o `vercel.json` define dois serviços — `web` (Vite, `packages/web`) e `server` (Fastify, `packages/server`) — e manda `/api/*` para a API. Para o ranking online funcionar:

1. No projeto da Vercel: **Storage → Create Database → Neon** e conecte ao projeto (cria `DATABASE_URL` e `DATABASE_URL_UNPOOLED`).
2. Defina `APP_SECRET` (string longa e aleatória, ex.: `openssl rand -base64 48`).
3. Faça o deploy. Em produção o build aplica as migrações (`prisma migrate deploy`); previews não mexem no banco.

Sem banco conectado o deploy continua funcionando: a API responde 503 e os jogos usam ranking local.

**Hospedagem estática (Netlify, GitHub Pages, itch.io):** publique `packages/web/dist` — os jogos funcionam no modo local (sem contas nem ranking global).

## Dados dos jogadores (localStorage)

| Chave | O quê |
|---|---|
| `ndc:profile`, `ndc:guest-name` | perfil local e último nome — **do hub, vale para todos os jogos** |
| `ndc:settings` | som e "menos movimento" (compartilhado) |
| `ndc:<jogo>:best`, `ndc:<jogo>:ranking` | recorde e top 10 **de cada jogo** |

Na primeira abertura depois da atualização, `migrateLegacyKeys` copia **uma única vez** as chaves antigas `nao-deixe-cair:*` para as novas (sem apagar as antigas e sem sobrescrever valores novos). Ninguém perde recorde, ranking nem perfil.

| `ndc:account` | nome da última conta online (só para mostrar na hora; a sessão de verdade é o cookie) |

Front online em `packages/web/src/shared/online/`: `api.ts` (cliente HTTP), `services.ts` (rotas), `player.ts` (conta online ou perfil local), `RankingController.ts` (ranking online/local, tokens, fallback) e `hooks.ts` (`usePlayer`, `useRanking`, usados pelo hub e pelos dois jogos).

## Arquitetura

```
packages/server/        API (Fastify + Prisma): src/modules/{auth,ranking}.routes.ts, prisma/schema.prisma, test/
packages/web/
index.html              hub (escolha de jogos)
bolinha/index.html      entrada do jogo da bolinha
aviao/index.html        entrada do Acrobata
corrida/index.html      entrada da Disparada
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
    corrida/            Disparada: física do pulo, padrões, gerador, planejador, render, som e telas
e2e/                    testes de navegador (hub + um por jogo)
```

Para adicionar um jogo: uma pasta em `packages/web/src/games/`, um `<jogo>/index.html`, uma entrada em `vite.config.ts` (`build.rollupOptions.input`), uma em `src/shared/games.ts` e, para ranking online, o id em `packages/server/src/lib/games.ts` (com o teto de pontos por segundo).

URLs de diagnóstico (nos três jogos): `?debug` expõe `window.__NDC__`; `?seed=N` fixa a semente. No Acrobata: `?fisica=voo` liga a física de voo com loops (deixada de lado; dentro dela `?controle=a|b` ligam os esquemas antigos) e `?debug&piloto` liga o piloto automático.

---

## Acrobata (jogo do avião)

### Física atual: a mesma da bolinha (padrão)

- O movimento vertical usa **a mesma função** do jogo da bolinha (`verticalAcceleration` em `src/games/bolinha/game/Physics.ts`, importada direto): gravidade 1150 u/s², propulsão 2350 u/s², reforço de 1,55× na inversão, subida máxima 430 u/s e queda máxima 480 u/s. Um teste compara passo a passo com a bolinha. Se a física da bolinha for recalibrada, o avião acompanha.
- O avião anda para a frente na mesma velocidade das barreiras da bolinha (150 → 285 u/s, curva `difficultyAt` da bolinha).
- **Segurar** sobe, **soltar** cai. O nariz só acompanha a direção do movimento (é visual).
- Tela fixa como a da bolinha: chão embaixo, teto em cima (o avião encosta e para, sem bater). Encostar no chão é batida.
- Sem loops neste modo. Continuam valendo anéis, raspões e rasante (passar rente ao chão e subir), com combo.
- Dificuldade própria deste modo (`ARCADE_DIFFICULTY` em `World.ts`): corredor 300 → 165 u, 1,6 → 5,5 obstáculos por trecho, rampa de 16 000 u. Com um jogador casual simulado, a mediana das partidas ficou entre ~52 s (descuidado) e ~107 s (cuidadoso). Um piloto automático sobrevive 120 s em todas as sementes testadas.

As seções abaixo descrevem a física de voo com loops, deixada de lado por enquanto e disponível em `?fisica=voo`.

### Física de voo (`?fisica=voo`) — controle: esquema C, "segurar sobe, toque + toque e segure dá o loop"

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

## Disparada (corrida infinita)

Inspirada no gênero de *Banana Kong* (corrida automática, pulo, planar, dash com medidor, perseguidor atrás), com identidade bem brasileira: uma **capivara** corre pela mata comendo **capim** (o que ela come todo dia), pula o rio onde o **jacaré** espera e foge de um **enxame de marimbondos**. Tudo desenhado em Canvas 2D e sons sintetizados — nenhum recurso de terceiros.

### Controles

| Ação | Toque | Teclado |
|---|---|---|
| Pular (na hora, sem esperar gesto) | tocar em qualquer lugar | Espaço / ↑ / W |
| Pulo alto e planar na descida (segurando uma folha de bananeira, até 0,9 s) | segurar | segurar |
| Balançar no cipó (agarra sozinha ao encostar no ar; solta no fim do balanço) | toque solta com impulso | Espaço solta · ↓ solta sem impulso |
| Descer rápido / atravessar o galho | deslizar ↓ | ↓ / S |
| **Disparada** (dash: 0,85 s, ×1,65 de velocidade, quebra pedras, espinhos e caixotes, afasta o enxame) | deslizar → ou botão **DISPARAR** | → / D / Shift |
| Pausar | botão ⏸ | Esc / P |

Toque curto = pulo baixo (~85 u, passa pedras pequenas); segurar = pulo cheio (~160 u, ~0,66 s no ar). Há pulo mínimo (o corte só vale após 0,08 s), 0,09 s de tolerância depois da beirada e 0,12 s de "toque guardado" antes de pousar.

### Regras

- Pedra de lado, espinhos ou cair no rio (o jacaré pega) = fim. Em cima de pedra dá para pousar (quinas de até 7 u sobem sozinhas).
- **Caixote**: atravessar atrasa (velocidade cai a 30 % e volta em 1,3 s) e o enxame se aproxima; pisar em cima quica (+10).
- **Cipós**: pendurados sobre rios largos e pedras; a capivara agarra ao encostar no ar, balança como pêndulo (sempre com força para chegar ao fim do balanço) e é lançada para a frente. Alguns rios só dá para atravessar pelo cipó.
- **Flor-mola**: encostar lança bem alto. **Galhos** (presos por cipós) são caminhos altos com frutas; dá para descer deles com ↓.
- **Enxame**: começa perto e vai ficando para trás (até 280 u) enquanto você corre; caixotes o aproximam, o dash afasta; se alcançar, acabou. Perto, a tela ganha borda vermelha e zumbido.
- **3 vidas por corrida** (corações ao lado da pausa), na mesma regra da Bolinha. Ao bater com vida sobrando, a tela **Ops!** oferece **CONTINUAR**: gasta uma vida e volta do mesmo ponto, com os mesmos pontos, a mesma velocidade e o capim do medidor; o trecho à frente (~1,8 s) fica limpo (chão contínuo, sem obstáculos, sem meio rio) e o enxame é afastado. **Encerrar corrida** termina ali. Sem vidas, a partida acaba e a próxima volta com 3. O ranking recebe **uma** pontuação por partida, no fim de verdade; o recorde já fica salvo em cada batida.
- **Anúncio para continuar (futuro):** o botão chama `rewardedAds.show('continue')` (`shared/ads/rewarded.ts`, o mesmo da Bolinha). Hoje `NoAds` libera na hora; ao plugar uma rede de anúncios, o botão vira "▶ ASSISTIR E CONTINUAR" e só continua se o anúncio for assistido até o fim. Ajustes em `CONTINUES` (`game/config.ts`).
- **Pontos** = metros + 5 por tufo de capim + 10 por quebra/pisão. 12 capins enchem o medidor do dash.
- **Chuva**: de vez em quando (≈30 % dos trechos de 450 m, nunca nos primeiros 150 m) o céu fecha, chove, troveja ao longe e aparece "CHUVA!". É só visual e som — a física e os obstáculos não mudam. Agenda em `rendering/weather.ts`.
- **Capim**: maço verde com contorno escuro, amarradinho de palha e disco creme atrás, para se destacar da mata em qualquer paleta e na chuva.
- **Bote do jacaré**: ao passar pulando por cima de um rio, o jacaré daquele rio salta da água de boca aberta e fecha logo **abaixo** das patas ("nhac!", respingo, "UFA!" quando passa raspando). É susto, não armadilha: um bote por rio, sem mudar a física, então quem pula certo nunca é pego. Quem cai no rio é pego por ele. Código em `rendering/gators.ts`.
- **Copa das árvores** (caminho alternativo, como as copas do Banana Kong): a partir de ~25 s aparece um cipó alto; pulando nele, o balanço lança a capivara para cima das copas, onde há muito capim e vãos curtos entre as árvores ("COPA DAS ÁRVORES!"). É opcional: embaixo o caminho continua, só com caixotes e pouco capim, e cair de uma copa nunca mata. A câmera sobe um pouco lá em cima (pulos normais não mexem nela). Padrão `copa` em `game/patterns.ts`; testes provam que todo agarrão no cipó chega à copa nas três velocidades.
- **Ímã de capim** (item especial): de vez em quando um capim do percurso vira um ímã de ferradura (nunca antes de 12 s, no mínimo 22 s entre um e outro, ~3–5 por partida longa). Pegando, por **8 s** os capins próximos (até 190 u à frente e para cima) voam até a capivara — inclusive os altos e os da copa. Enquanto dura: **embalo de +10% na velocidade** (sobe e desce em 0,5 s; não afasta o enxame — isso continua sendo papel da Disparada; todos os padrões são testados também a essa velocidade), **patas no ritmo da música** (uma passada por batida, com um quiquinho em cada tempo), **música de forró acelerado** (composição original sintetizada, acelera nos 2 últimos segundos e abaixa o zumbido do enxame), aura dourada pulsando, estrelinhas de arco-íris girando, rastro de brilho colorido, o ímã flutuando sobre a cabeça soltando raios até cada capim puxado, moldura dourada na tela e barra do tempo no HUD (tudo pisca no fim). Missão: "Pegue N ímãs de capim". Parâmetros em `MAGNET` (`game/config.ts`).
- **Escudo de vitória-régia** (item especial): uma folha de vitória-régia que aguenta **uma batida**. Os itens especiais dividem o mesmo sorteio (`ITEMS` em `game/config.ts`: nunca antes de 12 s, no mínimo 14 s entre um e outro). Com o escudo, a capivara ganha uma bolha verde e a folha nas costas. Batendo numa pedra ou em espinhos, a folha se gasta e o obstáculo é esmagado. Caindo no rio, surge uma trilha de vitórias-régias até a outra margem ("SALVA PELA VITÓRIA-RÉGIA!"). O enxame não é barrado pelo escudo.
- **Capim dourado** (item especial): um tufo de capim dourado, o do Jalapão, cintilando no caminho. Pegando, **todos os pontos valem o dobro por 10 s**: metros, capins e bônus. Os pontos ficam dourados, aparecem o selo "×2" e uma barrinha com o tempo que falta, e saem brilhinhos dourados da capivara. Tudo pisca nos 2 últimos segundos. Parâmetros em `GOLDEN` (`game/config.ts`).
- **Sem opção de "menos movimento"** na Disparada: efeitos fortes (tremida, clarões, raios) só são suavizados se o aparelho estiver com "reduzir movimento" ligado nas configurações de acessibilidade.
- **Missões em trios** (como Jetpack Joyride/Subway Surfers): sempre 3 objetivos ativos no menu e no fim da corrida (ex.: "Coma 25 capins numa corrida", "Balance em 2 cipós numa corrida", "Pise em 3 caixotes", "Corra 400 m sem bater em caixote", "Chegue ao inverno numa corrida"). Cumprir mostra um aviso na hora; com os três cumpridos, no fim da corrida a capivara **sobe de nível** e vem um trio novo, com alvos maiores (15 tipos, alguns só a partir do nível 2–3, como "Chegue à copa das árvores 2 vezes"). "Numa corrida" recomeça a cada partida (continuar é a mesma corrida); "no total" soma entre partidas. Salvo neste aparelho (`ndc:corrida:missions`); não muda os pontos do ranking. Código em `game/Missions.ts`.
- **Estações na ordem real**, em ciclo: **verão → outono → inverno → primavera → verão…**, 900 m cada. A troca é **lenta** (300 m, ~7–10 s de corrida): no inverno as araucárias vão tomando o lugar das árvores uma a uma, a geada cobre o chão aos poucos e a neve começa fininha. Outono tem folhas secas caindo; primavera, ipês roxos e amarelos florindo. Faixas: "OUTONO", "CHEGOU O INVERNO!", "PRIMAVERA!", "VERÃO".
- **Hora do dia** em ciclo independente (dia → entardecer → noite → amanhecer, 3.600 m), por cima da estação. Sem vaga-lumes no frio.
- **Chuva**: no máximo uma por estação (≈50 % das estações, 220–340 m), sempre **no miolo da estação, longe de qualquer troca** — nunca muda de cenário chovendo. Sobe e desce pela distância (60 m). No inverno, em vez de chuva cai **nevasca** ("NEVASCA!", sem trovão). Só visual: a física não muda. Código em `rendering/palette.ts` e `rendering/weather.ts`.

### Orientação

Paisagem (arena lógica 640×360): a corrida lateral precisa de visão à frente (~1–1,6 s). Em pé o jogo funciona numa faixa, com o aviso "Deite o celular"; nada força a orientação. Telas mais largas mostram mais caminho; mais altas, mais céu e terra.

### Percurso justo

- Obstáculos vêm de **padrões escritos em segundos** (`game/patterns.ts`): o `Builder` converte em distância pela velocidade prevista para quando a capivara chegar. "Um rio de 0,44 s" pede o mesmo pulo a 290 ou 480 u/s.
- Um **planejador** (`game/testing/planner.ts`) usa a mesma física e procura uma sequência de toques que atravessa: os testes provam que **os 22 padrões** são atravessáveis em três velocidades e três sementes sem bater em caixote, e que ele recusa trechos impossíveis.
- Um piloto automático (o planejador replanejando a cada pouso) sobrevive **150 s em 16 sementes** do percurso gerado de verdade.
- Jogadores **simulados** (pulam no meio da janela, com erro de tempo aleatório e toque ±25 %): mediana de **73 s** com ±25 ms e **27 s** com ±70 ms. É simulação, não medição com pessoas.

### Dificuldade (`game/Difficulty.ts`)

| Tempo | Nível | Novidades |
|---|---|---|
| 0–10 s | 0 | pedras, pedrona, caixote, riacho; 2,2 s iniciais livres |
| 10–25 s | 1 | rio médio, espinhos, duas pedras, galho, caixotes, flor-mola, cipó com capim |
| 25–45 s | 2 | pedra + rio, pedras juntas, rio largo, rio do cipó, ponte de galho, pedrona + caixote |
| 45–75 s | 3 | escada de galhos, espinhos longos (pedem planar), ritmo de três pulos |
| 75 s+ | 4 | galhos sobre rio comprido, corredor de obstáculos |

Velocidade 290 → 480 u/s (aproximação exponencial, τ = 70 s); folga entre padrões de 0,85–1,45 s, caindo até 0,25–0,6 s aos 90 s. Parâmetros em `game/config.ts`.

### Arquitetura

`game/` não conhece DOM nem React: `Physics.ts` (passo puro a 120 Hz, sem alocação), `Level.ts` (listas que se limpam atrás da tela), `Track.ts` (gerador), `Engine.ts` (estados, enxame, dash, pontos, eventos), `Gestures.ts` (deslizes). `rendering/` desenha (paletas, capivara, jacaré, efeitos em pools fixos); `hooks/useCorrida.ts` liga tudo ao `GameLoop`, `InputController`, `SynthAudio`, ranking e configurações do hub. Recorde e ranking em `ndc:corrida:best` / `ndc:corrida:ranking`; ranking online pelo mesmo backend (id `corrida`, teto de 200 pontos/s).

`?debug&piloto` liga o piloto automático no navegador.

## Bolinha

### Continuar de onde parou (3 vidas)

- Cada partida começa com **3 vidas** (corações no topo, ao lado da pausa). Ao bater com vida sobrando, aparece a tela **Bateu!**: **CONTINUAR** gasta uma vida e volta de onde parou — mesmos pontos, mesmo tempo (mesma velocidade), barreiras próximas removidas, bolinha alinhada ao próximo vão e contagem de "Prepare-se". **Encerrar partida** termina ali.
- Batendo sem vidas, a partida acaba; a próxima começa do zero, com 3 vidas de novo.
- O ranking recebe **uma** pontuação por partida, no fim de verdade (continuar não gera envios extras). O recorde pessoal é salvo já em cada batida.
- **Anúncio para continuar (futuro):** o botão chama `rewardedAds.show('continue')` (`packages/web/src/shared/ads/rewarded.ts`). Hoje `NoAds` libera na hora; para ligar anúncios, implemente `RewardedAds` com a rede escolhida e troque `rewardedAds` — o botão passa a dizer "▶ ASSISTIR E CONTINUAR" e só continua se o anúncio for assistido até o fim.
- Ajustes em `CONTINUES` (`src/games/bolinha/game/config.ts`): `lives` (vidas por partida) e `clearAhead` (espaço livre à frente ao continuar).

### Moedas e loja

- **Moedas** aparecem entre algumas barreiras (≈ 35 %), no trecho entre um vão e o próximo. Cada moeda vale 1, toca um "plim" (que sobe de tom em sequência) e é gravada na hora. Moedas **não** contam na pontuação do ranking.
- **Loja** (botão no menu): 6 bolinhas (Basquete, Sorriso, Futebol, Gelo, Planeta, Lava) e 4 rastros (Bolhas, Arco-íris, Estrelas, Fogo), de 20 a 150 moedas. Só visual: a colisão é a mesma. A prévia usa o mesmo desenho do jogo.
- Cada **rastro tem seu som** de toque e de propulsor: bolhas ("blup-blup" e bolhinhas enquanto segura), arco-íris (acorde de pentatônica), estrelas (sininho), fogo (labareda e estalos). Escolher o rastro na loja toca a prévia.
- Moedas ficam **um pouco fora da linha** entre os vãos (acima ou abaixo): é preciso arriscar para pegar, mas o desvio é limitado ao que a física permite naquele trecho.
- **Com conta, moedas e itens ficam na nuvem** (qualquer aparelho): `GET /api/games/:jogo/wallet`, `POST .../shop/buy` e `.../shop/equip`. O saldo nunca é definido pelo cliente: as moedas da partida são creditadas no servidor junto com o envio da pontuação (com teto pelo tempo de partida) e a compra confere saldo e preço no servidor, de forma atômica (sem descontar duas vezes).
- Na primeira vez que uma conta entra, as moedas e itens que estavam só neste aparelho vão para ela (`.../wallet/import`, uma vez por conta, até 2000 moedas) e saem do aparelho, para não duplicar em outra conta.
- Sem conta, a carteira fica em `ndc:bolinha:wallet` (neste aparelho); com conta, o aparelho guarda uma cópia (`ndc:bolinha:wallet:<conta>`) para abrir na hora.
- O **recorde** do menu e do HUD também segue a conta: ao entrar, vale o melhor entre o do aparelho e o da conta no ranking.
- Catálogo e preços: `game/cosmetics.ts` (front) e `packages/server/src/lib/shop.ts` (servidor); um teste garante que são iguais. Desenhos em `rendering/skins.ts`; regras das moedas em `COINS` (`game/config.ts`).

### Cenário que varia (estações, hora do dia e chuva)

Como na Disparada, o cenário muda o tempo todo enquanto a bolinha avança, em três camadas que andam em ritmos diferentes (as combinações variam a cada volta):

- **Estações em ciclo** — verão → outono → inverno → primavera → verão… (90 pontos cada; a troca acontece aos poucos nos últimos 30):
  - **Verão:** selva com palmeiras, cipós e macaquinhos (que gritam baixinho de vez em quando, de dia); barreiras de tronco.
  - **Outono:** árvores de copa laranja, folhas caindo, folhas secas no chão.
  - **Inverno:** montanhas nevadas, pinheiros, pinguins, flocos e pingentes; barreiras de gelo.
  - **Primavera:** cerejeiras, pétalas caindo, flores e borboletas.
- **Hora do dia em ciclo** (240 pontos por dia): dia → **entardecer** (sol desce e fica alaranjado, "ANOITECENDO…") → **noite** (lua, estrelas, vaga-lumes no verão e na primavera) → **amanhecer**. À noite a decoração escurece, mas as barreiras continuam fáceis de ver.
- **Chuva às vezes:** cerca de 30 % dos trechos de 60 pontos, sorteados por partida (começo sempre seco). Nuvens carregadas, gotas, relâmpago e trovão distantes e baixinhos, e som de chuva. No inverno vira **nevasca**.
- Tudo é só visual: física, barreiras e moedas não mudam. Com **Menos movimento**, nada balança ou cai e não há relâmpago.
- Ajustes em `SEASONS`, `DAY_CYCLE` e `RAIN` (`game/config.ts`); paletas e desenhos em `rendering/scenery.ts`; chuva em `rendering/weather.ts`.

Parâmetros em `src/games/bolinha/game/config.ts` e `Difficulty.ts`. Detalhes do jogo, do ranking e do som estão nos comentários do código e nos testes (`src/games/bolinha/__tests__`).

## Limitações conhecidas

- A calibragem do Acrobata foi feita com simulação e testes em Chromium (desktop e emulação de celular), **não em aparelho físico**. O ajuste fino de sensação (força da puxada, rasante, sons no alto-falante do iPhone) precisa de partidas reais.
- A duração das partidas foi estimada com um "jogador casual" simulado (reação de 0,15–0,25 s e erros aleatórios): mediana entre ~27 s (descuidado) e ~85 s (cuidadoso). Jogadores reais podem diferir.
- iOS não tem `navigator.vibrate`: lá a vibração simplesmente não acontece.
- O recorde pessoal mostrado no menu ainda é o deste aparelho; o melhor da conta aparece no ranking online.
- Disparada: toda a calibragem (pulo, planar, folgas, enxame) foi feita com simulação e Chromium (desktop e emulação de celular), **não em aparelho físico**. Em pé, a faixa do jogo fica pequena (o aviso pede para deitar). Fora da 1ª versão: animais montáveis, cipós de balançar, loja e missões.
- Dois testes do servidor (`empate: quem fez primeiro fica na frente` e `o melhor da conta na semana…`) já falhavam antes da Disparada no Postgres local deste ambiente; não foram alterados.
- O anti-trapaça é básico (token + teto por tempo): quem editar o jogo no navegador ainda consegue enviar pontuações plausíveis.
