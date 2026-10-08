/**
 * Network Configuration Utility
 * Automatically detects the machine's reachable LAN IPv4 address
 * for local mobile phone testing or reads PUBLIC_APP_URL for production.
 */

const os = require('os');

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
    return process.env.PUBLIC_APP_URL.trim().replace(/\/$/, '');
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL && process.env.VERCEL_PROJECT_PRODUCTION_URL.trim()) {
    const host = process.env.VERCEL_PROJECT_PRODUCTION_URL.trim().replace(/\/$/, '');
    return host.startsWith('http') ? host : `https://${host}`;
  }
  if (process.env.VERCEL_URL && process.env.VERCEL_URL.trim()) {
    const vercelHost = process.env.VERCEL_URL.trim().replace(/\/$/, '');
    return vercelHost.startsWith('http') ? vercelHost : `https://${vercelHost}`;
  }
  const lanIp = getLocalIpAddress();
  const port = process.env.PORT || 3000;
  return `http://${lanIp}:${port}`;
}

module.exports = {
  getLocalIpAddress,
  getPublicAppUrl
};
