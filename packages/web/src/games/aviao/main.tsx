import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import '../../shared/ui/game.css';
import './aviao.css';
import { GameScreen } from './app/GameScreen';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main className="app">
      <GameScreen />
    </main>
    <Analytics />
  </StrictMode>,
);
