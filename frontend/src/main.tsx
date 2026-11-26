import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import router from './router';
import { initInstallPrompt } from './utils/installPrompt';
import './styles/global.scss';

// Before rendering, so an early install event isn't missed
initInstallPrompt();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
