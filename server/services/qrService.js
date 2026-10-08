/**
 * Dynamic QR Service
 * Handles cryptographically secure token generation, expiration tracking,
 * 2-minute token rotation, clickable URL generation for student mobile browsers,
 * and safe server-side debug logging.
 */

const crypto = require('crypto');
const QRCode = require('qrcode');
const { getPublicAppUrl } = require('../config/network');

const TOKEN_LIFETIME_MS = 2 * 60 * 1000; // Exactly 2 minutes (120,000 ms)

/**
 * Generate a cryptographically secure random token
 * Students cannot forge or guess this token.
 */
function generateSecureToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Compute non-sensitive SHA-256 hash prefix for safe server-side debug logging
 */
function computeTokenHash(token) {
  if (!token) return 'null';
  return crypto.createHash('sha256').update(token.trim()).digest('hex').substring(0, 12);
}

/**
 * Creates new token metadata with exactly 2-minute expiration
 * Timestamps are stored as UTC milliseconds and ISO strings.
 */
function createTokenPayload() {
  const token = generateSecureToken();
  const now = Date.now(); // Current UTC epoch milliseconds
  const expiresAt = now + TOKEN_LIFETIME_MS; // Exactly 2 minutes later in UTC

  return {
    token,
    tokenHash: computeTokenHash(token),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
    createdAtMs: now,
    expiresAtMs: expiresAt,
    lifetimeMs: TOKEN_LIFETIME_MS
  };
}

/**
 * Checks whether a given QR token is valid and unexpired
 * 
 * @param {string} suppliedToken - Token from student scan
 * @param {string} expectedToken - Current token registered in feedback session
 * @param {number|string|Date} expiresAt - Expiration timestamp
 * @param {Object} context - Optional debugging context (sessionId, etc.)
 * @returns {Object} { isValid: boolean, error?: string, remainingSeconds?: number }
 */
function validateToken(suppliedToken, expectedToken, expiresAt, context = {}) {
  const now = Date.now();
  let expTime = 0;

  if (typeof expiresAt === 'number') {
    expTime = expiresAt;
  } else if (typeof expiresAt === 'string') {
    expTime = new Date(expiresAt).getTime();
  } else if (expiresAt instanceof Date) {
    expTime = expiresAt.getTime();
  }

  const cleanSupplied = (suppliedToken || '').trim();
  const cleanExpected = (expectedToken || '').trim();

  const suppliedHash = computeTokenHash(cleanSupplied);
  const expectedHash = computeTokenHash(cleanExpected);

  // Safe server-side debug logging (logs hash, never the secret token)
  console.log(`[QR-DEBUG] Validation Check for Session: ${context.sessionId || 'N/A'}`);
  console.log(`  - Supplied Token Hash: ${suppliedHash}`);
  console.log(`  - Current Valid Hash:  ${expectedHash}`);
  console.log(`  - Token Expiry (UTC):  ${new Date(expTime).toISOString()} (${expTime})`);
  console.log(`  - Server Now (UTC):    ${new Date(now).toISOString()} (${now})`);
  console.log(`  - Remaining Time:      ${Math.floor((expTime - now) / 1000)} seconds`);

  if (!cleanSupplied || !cleanExpected) {
    console.log(`  - Result: REJECTED (Missing token)`);
    return {
      isValid: false,
      error: "QR code expired or invalid. Please scan the current QR code displayed by the teacher."
    };
  }

  // Constant-time token comparison to prevent timing side-channels
  const suppliedBuf = Buffer.from(cleanSupplied);
  const expectedBuf = Buffer.from(cleanExpected);

  const isMatch = suppliedBuf.length === expectedBuf.length && crypto.timingSafeEqual(suppliedBuf, expectedBuf);
  if (!isMatch) {
    console.log(`  - Result: REJECTED (Token hash mismatch)`);
    return {
      isValid: false,
      error: "QR code expired or invalid. Please scan the current QR code displayed by the teacher."
    };
  }

  // Check if current server time has surpassed token expiration
  if (now > expTime) {
    console.log(`  - Result: REJECTED (Expired by ${Math.floor((now - expTime) / 1000)}s)`);
    return {
      isValid: false,
      error: "QR code expired or invalid. Please scan the current QR code displayed by the teacher."
    };
  }

  const remainingSeconds = Math.max(0, Math.floor((expTime - now) / 1000));
  console.log(`  - Result: ACCEPTED (${remainingSeconds}s remaining)`);

  return {
    isValid: true,
    remainingSeconds
  };
}

/**
 * Builds the full Student Feedback URL
 * e.g. http://192.168.1.89:3000/student/feedback?session=...&token=...
 */
function generateFeedbackUrl(sessionId, token, customBaseUrl) {
  const baseUrl = (customBaseUrl || getPublicAppUrl()).replace(/\/$/, '');
  const cleanSession = encodeURIComponent((sessionId || '').trim());
  const cleanToken = encodeURIComponent((token || '').trim());
  return `${baseUrl}/student/feedback?session=${cleanSession}&sessionId=${cleanSession}&token=${cleanToken}&qrToken=${cleanToken}`;
}

/**
 * Generates QR Code Data URL containing the navigable Student Feedback URL
 */
async function generateQrDataUrl(sessionId, token, customBaseUrl) {
  const feedbackUrl = generateFeedbackUrl(sessionId, token, customBaseUrl);

  const qrDataUrl = await QRCode.toDataURL(feedbackUrl, {
    errorCorrectionLevel: 'M',
    margin: 2,
    scale: 8,
    color: {
      dark: '#0f172a',
      light: '#ffffff'
    }
  });

  return {
    qrDataUrl,
    feedbackUrl
  };
}

module.exports = {
  TOKEN_LIFETIME_MS,
  generateSecureToken,
  computeTokenHash,
  createTokenPayload,
  validateToken,
  generateFeedbackUrl,
  generateQrDataUrl
};
