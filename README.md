# Não Deixe Cair

Arcade casual de sobrevivência infinita para navegador (prioridade para celular).
**Segure para subir. Solte para cair. Passe pelos vãos das barreiras.**

React 19 + TypeScript + Vite + Canvas 2D. Sem backend, sem contas, sem anúncios, sem dependências de execução além de React. Funciona offline depois de carregado.

## Rodar localmente

```bash
npm install
npm run dev          # http://localhost:5173 (também acessível pela rede local, para testar no celular)
```

## Testes e qualidade

```bash
npm test             # testes unitários (Vitest): física, colisão, gerador, estados, pontuação, entrada, layout
npm run lint         # ESLint
npm run typecheck    # TypeScript estrito
```

Teste de fumaça em navegador real (opcional, requer Python + Playwright com Chromium):

```bash
npm run build && npx vite preview --port 4173
python3 e2e/smoke.py http://localhost:4173 e2e/screens
```

## Build de produção e publicação

```bash
npm run build        # gera dist/
npm run preview      # confere o build localmente
```

`dist/` é 100 % estático e usa caminhos relativos (`base: './'`), então pode ser publicado em qualquer subpasta:

- **Netlify / Cloudflare Pages / Vercel:** comando de build `npm run build`, pasta de saída `dist`.
- **GitHub Pages:** envie o conteúdo de `dist/` para a branch `gh-pages` (ou use a action oficial `actions/deploy-pages` com `path: dist`).
- **itch.io:** compacte o conteúdo de `dist/` em .zip e envie como projeto HTML.

## Parâmetros de ajuste

Tudo que afeta a sensação de jogo está centralizado:

- `src/game/config.ts` — física (gravidade, propulsão, reforço de inversão, velocidades máximas, raio, hitbox), barreiras e pontuação.
- `src/game/Difficulty.ts` — curva de dificuldade (velocidade, espaçamento, vão, deslocamento vertical).

URL de diagnóstico: `?debug` expõe `window.__NDC__` (motor, laço) e `?seed=N` fixa a semente das barreiras.

## Arquitetura

```
src/
  app/        App.tsx, GameScreen.tsx       telas (menu, pausa, fim) em React
  hooks/      useGame.ts                    integra motor ↔ React ↔ canvas ↔ entrada
  game/       GameEngine, Physics, Collision, ObstacleManager, Difficulty,
              ScoreManager, GameLoop, config, types, random
  game/testing/autopilot.ts                 piloto automático usado nos testes de justiça
  rendering/  CanvasRenderer, effects, layout
  input/      InputController.ts            Pointer Events + teclado
  platform/   audio.ts (Web Audio sintetizado), settings.ts
  __tests__/  testes Vitest
e2e/smoke.py  teste em navegador real (Playwright)
```

A simulação (`game/`) não conhece DOM nem React. O React só re-renderiza quando o estado da partida muda; pontuação e HUD são desenhados no canvas.
