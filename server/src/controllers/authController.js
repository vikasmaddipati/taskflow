import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Otp from '../models/Otp.js';
import Session from '../models/Session.js';
import Organization from '../models/Organization.js';
import Membership from '../models/Membership.js';
import Workspace from '../models/Workspace.js';
import { sendOtpEmail } from '../services/emailService.js';
import { verifyGoogleIdToken } from '../services/googleAuthService.js';
import { config, getValidatedJwtSecret } from '../config/env.js';
import { isValidEmail, normalizeEmail } from '../utils/validators.js';

// Helper to hash secrets with sha256
const hashSecret = (value) => {
  return crypto.createHash('sha256').update(String(value).trim()).digest('hex');
};

/**
 * Attaches secure HttpOnly cookies and CSRF token for browser sessions
 */
export const setAuthCookies = (res, accessToken, refreshToken, csrfToken) => {
  const isProd = config.isProd;

  // 1. Short-lived Access Token in HttpOnly cookie
  res.cookie('tm_access_token', accessToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'None' : 'Lax',
    path: '/',
    maxAge: 15 * 60 * 1000 // 15 minutes
  });

  // 2. Long-lived Refresh Token in HttpOnly cookie scoped to auth routes
  if (refreshToken) {
    res.cookie('tm_refresh_token', refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'None' : 'Lax',
      path: '/api/auth',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
  }

  // 3. Readable Anti-CSRF Token for client Axios header attachment
  if (csrfToken) {
    res.cookie('XSRF-TOKEN', csrfToken, {
      httpOnly: false,
      secure: isProd,
      sameSite: isProd ? 'None' : 'Lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
  }
};

/**
 * Clears all authentication and CSRF cookies on logout or session invalidation
 */
export const clearAuthCookies = (res) => {
  const isProd = config.isProd;
  res.clearCookie('tm_access_token', {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'None' : 'Lax',
    path: '/'
  });
  res.clearCookie('tm_refresh_token', {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'None' : 'Lax',
    path: '/api/auth'
  });
  res.clearCookie('XSRF-TOKEN', {
    httpOnly: false,
    secure: isProd,
    sameSite: isProd ? 'None' : 'Lax',
    path: '/'
  });
};

/**
 * Creates authenticated session, signs JWT with validated secret, and generates refresh/csrf tokens
 */
export const createAuthSession = async (user, req) => {
  const jwtSecret = getValidatedJwtSecret();

  // 1. Generate short-lived access token with strict claims, issuer, and audience
  const signOptions = {
    expiresIn: config.jwt.accessExpiresIn,
    algorithm: 'HS256'
  };
  if (config.jwt.issuer) signOptions.issuer = config.jwt.issuer;
  if (config.jwt.audience) signOptions.audience = config.jwt.audience;

  const accessToken = jwt.sign(
    {
      id: user._id.toString(),
      type: 'access'
    },
    jwtSecret,
    signOptions
  );

  // 2. Generate cryptographically strong random refresh token (opaque string)
  const rawRefreshToken = crypto.randomBytes(48).toString('hex');
  const tokenHash = hashSecret(rawRefreshToken);

  // 3. Generate Anti-CSRF token
  const csrfToken = crypto.randomBytes(32).toString('hex');

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const userAgent = req.headers['user-agent'] || 'Unknown client';
  const ipAddress = req.ip || req.connection?.remoteAddress || 'Unknown IP';

  await Session.create({
    user: user._id,
    tokenHash,
    userAgent,
    ipAddress,
    expiresAt
  });

  // Update last login timestamp
  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  return {
    accessToken,
    refreshToken: rawRefreshToken,
    csrfToken
  };
};

/**
 * Ensures user has at least one active organization and workspace.
 */
export const ensureUserOrganization = async (user) => {
  let membership = await Membership.findOne({ user: user._id }).populate('organization');
  if (membership && membership.organization) {
    return membership.organization;
  }
  const slug = `org-${user._id.toString().slice(-6)}-${Date.now().toString().slice(-4)}`;
  const organization = await Organization.create({
    name: `${user.name}'s Workspace`,
    slug,
    owner: user._id,
    isPersonal: true,
    plan: 'free'
  });
  await Membership.create({
    organization: organization._id,
    user: user._id,
    role: 'owner'
  });
  await Workspace.create({
    name: 'General',
    organization: organization._id,
    isDefault: true
  });
  user.currentOrganization = organization._id;
  await user.save({ validateBeforeSave: false });
  return organization;
};

// @desc    Register a new user with email & password
// @route   POST /api/auth/register
// @access  Public
export const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name, email, and password'
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address with a valid top-level domain'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    const cleanEmail = normalizeEmail(email);
    const existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'An account with that email already exists'
      });
    }

    const user = await User.create({
      name: name.trim(),
      email: cleanEmail,
      password,
      authProviders: ['local'],
      isEmailVerified: false
    });

    // Generate email verification OTP automatically
    const plainOtp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = hashSecret(plainOtp);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins for email verification

    await Otp.create({
      email: cleanEmail,
      otpHash,
      purpose: 'email_verification',
      expiresAt,
      lastSentAt: new Date()
    });

    const isMock = req.headers['x-test-mode'] === 'true' && !config.isProd;
    await sendOtpEmail({
      to: cleanEmail,
      name: user.name,
      otp: plainOtp,
      purpose: 'login',
      expiresMinutes: 15,
      isMockMode: isMock
    }).catch((err) => console.warn('[Email Warning] Verification email dispatch deferred:', err.message));

    const [tokens, organization] = await Promise.all([
      createAuthSession(user, req),
      ensureUserOrganization(user)
    ]);

    setAuthCookies(res, tokens.accessToken, tokens.refreshToken, tokens.csrfToken);

    res.status(201).json({
      success: true,
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      csrfToken: tokens.csrfToken,
      requiresVerification: true,
      message: 'Account created successfully. Please verify your email address to unlock all features.',
      organization,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        theme: user.theme,
        avatar: user.avatar,
        authProviders: user.authProviders,
        isEmailVerified: user.isEmailVerified,
        currentOrganization: organization._id
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Authenticate user with password & get tokens
// @route   POST /api/auth/login
// @access  Public
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    const cleanEmail = normalizeEmail(email);
    const user = await User.findOne({ email: cleanEmail }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    if (!user.password) {
      return res.status(400).json({
        success: false,
        message: 'This account was created using Google or Email OTP. Please sign in with that method or reset your password.'
      });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const [tokens, organization] = await Promise.all([
      createAuthSession(user, req),
      ensureUserOrganization(user)
    ]);

    setAuthCookies(res, tokens.accessToken, tokens.refreshToken, tokens.csrfToken);

    res.status(200).json({
      success: true,
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      csrfToken: tokens.csrfToken,
      requiresVerification: !user.isEmailVerified,
      organization,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        theme: user.theme,
        avatar: user.avatar,
        authProviders: user.authProviders,
        isEmailVerified: user.isEmailVerified,
        currentOrganization: organization._id
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Authenticate or register via Google Identity Services
// @route   POST /api/auth/google
// @access  Public
export const googleAuth = async (req, res, next) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({
        success: false,
        message: 'Google credential ID token is required'
      });
    }

    const googleProfile = await verifyGoogleIdToken(credential);
    const { googleId, email, name, picture, emailVerified } = googleProfile;

    if (!emailVerified) {
      return res.status(400).json({
        success: false,
        message: 'Google account email is not verified'
      });
    }

    const cleanEmail = normalizeEmail(email);
    let user = await User.findOne({ googleId });

    if (!user) {
      user = await User.findOne({ email: cleanEmail });

      if (user) {
        user.googleId = googleId;
        if (!user.authProviders.includes('google')) {
          user.authProviders.push('google');
        }
        if (!user.avatar && picture) {
          user.avatar = picture;
        }
        user.isEmailVerified = true;
        await user.save();
      } else {
        user = await User.create({
          name: name || cleanEmail.split('@')[0],
          email: cleanEmail,
          googleId,
          avatar: picture,
          authProviders: ['google'],
          isEmailVerified: true
        });
      }
    }

    const [tokens, organization] = await Promise.all([
      createAuthSession(user, req),
      ensureUserOrganization(user)
    ]);

    setAuthCookies(res, tokens.accessToken, tokens.refreshToken, tokens.csrfToken);

    res.status(200).json({
      success: true,
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      csrfToken: tokens.csrfToken,
      organization,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        theme: user.theme,
        avatar: user.avatar,
        authProviders: user.authProviders,
        isEmailVerified: user.isEmailVerified,
        currentOrganization: organization._id
      }
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || 'Google authentication failed'
    });
  }
};

// @desc    Request a 6-digit OTP for Email Login
// @route   POST /api/auth/otp/request
// @access  Public
export const requestEmailOtp = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address'
      });
    }

    const cleanEmail = normalizeEmail(email);

    // Check resend cooldown: 60 seconds
    const recentOtp = await Otp.findOne({
      email: cleanEmail,
      purpose: 'login',
      isUsed: false,
      lastSentAt: { $gt: new Date(Date.now() - 60 * 1000) }
    });

    if (recentOtp) {
      const remainingSeconds = Math.ceil(
        (recentOtp.lastSentAt.getTime() + 60 * 1000 - Date.now()) / 1000
      );
      return res.status(429).json({
        success: false,
        message: `Please wait ${remainingSeconds} seconds before requesting a new code.`
      });
    }

    // Invalidate prior unused login OTPs
    await Otp.updateMany(
      { email: cleanEmail, purpose: 'login', isUsed: false },
      { $set: { isUsed: true } }
    );

    // Cryptographically secure 6-digit OTP
    const plainOtp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = hashSecret(plainOtp);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await Otp.create({
      email: cleanEmail,
      otpHash,
      purpose: 'login',
      expiresAt,
      lastSentAt: new Date()
    });

    const existingUser = await User.findOne({ email: cleanEmail });

    // Send email (test mode header honored in non-production)
    const isMock = req.headers['x-test-mode'] === 'true' && !config.isProd;
    const emailResult = await sendOtpEmail({
      to: cleanEmail,
      name: existingUser?.name || '',
      otp: plainOtp,
      purpose: 'login',
      expiresMinutes: 5,
      isMockMode: isMock
    });

    if (!emailResult.delivered) {
      if (emailResult.error === 'SMTP_NOT_CONFIGURED') {
        return res.status(503).json({
          success: false,
          code: 'SMTP_NOT_CONFIGURED',
          message: 'Email delivery is not configured on the server. Please configure SMTP in server/.env.'
        });
      }
      return res.status(502).json({
        success: false,
        code: 'EMAIL_SEND_FAILED',
        message: 'Unable to deliver verification code. Please check email settings.'
      });
    }

    res.status(200).json({
      success: true,
      message: 'A 6-digit verification code has been sent to your email.'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Verify 6-digit OTP and sign in / register
// @route   POST /api/auth/otp/verify
// @access  Public
export const verifyEmailOtp = async (req, res, next) => {
  try {
    const { email, otp, name } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Email and verification code are required'
      });
    }

    const cleanEmail = normalizeEmail(email);
    const cleanOtp = String(otp).trim();

    if (cleanOtp.length !== 6) {
      return res.status(400).json({
        success: false,
        message: 'Verification code must be 6 digits'
      });
    }

    const otpDoc = await Otp.findOne({
      email: cleanEmail,
      purpose: 'login',
      isUsed: false
    }).sort({ createdAt: -1 });

    if (!otpDoc) {
      return res.status(400).json({
        success: false,
        message: 'No active verification code found. Please request a new code.'
      });
    }

    if (new Date() > otpDoc.expiresAt) {
      otpDoc.isUsed = true;
      await otpDoc.save();
      return res.status(400).json({
        success: false,
        message: 'Verification code has expired. Please request a new code.'
      });
    }

    if (otpDoc.attempts >= 5) {
      otpDoc.isUsed = true;
      await otpDoc.save();
      return res.status(400).json({
        success: false,
        message: 'Too many incorrect attempts. Please request a new code.'
      });
    }

    const enteredHash = hashSecret(cleanOtp);
    if (enteredHash !== otpDoc.otpHash) {
      otpDoc.attempts += 1;
      await otpDoc.save();
      const remaining = 5 - otpDoc.attempts;
      return res.status(400).json({
        success: false,
        message: `Invalid verification code. ${remaining > 0 ? remaining : 0} attempt(s) remaining.`
      });
    }

    // Mark as used immediately (single-use)
    otpDoc.isUsed = true;
    await otpDoc.save();

    let user = await User.findOne({ email: cleanEmail });

    if (user) {
      if (!user.authProviders.includes('email_otp')) {
        user.authProviders.push('email_otp');
      }
      user.isEmailVerified = true;
      await user.save();
    } else {
      user = await User.create({
        name: name ? name.trim() : cleanEmail.split('@')[0],
        email: cleanEmail,
        authProviders: ['email_otp'],
        isEmailVerified: true
      });
    }

    const [tokens, organization] = await Promise.all([
      createAuthSession(user, req),
      ensureUserOrganization(user)
    ]);

    setAuthCookies(res, tokens.accessToken, tokens.refreshToken, tokens.csrfToken);

    res.status(200).json({
      success: true,
      message: 'Signed in successfully',
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      csrfToken: tokens.csrfToken,
      organization,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        theme: user.theme,
        avatar: user.avatar,
        authProviders: user.authProviders,
        isEmailVerified: user.isEmailVerified,
        currentOrganization: organization._id
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Verify Email using 6-digit OTP (Email Verification)
// @route   POST /api/auth/verify-email
// @access  Public / Private
export const verifyEmail = async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Email and verification code are required'
      });
    }

    const cleanEmail = normalizeEmail(email);
    const cleanOtp = String(otp).trim();

    const otpDoc = await Otp.findOne({
      email: cleanEmail,
      purpose: 'email_verification',
      isUsed: false
    }).sort({ createdAt: -1 });

    if (!otpDoc) {
      return res.status(400).json({
        success: false,
        message: 'No active email verification code found. Please request a new code.'
      });
    }

    if (new Date() > otpDoc.expiresAt) {
      otpDoc.isUsed = true;
      await otpDoc.save();
      return res.status(400).json({
        success: false,
        message: 'Verification code has expired. Please request a new code.'
      });
    }

    if (otpDoc.attempts >= 5) {
      otpDoc.isUsed = true;
      await otpDoc.save();
      return res.status(400).json({
        success: false,
        message: 'Too many incorrect attempts. Please request a new code.'
      });
    }

    const enteredHash = hashSecret(cleanOtp);
    if (enteredHash !== otpDoc.otpHash) {
      otpDoc.attempts += 1;
      await otpDoc.save();
      const remaining = 5 - otpDoc.attempts;
      return res.status(400).json({
        success: false,
        message: `Invalid verification code. ${remaining > 0 ? remaining : 0} attempt(s) remaining.`
      });
    }

    // Mark single-use
    otpDoc.isUsed = true;
    await otpDoc.save();

    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User account not found'
      });
    }

    user.isEmailVerified = true;
    await user.save();

    const [tokens, organization] = await Promise.all([
      createAuthSession(user, req),
      ensureUserOrganization(user)
    ]);

    setAuthCookies(res, tokens.accessToken, tokens.refreshToken, tokens.csrfToken);

    res.status(200).json({
      success: true,
      message: 'Email verified successfully! Full account features unlocked.',
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      csrfToken: tokens.csrfToken,
      organization,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        theme: user.theme,
        avatar: user.avatar,
        authProviders: user.authProviders,
        isEmailVerified: user.isEmailVerified,
        currentOrganization: organization._id
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Resend Email Verification Code
// @route   POST /api/auth/resend-verification
// @access  Public
export const resendVerificationEmail = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address'
      });
    }

    const cleanEmail = normalizeEmail(email);
    const user = await User.findOne({ email: cleanEmail });

    // Prevent account enumeration by returning generic response if not found
    if (!user) {
      return res.status(200).json({
        success: true,
        message: 'If an unverified account exists for this email, a new verification code has been sent.'
      });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({
        success: false,
        message: 'This email is already verified. You can log in directly.'
      });
    }

    // Cooldown check (60 seconds)
    const recentOtp = await Otp.findOne({
      email: cleanEmail,
      purpose: 'email_verification',
      isUsed: false,
      lastSentAt: { $gt: new Date(Date.now() - 60 * 1000) }
    });

    if (recentOtp) {
      const remainingSeconds = Math.ceil(
        (recentOtp.lastSentAt.getTime() + 60 * 1000 - Date.now()) / 1000
      );
      return res.status(429).json({
        success: false,
        message: `Please wait ${remainingSeconds} seconds before requesting another code.`
      });
    }

    await Otp.updateMany(
      { email: cleanEmail, purpose: 'email_verification', isUsed: false },
      { $set: { isUsed: true } }
    );

    const plainOtp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = hashSecret(plainOtp);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await Otp.create({
      email: cleanEmail,
      otpHash,
      purpose: 'email_verification',
      expiresAt,
      lastSentAt: new Date()
    });

    const isMock = req.headers['x-test-mode'] === 'true' && !config.isProd;
    await sendOtpEmail({
      to: cleanEmail,
      name: user.name,
      otp: plainOtp,
      purpose: 'login',
      expiresMinutes: 15,
      isMockMode: isMock
    });

    res.status(200).json({
      success: true,
      message: 'A new 6-digit email verification code has been sent.'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Request Password Reset OTP
// @route   POST /api/auth/forgot-password
// @access  Public
export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address'
      });
    }

    const cleanEmail = normalizeEmail(email);

    // Generic response to avoid user enumeration
    const genericResponse = {
      success: true,
      message: 'If an account exists for this email, you will receive a password reset code shortly.'
    };

    const isMock = req.headers['x-test-mode'] === 'true' && !config.isProd;
    const user = await User.findOne({ email: cleanEmail });

    if (!user) {
      return res.status(200).json(genericResponse);
    }

    // Cooldown check (60 seconds)
    const recentOtp = await Otp.findOne({
      email: cleanEmail,
      purpose: 'reset_password',
      isUsed: false,
      lastSentAt: { $gt: new Date(Date.now() - 60 * 1000) }
    });

    if (recentOtp) {
      const remainingSeconds = Math.ceil(
        (recentOtp.lastSentAt.getTime() + 60 * 1000 - Date.now()) / 1000
      );
      return res.status(429).json({
        success: false,
        message: `Please wait ${remainingSeconds} seconds before requesting another reset code.`
      });
    }

    await Otp.updateMany(
      { email: cleanEmail, purpose: 'reset_password', isUsed: false },
      { $set: { isUsed: true } }
    );

    const plainOtp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = hashSecret(plainOtp);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await Otp.create({
      email: cleanEmail,
      otpHash,
      purpose: 'reset_password',
      expiresAt,
      lastSentAt: new Date()
    });

    const emailResult = await sendOtpEmail({
      to: cleanEmail,
      name: user.name,
      otp: plainOtp,
      purpose: 'reset_password',
      expiresMinutes: 5,
      isMockMode: isMock
    });

    if (!emailResult.delivered && !isMock) {
      return res.status(502).json({
        success: false,
        code: 'EMAIL_SEND_FAILED',
        message: 'Failed to deliver password reset code.'
      });
    }

    res.status(200).json(genericResponse);
  } catch (error) {
    next(error);
  }
};

