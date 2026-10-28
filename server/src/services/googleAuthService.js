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
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error(
      'Google Login is not configured on this server. Please set GOOGLE_CLIENT_ID in server/.env.'
    );
  }

  const client = getOAuthClient();
  const ticket = await client.verifyIdToken({
    idToken,
    audience: clientId
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
