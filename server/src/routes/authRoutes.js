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
  getSession,
  getMe,
  updateProfile,
  changeEmail,
  deleteAccount
} from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import {
  authLimiter,
  otpRequestLimiter,
  otpVerifyLimiter
} from '../middleware/rateLimiter.js';
import { validate } from '../middleware/validate.js';
import {
  registerSchema,
  loginSchema,
  otpRequestSchema,
  otpVerifySchema,
  forgotPasswordSchema,
  verifyResetOtpSchema,
  resetPasswordSchema
} from '../validations/authSchemas.js';

const router = express.Router();

// Email & Password Auth
router.post('/register', authLimiter, validate({ body: registerSchema }), register);
router.post('/login', authLimiter, validate({ body: loginSchema }), login);
router.post('/verify-email', otpVerifyLimiter, verifyEmail);
router.post('/resend-verification', otpRequestLimiter, resendVerificationEmail);

// Google Sign-In
router.post('/google', googleAuth);

// Email OTP Login
router.post('/otp/request', otpRequestLimiter, validate({ body: otpRequestSchema }), requestEmailOtp);
router.post('/otp/verify', otpVerifyLimiter, validate({ body: otpVerifySchema }), verifyEmailOtp);

// Forgot Password Flow
router.post('/forgot-password', otpRequestLimiter, validate({ body: forgotPasswordSchema }), forgotPassword);
router.post('/reset-password/verify-otp', otpVerifyLimiter, validate({ body: verifyResetOtpSchema }), verifyResetOtp);
router.post('/reset-password', otpVerifyLimiter, validate({ body: resetPasswordSchema }), resetPassword);

// Session Refresh & Revocation
router.get('/session', getSession);
router.post('/refresh', refreshToken);
router.post('/logout', logout);
router.post('/logout-all', protect, logoutAll);
router.get('/sessions', protect, getActiveSessions);

// Profile & Account Management
router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfile);
router.patch('/email', protect, changeEmail);
router.delete('/account', protect, deleteAccount);

export default router;
