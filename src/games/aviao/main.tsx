import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../../shared/ui/game.css';
import { HubBack } from '../../shared/ui/HubBack';

// Provisório: o jogo do avião entra no próximo passo.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main className="app">
      <div className="surface" style={{ display: 'grid', placeItems: 'center' }}>
        <HubBack />
        <p className="howto">Em construção.</p>
      </div>
    </main>
  </StrictMode>,
);
