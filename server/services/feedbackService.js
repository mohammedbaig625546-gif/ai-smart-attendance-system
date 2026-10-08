/**
 * Feedback Service
 * Handles:
 * 1. Initial QR + Geofence scan validation (access gate to course selection)
 * 2. Final submission with full backend revalidation (double validation)
 * 3. Duplicate feedback prevention per student per session/course
 * 4. Analytics and reporting for Teacher Dashboard
 */

const { getDb } = require('../config/firebase');
const { validateGeofence } = require('./geofenceService');
const { validateToken } = require('./qrService');
const { getActiveCourses } = require('./courseService');

/**
 * Validates initial QR scan + Student GPS Geofence
 * Used when student scans the QR code to unlock the course selection form.
 */
async function validateScanAccess({ studentId, sessionId, qrToken, location }) {
  const db = getDb();
  if (!db) throw new Error("Firestore database is not initialized.");

  if (!studentId) {
    return {
      allowed: false,
      error: "Authentication required. Please sign in as a student."
    };
  }

  // 1. Fetch feedback session
  const sessionDoc = await db.collection('feedbackSessions').doc(sessionId).get();
  if (!sessionDoc.exists) {
    return {
      allowed: false,
      error: "Feedback session not found."
    };
  }

  const session = sessionDoc.data();

  // 2. Check whether feedback session is still active
  if (!session.active) {
    return {
      allowed: false,
      error: "This feedback session has ended or is inactive."
    };
  }

  // 3. Validate QR token on the backend & check expiration
  const tokenValidation = validateToken(
    qrToken,
    session.currentQrToken,
    session.currentQrExpiresAtMs || session.currentQrExpiresAt,
    { sessionId, context: 'validateScanAccess' }
  );
  if (!tokenValidation.isValid) {
    return {
      allowed: false,
      error: tokenValidation.error
    };
  }

  // 4. Validate Student GPS Location & Geofence
  const geofenceValidation = validateGeofence(location, {
    latitude: session.latitude,
    longitude: session.longitude,
    radiusMeters: session.radiusMeters
  });

  if (!geofenceValidation.isValid) {
    return {
      allowed: false,
      error: geofenceValidation.error,
      distanceMeters: geofenceValidation.distanceMeters,
      allowedRadiusMeters: geofenceValidation.allowedRadiusMeters
    };
  }

  // Fetch active courses dynamically from database
  const activeCourses = await getActiveCourses();

  return {
    allowed: true,
    sessionId,
    classId: session.classId,
    distanceMeters: geofenceValidation.distanceMeters,
    allowedRadiusMeters: geofenceValidation.allowedRadiusMeters,
    courses: activeCourses
  };
}

/**
 * Final Submission with STRICT REVALIDATION:
 * 1. Student authentication
 * 2. Active feedback session
 * 3. QR token validity
 * 4. QR token expiration
 * 5. Student location
 * 6. Geofence distance
 * 7. Selected course (subjectId)
 * 8. Duplicate submission check
 */
