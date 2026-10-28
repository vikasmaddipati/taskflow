import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Otp from '../models/Otp.js';
import { sendOtpEmail, isSmtpConfigured } from '../services/emailService.js';
import { verifyGoogleIdToken } from '../services/googleAuthService.js';

// Helper to generate JWT auth token
const generateToken = (id) => {
  return jwt.sign(
    { id },
    process.env.JWT_SECRET || 'super_secret_jwt_key_task_management_2026_modern',
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    }
  );
};

// Helper to hash OTP with sha256
const hashOtp = (otp) => {
  return crypto.createHash('sha256').update(String(otp).trim()).digest('hex');
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

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    const cleanEmail = email.toLowerCase().trim();
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

    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        theme: user.theme,
        avatar: user.avatar,
        authProviders: user.authProviders
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Authenticate user with password & get token
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

    const cleanEmail = email.toLowerCase().trim();
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

    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        theme: user.theme,
        avatar: user.avatar,
        authProviders: user.authProviders
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

    // Securely verify token with Google's servers
    const googleProfile = await verifyGoogleIdToken(credential);
    const { googleId, email, name, picture, emailVerified } = googleProfile;

    if (!emailVerified) {
      return res.status(400).json({
        success: false,
        message: 'Google account email is not verified'
      });
    }

    // 1. Check if user already exists with this Google ID
    let user = await User.findOne({ googleId });

    if (!user) {
      // 2. Check if a user with this email already exists
      user = await User.findOne({ email });

      if (user) {
        // Safe account linking: Google has verified email ownership
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
        // 3. Create a brand new Google user
        user = await User.create({
          name: name || email.split('@')[0],
          email,
          googleId,
          avatar: picture,
          authProviders: ['google'],
          isEmailVerified: true
        });
      }
    }

    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        theme: user.theme,
        avatar: user.avatar,
        authProviders: user.authProviders
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

    if (!email || !email.includes('@')) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address'
      });
    }

    const cleanEmail = email.toLowerCase().trim();

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

    // Invalidate any existing unused login OTPs for this email
    await Otp.updateMany(
      { email: cleanEmail, purpose: 'login', isUsed: false },
      { $set: { isUsed: true } }
    );

    // Generate cryptographically secure 6-digit OTP
    const plainOtp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = hashOtp(plainOtp);

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await Otp.create({
      email: cleanEmail,
      otpHash,
      purpose: 'login',
      expiresAt,
      lastSentAt: new Date()
    });

    // Check if user exists to personalize email
    const existingUser = await User.findOne({ email: cleanEmail });

    // Send email (never expose plain OTP in API response or logs)
    const isMock = req.headers['x-test-mode'] === 'true' || process.env.MOCK_EMAIL === 'true';
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
          message:
            'Email delivery is not configured on the server. Please set SMTP_HOST, SMTP_USER, and SMTP_PASS in server/.env to receive verification codes.'
        });
      }
      return res.status(502).json({
        success: false,
        code: 'EMAIL_SEND_FAILED',
        message: emailResult.message || 'Unable to deliver verification code. Please check server email settings.'
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

    const cleanEmail = email.toLowerCase().trim();
    const cleanOtp = String(otp).trim();

    if (cleanOtp.length !== 6) {
      return res.status(400).json({
        success: false,
        message: 'Verification code must be 6 digits'
      });
    }

    // Find active OTP record
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

    // Check expiration
    if (new Date() > otpDoc.expiresAt) {
      otpDoc.isUsed = true;
      await otpDoc.save();
      return res.status(400).json({
        success: false,
        message: 'Verification code has expired. Please request a new code.'
      });
    }

    // Check attempts limit (max 5)
    if (otpDoc.attempts >= 5) {
      otpDoc.isUsed = true;
      await otpDoc.save();
      return res.status(400).json({
        success: false,
        message: 'Too many incorrect attempts. Please request a new code.'
      });
    }

    // Validate hash
    const enteredHash = hashOtp(cleanOtp);
    if (enteredHash !== otpDoc.otpHash) {
      otpDoc.attempts += 1;
      await otpDoc.save();
      const remaining = 5 - otpDoc.attempts;
      return res.status(400).json({
        success: false,
        message: `Invalid verification code. ${remaining > 0 ? remaining : 0} attempt(s) remaining.`
      });
    }

    // Mark OTP as used immediately (single-use)
    otpDoc.isUsed = true;
    await otpDoc.save();

    // Find or create user
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

    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      message: 'Signed in successfully',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        theme: user.theme,
        avatar: user.avatar,
        authProviders: user.authProviders
      }
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

    if (!email || !email.includes('@')) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address'
      });
    }

    const cleanEmail = email.toLowerCase().trim();

    // Constant user enumeration defense: always respond with identical generic message
    const genericResponse = {
      success: true,
      message: 'If an account exists for this email, you will receive a password reset code shortly.'
    };

    const isMock = req.headers['x-test-mode'] === 'true' || process.env.MOCK_EMAIL === 'true';

    // Check if SMTP is configured before proceeding (unless in automated test mode)
    if (!isSmtpConfigured() && !isMock) {
      return res.status(503).json({
        success: false,
        code: 'SMTP_NOT_CONFIGURED',
        message:
          'Email delivery is not configured on the server. Please set SMTP_HOST, SMTP_USER, and SMTP_PASS in server/.env to receive password reset codes.'
      });
    }

    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      return res.status(200).json(genericResponse);
    }

    // Check cooldown: 60 seconds
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

    // Invalidate prior unused reset OTPs
    await Otp.updateMany(
      { email: cleanEmail, purpose: 'reset_password', isUsed: false },
      { $set: { isUsed: true } }
    );

    const plainOtp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = hashOtp(plainOtp);
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

    if (!emailResult.delivered) {
      return res.status(502).json({
        success: false,
        code: 'EMAIL_SEND_FAILED',
        message: emailResult.message || 'Failed to deliver password reset code.'
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

    const cleanEmail = email.toLowerCase().trim();
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

    const enteredHash = hashOtp(cleanOtp);
    if (enteredHash !== otpDoc.otpHash) {
      otpDoc.attempts += 1;
      await otpDoc.save();
      const remaining = 5 - otpDoc.attempts;
      return res.status(400).json({
        success: false,
        message: `Invalid reset code. ${remaining > 0 ? remaining : 0} attempt(s) remaining.`
      });
    }

    // Invalidate OTP
    otpDoc.isUsed = true;
    await otpDoc.save();

    // Create a secure short-lived reset authorization token (10 minutes)
    const resetToken = jwt.sign(
      { email: cleanEmail, resetAllowed: true },
      process.env.JWT_SECRET || 'super_secret_jwt_key_task_management_2026_modern',
      { expiresIn: '10m' }
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

    const cleanEmail = email.toLowerCase().trim();

    // Verify reset token
    let decoded;
    try {
      decoded = jwt.verify(
        resetToken,
        process.env.JWT_SECRET || 'super_secret_jwt_key_task_management_2026_modern'
      );
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

    // Update password
    user.password = newPassword;
    if (!user.authProviders.includes('local')) {
      user.authProviders.push('local');
    }
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password reset successfully! You can now log in with your new password.'
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
      isEmailVerified: req.user.isEmailVerified
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

    if (newPassword) {
      // If user had a password previously, require current password
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
      if (!user.authProviders.includes('local')) {
        user.authProviders.push('local');
      }
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
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
