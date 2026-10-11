import { Resend } from 'resend';

/**
 * Resend email client helper.
 * Reads RESEND_API_KEY and EMAIL_FROM strictly from backend environment variables.
 */
let resendClient = null;

export function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    return null;
  }
  if (!resendClient) {
    resendClient = new Resend(apiKey.trim());
  }
  return resendClient;
}

export function getEmailConfig() {
  const apiKey = process.env.RESEND_API_KEY ? process.env.RESEND_API_KEY.trim() : '';
  const fromEmail = process.env.EMAIL_FROM ? process.env.EMAIL_FROM.trim() : '';
  const configured = Boolean(apiKey && fromEmail);
  return {
    configured,
    fromEmail,
    hasApiKey: Boolean(apiKey)
  };
}

/**
 * Generates the clean HTML and Text template for participant credential delivery.
 */
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

/**
 * Sends a single test email to confirm provider configuration.
 */
export async function sendTestEmail({ recipientEmail }) {
  const client = getResendClient();
  const config = getEmailConfig();

  if (!config.configured || !client) {
    throw new Error('Resend is not configured. Both RESEND_API_KEY and EMAIL_FROM must be set.');
  }

  const { data, error } = await client.emails.send({
    from: config.fromEmail,
    to: recipientEmail,
    subject: '🚩 FlagHunters CTF - Test Email Notification',
    html: `
      <div style="font-family: sans-serif; padding: 20px;">
        <h2>FlagHunters Email System Test</h2>
        <p>This is a verification email from your CTF platform.</p>
        <p>Provider: <strong>Resend</strong></p>
        <p>Sender: <strong>${config.fromEmail}</strong></p>
        <p>Timestamp: ${new Date().toISOString()}</p>
      </div>
    `,
    text: `FlagHunters Email System Test: This is a verification email from your CTF platform sent to ${recipientEmail}.`
  });

  if (error) {
    throw new Error(error.message || 'Resend API returned an error');
  }

  return data;
}
