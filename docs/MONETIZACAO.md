# Monetização da Disparada — intersticiais e revive por anúncio

Só a **Disparada** (capivara) tem anúncios. Bolinha e Acrobata não importam o módulo e não mudaram.
**Sem configuração, os anúncios ficam desligados** e o jogo funciona exatamente como antes (3 vidas grátis, sem última chance).

## Rede usada

Google **H5 Games Ads** via **Ad Placement API** (`adBreak()` / `adConfig()` sobre o `adsbygoogle.js` do AdSense).
Documentação oficial: <https://developers.google.com/ad-placement> — referência de [`adBreak`](https://developers.google.com/ad-placement/apis/adbreak), [`adConfig`](https://developers.google.com/ad-placement/apis/adconfig), [tipos de posicionamento](https://developers.google.com/ad-placement/docs/placement-types), [frequência](https://developers.google.com/ad-placement/docs/ad-rate) e [modo de teste](https://developers.google.com/ad-placement/docs/test).

| Posicionamento | Tipo na API | Quando |
|---|---|---|
| `corrida-restart` | `start` (reinício de jogo) | jogador toca "Correr de novo"/"Jogar novamente" (ou Enter) depois de uma partida concluída, se a política permitir |
| `corrida-revive` | `reward` | tela de "última chance" (vidas grátis acabaram); só aparece se a rede disser que há anúncio (`beforeReward`) |

A recompensa (reviver) só é dada no callback **`adViewed`**. `adDismissed`, erro, tempo-limite ou qualquer `breakStatus` sem `adViewed` = sem recompensa.

## Arquitetura

```
packages/web/src/shared/monetization/
  config.ts            variáveis de ambiente → configuração (padrões seguros, validação, limites)
  policy.ts            política de frequência pura (sessionStorage; sem DOM/rede)
  monetization.ts      fachada: travas anti-duplicidade, tempos-limite, oferta de recompensa (RewardedOffer)
  types.ts             contrato provedor ↔ fachada
  providers/googleH5.ts   Ad Placement API (script, adConfig, adBreak start/reward)
  providers/off.ts        desligado: nunca anúncio, nunca recompensa
  providers/devSimulated.ts  SÓ em `npm run dev`: painel "ANÚNCIO SIMULADO — DESENVOLVIMENTO"
  index.ts             getMonetization('corrida') monta tudo
packages/web/src/games/corrida/
  app/useAds.ts        cola React ↔ monetização (jogar de novo, oferta de revive)
  app/GameScreen.tsx   tela "Fim das vidas" (última chance)
  game/Engine.ts       `adRevives`, `lastChance`, `reviveWithReward()` — o motor não sabe de anúncios
```

Fluxo da última chance:

1. Bate com vidas grátis → tela "Ops!" de sempre (CONTINUAR grátis).
2. Bate sem vidas e com revive disponível → estado `CONTINUE` com `lastChance` (a partida **não** terminou: ranking e missões ainda não registraram o fim).
3. A tela mostra pontos, distância e recorde; **Jogar novamente** (principal), **▶ Assistir anúncio para continuar** (secundário, com "Preparando anúncio…" enquanto a rede responde) e **Ver resultado**.
4. Viu até o fim → `reviveWithReward()`: mesma partida, mesmos pontos/distância/tempo, chão seguro e trecho livre à frente, enxame afastado, contagem curta.
5. Fechou antes / sem anúncio → nada muda; o jogador escolhe jogar de novo ou ver o resultado.
6. Uma revivida por partida (configurável). Depois dela, a próxima batida encerra de vez.

Garantias da fachada: um intersticial por vez (cliques repetidos recebem a mesma promessa), impressão só conta quando o anúncio aparece (`beforeAd`), callbacks repetidos/atrasados ignorados, `claim()` da recompensa vale uma vez, tempo-limite se a rede não responder, e anúncios só são pedidos depois do `onReady` (com o script bloqueado nada fica na fila para surgir no meio da corrida). Se um anúncio aparecer mesmo assim durante a corrida, o jogo pausa e silencia.

## Configuração (variáveis do Vite)

Defina no painel da Vercel (projeto → Settings → Environment Variables, serviço `web`) ou em `packages/web/.env.local`. Mudanças exigem novo build/deploy.

