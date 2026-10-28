import express from 'express';
import {
  register,
  login,
  googleAuth,
  requestEmailOtp,
  verifyEmailOtp,
  forgotPassword,
  verifyResetOtp,
  resetPassword,
  getMe,
  updateProfile
} from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import { devOtpStore } from '../services/emailService.js';
import {
  authLimiter,
  otpRequestLimiter,
  otpVerifyLimiter
} from '../middleware/rateLimiter.js';

const router = express.Router();

// Development-only endpoint to inspect simulated OTP during tests
if (process.env.NODE_ENV !== 'production') {
  router.get('/dev/otp/:email/:purpose', (req, res) => {
    const key = `${req.params.email.toLowerCase()}_${req.params.purpose}`;
    const entry = devOtpStore.get(key);
    if (!entry) {
      return res.status(404).json({ success: false, message: 'OTP not found or expired' });
    }
    res.json({ success: true, otp: entry.otp });
  });
}

// Email & Password Auth
router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);

// Google Sign-In
router.post('/google', googleAuth);

// Email OTP Login
router.post('/otp/request', otpRequestLimiter, requestEmailOtp);
router.post('/otp/verify', otpVerifyLimiter, verifyEmailOtp);

// Forgot Password Flow
router.post('/forgot-password', otpRequestLimiter, forgotPassword);
router.post('/reset-password/verify-otp', otpVerifyLimiter, verifyResetOtp);
router.post('/reset-password', otpVerifyLimiter, resetPassword);

// Profile
router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfile);

export default router;
