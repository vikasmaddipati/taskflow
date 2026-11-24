import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { Capacitor } from '@capacitor/core';
import './index.css';
import App from './App.jsx';
import { ErrorBoundary } from './components/common/ErrorBoundary.jsx';
import { isGoogleConfigured, googleClientId } from './components/auth/GoogleAuthButton.jsx';

const isNative = typeof window !== 'undefined' && (
  Capacitor.isNativePlatform() ||
  window.Capacitor?.isNativePlatform?.() ||
  window.location.protocol === 'capacitor:' ||
  (window.location.hostname === 'localhost' && !window.location.port)
);

const root = createRoot(document.getElementById('root'));

root.render(
  <StrictMode>
    <ErrorBoundary>
      {!isNative && isGoogleConfigured && googleClientId ? (
        <GoogleOAuthProvider clientId={googleClientId}>
          <App />
        </GoogleOAuthProvider>
      ) : (
        <App />
      )}
    </ErrorBoundary>
  </StrictMode>
);

// Register Progressive Web App (PWA) Service Worker for offline shell and data caching only on Web
if (typeof window !== 'undefined' && 'serviceWorker' in navigator && !isNative && import.meta.env.MODE !== 'test') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('[PWA] Service worker registration failed:', err);
    });
  });
} else if (isNative && typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  // Ensure any stale service workers from local web tests are cleaned up inside native webview
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((reg) => reg.unregister());
  }).catch(() => {});
}
