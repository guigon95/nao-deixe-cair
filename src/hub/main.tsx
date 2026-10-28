import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../shared/ui/game.css';
import './hub.css';
import { Hub } from './Hub';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Hub />
  </StrictMode>,
);