async function submitFeedback({
  studentId,
  studentEmail,
  sessionId,
  qrToken,
  location,
  subjectId,
  rating,
  answers,
  comments
}) {
  const db = getDb();
  if (!db) throw new Error("Firestore database is not initialized.");

  // 1. Student Authentication
  if (!studentId) {
    throw new Error("Student authentication is required.");
  }

  // 2. Active Feedback Session
  const sessionDoc = await db.collection('feedbackSessions').doc(sessionId).get();
  if (!sessionDoc.exists) {
    throw new Error("Feedback session does not exist.");
  }
  const session = sessionDoc.data();
  if (!session.active) {
    throw new Error("This feedback session has already ended.");
  }

  // 3 & 4. QR Token validity and expiration
  const tokenValidation = validateToken(
    qrToken,
    session.currentQrToken,
    session.currentQrExpiresAtMs || session.currentQrExpiresAt,
    { sessionId, context: 'submitFeedback' }
  );
  if (!tokenValidation.isValid) {
    throw new Error(tokenValidation.error);
  }

  // 5 & 6. Student location and geofence distance
  const geofenceValidation = validateGeofence(location, {
    latitude: session.latitude,
    longitude: session.longitude,
    radiusMeters: session.radiusMeters
  });
  if (!geofenceValidation.isValid) {
    throw new Error(geofenceValidation.error);
  }

  // 7. Selected course verification
  if (!subjectId) {
    throw new Error("A valid course / subject must be selected.");
  }
  const courseDoc = await db.collection('courses').doc(subjectId).get();
  if (!courseDoc.exists) {
    throw new Error("Selected course does not exist.");
  }
  const courseData = courseDoc.data();
  if (!courseData.active) {
    throw new Error(`The course "${courseData.name}" has been deactivated and is not accepting feedback.`);
  }

  // 8. Duplicate submission check
  const existingFeedback = await db.collection('feedback')
    .where('sessionId', '==', sessionId)
    .where('studentId', '==', studentId)
    .where('subjectId', '==', subjectId)
    .get();

  if (!existingFeedback.empty) {
    throw new Error(`You have already submitted feedback for ${courseData.name} in this session.`);
  }

  // Validate ratings (1 to 5 stars)
  const numRating = Number(rating);
  if (isNaN(numRating) || numRating < 1 || numRating > 5) {
    throw new Error("Overall rating must be between 1 and 5 stars.");
  }

  const cleanAnswers = answers && typeof answers === 'object' ? answers : {};

  // Store in feedback collection using subjectId
  const feedbackDocRef = db.collection('feedback').doc();
  const feedbackRecord = {
    id: feedbackDocRef.id,
    studentId,
    studentEmail: studentEmail || 'anonymous_student',
    sessionId,
    subjectId,
    courseName: courseData.name, // denormalized for fast display
    rating: numRating,
    answers: {
      teachingClarity: Number(cleanAnswers.teachingClarity) || numRating,
      conceptExplanation: Number(cleanAnswers.conceptExplanation) || numRating,
      practicalExamples: Number(cleanAnswers.practicalExamples) || numRating
    },
    comments: (comments || '').trim(),
    studentLocation: {
      latitude: location.latitude,
      longitude: location.longitude,
      distanceFromClassroomMeters: geofenceValidation.distanceMeters,
      accuracy: location.accuracy || null
    },
    createdAt: new Date().toISOString()
  };

  await feedbackDocRef.set(feedbackRecord);

  return feedbackRecord;
}

/**
 * Calculates real-time analytics for a teacher session or overall course
 */
async function getSessionAnalytics(sessionId) {
  const db = getDb();
  if (!db) throw new Error("Firestore database is not initialized.");

  let feedbackQuery = db.collection('feedback');
  if (sessionId) {
    feedbackQuery = feedbackQuery.where('sessionId', '==', sessionId);
  }

  const snapshot = await feedbackQuery.get();
  const feedbackList = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

  const totalResponses = feedbackList.length;

  // Course-wise aggregation
  const courseMap = {};

  feedbackList.forEach(item => {
    const sId = item.subjectId;
    const name = item.courseName || 'Unknown Course';

    if (!courseMap[sId]) {
      courseMap[sId] = {
        subjectId: sId,
        courseName: name,
        responseCount: 0,
        totalRating: 0,
        averageRating: 0,
        questionAverages: {
          teachingClarity: 0,
          conceptExplanation: 0,
          practicalExamples: 0
        },
        comments: []
      };
    }

    const c = courseMap[sId];
    c.responseCount += 1;
    c.totalRating += item.rating;

    if (item.answers) {
      c.questionAverages.teachingClarity += (item.answers.teachingClarity || 0);
      c.questionAverages.conceptExplanation += (item.answers.conceptExplanation || 0);
      c.questionAverages.practicalExamples += (item.answers.practicalExamples || 0);
    }

    if (item.comments) {
      c.comments.push({
        comment: item.comments,
        rating: item.rating,
        createdAt: item.createdAt
      });
    }
  });

  // Calculate final averages
  const courseBreakdown = Object.values(courseMap).map(c => {
    const count = c.responseCount || 1;
    return {
      subjectId: c.subjectId,
      courseName: c.courseName,
      responseCount: c.responseCount,
      averageRating: Math.round((c.totalRating / count) * 10) / 10,
      questionAverages: {
        teachingClarity: Math.round((c.questionAverages.teachingClarity / count) * 10) / 10,
        conceptExplanation: Math.round((c.questionAverages.conceptExplanation / count) * 10) / 10,
        practicalExamples: Math.round((c.questionAverages.practicalExamples / count) * 10) / 10
      },
      comments: c.comments
    };
  });

  const overallAvg = totalResponses > 0
    ? Math.round((feedbackList.reduce((acc, f) => acc + f.rating, 0) / totalResponses) * 10) / 10
    : 0;

  return {
    sessionId,
    totalResponses,
    overallAverageRating: overallAvg,
    courses: courseBreakdown,
    recentFeedback: feedbackList.slice(-20).reverse()
  };
}

module.exports = {
  validateScanAccess,
  submitFeedback,
  getSessionAnalytics
};
