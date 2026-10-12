/**
 * backend/utils/email.js
 *
 * Gmail API email utility — replaces the previous Resend integration.
 * All email dispatch is now performed via the Gmail API using the stored OAuth
 * refresh token persisted in GmailCredential by backend/routes/email.js.
 *
 * Required environment variables (backend only, never exposed to frontend):
 *   GMAIL_CLIENT_ID              – Google OAuth client ID
 *   GMAIL_CLIENT_SECRET          – Google OAuth client secret
 *   GMAIL_REDIRECT_URI           – Must match the registered callback URI
 *   GMAIL_TOKEN_ENCRYPTION_KEY   – Base64-encoded 32-byte AES key
 *
 * The EMAIL_FROM and RESEND_API_KEY variables are no longer required.
 */

import { google } from 'googleapis';
import GmailCredential from '../models/GmailCredential.js';
import { decrypt } from './crypto.js';

// ---------------------------------------------------------------------------
// OAuth2 client factory — reads env vars, throws early if misconfigured.
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
// getGmailConfig – returns connection status for the requesting admin.
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
// buildGmailClient – given an adminId, returns an authenticated Gmail client.
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
// encodeRawMessage – encodes a raw MIME message for the Gmail API.
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
// sendEmailViaGmail – sends a single email via the Gmail API.
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
// sendTestEmail – sends a test email from the admin's connected Gmail account.
// Accepts { adminId, recipientEmail }.
// ---------------------------------------------------------------------------
export async function sendTestEmail({ adminId, recipientEmail }) {
  if (!adminId) {
    throw new Error('adminId is required to send a test email via Gmail.');
  }

  const { gmail, fromEmail } = await buildGmailClient(adminId);

  const subject = '🚩 FlagHunters CTF — Test Email';
  const html = `
    <div style="font-family: sans-serif; padding: 20px;">
      <h2>FlagHunters Email System Test</h2>
      <p>This is a verification email from your CTF platform.</p>
      <p>Provider: <strong>Gmail API</strong></p>
      <p>Authorized sender: <strong>${fromEmail}</strong></p>
      <p>Timestamp: ${new Date().toISOString()}</p>
    </div>
  `.trim();
  const text = `FlagHunters Email System Test — sent via Gmail API from ${fromEmail} at ${new Date().toISOString()}`;

  const raw = encodeRawMessage(fromEmail, recipientEmail, subject, html, text);
  const result = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw }
  });

  return { gmailMessageId: result.data.id, fromEmail };
}

// ---------------------------------------------------------------------------
// buildCredentialEmail – generates HTML and plain-text credential email bodies.
// Unchanged from previous implementation — provider-agnostic.
// ---------------------------------------------------------------------------
export function buildCredentialEmail({ studentId, fullName, temporaryPassword, loginUrl, eventName }) {
  const recipientName = fullName && fullName.trim() ? fullName.trim() : studentId;
  const targetUrl = loginUrl || process.env.FRONTEND_URL || 'https://cyber-ctf-seven.vercel.app';
  const targetEvent = eventName || 'FlagHunters CTF';

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Your ${targetEvent} Credentials</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; color: #f3f4f6; margin: 0; padding: 24px; }
    .container { max-width: 580px; margin: 0 auto; background-color: #111827; border: 1px solid #1f2937; border-radius: 12px; overflow: hidden; }
    .header { background: linear-gradient(135deg, #0284c7 0%, #2563eb 100%); padding: 32px 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 700; color: #ffffff; letter-spacing: -0.025em; }
    .content { padding: 32px 24px; line-height: 1.6; color: #e5e7eb; }
    .box { background-color: #1f2937; border: 1px solid #374151; border-radius: 8px; padding: 20px; margin: 24px 0; }
    .field { margin-bottom: 12px; }
    .field:last-child { margin-bottom: 0; }
    .label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #9ca3af; }
    .value { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 16px; font-weight: 600; color: #38bdf8; word-break: break-all; margin-top: 4px; }
    .btn { display: inline-block; background-color: #2563eb; color: #ffffff !important; padding: 12px 28px; border-radius: 6px; font-weight: 600; text-decoration: none; margin: 16px 0; }
    .warning { font-size: 13px; color: #fbbf24; background-color: rgba(251, 191, 36, 0.1); border-left: 4px solid #f59e0b; padding: 12px; border-radius: 4px; margin-top: 24px; }
    .footer { padding: 20px 24px; background-color: #0b0f19; text-align: center; font-size: 12px; color: #6b7280; border-top: 1px solid #1f2937; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🚩 ${targetEvent}</h1>
    </div>
    <div class="content">
      <p>Hello <strong>${recipientName}</strong>,</p>
      <p>Your competition account for <strong>${targetEvent}</strong> has been created. Use the credentials below to log in and participate:</p>
      
      <div class="box">
        <div class="field">
          <div class="label">Student ID (Username)</div>
          <div class="value">${studentId}</div>
        </div>
        <div class="field">
          <div class="label">Temporary Passcode / Password</div>
          <div class="value">${temporaryPassword}</div>
        </div>
      </div>

      <div style="text-align: center;">
        <a href="${targetUrl}" class="btn" target="_blank" rel="noopener noreferrer">Access CTF Arena</a>
      </div>

      <div class="warning">
        ⚠️ <strong>Security Notice:</strong> Do not share these credentials with anyone. Your activity and flag submissions are tied directly to your unique student account.
      </div>
    </div>
    <div class="footer">
      This is an automated transactional message sent by the FlagHunters platform. Please contact your competition administrators if you have questions.
    </div>
  </div>
</body>
</html>
  `.trim();

  const text = `
Hello ${recipientName},

Your competition account for ${targetEvent} is ready!

Your Login Credentials:
- Student ID (Username): ${studentId}
- Temporary Passcode: ${temporaryPassword}
- Competition URL: ${targetUrl}

Security Warning:
Do not share these credentials with anyone. Your activity and flag submissions are tied directly to your student ID.

Good luck in the competition!
FlagHunters CTF Team
  `.trim();

  return { html, text };
}

// ---------------------------------------------------------------------------
// Legacy no-op stubs — kept so any import that only calls these doesn't crash.
// They throw descriptive errors if actually invoked.
// ---------------------------------------------------------------------------
export function getResendClient() {
  return null;
}

export function getEmailConfig() {
  // Always returns unconfigured — Resend is no longer used.
  return { configured: false, fromEmail: null, hasApiKey: false };
}
