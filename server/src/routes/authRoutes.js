import express from 'express';
import {
  register,
  login,
  googleAuth,
  requestEmailOtp,
  verifyEmailOtp,
  verifyEmail,
  resendVerificationEmail,
  forgotPassword,
  verifyResetOtp,
  resetPassword,
  refreshToken,
  logout,
  logoutAll,
  getActiveSessions,
  getMe,
  updateProfile
} from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import {
  authLimiter,
  otpRequestLimiter,
  otpVerifyLimiter
} from '../middleware/rateLimiter.js';

const router = express.Router();

// Email & Password Auth
router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/verify-email', otpVerifyLimiter, verifyEmail);
router.post('/resend-verification', otpRequestLimiter, resendVerificationEmail);

// Google Sign-In
router.post('/google', googleAuth);

// Email OTP Login (No backdoor routes permitted)
router.post('/otp/request', otpRequestLimiter, requestEmailOtp);
router.post('/otp/verify', otpVerifyLimiter, verifyEmailOtp);

// Forgot Password Flow
router.post('/forgot-password', otpRequestLimiter, forgotPassword);
router.post('/reset-password/verify-otp', otpVerifyLimiter, verifyResetOtp);
router.post('/reset-password', otpVerifyLimiter, resetPassword);

// Session Refresh & Revocation
router.post('/refresh', refreshToken);
router.post('/logout', logout);
router.post('/logout-all', protect, logoutAll);
router.get('/sessions', protect, getActiveSessions);

// Profile
router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfile);

export default router;
