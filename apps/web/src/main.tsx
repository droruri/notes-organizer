import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './lib/i18n';
import './styles.css';

// On a touch screen the keyboard checks spelling itself. The browser's own check makes Chrome on
// Android open a suggestions popup when a misspelled word is tapped, and that popup closes the
// keyboard, so the typo can't be fixed by typing. Every field inherits `spellcheck` from here.
if (window.matchMedia('(pointer: coarse)').matches) document.documentElement.spellcheck = false;

const root = document.getElementById('root');
if (!root) throw new Error('index.html is missing #root');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
