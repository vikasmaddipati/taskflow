import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleOAuthProvider } from '@react-oauth/google';
import './index.css';
import App from './App.jsx';
import { isGoogleConfigured, googleClientId } from './components/auth/GoogleAuthButton.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isGoogleConfigured && googleClientId ? (
      <GoogleOAuthProvider clientId={googleClientId}>
        <App />
      </GoogleOAuthProvider>
    ) : (
      <App />
    )}
  </StrictMode>
);
