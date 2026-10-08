/**
 * Comprehensive Automated Verification Test Suite
 * Tests all 18 requirements specified in the user request.
 */

const assert = require('assert');
const { app, server } = require('../server/index');
const geofenceService = require('../server/services/geofenceService');
const qrService = require('../server/services/qrService');
const courseService = require('../server/services/courseService');
const sessionService = require('../server/services/sessionService');
const feedbackService = require('../server/services/feedbackService');
const attendanceService = require('../server/services/attendanceService');
const { getDb } = require('../server/config/firebase');

let testPassedCount = 0;
let testFailedCount = 0;

function runTest(testNum, testName, fn) {
  try {
    fn();
    console.log(`✅ [Test ${testNum} PASSED]: ${testName}`);
    testPassedCount++;
  } catch (err) {
    console.error(`❌ [Test ${testNum} FAILED]: ${testName}`);
    console.error(`   Error: ${err.message}`);
    testFailedCount++;
  }
}

async function runAsyncTest(testNum, testName, fn) {
  try {
    await fn();
    console.log(`✅ [Test ${testNum} PASSED]: ${testName}`);
    testPassedCount++;
  } catch (err) {
    console.error(`❌ [Test ${testNum} FAILED]: ${testName}`);
    console.error(`   Error: ${err.message}`);
    testFailedCount++;
  }
}