| Variável | Padrão | O que faz |
|---|---|---|
| `VITE_ADS_PROVIDER` | `off` | `off`, `google` ou `dev` (dev só funciona em `npm run dev`) |
| `VITE_ADSENSE_CLIENT` | — | Publisher ID `ca-pub-…` (obrigatório para `google`; inválido → desliga) |
| `VITE_ADS_TEST_MODE` | `off` | `on` liga `data-adbreak-test` (anúncios de exemplo do Google). **Desligar em produção.** |
| `VITE_ADS_INTERSTITIAL` | `on` | `off` desliga só os intersticiais |
| `VITE_ADS_INTERSTITIAL_EVERY_RUNS` | `3` | um intersticial a cada N partidas concluídas (mín. 2 — a 1ª derrota nunca tem anúncio) |
| `VITE_ADS_INTERSTITIAL_MIN_INTERVAL_S` | `120` | intervalo mínimo entre intersticiais (30–900 s); também vira o `data-ad-frequency-hint` |
| `VITE_ADS_REWARDED_REVIVES` | `1` | revives por anúncio por partida (`0` desliga a última chance) |

Regras do intersticial (`policy.ts`): partida concluída = chegou à tela de resultado (inclui "Jogar novamente" na última chance). É devido quando houve ≥ 2 partidas na sessão, ≥ N desde o último intersticial **exibido** e passou o intervalo mínimo desde o último anúncio (ou desde o início da sessão). Se a rede não tinha anúncio, a próxima partida continua elegível. Um anúncio com recompensa visto reinicia o relógio (não emenda intersticial logo depois). O estado fica no `sessionStorage` (`ndc:corrida:ads`), então recarregar a página não libera anúncio extra. O Google também aplica o próprio limite de frequência (`frequencyCapped`).

Para ajustar após métricas: comece com 3 partidas / 120 s; se a retenção (partidas por sessão) não cair, teste 3 / 90 s. Os resultados aparecem nos relatórios do AdSense pelos nomes `corrida-restart` e `corrida-revive`.

## Testar

```bash
npm test -w @ndc/web                 # inclui monetization/*.test.ts e corrida/revive-ad.test.ts (mocks, sem rede)

cd packages/web
VITE_ADS_PROVIDER=dev npx vite --port 5173          # anúncios SIMULADOS, só em dev
python3 e2e/corrida_ads.py http://localhost:5173 e2e/screens
# na mão: http://localhost:5173/corrida/?ads=dev      (&fill=0 simula "sem anúncio")
```

Com uma conta aprovada, teste a integração real antes de publicar: `VITE_ADS_PROVIDER=google`, `VITE_ADSENSE_CLIENT=ca-pub-…`, `VITE_ADS_TEST_MODE=on` (num deploy de preview da Vercel). O modo de teste do Google alterna entre "tem anúncio" e "não tem", mas não detecta erro de configuração do AdSense.

## O que falta para ligar de verdade (externo ao código)

1. **Conta AdSense aprovada** com o domínio do jogo (ex.: o domínio de produção da Vercel) adicionado e verificado em *Sites*.
2. **Acesso ao H5 Games Ads**: é por inscrição (formulário em <https://adsense.google.com/start/h5-beta>); a aprovação depende de critérios do Google e não é garantida.
3. **`ads.txt`** na raiz do domínio com a linha que o AdSense indicar (`google.com, pub-…, DIRECT, f08c47fec0942fa0`). Basta criar `packages/web/public/ads.txt` com o conteúdo exato mostrado no painel.
4. **Consentimento/privacidade**: para visitantes do EEE/Reino Unido/Suíça o Google exige uma CMP certificada (o AdSense oferece a mensagem de privacidade do próprio Google em *Privacidade e mensagens*). Publique também uma política de privacidade que mencione anúncios/cookies.
5. Variáveis na Vercel: `VITE_ADS_PROVIDER=google`, `VITE_ADSENSE_CLIENT=ca-pub-…` e redeploy.
6. Ler e seguir as políticas do AdSense para jogos H5 (anúncio com recompensa sempre opcional e explícito; sem incentivar cliques).
