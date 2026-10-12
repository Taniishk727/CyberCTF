// backend/utils/crypto.js
// Crypto helper for encrypting and decrypting Gmail refresh tokens
// Uses AES-256-GCM with a 32-byte base64 key from env GMAIL_TOKEN_ENCRYPTION_KEY
import crypto from 'crypto';

const ALGO = 'aes-256-gcm';

function getKey() {
  const keyB64 = process.env.GMAIL_TOKEN_ENCRYPTION_KEY || '';
  if (!keyB64) {
    throw new Error('GMAIL_TOKEN_ENCRYPTION_KEY environment variable is not set');
  }
  const key = Buffer.from(keyB64, 'base64');
  if (key.length !== 32) {
    throw new Error('GMAIL_TOKEN_ENCRYPTION_KEY must be 32 bytes after base64 decode');
  }
  return key;
}

/**
 * Encrypt a plaintext string.
 * Returns an object { iv: <hex>, authTag: <hex>, data: <hex> }
 */
export function encrypt(text) {
  const key = getKey();
  const iv = crypto.randomBytes(12); // 96‑bit IV for GCM
  const cipher = crypto.createCipheriv(ALGO, key, iv);
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
  const key = getKey();
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));
  let decrypted = decipher.update(data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
