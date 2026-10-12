// Crypto helper for encrypting and decrypting Gmail refresh tokens
// Uses AES-256-GCM with a 32-byte base64 key from env GMAIL_TOKEN_ENCRYPTION_KEY
import crypto from 'crypto';

const ALGO = 'aes-256-gcm';
const KEY_B64 = process.env.GMAIL_TOKEN_ENCRYPTION_KEY || '';
if (!KEY_B64) {
  console.warn('[GMAIL] GMAIL_TOKEN_ENCRYPTION_KEY is not set');
}
// Decode base64 key (should be 32 bytes)
const KEY = Buffer.from(KEY_B64, 'base64');
if (KEY.length !== 32) {
  console.warn('[GMAIL] Encryption key is not 32 bytes after base64 decode');
}

/**
 * Encrypt a plaintext string.
 * Returns an object { iv: <hex>, authTag: <hex>, data: <hex> }
 */
export function encrypt(text) {
  const iv = crypto.randomBytes(12); // 96‑bit IV for GCM
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return {
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    data: encrypted
  };
}

/**
 * Decrypt an object produced by encrypt().
 */
export function decrypt({ iv, authTag, data }) {
  const decipher = crypto.createDecipheriv(ALGO, KEY, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));
  let decrypted = decipher.update(data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
