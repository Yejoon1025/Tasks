/**
 * main.jsx — React entry point.
 *
 * Mounts <App /> into #root.  Design tokens (tokens.css) are imported first
 * so that CSS custom properties are defined before any component stylesheet
 * tries to use them.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// tokens.css must be first — it defines all CSS custom properties
import './styles/tokens.css';
import './styles/global.css';

import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
