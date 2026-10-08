/**
 * Feedback Session Service
 * Handles session lifecycle (start, stop, active check) and
 * dynamic 2-minute QR token rotation in Firestore with detailed logging.
 */

const { getDb } = require('../config/firebase');
const { createTokenPayload, validateToken, generateQrDataUrl, computeTokenHash } = require('./qrService');
const { getPublicAppUrl } = require('../config/network');

// Active rotation intervals in memory for running sessions
const activeRotationTimers = new Map();

/**
 * Directly retrieve a session document by ID without side-effects (no auto-rotation)
 */
async function getSessionById(sessionId) {
  const db = getDb();
  if (!db) throw new Error("Firestore database is not initialized.");

  const doc = await db.collection('feedbackSessions').doc(sessionId.trim()).get();
  if (!doc.exists) {
    return null;
  }
  return doc.data();
}

/**
 * Start a new feedback session for a teacher/admin
 */
async function startSession({ teacherId, classId, subjectGroupId, latitude, longitude, radiusMeters, customBaseUrl }) {
  const db = getDb();
  if (!db) throw new Error("Firestore database is not initialized.");

  const lat = Number(latitude);
  const lon = Number(longitude);
  const radius = Number(radiusMeters || 50);

  if (isNaN(lat) || isNaN(lon) || isNaN(radius)) {
    throw new Error("Invalid latitude, longitude, or radius specified for classroom geofence.");
  }

  // Deactivate any currently active sessions for this teacher
  const existingActive = await db.collection('feedbackSessions')
    .where('teacherId', '==', teacherId)
    .where('active', '==', true)
    .get();

  for (const doc of existingActive.docs) {
    await doc.ref.update({
      active: false,
      endedAt: new Date().toISOString()
    });
    if (activeRotationTimers.has(doc.id)) {
      clearInterval(activeRotationTimers.get(doc.id));
      activeRotationTimers.delete(doc.id);
    }
  }

  // Generate initial exactly 2-minute QR token
  const tokenPayload = createTokenPayload();
  const docRef = db.collection('feedbackSessions').doc();
  const sessionId = docRef.id;

  const sessionData = {
    id: sessionId,
    teacherId: teacherId || 'teacher_admin_1',
    classId: classId || 'CSE',
    subjectGroupId: subjectGroupId || 'Default',
    active: true,
    latitude: lat,
    longitude: lon,
    radiusMeters: radius,
    startedAt: tokenPayload.createdAt,
    endedAt: null,
    currentQrToken: tokenPayload.token,
    currentQrTokenHash: tokenPayload.tokenHash,
    currentQrExpiresAt: tokenPayload.expiresAt,
    currentQrExpiresAtMs: tokenPayload.expiresAtMs,
    currentQrCreatedAtMs: tokenPayload.createdAtMs,
    tokenRotatedAt: tokenPayload.createdAt
  };

  await docRef.set(sessionData);

  console.log(`[SESSION-START] New Feedback Session Started:`);
  console.log(`  - Session ID:       ${sessionId}`);
  console.log(`  - Class:            ${classId}`);
  console.log(`  - Token Hash:       ${tokenPayload.tokenHash}`);
  console.log(`  - Created Time UTC: ${tokenPayload.createdAt} (${tokenPayload.createdAtMs})`);
  console.log(`  - Expiry Time UTC:  ${tokenPayload.expiresAt} (${tokenPayload.expiresAtMs})`);
  console.log(`  - Server Time UTC:  ${new Date().toISOString()} (${Date.now()})`);

  // Generate QR code containing the full navigable student feedback URL
  const { qrDataUrl, feedbackUrl } = await generateQrDataUrl(sessionId, tokenPayload.token, customBaseUrl);

  // Setup periodic 2-minute rotation timer for this active session
  startRotationTimer(sessionId, customBaseUrl);

  return {
    ...sessionData,
    qrDataUrl,
    feedbackUrl,
    publicBaseUrl: customBaseUrl || getPublicAppUrl(),
    remainingSeconds: Math.floor((tokenPayload.expiresAtMs - Date.now()) / 1000)
  };
}

/**
 * Stop an active feedback session
 */
async function stopSession(sessionId, teacherId) {
  const db = getDb();
  if (!db) throw new Error("Firestore database is not initialized.");

  const docRef = db.collection('feedbackSessions').doc(sessionId.trim());
  const doc = await docRef.get();
  if (!doc.exists) {
    throw new Error("Feedback session not found.");
  }

  const data = doc.data();
  if (teacherId && data.teacherId !== teacherId) {
    throw new Error("Unauthorized to stop this feedback session.");
  }

  await docRef.update({
    active: false,
    endedAt: new Date().toISOString()
  });

  if (activeRotationTimers.has(sessionId)) {
    clearInterval(activeRotationTimers.get(sessionId));
    activeRotationTimers.delete(sessionId);
  }

  console.log(`[SESSION-STOP] Session ${sessionId} stopped.`);

  return { id: sessionId, active: false, endedAt: new Date().toISOString() };
}

/**
 * Rotates QR token for a session (called every 2 minutes or upon expiry)
 */
