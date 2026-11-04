import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import './lib/i18n';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('index.html is missing #root');

// A new deploy takes over and reloads the page at once, so a reload never keeps showing the
// previous build from the service-worker cache.
registerSW({ immediate: true });

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
