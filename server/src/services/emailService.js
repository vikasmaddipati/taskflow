import nodemailer from 'nodemailer';

// In-memory store for automated test execution
export const devOtpStore = new Map();

// Custom transporter hook for test suites to inject mock or JSON transporters
let customTransporter = null;

export const setCustomTransporter = (transporter) => {
  customTransporter = transporter;
};

export const resetCustomTransporter = () => {
  customTransporter = null;
};

/**
 * Check if SMTP credentials are fully provided in environment
 */
export const isSmtpConfigured = () => {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  return Boolean(
    host &&
    user &&
    pass &&
    !host.includes('example.com') &&
    !user.includes('your_') &&
    !pass.includes('your_')
  );
};

/**
 * Creates and returns nodemailer transporter
 */
const getTransporter = () => {
  if (!isSmtpConfigured()) {
    return null;
  }

  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    // Reasonable timeouts to prevent hanging
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000
  });
};

/**
 * Send an OTP verification email
 * @param {Object} options
 * @param {string} options.to - Recipient email
 * @param {string} options.name - Recipient name (optional)
 * @param {string} options.otp - 6-digit plain OTP
 * @param {'login'|'reset_password'} options.purpose - OTP purpose
 * @param {number} options.expiresMinutes - Expiration time in minutes (default 5)
 * @returns {Promise<{ delivered: boolean, success: boolean, messageId?: string, error?: string, message?: string }>}
 */
export const sendOtpEmail = async ({ to, name, otp, purpose, expiresMinutes = 5, isMockMode = false }) => {
  const isReset = purpose === 'reset_password';
  const subject = isReset
    ? 'Your TaskFlow Password Reset Code'
    : 'Your TaskFlow Verification Code';

  const actionText = isReset
    ? 'reset your account password'
    : 'sign in to your TaskFlow account';

  const plainText = `Hello ${name || 'there'},\n\nYour 6-digit verification code to ${actionText} is:\n\n${otp}\n\nThis code is valid for ${expiresMinutes} minutes and can only be used once.\n\nSECURITY WARNING: Never share this code with anyone. TaskFlow will never ask for your verification code.\nIf you did not request this code, please ignore this email.\n\nBest regards,\nThe TaskFlow Team`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
          .container { max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
          .brand { font-weight: 800; font-size: 20px; color: #4f46e5; margin-bottom: 24px; }
          .title { font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 12px; }
          .desc { font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 24px; }
          .code-box { background: #f1f5f9; border: 2px dashed #cbd5e1; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0; }
          .code { font-family: monospace, monospace; font-size: 36px; font-weight: 800; letter-spacing: 10px; color: #4f46e5; margin: 0; }
          .warning { font-size: 12px; color: #64748b; background: #fef2f2; border-left: 3px solid #ef4444; padding: 12px; border-radius: 6px; margin: 20px 0; }
          .footer { font-size: 11px; color: #94a3b8; text-align: center; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 16px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="brand">TaskFlow</div>
          <h2 class="title">${isReset ? 'Password Reset Request' : 'Email Verification Code'}</h2>
          <p class="desc">
            Hello ${name ? `<strong>${name}</strong>` : ''},<br/>
            Use the 6-digit verification code below to ${actionText}:
          </p>
          <div class="code-box">
            <p class="code">${otp}</p>
          </div>
          <p class="desc">
            This code will expire in <strong>${expiresMinutes} minutes</strong> and is single-use only.
          </p>
          <div class="warning">
            <strong>Security Notice:</strong> Never share this code with anyone. If you did not request this email, please ensure your account is secure.
          </div>
          <div class="footer">
            &copy; ${new Date().getFullYear()} TaskFlow Inc. Automated security notification.
          </div>
        </div>
      </body>
    </html>
  `;

  const transporter = customTransporter || (isSmtpConfigured() ? getTransporter() : null);

  // If automated test environment simulation is enabled (and no custom transporter is set)
  if (!customTransporter && (process.env.MOCK_EMAIL === 'true' || isMockMode)) {
    devOtpStore.set(`${to.toLowerCase()}_${purpose}`, {
      otp,
      expiresAt: Date.now() + expiresMinutes * 60 * 1000
    });
    return {
      success: true,
      delivered: true,
      mode: 'mock_test',
      messageId: 'mock-test-id'
    };
  }

  // Check if SMTP or custom transporter is configured
  if (!transporter) {
    console.warn(
      `[EmailService] SMTP credentials not configured in server/.env. Unable to dispatch email to: ${to}`
    );
    return {
      success: false,
      delivered: false,
      error: 'SMTP_NOT_CONFIGURED',
      message:
        'Email service is not configured on the server. Please set SMTP_HOST, SMTP_USER, and SMTP_PASS in server/.env to receive verification emails.'
    };
  }

  try {
    const fromEmail = process.env.FROM_EMAIL || process.env.SMTP_USER;
    const fromName = process.env.FROM_NAME || 'TaskFlow Security';

    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject,
      text: plainText,
      html: htmlContent
    });

    const accepted = Array.isArray(info.accepted)
      ? info.accepted.length > 0
      : Boolean(info.messageId);

    if (!accepted) {
      console.error(
        `[EmailService] SMTP provider did not accept message for ${to}. Response: ${info.response || 'Rejected'}`
      );
      return {
        success: false,
        delivered: false,
        error: 'SMTP_REJECTED',
        message: 'The email provider did not accept the message for delivery.'
      };
    }

    console.log(`[EmailService] Verification email successfully accepted for ${to}. MessageId: ${info.messageId}`);
    return {
      success: true,
      delivered: true,
      messageId: info.messageId
    };
  } catch (err) {
    // Safe error logging - never logs passwords or OTPs
    console.error(`[EmailService] SMTP sendMail error for ${to}: ${err.message}`);
    return {
      success: false,
      delivered: false,
      error: err.code || 'SEND_FAILED',
      message: `Failed to deliver email: ${err.message}`
    };
  }
};
