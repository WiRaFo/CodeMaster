import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/marck-script';
import './i18n/index.ts';
import './styles/index.css';
import { App } from './app/App.tsx';

const container = document.getElementById('root');
if (!container) throw new Error('Нет элемента #root');
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
