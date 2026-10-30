import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  CheckCircle,
  KeyRound,
  ShieldCheck,
  RefreshCw
} from 'lucide-react';
import { GoogleAuthButton } from '../components/auth/GoogleAuthButton';
import { useAuth } from '../context/AuthContext';

export const AuthView = () => {
  // Modes: 'login' | 'register' | 'otp_request' | 'otp_verify' | 'forgot_email' | 'forgot_verify' | 'forgot_new_password' | 'forgot_success'
  const [mode, setMode] = useState('login');

  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Status & feedback
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [statusMessage, setStatusMessage] = useState(null);

  // Resend OTP countdown (60 seconds)
  const [resendTimer, setResendTimer] = useState(0);

  const {
    login,
    register,
    loginWithGoogle,
    requestEmailOtp,
    verifyEmailOtp,
    verifyEmail,
    resendVerification,
    requestForgotPassword,
    verifyResetOtp,
    completePasswordReset,
    authError,
    setAuthError
  } = useAuth();

  useEffect(() => {
    let interval = null;
    if (resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [resendTimer]);

  const switchMode = (newMode) => {
    setMode(newMode);
    setValidationError('');
    setStatusMessage(null);
    setAuthError(null);
  };

  // 1. Password Login
  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    setValidationError('');
    if (!email.trim() || !password) {
      setValidationError('Please enter email and password');
      return;
    }
    setIsSubmitting(true);
    await login(email.trim(), password);
    setIsSubmitting(false);
  };

  // 2. Registration
  const handleRegister = async (e) => {
    e.preventDefault();
    setValidationError('');
    if (!name.trim()) {
      setValidationError('Please enter your full name');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setValidationError('Please enter a valid email address');
      return;
    }
    if (password.length < 6) {
      setValidationError('Password must be at least 6 characters');
      return;
    }
    setIsSubmitting(true);
    const res = await register(name.trim(), email.trim(), password);
    setIsSubmitting(false);
    if (res?.success && res?.requiresVerification) {
      setMode('verify_email');
      setStatusMessage('Account created! Please enter the 6-digit verification code sent to your email.');
      setResendTimer(60);
    }
  };

  // 2b. Handle Email Verification Code Submission
  const handleVerifyEmail = async (e) => {
    e.preventDefault();
    setValidationError('');
    if (otp.length !== 6) {
      setValidationError('Please enter all 6 digits of your verification code');
      return;
    }
    setIsSubmitting(true);
    const res = await verifyEmail(email.trim(), otp);
    setIsSubmitting(false);
    if (!res?.success) {
      setValidationError(res?.message || 'Verification failed');
    }
  };

  // 2c. Resend Verification Code
  const handleResendVerification = async () => {
    if (resendTimer > 0) return;
    setIsSubmitting(true);
    const res = await resendVerification(email.trim());
    setIsSubmitting(false);
    if (res?.success) {
      setResendTimer(60);
      setStatusMessage('A new verification code has been dispatched to your email.');
    } else {
      setValidationError(res?.message || 'Failed to resend code');
    }
  };

  // 3. Google Sign-In Success Handler
  const handleGoogleSuccess = async (credentialResponse) => {
    setValidationError('');
    if (credentialResponse.credential) {
      setIsSubmitting(true);
      await loginWithGoogle(credentialResponse.credential);
      setIsSubmitting(false);
    } else {
      setValidationError('Google did not return credentials. Please try again.');
    }
  };

  const handleGoogleError = () => {
    setValidationError(
      'Google sign-in was closed or failed. Ensure GOOGLE_CLIENT_ID is configured in server/.env and client/.env.'
    );
  };

  // 4. Request Email OTP (Login)
  const handleRequestEmailOtp = async (e) => {
    e.preventDefault();
    setValidationError('');
    if (!email.trim() || !email.includes('@')) {
      setValidationError('Please enter a valid email address');
      return;
    }
    setIsSubmitting(true);
    const res = await requestEmailOtp(email.trim());
    setIsSubmitting(false);
    if (res.success) {
      setResendTimer(60);
      setStatusMessage(res.message);
      setMode('otp_verify');
    }
  };

  // 5. Verify Email OTP
  const handleVerifyEmailOtp = async (e) => {
    e.preventDefault();
    setValidationError('');
    if (!otp || otp.trim().length !== 6) {
      setValidationError('Please enter the complete 6-digit verification code');
      return;
    }
    setIsSubmitting(true);
    await verifyEmailOtp(email.trim(), otp.trim(), name.trim());
    setIsSubmitting(false);
  };

  // 6. Resend Email OTP
  const handleResendOtp = async () => {
    if (resendTimer > 0 || isSubmitting) return;
    setIsSubmitting(true);
    const res =
      mode === 'otp_verify'
        ? await requestEmailOtp(email.trim())
        : await requestForgotPassword(email.trim());
    setIsSubmitting(false);
    if (res.success) {
      setResendTimer(60);
      setStatusMessage('A new 6-digit code has been sent to your email.');
    }
  };

  // 7. Forgot Password - Request
  const handleRequestForgotPassword = async (e) => {
    e.preventDefault();
    setValidationError('');
    if (!email.trim() || !email.includes('@')) {
      setValidationError('Please enter your registered email address');
      return;
    }
    setIsSubmitting(true);
    const res = await requestForgotPassword(email.trim());
    setIsSubmitting(false);
    if (res.success) {
      setResendTimer(60);
      setStatusMessage(res.message);
      setMode('forgot_verify');
    }
  };

  // 8. Forgot Password - Verify OTP
  const handleVerifyResetOtp = async (e) => {
    e.preventDefault();
    setValidationError('');
    if (!otp || otp.trim().length !== 6) {
      setValidationError('Please enter the 6-digit reset code');
      return;
    }
    setIsSubmitting(true);
    const res = await verifyResetOtp(email.trim(), otp.trim());
    setIsSubmitting(false);
    if (res.success && res.resetToken) {
      setResetToken(res.resetToken);
      setMode('forgot_new_password');
    }
  };

  // 9. Forgot Password - Set New Password
  const handleCompleteReset = async (e) => {
    e.preventDefault();
    setValidationError('');
    if (newPassword.length < 6) {
      setValidationError('New password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setValidationError('Passwords do not match');
      return;
    }
    setIsSubmitting(true);
    const res = await completePasswordReset(email.trim(), resetToken, newPassword);
    setIsSubmitting(false);
    if (res.success) {
      setMode('forgot_success');
    }
  };

  const fillDemoAccount = () => {
    setEmail('demo@taskflow.dev');
    setPassword('demopass123');
    if (mode === 'register') {
      setName('Alex Rivera');
    }
    setValidationError('');
  };

  const displayError = validationError || authError;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-center items-center p-4 transition-colors">
      <div className="w-full max-w-md">
        {/* Brand / Logo */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-indigo-600 text-white shadow-xl shadow-indigo-600/30 mb-2">
            <Sparkles className="w-6 h-6 fill-white" />
          </div>
          <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight">
            TaskFlow
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Productivity workspace with secure authentication
          </p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-xl shadow-slate-200/50 dark:shadow-none transition-all">
          {/* Top Tabs (visible only on login / register) */}
          {(mode === 'login' || mode === 'register') && (
            <div className="grid grid-cols-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl mb-5">
              <button
                type="button"
                onClick={() => switchMode('login')}
                className={`py-2 text-xs sm:text-sm font-bold rounded-xl transition-all ${
                  mode === 'login'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => switchMode('register')}
                className={`py-2 text-xs sm:text-sm font-bold rounded-xl transition-all ${
                  mode === 'register'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Create Account
              </button>
            </div>
          )}

          {/* Error Banner */}
          {displayError && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex flex-col gap-1.5 animate-in fade-in">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-relaxed font-medium">{displayError}</span>
              </div>
              {displayError.includes('server/.env') && (
                <div className="mt-1 p-2 bg-rose-100/60 dark:bg-rose-900/40 rounded-lg text-[11px] leading-relaxed text-rose-800 dark:text-rose-200">
                  <strong>SMTP Setup Guide:</strong> To receive real OTP emails, open <code className="font-mono bg-white/60 dark:bg-black/30 px-1 py-0.5 rounded">server/.env</code> and configure your Gmail or SMTP credentials: <code className="font-mono bg-white/60 dark:bg-black/30 px-1 py-0.5 rounded">SMTP_HOST=smtp.gmail.com</code>, <code className="font-mono bg-white/60 dark:bg-black/30 px-1 py-0.5 rounded">SMTP_USER=your_email@gmail.com</code>, and <code className="font-mono bg-white/60 dark:bg-black/30 px-1 py-0.5 rounded">SMTP_PASS=your_16_char_app_password</code>.
                </div>
              )}
              {(displayError.toLowerCase().includes('database') || displayError.includes('MONGODB_URI')) && (
                <div className="mt-1 p-2 bg-amber-100/60 dark:bg-amber-900/40 border border-amber-200/60 dark:border-amber-800/40 rounded-lg text-[11px] leading-relaxed text-amber-900 dark:text-amber-200">
                  <strong>Database Setup Required:</strong> To enable account creation and data storage on your cPanel domain, add your free <strong>MongoDB Atlas</strong> connection string to <code className="font-mono bg-white/60 dark:bg-black/30 px-1 py-0.5 rounded">/home/taskflow/taskflow/.env</code> as <code className="font-mono bg-white/60 dark:bg-black/30 px-1 py-0.5 rounded">MONGODB_URI=mongodb+srv://...</code>.
                </div>
              )}
            </div>
          )}

          {/* Success Banner */}
          {statusMessage && (
            <div className="mb-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 text-xs flex items-start gap-2 animate-in fade-in">
              <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{statusMessage}</span>
            </div>
          )}

          {/* ============================================================ */}
          {/* MODE 1: PASSWORD LOGIN                                      */}
          {/* ============================================================ */}
          {mode === 'login' && (
            <div className="space-y-4">
              {/* Google Sign In Component */}
              <GoogleAuthButton
                onSuccess={handleGoogleSuccess}
                onError={handleGoogleError}
                text="continue_with"
              />

              {/* Divider */}
              <div className="relative flex items-center justify-center my-3">
                <div className="border-t border-slate-200 dark:border-slate-800 w-full" />
                <span className="bg-white dark:bg-slate-900 px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Or password
                </span>
                <div className="border-t border-slate-200 dark:border-slate-800 w-full" />
              </div>

              <form onSubmit={handlePasswordLogin} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      disabled={isSubmitting}
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => switchMode('forgot_email')}
                      className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      disabled={isSubmitting}
                      className="w-full pl-9 pr-10 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 px-4 rounded-xl font-bold text-sm text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-60 transition-all shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Signing in...</span>
                    </>
                  ) : (
                    <>
                      <span>Sign In</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              {/* Passwordless OTP Option */}
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => switchMode('otp_request')}
                  className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 font-semibold p-1"
                >
                  <KeyRound className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Sign in with email OTP instead</span>
                </button>
              </div>

              {/* Demo Helper */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 text-center">
                <button
                  type="button"
                  onClick={fillDemoAccount}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium inline-flex items-center gap-1.5"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  Fill sample test credentials
                </button>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* MODE 2: REGISTRATION                                        */}
          {/* ============================================================ */}
          {mode === 'register' && (
            <div className="space-y-4">
              <GoogleAuthButton
                onSuccess={handleGoogleSuccess}
                onError={handleGoogleError}
                text="signup_with"
              />

              <div className="relative flex items-center justify-center my-3">
                <div className="border-t border-slate-200 dark:border-slate-800 w-full" />
                <span className="bg-white dark:bg-slate-900 px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Or with email
                </span>
                <div className="border-t border-slate-200 dark:border-slate-800 w-full" />
              </div>

              <form onSubmit={handleRegister} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                    Full Name
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Alex Rivera"
                      disabled={isSubmitting}
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      disabled={isSubmitting}
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      disabled={isSubmitting}
                      className="w-full pl-9 pr-10 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 px-4 rounded-xl font-bold text-sm text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-60 transition-all shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Creating account...</span>
                    </>
                  ) : (
                    <>
                      <span>Create Account</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => switchMode('otp_request')}
                  className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 font-semibold p-1"
                >
                  <KeyRound className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Or sign up passwordless with Email OTP</span>
                </button>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* MODE 3: EMAIL OTP REQUEST                                    */}
          {/* ============================================================ */}
          {mode === 'otp_request' && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 font-medium"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to sign in</span>
              </button>

              <div className="pt-1">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-2">
                  <KeyRound className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                  Sign in with Email OTP
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Enter your email address. We'll send a 6-digit one-time passcode to sign in without a password.
                </p>
              </div>

              <form onSubmit={handleRequestEmailOtp} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                    Your Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="email"
                      required
                      autoFocus
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      disabled={isSubmitting}
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 px-4 rounded-xl font-bold text-sm text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-60 transition-all shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Sending OTP...</span>
                    </>
                  ) : (
                    <>
                      <span>Send Verification Code</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* ============================================================ */}
          {/* MODE 4: EMAIL OTP VERIFY                                     */}
          {/* ============================================================ */}
          {mode === 'otp_verify' && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => switchMode('otp_request')}
                className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 font-medium"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Change email</span>
              </button>

              <div className="pt-1">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-2">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                  Enter 6-digit Code
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  We sent a code to <span className="font-semibold text-slate-700 dark:text-slate-300">{email}</span>. Code expires in 5 minutes.
                </p>
              </div>

              <form onSubmit={handleVerifyEmailOtp} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                    Verification Code
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    disabled={isSubmitting}
                    className="w-full px-3.5 py-3 text-center text-2xl font-mono tracking-[10px] font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Optional Name (for first-time signup via OTP) */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                    Display Name <span className="text-slate-400 font-normal lowercase">(if new account)</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Alex"
                    disabled={isSubmitting}
                    className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || otp.length !== 6}
                  className="w-full py-2.5 px-4 rounded-xl font-bold text-sm text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 transition-all shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Verifying...</span>
                    </>
                  ) : (
                    <>
                      <span>Verify & Sign In</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              {/* Resend Cooldown Timer */}
              <div className="pt-2 text-center text-xs">
                {resendTimer > 0 ? (
                  <span className="text-slate-400">
                    Resend code in <strong className="text-slate-600 dark:text-slate-200">{resendTimer}s</strong>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={isSubmitting}
                    className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold inline-flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Resend verification code
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* MODE 4b: EMAIL VERIFICATION CODE ENTRY                       */}
          {/* ============================================================ */}
          {mode === 'verify_email' && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => switchMode('register')}
                className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 font-medium"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to registration</span>
              </button>

              <div className="pt-1">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-2">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                  Verify Your Email
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Enter the 6-digit activation code sent to <span className="font-semibold text-slate-700 dark:text-slate-300">{email}</span>.
                </p>
              </div>

              <form onSubmit={handleVerifyEmail} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                    Verification Code
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    disabled={isSubmitting}
                    className="w-full px-3.5 py-3 text-center text-2xl font-mono tracking-[10px] font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || otp.length !== 6}
                  className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-sm rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>Activate Account</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              <div className="pt-2 text-center text-xs text-slate-500">
                {resendTimer > 0 ? (
                  <span>Resend code in <strong className="text-slate-700 dark:text-slate-300">{resendTimer}s</strong></span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResendVerification}
                    disabled={isSubmitting}
                    className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold inline-flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Resend code
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* MODE 5: FORGOT PASSWORD - EMAIL REQUEST                      */}
          {/* ============================================================ */}
          {mode === 'forgot_email' && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 font-medium"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to sign in</span>
              </button>

              <div className="pt-1">
                <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/70 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-2">
                  <KeyRound className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                  Reset Password
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Enter your account email. We'll send a 6-digit verification code to reset your password.
                </p>
              </div>

              <form onSubmit={handleRequestForgotPassword} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                    Registered Email
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="email"
                      required
                      autoFocus
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      disabled={isSubmitting}
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 px-4 rounded-xl font-bold text-sm text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-60 transition-all shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Sending reset code...</span>
                    </>
                  ) : (
                    <>
                      <span>Send Reset Code</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* ============================================================ */}
          {/* MODE 6: FORGOT PASSWORD - VERIFY CODE                        */}
          {/* ============================================================ */}
          {mode === 'forgot_verify' && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => switchMode('forgot_email')}
                className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 font-medium"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Change email</span>
              </button>

              <div className="pt-1">
                <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/70 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-2">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                  Verify Reset Code
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Enter the 6-digit reset code sent to <span className="font-semibold text-slate-700 dark:text-slate-300">{email}</span>.
                </p>
              </div>

              <form onSubmit={handleVerifyResetOtp} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                    6-digit Reset Code
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    disabled={isSubmitting}
                    className="w-full px-3.5 py-3 text-center text-2xl font-mono tracking-[10px] font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || otp.length !== 6}
                  className="w-full py-2.5 px-4 rounded-xl font-bold text-sm text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 transition-all shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Verifying code...</span>
                    </>
                  ) : (
                    <>
                      <span>Continue</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              <div className="pt-2 text-center text-xs">
                {resendTimer > 0 ? (
                  <span className="text-slate-400">
                    Resend code in <strong className="text-slate-600 dark:text-slate-200">{resendTimer}s</strong>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={isSubmitting}
                    className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold inline-flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Resend reset code
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* MODE 7: FORGOT PASSWORD - NEW PASSWORD                       */}
          {/* ============================================================ */}
          {mode === 'forgot_new_password' && (
            <div className="space-y-4">
              <div className="pt-1">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-2">
                  <Lock className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                  Set New Password
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Identity verified. Enter a strong new password for your account.
                </p>
              </div>

              <form onSubmit={handleCompleteReset} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                    New Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      required
                      autoFocus
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      disabled={isSubmitting}
                      className="w-full pl-9 pr-10 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1.5">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter password"
                      disabled={isSubmitting}
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 px-4 rounded-xl font-bold text-sm text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-60 transition-all shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Saving new password...</span>
                    </>
                  ) : (
                    <>
                      <span>Save New Password</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* ============================================================ */}
          {/* MODE 8: FORGOT PASSWORD - SUCCESS CONFIRMATION               */}
          {/* ============================================================ */}
          {mode === 'forgot_success' && (
            <div className="space-y-5 text-center py-4">
              <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto ring-8 ring-emerald-50 dark:ring-emerald-950/30">
                <CheckCircle className="w-8 h-8" />
              </div>

              <div>
                <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                  Password Reset Successful
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                  Your password has been securely updated. You can now sign in with your new password.
                </p>
              </div>

              <button
                type="button"
                onClick={() => switchMode('login')}
                className="w-full py-2.5 px-4 rounded-xl font-bold text-sm text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 transition-all shadow-md shadow-indigo-600/20"
              >
                Sign In with New Password
              </button>
            </div>
          )}
        </div>

        {/* Security badge note */}
        <p className="mt-5 text-center text-xs text-slate-400">
          Protected with Google Identity, single-use encrypted OTPs & bcrypt
        </p>
      </div>
    </div>
  );
};
