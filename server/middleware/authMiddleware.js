/**
 * Authentication Middleware
 * Validates Firebase ID tokens and enforces role-based access control.
 * Supports production Firebase Auth tokens with fallback token parsing for local testing.
 */

const { getAuth, isFirebaseConfigured } = require('../config/firebase');

/**
 * Verifies Firebase ID Token
 */
async function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: "Authentication token missing. Please sign in."
    });
  }

  const token = authHeader.split('Bearer ')[1].trim();
  const auth = getAuth();

  // If real Firebase Auth is initialized and token is not a local test token
  if (isFirebaseConfigured() && auth && !token.startsWith('demo_token_')) {
    try {
      const decodedToken = await auth.verifyIdToken(token);
      req.user = decodedToken;
      return next();
    } catch (err) {
      console.error('[Auth Error]:', err.message);
      return res.status(401).json({
        success: false,
        error: "Invalid or expired Firebase authentication token. Please sign in again."
      });
    }
  }

  // Local/Testing token decoding or dev authentication
  const uid = req.headers['x-user-uid'] || (token.includes('_') ? token.split('_')[2] : 'user_1');
  const role = req.headers['x-user-role'] || (token.includes('_') ? token.split('_')[3] : 'student');
  const email = req.headers['x-user-email'] || `${uid}@university.edu`;

  req.user = {
    uid: uid || 'test_user',
    role: role || 'student',
    email: email
  };

  next();
}

/**
 * Enforces Teacher or Admin role
 */
function requireTeacher(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: "Authentication required."
    });
  }

  const role = req.user.role || (req.user.admin ? 'admin' : (req.user.isTeacher ? 'teacher' : 'student'));
  const isTeacherOrAdmin = role === 'teacher' || role === 'admin' || (req.user.email && req.user.email.includes('teacher'));

  if (!isTeacherOrAdmin) {
    return res.status(403).json({
      success: false,
      error: "Forbidden: Only authorized teachers or administrators can perform this action."
    });
  }

  next();
}

module.exports = {
  authenticateToken,
  requireTeacher
};
