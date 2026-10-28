import React, { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { X, ExternalLink, KeyRound, AlertCircle } from 'lucide-react';

const rawClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
export const isGoogleConfigured = Boolean(
  rawClientId &&
  typeof rawClientId === 'string' &&
  rawClientId.trim() !== '' &&
  !rawClientId.includes('placeholder') &&
  !rawClientId.includes('your_google_client_id') &&
  rawClientId.endsWith('.apps.googleusercontent.com')
);

export const googleClientId = isGoogleConfigured ? rawClientId.trim() : null;

export const GoogleAuthButton = ({
  onSuccess,
  onError,
  text = 'continue_with'
}) => {
  const [showSetupModal, setShowSetupModal] = useState(false);

  // If Google is configured with a valid client ID, render the official Google Identity Services button
  if (isGoogleConfigured && googleClientId) {
    return (
      <div className="w-full flex justify-center py-1">
        <GoogleLogin
          onSuccess={onSuccess}
          onError={onError}
          theme="outline"
          shape="pill"
          text={text}
          size="large"
          width={360}
        />
      </div>
    );
  }

  // If Google Client ID is not yet configured, render a clean fallback button that explains setup
  return (
    <>
      <div className="w-full flex justify-center py-1">
        <button
          type="button"
          onClick={() => setShowSetupModal(true)}
          className="w-full max-w-[360px] flex items-center justify-center gap-3 px-4 py-2.5 rounded-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-750 transition-all shadow-xs"
        >
          {/* Official Google 'G' SVG Logo */}
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
            />
            <path
              fill="#FBBC05"
              d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.14-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
            />
          </svg>
          <span>Continue with Google</span>
        </button>
      </div>

      {/* Google Setup Guide Modal */}
      {showSetupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-2xl">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                    Google OAuth Setup Required
                  </h3>
                  <p className="text-xs text-slate-400">Configure your Google Client ID to enable sign-in</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSetupModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-2xl text-xs text-amber-800 dark:text-amber-200 space-y-1.5">
              <div className="font-semibold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                <span>Google Client ID not found in environment</span>
              </div>
              <p className="leading-relaxed text-amber-700 dark:text-amber-300">
                To sign in with Google without getting "Error 401: invalid_client" or 403 errors, a Google Cloud OAuth 2.0 Web Client ID must be configured in your environment files.
              </p>
            </div>

            <div className="space-y-2.5 text-xs text-slate-600 dark:text-slate-300">
              <div className="font-semibold text-slate-800 dark:text-slate-100">Quick 4-step setup:</div>
              <ol className="list-decimal pl-4 space-y-2 leading-relaxed">
                <li>
                  Open <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 underline font-medium inline-flex items-center gap-0.5">Google Cloud Console <ExternalLink className="w-3 h-3" /></a> and create or select a project.
                </li>
                <li>
                  Configure your <strong>OAuth Consent Screen</strong> (External, App Name: TaskFlow).
                </li>
                <li>
                  Go to <strong>Credentials ➔ Create Credentials ➔ OAuth client ID</strong>:
                  <ul className="list-disc pl-4 mt-1 space-y-1 text-slate-500">
                    <li>Application type: <strong>Web application</strong></li>
                    <li>Authorized JavaScript origins: <code className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-indigo-600 dark:text-indigo-300">http://localhost:5173</code></li>
                  </ul>
                </li>
                <li>
                  Copy the generated Client ID and add it to:
                  <div className="mt-1 bg-slate-900 text-slate-200 p-2.5 rounded-xl font-mono text-[11px] space-y-1">
                    <div>client/.env: <span className="text-emerald-400">VITE_GOOGLE_CLIENT_ID=your_id.apps.googleusercontent.com</span></div>
                    <div>server/.env: <span className="text-emerald-400">GOOGLE_CLIENT_ID=your_id.apps.googleusercontent.com</span></div>
                  </div>
                </li>
              </ol>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setShowSetupModal(false)}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
