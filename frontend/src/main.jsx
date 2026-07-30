import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App.jsx';
import VersionWatcher from './components/VersionWatcher.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Toaster position="top-right" />
        <VersionWatcher />
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