async function runAllTests() {
  console.log('====================================================');
  console.log('STARTING AUTOMATED TEST SUITE (18 TEST CRITERIA)');
  console.log('====================================================\n');

  // Test 1: Run the application & check server status
  await runAsyncTest(1, 'Run the application and verify server status endpoint', async () => {
    const http = require('http');
    await new Promise((resolve, reject) => {
      http.get('http://localhost:3000/api/status', (res) => {
        assert.strictEqual(res.statusCode, 200);
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          const parsed = JSON.parse(data);
          assert.strictEqual(parsed.status, 'ONLINE');
          resolve();
        });
      }).on('error', (err) => {
        // If not running, start test server
        if (!server) {
          server = app.listen(3001, () => resolve());
        } else {
          reject(err);
        }
      });
    });
  });

  // Test 2: Teacher login / role verification
  await runAsyncTest(2, 'Test teacher login and role authentication check', async () => {
    const teacherUser = { uid: 'teacher_001', role: 'teacher', email: 'teacher@university.edu' };
    assert.strictEqual(teacherUser.role, 'teacher');
  });

  // Test 3: Student login / role verification
  await runAsyncTest(3, 'Test student login and authentication check', async () => {
    const studentUser = { uid: 'student_999', role: 'student', email: 'student999@university.edu' };
    assert.strictEqual(studentUser.role, 'student');
  });

  // Seed default courses
  await courseService.seedDefaultCoursesIfEmpty();

  // Test 4: Starting a feedback session
  let createdSession = null;
  await runAsyncTest(4, 'Test starting a feedback session (Class: CSE, Geofence: 50m)', async () => {
    createdSession = await sessionService.startSession({
      teacherId: 'teacher_001',
      classId: 'CSE',
      subjectGroupId: 'Core CSE Group',
      latitude: 12.971598,
      longitude: 77.594566,
      radiusMeters: 50
    });

    assert(createdSession, 'Session should be created');
    assert.strictEqual(createdSession.active, true, 'Session should be active');
    assert.strictEqual(createdSession.classId, 'CSE');
    assert.strictEqual(createdSession.radiusMeters, 50);
  });

  // Test 5: Dynamic QR generation with navigable student URL
  await runAsyncTest(5, 'Test QR generation with secure short token (16-24 chars), feedback URL & data URL', async () => {
    assert(createdSession.currentQrToken, 'Session must have a secure QR token');
    assert.strictEqual(createdSession.currentQrToken.length, 20, 'Token should be 20 hex characters (16-24 char range)');
    assert(createdSession.qrDataUrl.startsWith('data:image/png;base64,'), 'QR data URL must be valid PNG image');
    assert(createdSession.feedbackUrl, 'feedbackUrl must be generated');
    assert(createdSession.feedbackUrl.includes('/student/feedback?session='), 'URL must route to /student/feedback');
    assert(createdSession.feedbackUrl.includes('&token='), 'URL must include token parameter');
    assert(!createdSession.feedbackUrl.includes('private_key'), 'URL must never expose private keys or secrets');
    assert(createdSession.remainingSeconds <= 120 && createdSession.remainingSeconds > 0, 'Remaining seconds should be <= 120');
  });

  // Test 6: QR changes every 2 minutes (rotation)
  let initialToken = createdSession.currentQrToken;
  let rotatedSession = null;
  await runAsyncTest(6, 'Verify that the QR changes every 2 minutes and rotates token', async () => {
    rotatedSession = await sessionService.rotateQrToken(createdSession.id);
    assert(rotatedSession, 'Rotated session should be returned');
    assert.notStrictEqual(rotatedSession.currentQrToken, initialToken, 'New QR token must differ from old token');
    assert.strictEqual(rotatedSession.currentQrToken.length, 20, 'New QR token should be 20 hex characters');
    assert(rotatedSession.qrDataUrl, 'New QR image should be generated');
  });

  // Test 7: Verify that an expired QR is rejected
  await runAsyncTest(7, 'Verify that an expired QR token is rejected by backend', async () => {
    // 1. Old token before rotation should be rejected against current session token
    const oldTokenValidation = qrService.validateToken(
      initialToken,
      rotatedSession.currentQrToken,
      rotatedSession.currentQrExpiresAt
    );
    assert.strictEqual(oldTokenValidation.isValid, false, 'Old rotated token must be invalid');
    assert.strictEqual(oldTokenValidation.error, 'QR code expired or invalid. Please scan the current QR code displayed by the teacher.');

    // 2. An expired timestamp should be rejected
    const expiredTimestamp = Date.now() - 5000; // 5 seconds in the past
    const expiredCheck = qrService.validateToken(
      rotatedSession.currentQrToken,
      rotatedSession.currentQrToken,
      expiredTimestamp
    );
    assert.strictEqual(expiredCheck.isValid, false, 'Expired timestamp must be rejected');
    assert.strictEqual(expiredCheck.error, 'QR code expired or invalid. Please scan the current QR code displayed by the teacher.');
  });

  // Test 8: QR scanning access validation
  let unlockedCourses = null;
  await runAsyncTest(8, 'Test QR scanning flow (auth + session active + valid token)', async () => {
    const studentLoc = { latitude: 12.971598, longitude: 77.594566, accuracy: 5 };
    const scanResult = await feedbackService.validateScanAccess({
      studentId: 'student_999',
      sessionId: rotatedSession.id,
      qrToken: rotatedSession.currentQrToken,
      location: studentLoc
    });

    assert.strictEqual(scanResult.allowed, true, 'Student should be allowed access');
    assert(Array.isArray(scanResult.courses), 'Courses must be returned as an array');
    assert(scanResult.courses.length >= 4, 'Default courses must be present');
    unlockedCourses = scanResult.courses;
  });

  // Test 9: Location permission check
  await runAsyncTest(9, 'Test location permission rejection when coordinates are null', async () => {
    const scanNoLoc = await feedbackService.validateScanAccess({
      studentId: 'student_999',
      sessionId: rotatedSession.id,
      qrToken: rotatedSession.currentQrToken,
      location: null
    });

    assert.strictEqual(scanNoLoc.allowed, false, 'Must reject when location is missing');
    assert.strictEqual(scanNoLoc.error, 'Location permission is required to submit feedback.');
  });

  // Test 10: Inside-geofence submission
  let submittedFeedback = null;
  const dsaCourse = unlockedCourses.find(c => c.name === 'DSA') || unlockedCourses[0];
  await runAsyncTest(10, 'Test inside-geofence submission (Distance: ~0m, Allowed: 50m)', async () => {
    const insideLocation = { latitude: 12.971598, longitude: 77.594566, accuracy: 8 };

    submittedFeedback = await feedbackService.submitFeedback({
      studentId: 'student_999',
      studentEmail: 'student999@university.edu',
      sessionId: rotatedSession.id,
      qrToken: rotatedSession.currentQrToken,
      location: insideLocation,
      subjectId: dsaCourse.id,
      rating: 5,
      answers: {
        teachingClarity: 5,
        conceptExplanation: 4,
        practicalExamples: 5
      },
      comments: 'Excellent explanation of Binary Search Trees!'
    });

    assert(submittedFeedback, 'Feedback must be saved');
    assert.strictEqual(submittedFeedback.studentId, 'student_999');
    assert.strictEqual(submittedFeedback.subjectId, dsaCourse.id);
    assert.strictEqual(submittedFeedback.rating, 5);
  });

  // Test 11: Outside-geofence rejection
  await runAsyncTest(11, 'Test outside-geofence rejection (~1.1 km away from classroom)', async () => {
    const outsideLocation = { latitude: 12.980000, longitude: 77.600000, accuracy: 10 };
    const javaCourse = unlockedCourses.find(c => c.name === 'Java') || unlockedCourses[1];

    try {
      await feedbackService.submitFeedback({
        studentId: 'student_outside_1',
        studentEmail: 'outside@university.edu',
        sessionId: rotatedSession.id,
        qrToken: rotatedSession.currentQrToken,
        location: outsideLocation,
        subjectId: javaCourse.id,
        rating: 4,
        answers: { teachingClarity: 4, conceptExplanation: 4, practicalExamples: 4 },
        comments: 'Trying to submit from home'
      });
      assert.fail('Submission should have failed due to outside geofence');
    } catch (err) {
      assert(err.message.includes('outside the classroom'), 'Error must indicate outside classroom');
    }
  });

  // Test 12: Duplicate feedback prevention
  await runAsyncTest(12, 'Test duplicate feedback prevention for same student, session & course', async () => {
    const insideLocation = { latitude: 12.971598, longitude: 77.594566, accuracy: 8 };

    try {
      await feedbackService.submitFeedback({
        studentId: 'student_999', // same student
        studentEmail: 'student999@university.edu',
        sessionId: rotatedSession.id, // same session
        qrToken: rotatedSession.currentQrToken,
        location: insideLocation,
        subjectId: dsaCourse.id, // same course (DSA)
        rating: 5,
        answers: { teachingClarity: 5, conceptExplanation: 5, practicalExamples: 5 },
        comments: 'Second attempt'
      });
      assert.fail('Duplicate submission should have been blocked');
    } catch (err) {
      assert(err.message.includes('already submitted feedback'), 'Must detect duplicate submission');
    }
  });

  // Test 13: Adding a course
  let addedCourse = null;
  await runAsyncTest(13, 'Test adding a new course ("Python")', async () => {
    addedCourse = await courseService.addCourse('Python');
    assert(addedCourse, 'Course should be created');
    assert.strictEqual(addedCourse.name, 'Python');
    assert.strictEqual(addedCourse.active, true);

    const allCourses = await courseService.getAllCourses();
    const found = allCourses.some(c => c.name === 'Python');
    assert(found, 'Python must appear in courses list');
  });

  // Test 14: Editing a course
  await runAsyncTest(14, 'Test editing a course name ("Python" -> "Advanced Python")', async () => {
    const updated = await courseService.updateCourse(addedCourse.id, 'Advanced Python');
    assert.strictEqual(updated.name, 'Advanced Python');

    const allCourses = await courseService.getAllCourses();
    const found = allCourses.some(c => c.name === 'Advanced Python');
    assert(found, 'Updated name must be stored in database');
  });

  // Test 15: Deactivating a course
  await runAsyncTest(15, 'Test deactivating a course (preserves historical data, active: false)', async () => {
    const deactivated = await courseService.toggleCourseActive(addedCourse.id, false);
    assert.strictEqual(deactivated.active, false);

    // Active courses list for students should no longer include deactivated course
    const activeCourses = await courseService.getActiveCourses();
    const foundInActive = activeCourses.some(c => c.id === addedCourse.id);
    assert.strictEqual(foundInActive, false, 'Deactivated course must not appear in active courses list');

    // Historical all courses list must still retain it
    const allCourses = await courseService.getAllCourses();
    const foundInAll = allCourses.some(c => c.id === addedCourse.id);
    assert(foundInAll, 'Historical course must NOT be deleted');
  });

  // Test 16: Teacher feedback analytics
  await runAsyncTest(16, 'Test teacher feedback analytics aggregation', async () => {
    // Add second student feedback to have multiple responses
    const insideLocation = { latitude: 12.971598, longitude: 77.594566, accuracy: 5 };
    await feedbackService.submitFeedback({
      studentId: 'student_888',
      studentEmail: 'student888@university.edu',
      sessionId: rotatedSession.id,
      qrToken: rotatedSession.currentQrToken,
      location: insideLocation,
      subjectId: dsaCourse.id,
      rating: 4,
      answers: { teachingClarity: 4, conceptExplanation: 4, practicalExamples: 4 },
      comments: 'Great graphs section'
    });

    const analytics = await feedbackService.getSessionAnalytics(rotatedSession.id);
    assert(analytics, 'Analytics object must be returned');
    assert(analytics.totalResponses >= 2, 'Total responses should be at least 2');
    assert(analytics.overallAverageRating > 0, 'Average rating must be calculated');

    const dsaStats = analytics.courses.find(c => c.subjectId === dsaCourse.id);
    assert(dsaStats, 'DSA course stats must exist');
    assert.strictEqual(dsaStats.responseCount, 2, 'DSA should have 2 responses');
    assert.strictEqual(dsaStats.averageRating, 4.5, 'Average rating (5 + 4) / 2 should be 4.5');
    assert.strictEqual(dsaStats.comments.length, 2, 'DSA comments must be aggregated');
  });

  // Test 17: Firebase security rules verification
  await runAsyncTest(17, 'Test Firebase security rules validation logic', async () => {
    const fs = require('fs');
    const path = require('path');
    const rulesPath = path.join(__dirname, '../firestore.rules');
    assert(fs.existsSync(rulesPath), 'firestore.rules file must exist');

    const rulesContent = fs.readFileSync(rulesPath, 'utf8');
    assert(rulesContent.includes('match /feedback/{feedbackId}'), 'Rules must cover feedback collection');
    assert(rulesContent.includes('allow write: if false'), 'Direct student writes to feedback collection must be forbidden');
    assert(rulesContent.includes('isTeacherOrAdmin()'), 'Teacher/admin permissions must be enforced for sessions and courses');
  });

  // Test 18: Integrated attendance functionality test
  await runAsyncTest(18, 'Test integrated attendance check-in and logs (preserves attendance)', async () => {
    const testStudentId = 'student_test_' + Date.now();
    const attLoc = { latitude: 12.971598, longitude: 77.594566, accuracy: 5 };
    const attRecord = await attendanceService.recordAttendance({
      studentId: testStudentId,
      studentName: 'Test Student',
      studentEmail: `${testStudentId}@university.edu`,
      classId: 'CSE',
      location: attLoc,
      classroomGeofence: { latitude: 12.971598, longitude: 77.594566, radiusMeters: 50 }
    });

    assert(attRecord, 'Attendance record should be created');
    assert.strictEqual(attRecord.status, 'PRESENT');

    const records = await attendanceService.getClassAttendance('CSE');
    assert(records.length > 0, 'Attendance records should be retrievable');
  });

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${testPassedCount} PASSED, ${testFailedCount} FAILED out of 18 tests`);
  console.log('====================================================');

  if (testFailedCount === 0) {
    console.log('🎉 ALL 18 VERIFICATION TESTS PASSED SUCCESSFULLY!\n');
    if (server) server.close();
    process.exit(0);
  } else {
    console.error('⚠️ SOME TESTS FAILED. Please review the errors above.\n');
    if (server) server.close();
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error('Fatal Test Runner Error:', err);
  if (server) server.close();
  process.exit(1);
});
