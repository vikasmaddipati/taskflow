import rateLimit from 'express-rate-limit';
import { config } from '../config/env.js';

const isTestRequest = (req) => {
  return (req.headers['x-test-mode'] === 'true' || process.env.NODE_ENV === 'test') && !config.isProd;
};

// Standard rate limiter for password login & registration
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  skip: isTestRequest,
  message: {
    success: false,
    message: 'Too many login attempts from this IP. Please try again after 15 minutes.'
  }
});

// Limiter for requesting OTPs (Email Login & Forgot Password)
export const otpRequestLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 6, // max 6 OTP requests per 10 minutes
  standardHeaders: true,
  legacyHeaders: false,
  skip: isTestRequest,
  message: {
    success: false,
    message: 'Too many OTP requests from this address. Please wait a few minutes before trying again.'
  }
});

// Limiter for OTP verification attempts (brute-force defense)
export const otpVerifyLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 15, // max 15 verification attempts
  standardHeaders: true,
  legacyHeaders: false,
  skip: isTestRequest,
  message: {
    success: false,
    message: 'Too many verification attempts. Please wait a few minutes before trying again.'
  }
});
