import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import '../shared/ui/game.css';
import './hub.css';
import { Hub } from './Hub';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Hub />
    <Analytics />
  </StrictMode>,
);