async function rotateQrToken(sessionId, customBaseUrl) {
  const db = getDb();
  if (!db) return null;

  const docRef = db.collection('feedbackSessions').doc(sessionId.trim());
  const doc = await docRef.get();
  if (!doc.exists) return null;

  const session = doc.data();
  if (!session.active) {
    if (activeRotationTimers.has(sessionId)) {
      clearInterval(activeRotationTimers.get(sessionId));
      activeRotationTimers.delete(sessionId);
    }
    return null;
  }

  const tokenPayload = createTokenPayload();
  const updateData = {
    previousQrToken: session.currentQrToken,
    previousQrTokenHash: session.currentQrTokenHash || computeTokenHash(session.currentQrToken),
    currentQrToken: tokenPayload.token,
    currentQrTokenHash: tokenPayload.tokenHash,
    currentQrExpiresAt: tokenPayload.expiresAt,
    currentQrExpiresAtMs: tokenPayload.expiresAtMs,
    currentQrCreatedAtMs: tokenPayload.createdAtMs,
    tokenRotatedAt: tokenPayload.createdAt
  };

  await docRef.update(updateData);

  console.log(`[QR-ROTATE] Session ${sessionId} QR Token Rotated:`);
  console.log(`  - Old Token Hash:   ${updateData.previousQrTokenHash}`);
  console.log(`  - New Token Hash:   ${tokenPayload.tokenHash}`);
  console.log(`  - New Expiry (UTC): ${tokenPayload.expiresAt} (${tokenPayload.expiresAtMs})`);
  console.log(`  - Server Time:      ${new Date().toISOString()} (${Date.now()})`);

  const { qrDataUrl, feedbackUrl } = await generateQrDataUrl(sessionId, tokenPayload.token, customBaseUrl);

  return {
    ...session,
    ...updateData,
    qrDataUrl,
    feedbackUrl,
    publicBaseUrl: customBaseUrl || getPublicAppUrl(),
    remainingSeconds: Math.floor((tokenPayload.expiresAtMs - Date.now()) / 1000)
  };
}

/**
 * Starts a 2-minute background interval timer for dynamic QR rotation
 */
function startRotationTimer(sessionId, customBaseUrl) {
  if (activeRotationTimers.has(sessionId)) {
    clearInterval(activeRotationTimers.get(sessionId));
  }

  // Check every 2 seconds for exact timing
  const interval = setInterval(async () => {
    try {
      const db = getDb();
      if (!db) return;
      const doc = await db.collection('feedbackSessions').doc(sessionId).get();
      if (!doc.exists || !doc.data().active) {
        clearInterval(interval);
        activeRotationTimers.delete(sessionId);
        return;
      }

      const session = doc.data();
      const now = Date.now();
      const expiresAt = session.currentQrExpiresAtMs || new Date(session.currentQrExpiresAt).getTime();
      if (now >= expiresAt) {
        console.log(`[AUTO-ROTATE-TIMER] 2 minutes expired for session ${sessionId}. Rotating QR token...`);
        await rotateQrToken(sessionId, customBaseUrl);
      }
    } catch (err) {
      console.error(`[QR Rotation Error for session ${sessionId}]:`, err.message);
    }
  }, 2000);

  activeRotationTimers.set(sessionId, interval);
}

/**
 * Retrieve session state and current QR code
 */
async function getSessionState(sessionId, customBaseUrl) {
  const db = getDb();
  if (!db) throw new Error("Firestore database is not initialized.");

  const doc = await db.collection('feedbackSessions').doc(sessionId.trim()).get();
  if (!doc.exists) {
    throw new Error("Feedback session not found.");
  }

  const session = doc.data();
  const now = Date.now();
  const expiresAt = session.currentQrExpiresAtMs || new Date(session.currentQrExpiresAt).getTime();

  // If active and expired, rotate immediately
  if (session.active && now >= expiresAt) {
    console.log(`[GET-STATE] Session ${sessionId} expired during query. Triggering rotation...`);
    const rotated = await rotateQrToken(sessionId, customBaseUrl);
    if (rotated) return rotated;
  }

  const { qrDataUrl, feedbackUrl } = await generateQrDataUrl(sessionId, session.currentQrToken, customBaseUrl);
  const remainingSeconds = session.active
    ? Math.max(0, Math.floor((expiresAt - now) / 1000))
    : 0;

  return {
    ...session,
    qrDataUrl,
    feedbackUrl,
    publicBaseUrl: customBaseUrl || getPublicAppUrl(),
    remainingSeconds
  };
}

/**
 * Retrieve current active session for teacher
 */
async function getTeacherActiveSession(teacherId, customBaseUrl) {
  const db = getDb();
  if (!db) throw new Error("Firestore database is not initialized.");

  const snapshot = await db.collection('feedbackSessions')
    .where('teacherId', '==', teacherId)
    .where('active', '==', true)
    .limit(1)
    .get();

  if (snapshot.empty) return null;

  const doc = snapshot.docs[0];
  return await getSessionState(doc.id, customBaseUrl);
}

module.exports = {
  getSessionById,
  startSession,
  stopSession,
  rotateQrToken,
  getSessionState,
  getTeacherActiveSession
};
