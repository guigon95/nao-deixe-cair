import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../../shared/ui/game.css';
import './corrida.css';
import { GameScreen } from './app/GameScreen';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main className="app">
      <GameScreen />
    </main>
  </StrictMode>,
);
