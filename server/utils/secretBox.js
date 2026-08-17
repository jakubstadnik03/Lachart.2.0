/**
 * secretBox
 * ─────────
 * Authenticated symmetric encryption for third-party credentials we must be
 * able to read back (API keys, refresh tokens) — as opposed to passwords,
 * which should be hashed and never recovered.
 *
 * AES-256-GCM with a random 12-byte IV per value. The auth tag is stored
 * alongside the ciphertext, so tampering fails closed on decrypt rather than
 * yielding garbage.
 *
 * Key: SECRET_BOX_KEY, a 32-byte value given as 64 hex chars or base64.
 * Generate one with:
 *     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * If the key is absent, encrypt() THROWS rather than silently falling back to
 * plaintext or base64 — a credential store that quietly stops protecting
 * anything is worse than one that refuses to start.
 */
const crypto = require('crypto');

const PREFIX = 'v1.aes256gcm.';

let cachedKey;

function loadKey() {
  if (cachedKey !== undefined) return cachedKey;
  const raw = process.env.SECRET_BOX_KEY || '';
  if (!raw) { cachedKey = null; return cachedKey; }
  let buf;
  if (/^[0-9a-f]{64}$/i.test(raw.trim())) {
    buf = Buffer.from(raw.trim(), 'hex');
  } else {
    try { buf = Buffer.from(raw.trim(), 'base64'); } catch { buf = null; }
  }
  if (!buf || buf.length !== 32) {
    throw new Error('SECRET_BOX_KEY must be 32 bytes (64 hex chars or base64).');
  }
  cachedKey = buf;
  return cachedKey;
}

/** True when the server is configured to store encrypted secrets. */
function isSecretBoxConfigured() {
  try { return loadKey() != null; } catch { return false; }
}

/**
 * Encrypt a UTF-8 string. Returns `v1.aes256gcm.<iv>.<tag>.<ciphertext>`,
 * all base64url. Throws when no key is configured.
 */
function encryptSecret(plain) {
  const key = loadKey();
  if (!key) {
    throw new Error('SECRET_BOX_KEY is not set — refusing to store a credential unencrypted.');
  }
  if (plain == null || plain === '') return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv, tag, ct].map((b) => b.toString('base64url')).join('.');
}

/**
 * Decrypt a value produced by encryptSecret. Returns null when the input is
 * empty, not in our format, or fails authentication.
 */
function decryptSecret(stored) {
  if (!stored || typeof stored !== 'string') return null;
  if (!stored.startsWith(PREFIX)) return null;
  const key = loadKey();
  if (!key) return null;
  try {
    const [ivB64, tagB64, ctB64] = stored.slice(PREFIX.length).split('.');
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm', key, Buffer.from(ivB64, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ctB64, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null; // wrong key or tampered value — fail closed
  }
}

module.exports = { encryptSecret, decryptSecret, isSecretBoxConfigured };
