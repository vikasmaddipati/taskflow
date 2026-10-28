import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve candidate paths for .env
const serverEnvPath = path.resolve(__dirname, '../../.env');
const rootEnvPath = path.resolve(__dirname, '../../../.env');

if (fs.existsSync(serverEnvPath)) {
  dotenv.config({ path: serverEnvPath });
} else if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
} else {
  dotenv.config();
}

const INSECURE_DEFAULT_SECRETS = [
  'super_secret_jwt_key_task_management_2026_modern',
  'your_super_secret_jwt_key_please_change_in_production',
  'secret',
  'jwtsecret',
  'changeme',
  'dev_fallback_only_active_in_test_env_32chars_min_length',
  'dev_refresh_fallback_only_active_in_test_env_32chars'
];

/**
 * Validates critical environment variables and enforces production security requirements.
 */
export const validateEnv = () => {
  const isProd = process.env.NODE_ENV === 'production';
  const errors = [];

  // JWT Secret Validation (Strict: no silent fallbacks in any environment)
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    errors.push('JWT_SECRET is missing from environment variables. Set a strong random secret of at least 32 characters.');
  } else if (INSECURE_DEFAULT_SECRETS.includes(jwtSecret)) {
    if (isProd) {
      errors.push('JWT_SECRET is using an insecure default or well-known test string in production.');
    } else {
      console.warn('[Security Warning] JWT_SECRET is using a known default key. Change this for production deployments.');
    }
  } else if (jwtSecret.length < 32) {
    errors.push('JWT_SECRET must be at least 32 characters long.');
  }

  // JWT Refresh Secret Validation
  const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;
  if (!jwtRefreshSecret && isProd) {
    errors.push('JWT_REFRESH_SECRET is required in production for revocable session management.');
  }

  // MongoDB URI
  if (!process.env.MONGODB_URI && isProd) {
    errors.push('MONGODB_URI is required in production.');
  }

  if (errors.length > 0) {
    console.error('\n======================================================');
    console.error('FATAL CONFIGURATION ERROR: Application Startup Blocked');
    console.error('======================================================');
    errors.forEach((err, idx) => console.error(`${idx + 1}. ${err}`));
    console.error('======================================================\n');
    process.exit(1);
  }
};

/**
 * Validated JWT secret accessor — guaranteed to never silently substitute a default secret
 */
export const getValidatedJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim().length === 0) {
    throw new Error('JWT_SECRET is not configured in environment. Silent fallback is prohibited.');
  }
  if (secret.length < 32 && process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be at least 32 characters in production.');
  }
  return secret;
};

/**
 * Validated JWT refresh secret accessor
 */
export const getValidatedRefreshSecret = () => {
  const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
  if (!secret || secret.trim().length === 0) {
    throw new Error('JWT_REFRESH_SECRET is not configured. Silent fallback is prohibited.');
  }
  return secret;
};

// Safe configuration object
export const config = {
  env: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: parseInt(process.env.PORT || '5000', 10),
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/taskmanager',
  jwt: {
    // Read directly from process.env — NO silent fallback string
    secret: process.env.JWT_SECRET || '',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET || '',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    issuer: 'taskflow-auth-service',
    audience: 'taskflow-client'
  },
  cors: {
    clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
    allowedOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean)
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || ''
  },
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    fromEmail: process.env.FROM_EMAIL || 'noreply@taskflow.dev',
    fromName: process.env.FROM_NAME || 'TaskFlow Security'
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    proPriceId: process.env.STRIPE_PRICE_PRO_MONTHLY || '',
    businessPriceId: process.env.STRIPE_PRICE_BUSINESS_MONTHLY || ''
  },
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
    currency: process.env.BILLING_DEFAULT_CURRENCY || 'INR'
  }
};
