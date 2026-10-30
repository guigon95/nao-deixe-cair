import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { startAnalytics } from '../../shared/analytics';
import { App } from './app/App';
import '../../shared/ui/game.css';

startAnalytics();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
