import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { startAnalytics } from '../shared/analytics';
import '../shared/ui/game.css';
import './hub.css';
import { Hub } from './Hub';

startAnalytics();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Hub />
  </StrictMode>,
);
