import React, { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { X, ExternalLink, KeyRound, AlertCircle, Copy, Check, Smartphone } from 'lucide-react';

const GoogleNativeAuth = registerPlugin('GoogleNativeAuth');

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

export const isNativePlatform = () => {
  return typeof window !== 'undefined' && (
    Capacitor.isNativePlatform() ||
    window.Capacitor?.isNativePlatform?.() ||
    window.location.protocol === 'capacitor:' ||
    (window.location.hostname === 'localhost' && !window.location.port)
  );
};

// Safe boundary so GoogleLogin failures never crash the React tree
class GoogleLoginBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(err) {
    console.warn('[GoogleAuthButton] GoogleLogin component error, falling back:', err);
    if (this.props.onError) {
      this.props.onError();
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

export const GoogleAuthButton = ({
  onSuccess,
  onError,
  text = 'continue_with'
}) => {
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [hasGoogleError, setHasGoogleError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);

  const isNative = isNativePlatform();
  const [attemptLogin, setAttemptLogin] = useState(!isNative);

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://taskflow.zerosyntax.in';

  const handleCopyOrigin = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(currentOrigin);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleGoogleFailure = () => {
    setHasGoogleError(true);
    onError?.();
  };

  const handleNativeGoogleSignIn = async () => {
    setIsSigningIn(true);
    setHasGoogleError(false);
    try {
      const activeClientId = googleClientId || '870153795095-rnaveq3voksmqq78qoljjp6ccleuuegr.apps.googleusercontent.com';
      const res = await GoogleNativeAuth.signIn({ clientId: activeClientId });
      if (res?.idToken) {
        await onSuccess?.({ credential: res.idToken });
      } else {
        handleGoogleFailure();
      }
    } catch (err) {
      console.warn('[GoogleAuthButton] Native Google Sign-In error:', err);
      setHasGoogleError(true);
      onError?.(err?.message || 'Google sign-in was canceled or failed');
    } finally {
      setIsSigningIn(false);
    }
  };

  const renderModal = () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-2xl">
              {isNative ? <Smartphone className="w-5 h-5" /> : <KeyRound className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                {isNative ? 'Sign In on Mobile' : 'Authorize Domain for Google Sign-In'}
              </h3>
              <p className="text-xs text-slate-400">
                {isNative ? 'Mobile app authentication details' : 'Add this domain to Google Cloud Console'}
              </p>
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

        {isNative ? (
          <div className="p-3.5 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900 rounded-2xl text-xs text-indigo-900 dark:text-indigo-200 space-y-2.5">
            <div className="font-semibold flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-indigo-600" />
              <span>Android App Authentication</span>
            </div>
            <p className="leading-relaxed">
              Google uses native Google Play Services on Android. If tapping Continue with Google does not open your accounts:
            </p>
            <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-indigo-100 dark:border-indigo-800/60 space-y-2 text-slate-700 dark:text-slate-300">
              <div className="font-semibold text-slate-900 dark:text-white">Alternative sign-in options on Android:</div>
              <ul className="list-disc pl-4 space-y-1">
                <li><strong>Email OTP:</strong> Instant 6-digit verification code sent to your email inbox without needing a password.</li>
                <li><strong>Email & Password:</strong> Standard secure login with your registered account password.</li>
                <li><strong>Web Portal:</strong> Visit <a href="https://taskflow.zerosyntax.in" target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 underline font-medium">taskflow.zerosyntax.in</a>.</li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-2xl text-xs text-amber-800 dark:text-amber-200 space-y-2">
            <div className="font-semibold flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
              <span>Origin Not Allowed in Google Client ID</span>
            </div>
            <p className="leading-relaxed text-amber-700 dark:text-amber-300">
              Google blocks OAuth requests if the current domain is not in your <strong>Authorized JavaScript origins</strong>.
            </p>
            <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-amber-200 dark:border-amber-800/60 flex items-center justify-between gap-2">
              <code className="font-mono text-indigo-600 dark:text-indigo-300 text-[11px] font-bold">
                {currentOrigin}
              </code>
              <button
                type="button"
                onClick={handleCopyOrigin}
                className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[10px] font-semibold flex items-center gap-1 transition-colors"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'Copied' : 'Copy Origin'}</span>
              </button>
            </div>
          </div>
        )}

        {!isNative && (
          <div className="space-y-2.5 text-xs text-slate-600 dark:text-slate-300">
            <div className="font-semibold text-slate-800 dark:text-slate-100">Quick 3-step fix:</div>
            <ol className="list-decimal pl-4 space-y-2 leading-relaxed">
              <li>
                Open <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 underline font-medium inline-flex items-center gap-0.5">Google Cloud Credentials <ExternalLink className="w-3 h-3" /></a>.
              </li>
              <li>
                Click your Web Client ID (ending in <span className="font-mono text-[11px]">...apps.googleusercontent.com</span>).
              </li>
              <li>
                Under <strong>Authorized JavaScript origins</strong>, click <strong>+ ADD URI</strong> and paste:
                <div className="mt-1 font-mono text-[11px] bg-slate-100 dark:bg-slate-800 p-2 rounded-lg text-indigo-600 dark:text-indigo-400">
                  {currentOrigin}
                </div>
              </li>
              <li>
                Click <strong>Save</strong>. Changes become active in about 60 seconds.
              </li>
            </ol>
          </div>
        )}

        <div className="pt-3 flex flex-wrap justify-between items-center gap-2 border-t border-slate-100 dark:border-slate-800 text-xs">
          {!isNative && (
            <button
              type="button"
              onClick={() => {
                try {
                  localStorage.setItem('tm_google_allowed', 'true');
                } catch {}
                setAttemptLogin(true);
                setShowSetupModal(false);
              }}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition-colors"
            >
              I added this domain (Try Sign-In)
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowSetupModal(false)}
            className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium transition-colors ml-auto"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );

  const fallbackButton = (
    <div className="w-full flex flex-col items-center py-1">
      <button
        type="button"
        disabled={isSigningIn}
        onClick={isNative ? handleNativeGoogleSignIn : () => setShowSetupModal(true)}
        className="w-full max-w-[360px] flex items-center justify-center gap-3 px-4 py-2.5 rounded-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-xs disabled:opacity-60"
      >
        {isSigningIn ? (
          <>
            <div className="w-4 h-4 border-2 border-slate-400 border-t-indigo-600 rounded-full animate-spin" />
            <span>Connecting to Google...</span>
          </>
        ) : (
          <>
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
          </>
        )}
      </button>
      {hasGoogleError && !isNative && (
        <span className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
          Domain not yet authorized in Google Console. Click above for instructions.
        </span>
      )}
      {hasGoogleError && isNative && (
        <button
          type="button"
          onClick={() => setShowSetupModal(true)}
          className="mt-1 text-[11px] text-amber-600 dark:text-amber-400 hover:underline"
        >
          Google sign-in issue? Tap here for setup help & options.
        </button>
      )}
      {showSetupModal && renderModal()}
    </div>
  );

  // If on native platform, do NOT render @react-oauth/google (it requires Google Web GSI & GoogleOAuthProvider)
  if (isNative) {
    return fallbackButton;
  }

  // If Google is configured with a valid client ID, origin is allowed/attempted, and no fatal error occurred yet
  if (isGoogleConfigured && googleClientId && !hasGoogleError && attemptLogin) {
    return (
      <GoogleLoginBoundary onError={handleGoogleFailure} fallback={fallbackButton}>
        <div className="w-full flex flex-col items-center py-1">
          <GoogleLogin
            onSuccess={onSuccess}
            onError={handleGoogleFailure}
            theme="outline"
            shape="pill"
            text={text}
            size="large"
            width={360}
          />
          <button
            type="button"
            onClick={() => setShowSetupModal(true)}
            className="mt-1.5 text-[11px] text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1 transition-colors"
          >
            <span>Google sign-in help & domain authorization</span>
          </button>

          {showSetupModal && renderModal()}
        </div>
      </GoogleLoginBoundary>
    );
  }

  // Fallback button if Google Client ID is not configured or error occurred
  return fallbackButton;
};
