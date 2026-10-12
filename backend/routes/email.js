// backend/routes/email.js
import express from 'express';
import crypto from 'crypto';
import { authMiddleware, requireAdmin } from '../middleware/auth.js';
import { google } from 'googleapis';
import GmailCredential from '../models/GmailCredential.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import { getResendClient, getEmailConfig } from '../utils/email.js';

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
    // Simple in‑memory store on the request session (if session exists) or global Map
    // We'll use a global Map for simplicity.
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
    // Redirect admin to Google consent screen
    res.redirect(authUrl);
  } catch (err) {
    next(err);
  }
});

// GET /api/email/oauth/callback – handle Google response
router.get('/oauth/callback', async (req, res, next) => {
  try {
    const { code, state } = req.query;
    // We need to know which admin initiated – the state map stores adminId.
    const stateMap = req.app.locals.gmailOAuthState || new Map();
    // Find matching adminId
    const entry = Array.from(stateMap.entries()).find(([, v]) => v.state === state);
    if (!entry) {
      return res.status(400).send('Invalid or expired OAuth state');
    }
    const [adminId, stored] = entry;
    if (Date.now() > stored.expiresAt) {
      stateMap.delete(adminId);
      return res.status(400).send('OAuth state has expired');
    }
    // Remove used state
    stateMap.delete(adminId);

    const oauth2 = buildOAuthClient();
    const { tokens } = await oauth2.getToken(code);
    // tokens may contain access_token, refresh_token, expiry_date, scope, token_type
    if (!tokens) {
      return res.status(400).send('Failed to obtain tokens from Google');
    }
    const refreshToken = tokens.refresh_token;
    // If no refresh token, keep existing one if present
    let credential = await GmailCredential.findOne({ adminId });
    if (!refreshToken && credential) {
      // nothing to update, keep existing
    } else if (refreshToken) {
      // Encrypt refresh token before storage
      const encrypted = encrypt(refreshToken);
      if (!credential) {
        credential = new GmailCredential({ adminId, encryptedToken: encrypted });
      } else {
        credential.encryptedToken = encrypted;
      }
    }
    // Use the access token to fetch user profile (email address)
    oauth2.setCredentials(tokens);
    const gmail = google.gmail({ version: 'v1', auth: oauth2 });
    const profileRes = await gmail.users.getProfile({ userId: 'me' });
    const emailAddress = profileRes.data.emailAddress;
    if (credential) {
      credential.email = emailAddress;
      await credential.save();
    }
    // Redirect back to admin UI – a known settings page path
    const redirectUrl = `${process.env.FRONTEND_URL || ''}/admin/settings?gmail=connected`;
    res.redirect(redirectUrl);
  } catch (err) {
    // Log but do not expose sensitive info
    console.error('[GMAIL OAuth] Callback error:', err.message);
    res.status(500).send('OAuth processing failed');
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
    const credential = await GmailCredential.findOne({ adminId: req.user._id });
    if (!credential) {
      return res.status(400).json({ message: 'Gmail not configured' });
    }
    // Decrypt refresh token
    const refreshToken = decrypt(credential.encryptedToken);
    const oauth2 = buildOAuthClient();
    oauth2.setCredentials({ refresh_token: refreshToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2 });
    // Build raw MIME message
    const subject = '🚩 FlagHunters CTF – Test Email';
    const rawMessage = [
      `From: <${process.env.EMAIL_FROM}>`,
      `To: <${to}>`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset="UTF-8"',
      '',
      'This is a test email sent via the Gmail API integration of the FlagHunters platform.',
    ].join('\r\n');
    const encoded = Buffer.from(rawMessage).toString('base64url');
    const result = await gmail.users.messages.send({ userId: 'me', requestBody: { raw: encoded } });
    res.json({ message: 'Test email sent', gmailMessageId: result.data.id });
  } catch (err) {
    console.error('[GMAIL Test] error:', err.message);
    next(err);
  }
});

export default router;
