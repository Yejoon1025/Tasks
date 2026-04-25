import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Design tokens must load before any component stylesheet
import './styles/tokens.css';
import './styles/global.css';

import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
