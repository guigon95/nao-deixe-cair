import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { startAnalytics } from '../../shared/analytics';
import '../../shared/ui/game.css';
import './cobrinha.css';
import { GameScreen } from './app/GameScreen';

startAnalytics();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main className="app">
      <GameScreen />
    </main>
  </StrictMode>,
);
