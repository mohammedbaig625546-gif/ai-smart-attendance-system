/**
 * Attendance Service
 * Preserves and extends attendance management functionality.
 * Allows teachers to conduct attendance sessions with classroom geofencing
 * and logs attendance records in Firestore.
 */

const { getDb } = require('../config/firebase');
const { validateGeofence } = require('./geofenceService');

/**
 * Record student attendance check-in
 */
async function recordAttendance({ studentId, studentName, studentEmail, classId, location, classroomGeofence }) {
  const db = getDb();
  if (!db) throw new Error("Firestore database is not initialized.");

  if (!studentId) {
    throw new Error("Student authentication required for attendance.");
  }

  // Validate geofence if classroom coordinates are configured
  if (classroomGeofence && classroomGeofence.latitude && classroomGeofence.longitude) {
    const geoCheck = validateGeofence(location, classroomGeofence);
    if (!geoCheck.isValid) {
      throw new Error(`Attendance rejected: ${geoCheck.error}`);
    }
  }

  // Today's date string YYYY-MM-DD
  const today = new Date().toISOString().split('T')[0];

  // Prevent duplicate check-in on the same day for this class
  const existing = await db.collection('attendance')
    .where('studentId', '==', studentId)
    .where('classId', '==', classId)
    .where('date', '==', today)
    .get();

  if (!existing.empty) {
    throw new Error(`Attendance already recorded for today (${today}).`);
  }

  const docRef = db.collection('attendance').doc();
  const attendanceRecord = {
    id: docRef.id,
    studentId,
    studentName: studentName || 'Student',
    studentEmail: studentEmail || '',
    classId: classId || 'CSE',
    date: today,
    status: 'PRESENT',
    timestamp: new Date().toISOString(),
    location: location ? {
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy || null
    } : null
  };

  await docRef.set(attendanceRecord);
  return attendanceRecord;
}

/**
 * Get attendance records for a specific class and date
 */
async function getClassAttendance(classId, date) {
  const db = getDb();
  if (!db) throw new Error("Firestore database is not initialized.");

  let query = db.collection('attendance');
  if (classId) {
    query = query.where('classId', '==', classId);
  }
  if (date) {
    query = query.where('date', '==', date);
  }

  const snapshot = await query.orderBy('timestamp', 'desc').get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

module.exports = {
  recordAttendance,
  getClassAttendance
};
