import { OAuth2Client } from 'google-auth-library';

let oauthClient = null;

const getOAuthClient = () => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return null;
  }
  if (!oauthClient) {
    oauthClient = new OAuth2Client(clientId);
  }
  return oauthClient;
};

/**
 * Verify Google ID Token received from Google Identity Services frontend
 * @param {string} idToken
 * @returns {Promise<Object>} Verified profile details
 */
export const verifyGoogleIdToken = async (idToken) => {
  const rawClientId = process.env.GOOGLE_CLIENT_ID || '';
  const clientIds = rawClientId
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  if (clientIds.length === 0) {
    throw new Error(
      'Google Login is not configured on this server. Please set GOOGLE_CLIENT_ID in server/.env.'
    );
  }

  // Allow simulated Google tokens for automated testing in non-production environments
  if (process.env.NODE_ENV !== 'production' && typeof idToken === 'string' && idToken.startsWith('test_google_token:')) {
    const parts = idToken.split(':');
    const mockEmail = parts[1] || 'test.google.user@taskmate.dev';
    const mockName = parts[2] || 'Test Google User';
    const mockSub = parts[3] || 'google_sub_1234567890';
    return {
      googleId: mockSub,
      email: mockEmail.toLowerCase(),
      name: mockName,
      picture: 'https://lh3.googleusercontent.com/a/default-avatar',
      emailVerified: true
    };
  }

  const client = getOAuthClient() || new OAuth2Client(clientIds[0]);
  const ticket = await client.verifyIdToken({
    idToken,
    audience: clientIds.length === 1 ? clientIds[0] : clientIds
  });

  const payload = ticket.getPayload();
  if (!payload) {
    throw new Error('Invalid Google token: payload is missing');
  }

  if (!payload.email_verified) {
    throw new Error('Google email is not verified. Please verify your Google account first.');
  }

  return {
    googleId: payload.sub,
    email: payload.email.toLowerCase(),
    name: payload.name || payload.email.split('@')[0],
    picture: payload.picture || '',
    emailVerified: Boolean(payload.email_verified)
  };
};
