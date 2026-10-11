import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider } from './i18n/react';
import { App } from './ui/App';
import './ui/styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
);
