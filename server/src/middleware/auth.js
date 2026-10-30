import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { config, getValidatedJwtSecret } from '../config/env.js';

export const protect = async (req, res, next) => {
  let token = null;
  let isCookieAuth = false;

  // 1. Check HttpOnly cookie first for web clients
  if (req.cookies && req.cookies.tm_access_token) {
    token = req.cookies.tm_access_token;
    isCookieAuth = true;
  }
  // 2. Fall back to Authorization Bearer header (for mobile apps / Android client / API clients)
  else if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }
  // 3. Fall back to query param for authenticated media/file downloads (e.g. browser anchor downloads)
  else if (req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      code: 'AUTH_TOKEN_MISSING',
      message: 'Not authorized to access this route, authentication token missing'
    });
  }

  // 3. Double Submit Cookie CSRF defense for browser cookie-authenticated state-changing requests
  if (isCookieAuth && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const isTestMode = req.headers['x-test-mode'] === 'true' && !config.isProd;
    if (!isTestMode) {
      const csrfHeader = req.headers['x-xsrf-token'] || req.headers['x-csrf-token'];
      const csrfCookie = req.cookies['XSRF-TOKEN'];

      if (!csrfHeader || !csrfCookie || csrfHeader !== csrfCookie) {
        return res.status(403).json({
          success: false,
          code: 'CSRF_VALIDATION_FAILED',
          message: 'Invalid or missing CSRF token'
        });
      }
    }
  }

  try {
    const jwtSecret = getValidatedJwtSecret();

    // Verify token with strict algorithm, issuer, and audience enforcement
    const verifyOptions = {
      algorithms: ['HS256']
    };
    if (config.jwt.issuer) verifyOptions.issuer = config.jwt.issuer;
    if (config.jwt.audience) verifyOptions.audience = config.jwt.audience;

    const decoded = jwt.verify(token, jwtSecret, verifyOptions);

    if (!decoded.id) {
      return res.status(401).json({
        success: false,
        code: 'TOKEN_INVALID_CLAIMS',
        message: 'Token contains invalid or missing subject claims'
      });
    }

    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({
        success: false,
        code: 'USER_NOT_FOUND',
        message: 'The user belonging to this token no longer exists'
      });
    }

    // Check if user changed password after the token was issued
    if (decoded.iat && user.changedPasswordAfter(decoded.iat)) {
      return res.status(401).json({
        success: false,
        code: 'TOKEN_INVALIDATED',
        message: 'Password was recently changed. Please log in again.'
      });
    }

    // Check token version against user token version for revoked sessions
    if (
      decoded.tokenVersion !== undefined &&
      user.tokenVersion !== undefined &&
      decoded.tokenVersion < user.tokenVersion
    ) {
      return res.status(401).json({
        success: false,
        code: 'TOKEN_REVOKED',
        message: 'This session has been revoked. Please log in again.'
      });
    }

    req.user = user;
    req.tokenPayload = decoded;
    req.isCookieAuth = isCookieAuth;
    next();
  } catch (error) {
    const isExpired = error.name === 'TokenExpiredError';
    return res.status(401).json({
      success: false,
      code: isExpired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
      message: isExpired ? 'Session token has expired' : 'Token signature verification failed'
    });
  }
};

/**
 * Middleware ensuring email verification has been completed
 */
export const requireVerifiedEmail = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      code: 'AUTH_REQUIRED',
      message: 'Authentication required'
    });
  }

  if (!req.user.isEmailVerified) {
    return res.status(403).json({
      success: false,
      code: 'EMAIL_VERIFICATION_REQUIRED',
      message: 'Email address must be verified to access this resource. Please verify your email.'
    });
  }

  next();
};
