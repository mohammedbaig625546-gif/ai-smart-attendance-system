/**
 * Network Configuration Utility
 * Automatically detects the machine's reachable LAN IPv4 address
 * for local mobile phone testing or reads PUBLIC_APP_URL for production.
 */

const os = require('os');

/**
 * Sanitizes and normalizes an application base URL:
 * - Strips leading/trailing square brackets [ ], quotes ' ", backticks, angle brackets < >, parentheses.
 * - Strips any remaining internal square brackets [ ].
 * - Strips trailing slashes.
 * - Ensures valid protocol ("https://" strictly for cloud/production domains, "http://" for local LAN/localhost).
 */
function sanitizeBaseUrl(rawUrl) {
  if (!rawUrl) return '';
  let cleaned = String(rawUrl).trim();

  // Strip leading and trailing brackets, quotes, braces, angle brackets, parentheses, spaces
  cleaned = cleaned.replace(/^[\["'`<(\s]+|[\]"'`>)\s]+$/g, '');

  // Strip any remaining square brackets anywhere in the string
  cleaned = cleaned.replace(/[\[\]]/g, '');

  // Strip trailing slashes
  cleaned = cleaned.replace(/\/+$/, '');

  if (!cleaned) return '';

  const isLocalHostOrIp = /^(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/i.test(cleaned);

  // If missing protocol prefix, prepend https:// (or http:// for local loopback/LAN)
  if (!/^https?:\/\//i.test(cleaned)) {
    cleaned = isLocalHostOrIp ? `http://${cleaned}` : `https://${cleaned}`;
  }

  // If http:// was specified for a remote domain (like vercel.app), upgrade strictly to https://
  if (cleaned.toLowerCase().startsWith('http://') && !isLocalHostOrIp && !/^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?/i.test(cleaned)) {
    cleaned = cleaned.replace(/^http:\/\//i, 'https://');
  }

  return cleaned;
}

function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  // Look for external IPv4 addresses (Wi-Fi, Ethernet)
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

function getPublicAppUrl() {
  if (process.env.PUBLIC_APP_URL && process.env.PUBLIC_APP_URL.trim()) {
    return sanitizeBaseUrl(process.env.PUBLIC_APP_URL);
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL && process.env.VERCEL_PROJECT_PRODUCTION_URL.trim()) {
    return sanitizeBaseUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL);
  }
  if (process.env.VERCEL_URL && process.env.VERCEL_URL.trim()) {
    return sanitizeBaseUrl(process.env.VERCEL_URL);
  }
  const lanIp = getLocalIpAddress();
  const port = process.env.PORT || 3000;
  return `http://${lanIp}:${port}`;
}

module.exports = {
  sanitizeBaseUrl,
  getLocalIpAddress,
  getPublicAppUrl
};
