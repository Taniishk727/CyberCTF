// backend/routes/email.js
import express from 'express';
import crypto from 'crypto';
import { authMiddleware, requireAdmin } from '../middleware/auth.js';
import { google } from 'googleapis';
import GmailCredential from '../models/GmailCredential.js';
import { encrypt } from '../utils/crypto.js';
import { sendTestEmail } from '../utils/email.js';

const router = express.Router();

// Helper to build OAuth2 client
function buildOAuthClient() {
  const clientId = process.env.GMAIL_CLIENT_ID?.trim();
  const clientSecret = process.env.GMAIL_CLIENT_SECRET?.trim();
  const redirectUri = process.env.GMAIL_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Gmail OAuth configuration missing');
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

// GET /api/email/oauth/connect – initiate OAuth flow
router.get('/oauth/connect', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const oauth2 = buildOAuthClient();
    // Generate random state and store in memory (per admin)
    const state = crypto.randomBytes(16).toString('hex');
    req.app.locals.gmailOAuthState = req.app.locals.gmailOAuthState || new Map();
    const adminId = req.user._id.toString();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
    req.app.locals.gmailOAuthState.set(adminId, { state, expiresAt });

    const authUrl = oauth2.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/gmail.send'],
      state,
    });

    // Support JSON response if caller requested json or is an API client
    if (req.xhr || req.headers.accept?.includes('application/json') || req.query.format === 'json') {
      return res.json({ url: authUrl });
    }

    // Redirect admin to Google consent screen
    res.redirect(authUrl);
  } catch (err) {
    next(err);
  }
});

// GET /api/email/oauth/callback – handle Google response
router.get('/oauth/callback', async (req, res, next) => {
  const frontendBase = (process.env.FRONTEND_URL || '').replace(/\/+$/, '');
  const redirectSuccess = `${frontendBase}/admin/participants?gmail=connected`;
  const redirectError = (msg) => `${frontendBase}/admin/participants?gmail=error&error=${encodeURIComponent(msg || 'oauth_failed')}`;

  try {
    const { code, state, error: oauthError } = req.query;

    if (oauthError) {
      console.warn('[GMAIL OAuth] User cancelled or error from Google:', oauthError);
      return res.redirect(redirectError(oauthError));
    }

    if (!code || !state) {
      return res.redirect(redirectError('Missing code or state parameter'));
    }

    const stateMap = req.app.locals.gmailOAuthState || new Map();
    const entry = Array.from(stateMap.entries()).find(([, v]) => v.state === state);
    if (!entry) {
      return res.redirect(redirectError('Invalid or expired OAuth state'));
    }
    const [adminId, stored] = entry;
    if (Date.now() > stored.expiresAt) {
      stateMap.delete(adminId);
      return res.redirect(redirectError('OAuth state has expired'));
    }
    // Remove used state
    stateMap.delete(adminId);

    const oauth2 = buildOAuthClient();
    const { tokens } = await oauth2.getToken(code);
    if (!tokens) {
      return res.redirect(redirectError('Failed to obtain tokens from Google'));
    }

    const refreshToken = tokens.refresh_token;
    let credential = await GmailCredential.findOne({ adminId });
    if (!refreshToken && credential) {
      // Keep existing token
    } else if (refreshToken) {
      const encrypted = encrypt(refreshToken);
      if (!credential) {
        credential = new GmailCredential({ adminId, encryptedToken: encrypted });
      } else {
        credential.encryptedToken = encrypted;
      }
    } else if (!credential) {
      return res.redirect(redirectError('No refresh token provided by Google'));
    }

    // Use access token to fetch user profile (email address)
    oauth2.setCredentials(tokens);
    const gmail = google.gmail({ version: 'v1', auth: oauth2 });
    const profileRes = await gmail.users.getProfile({ userId: 'me' });
    const emailAddress = profileRes.data.emailAddress;
    if (credential) {
      credential.email = emailAddress;
      await credential.save();
    }

    res.redirect(redirectSuccess);
  } catch (err) {
    console.error('[GMAIL OAuth] Callback error:', err.message);
    res.redirect(redirectError(err.message));
  }
});

// GET /api/email/status – return connection status
router.get('/status', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const credential = await GmailCredential.findOne({ adminId: req.user._id });
    if (!credential) {
      return res.json({ connected: false });
    }
    res.json({ connected: true, email: credential.email || null });
  } catch (err) {
    next(err);
  }
});

// POST /api/email/test – send test email via Gmail API
router.post('/test', authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const { to } = req.body;
    if (!to) {
      return res.status(400).json({ message: 'Recipient email address required' });
    }

    const result = await sendTestEmail({
      adminId: req.user._id.toString(),
      recipientEmail: to
    });

    res.json({ message: 'Test email sent', gmailMessageId: result.gmailMessageId });
  } catch (err) {
    console.error('[GMAIL Test] error:', err.message);
    next(err);
  }
});

export default router;
