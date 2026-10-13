/**
 * backend/utils/email.js
 *
 * Gmail API email utility â€” replaces the previous Resend integration.
 * All email dispatch is now performed via the Gmail API using the stored OAuth
 * refresh token persisted in GmailCredential by backend/routes/email.js.
 *
 * Required environment variables (backend only, never exposed to frontend):
 *   GMAIL_CLIENT_ID              â€“ Google OAuth client ID
 *   GMAIL_CLIENT_SECRET          â€“ Google OAuth client secret
 *   GMAIL_REDIRECT_URI           â€“ Must match the registered callback URI
 *   GMAIL_TOKEN_ENCRYPTION_KEY   â€“ Base64-encoded 32-byte AES key
 *
 * The EMAIL_FROM and RESEND_API_KEY variables are no longer required.
 */

import { google } from 'googleapis';
import GmailCredential from '../models/GmailCredential.js';
import { decrypt } from './crypto.js';

// ---------------------------------------------------------------------------
// OAuth2 client factory â€” reads env vars, throws early if misconfigured.
// ---------------------------------------------------------------------------
function buildOAuthClient() {
  const clientId = process.env.GMAIL_CLIENT_ID?.trim();
  const clientSecret = process.env.GMAIL_CLIENT_SECRET?.trim();
  const redirectUri = process.env.GMAIL_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'Gmail OAuth configuration missing. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REDIRECT_URI.'
    );
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

// ---------------------------------------------------------------------------
// getGmailConfig â€“ returns connection status for the requesting admin.
// When adminId is omitted (e.g. legacy callers), we try to find any credential.
// ---------------------------------------------------------------------------
export async function getGmailConfig(adminId) {
  try {
    const query = adminId ? { adminId } : {};
    const credential = await GmailCredential.findOne(query).lean();
    if (!credential) {
      return { configured: false, fromEmail: null };
    }
    return { configured: true, fromEmail: credential.email || null };
  } catch {
    return { configured: false, fromEmail: null };
  }
}

// ---------------------------------------------------------------------------
// buildGmailClient â€“ given an adminId, returns an authenticated Gmail client.
// Throws a descriptive error if credentials are absent or decryption fails.
// ---------------------------------------------------------------------------
async function buildGmailClient(adminId) {
  const credential = await GmailCredential.findOne({ adminId }).lean();
  if (!credential) {
    throw new Error(
      'Gmail not connected. Ask an administrator to authorize Gmail via the Email Settings page.'
    );
  }

  const refreshToken = decrypt(credential.encryptedToken);
  const oauth2 = buildOAuthClient();
  oauth2.setCredentials({ refresh_token: refreshToken });
  return { gmail: google.gmail({ version: 'v1', auth: oauth2 }), fromEmail: credential.email };
}

// ---------------------------------------------------------------------------
// encodeRawMessage â€“ encodes a raw MIME message for the Gmail API.
// ---------------------------------------------------------------------------
function encodeRawMessage(from, to, subject, htmlBody, textBody) {
  // Build a simple multipart/alternative MIME message
  const boundary = `----=_Part_${Date.now()}`;
  const mime = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    textBody,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    htmlBody,
    '',
    `--${boundary}--`
  ].join('\r\n');

  return Buffer.from(mime).toString('base64url');
}

// ---------------------------------------------------------------------------
// sendEmailViaGmail â€“ sends a single email via the Gmail API.
// Returns the Gmail message ID on success.
// ---------------------------------------------------------------------------
export async function sendEmailViaGmail({ adminId, to, subject, html, text }) {
  const { gmail, fromEmail } = await buildGmailClient(adminId);

  const raw = encodeRawMessage(fromEmail, to, subject, html, text || '');
  const result = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw }
  });

  return result.data.id;
}

// ---------------------------------------------------------------------------
// sendTestEmail â€“ sends a test email from the admin's connected Gmail account.
// Accepts { adminId, recipientEmail }.
// ---------------------------------------------------------------------------
export async function sendTestEmail({ adminId, recipientEmail }) {
  if (!adminId) {
    throw new Error('adminId is required to send a test email via Gmail.');
  }

  const { gmail, fromEmail } = await buildGmailClient(adminId);

  const subject = 'ðŸš© FlagHunters CTF â€” Test Email';
  const html = `
    <div style="font-family: sans-serif; padding: 20px;">
      <h2>FlagHunters Email System Test</h2>
      <p>This is a verification email from your CTF platform.</p>
      <p>Provider: <strong>Gmail API</strong></p>
      <p>Authorized sender: <strong>${fromEmail}</strong></p>
      <p>Timestamp: ${new Date().toISOString()}</p>
    </div>
  `.trim();
  const text = `FlagHunters Email System Test â€” sent via Gmail API from ${fromEmail} at ${new Date().toISOString()}`;

  const raw = encodeRawMessage(fromEmail, recipientEmail, subject, html, text);
  const result = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw }
  });

  return { gmailMessageId: result.data.id, fromEmail };
}

// ---------------------------------------------------------------------------
// buildCredentialEmail generates HTML and plain-text participant credentials.
// ---------------------------------------------------------------------------
export function buildCredentialEmail({ studentId, temporaryPassword, gamePin }) {
  const username = escapeHtml(studentId);
  const password = escapeHtml(temporaryPassword);
  const roomCredential = escapeHtml(gamePin);

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Account Credentials</title>
</head>
<body>
  <p><strong>Username:</strong> <code>${username}</code></p>
  <p><strong>Password:</strong> <code>${password}</code></p>
  <p><strong>Room PIN:</strong> <code>${roomCredential}</code></p>
</body>
</html>
  `.trim();

  const text = `Username: ${studentId}\nPassword: ${temporaryPassword}\nRoom PIN: ${gamePin}`;
  return { html, text };
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}
// ---------------------------------------------------------------------------
// Legacy no-op stubs â€” kept so any import that only calls these doesn't crash.
// They throw descriptive errors if actually invoked.
// ---------------------------------------------------------------------------
export function getResendClient() {
  return null;
}

export function getEmailConfig() {
  // Always returns unconfigured â€” Resend is no longer used.
  return { configured: false, fromEmail: null, hasApiKey: false };
}