// @desc    Verify Reset OTP and get short-lived reset token
// @route   POST /api/auth/reset-password/verify-otp
// @access  Public
export const verifyResetOtp = async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Email and verification code are required'
      });
    }

    const cleanEmail = normalizeEmail(email);
    const cleanOtp = String(otp).trim();

    if (cleanOtp.length !== 6) {
      return res.status(400).json({
        success: false,
        message: 'Verification code must be 6 digits'
      });
    }

    const otpDoc = await Otp.findOne({
      email: cleanEmail,
      purpose: 'reset_password',
      isUsed: false
    }).sort({ createdAt: -1 });

    if (!otpDoc) {
      return res.status(400).json({
        success: false,
        message: 'No active password reset code found or code has expired.'
      });
    }

    if (new Date() > otpDoc.expiresAt) {
      otpDoc.isUsed = true;
      await otpDoc.save();
      return res.status(400).json({
        success: false,
        message: 'Password reset code has expired. Please request a new one.'
      });
    }

    if (otpDoc.attempts >= 5) {
      otpDoc.isUsed = true;
      await otpDoc.save();
      return res.status(400).json({
        success: false,
        message: 'Too many incorrect attempts. Please request a new code.'
      });
    }

    const enteredHash = hashSecret(cleanOtp);
    if (enteredHash !== otpDoc.otpHash) {
      otpDoc.attempts += 1;
      await otpDoc.save();
      const remaining = 5 - otpDoc.attempts;
      return res.status(400).json({
        success: false,
        message: `Invalid reset code. ${remaining > 0 ? remaining : 0} attempt(s) remaining.`
      });
    }

    otpDoc.isUsed = true;
    await otpDoc.save();

    const jwtSecret = getValidatedJwtSecret();

    // 10-minute short-lived reset token signed with validated secret
    const resetToken = jwt.sign(
      { email: cleanEmail, resetAllowed: true, type: 'password_reset' },
      jwtSecret,
      { expiresIn: '10m', algorithm: 'HS256' }
    );

    res.status(200).json({
      success: true,
      resetToken,
      message: 'Code verified successfully. You may now set your new password.'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Complete Password Reset with reset token
// @route   POST /api/auth/reset-password
// @access  Public
export const resetPassword = async (req, res, next) => {
  try {
    const { email, resetToken, newPassword } = req.body;

    if (!email || !resetToken || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Email, reset token, and new password are required'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters'
      });
    }

    const cleanEmail = normalizeEmail(email);
    const jwtSecret = getValidatedJwtSecret();

    let decoded;
    try {
      decoded = jwt.verify(resetToken, jwtSecret, { algorithms: ['HS256'] });
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: 'Password reset session has expired or is invalid. Please request a new code.'
      });
    }

    if (decoded.email !== cleanEmail || !decoded.resetAllowed) {
      return res.status(401).json({
        success: false,
        message: 'Invalid reset authorization'
      });
    }

    const user = await User.findOne({ email: cleanEmail }).select('+password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User account not found'
      });
    }

    // Update password and track passwordChangedAt
    user.password = newPassword;
    user.passwordChangedAt = new Date();
    if (!user.authProviders.includes('local')) {
      user.authProviders.push('local');
    }
    await user.save();

    // Revoke all existing sessions for this user on password reset
    await Session.updateMany(
      { user: user._id, isRevoked: false },
      { $set: { isRevoked: true, revokedAt: new Date(), revokedReason: 'PASSWORD_RESET' } }
    );

    clearAuthCookies(res);

    res.status(200).json({
      success: true,
      message: 'Password reset successfully! All previous sessions have been signed out. Please log in with your new password.'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Exchange refresh token for fresh access token & rotated refresh token
// @route   POST /api/auth/refresh
// @access  Public
export const refreshToken = async (req, res, next) => {
  try {
    const rawRefreshToken =
      req.cookies?.tm_refresh_token ||
      req.body.refreshToken ||
      req.headers['x-refresh-token'];

    if (!rawRefreshToken) {
      return res.status(401).json({
        success: false,
        code: 'REFRESH_TOKEN_REQUIRED',
        message: 'Refresh token is required'
      });
    }

    const tokenHash = hashSecret(rawRefreshToken);
    const session = await Session.findOne({ tokenHash });

    if (!session) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_SESSION',
        message: 'Session not found or invalid refresh token'
      });
    }

    // Reuse Detection: if session was already revoked and has a replacement, someone is replaying an old token!
    if (session.isRevoked) {
      if (session.replacedByTokenHash) {
        console.warn(`[Security Alert] Refresh token reuse detected for user ${session.user}. Revoking all sessions.`);
        await Session.updateMany(
          { user: session.user, isRevoked: false },
          { $set: { isRevoked: true, revokedAt: new Date(), revokedReason: 'TOKEN_REUSE_DETECTED' } }
        );
        clearAuthCookies(res);
        return res.status(403).json({
          success: false,
          code: 'TOKEN_REUSE_DETECTED',
          message: 'Security breach detected: refresh token was already used. All sessions have been revoked.'
        });
      }
      return res.status(401).json({
        success: false,
        code: 'SESSION_REVOKED',
        message: 'This session has been revoked. Please sign in again.'
      });
    }

    // Check expiration
    if (new Date() > session.expiresAt) {
      session.isRevoked = true;
      session.revokedAt = new Date();
      session.revokedReason = 'EXPIRED';
      await session.save();
      clearAuthCookies(res);
      return res.status(401).json({
        success: false,
        code: 'SESSION_EXPIRED',
        message: 'Session has expired. Please sign in again.'
      });
    }

    const user = await User.findById(session.user);
    if (!user) {
      return res.status(401).json({
        success: false,
        code: 'USER_NOT_FOUND',
        message: 'User belonging to this session no longer exists'
      });
    }

    // Rotate refresh token: generate new token and hash
    const newRawRefreshToken = crypto.randomBytes(48).toString('hex');
    const newTokenHash = hashSecret(newRawRefreshToken);

    // Invalidate old session and link to new one
    session.isRevoked = true;
    session.revokedAt = new Date();
    session.revokedReason = 'ROTATED';
    session.replacedByTokenHash = newTokenHash;
    await session.save();

    // Create new session
    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await Session.create({
      user: user._id,
      tokenHash: newTokenHash,
      userAgent: req.headers['user-agent'] || session.userAgent,
      ipAddress: req.ip || session.ipAddress,
      expiresAt: newExpiresAt
    });

    const jwtSecret = getValidatedJwtSecret();
    const signOptions = {
      expiresIn: config.jwt.accessExpiresIn,
      algorithm: 'HS256'
    };
    if (config.jwt.issuer) signOptions.issuer = config.jwt.issuer;
    if (config.jwt.audience) signOptions.audience = config.jwt.audience;

    const newAccessToken = jwt.sign(
      { id: user._id.toString(), type: 'access' },
      jwtSecret,
      signOptions
    );

    const csrfToken = crypto.randomBytes(32).toString('hex');
    setAuthCookies(res, newAccessToken, newRawRefreshToken, csrfToken);

    res.status(200).json({
      success: true,
      token: newAccessToken,
      refreshToken: newRawRefreshToken,
      csrfToken
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Logout current session
// @route   POST /api/auth/logout
// @access  Public / Private
export const logout = async (req, res, next) => {
  try {
    const rawRefreshToken =
      req.cookies?.tm_refresh_token ||
      req.body.refreshToken ||
      req.headers['x-refresh-token'];

    if (rawRefreshToken) {
      const tokenHash = hashSecret(rawRefreshToken);
      await Session.findOneAndUpdate(
        { tokenHash, isRevoked: false },
        { $set: { isRevoked: true, revokedAt: new Date(), revokedReason: 'LOGOUT' } }
      );
    }

    clearAuthCookies(res);

    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Revoke all active sessions for current user (Logout from all devices)
// @route   POST /api/auth/logout-all
// @access  Private
export const logoutAll = async (req, res, next) => {
  try {
    const result = await Session.updateMany(
      { user: req.user._id, isRevoked: false },
      { $set: { isRevoked: true, revokedAt: new Date(), revokedReason: 'LOGOUT_ALL' } }
    );

    clearAuthCookies(res);

    res.status(200).json({
      success: true,
      sessionsRevoked: result.modifiedCount,
      message: 'All active sessions have been revoked. Please log in again.'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get active sessions for user
// @route   GET /api/auth/sessions
// @access  Private
export const getActiveSessions = async (req, res, next) => {
  try {
    const sessions = await Session.find({
      user: req.user._id,
      isRevoked: false,
      expiresAt: { $gt: new Date() }
    })
      .select('-tokenHash -replacedByTokenHash')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: sessions.length,
      sessions
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
export const getMe = async (req, res) => {
  res.status(200).json({
    success: true,
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      theme: req.user.theme,
      avatar: req.user.avatar,
      authProviders: req.user.authProviders,
      isEmailVerified: req.user.isEmailVerified,
      currentOrganization: req.user.currentOrganization
    }
  });
};

// @desc    Update user profile & preferences
// @route   PUT /api/auth/profile
// @access  Private
export const updateProfile = async (req, res, next) => {
  try {
    const { name, theme, currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select('+password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (name) {
      user.name = name.trim();
    }

    if (theme && ['light', 'dark'].includes(theme)) {
      user.theme = theme;
    }

    let passwordChanged = false;
    if (newPassword) {
      if (user.password) {
        if (!currentPassword) {
          return res.status(400).json({
            success: false,
            message: 'Current password is required to set a new password'
          });
        }

        const isMatch = await user.matchPassword(currentPassword);
        if (!isMatch) {
          return res.status(400).json({
            success: false,
            message: 'Current password is incorrect'
          });
        }
      }

      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'New password must be at least 6 characters'
        });
      }

      user.password = newPassword;
      user.passwordChangedAt = new Date();
      passwordChanged = true;
      if (!user.authProviders.includes('local')) {
        user.authProviders.push('local');
      }
    }

    await user.save();

    // If password changed, revoke other sessions
    if (passwordChanged) {
      await Session.updateMany(
        { user: user._id, isRevoked: false },
        { $set: { isRevoked: true, revokedAt: new Date(), revokedReason: 'PASSWORD_CHANGE' } }
      );
    }

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      passwordChanged,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        theme: user.theme,
        avatar: user.avatar,
        authProviders: user.authProviders,
        isEmailVerified: user.isEmailVerified
      }
    });
  } catch (error) {
    next(error);
  }
};
