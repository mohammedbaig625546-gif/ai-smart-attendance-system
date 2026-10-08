/**
 * Verification of the 5 Specific QR Expiration & Validation Tests
 * Required by user:
 * 
 * Test 1: Generate a new QR. Immediately scan it. Expected: VALID.
 * Test 2: Wait until approximately 1 minute has passed. Scan the same QR. Expected: VALID.
 * Test 3: After 2 minutes, scan the old QR. Expected: EXPIRED.
 * Test 4: After QR rotation, scan the new QR. Expected: VALID.
 * Test 5: Open the QR URL manually immediately after generation. Expected: Student Feedback Portal opens and token is VALID.
 */

const http = require('http');
const assert = require('assert');

const BASE_URL = 'http://localhost:3000';

function httpRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const contentType = res.headers['content-type'] || '';
          if (contentType.includes('application/json')) {
            resolve({ statusCode: res.statusCode, headers: res.headers, body: JSON.parse(data) });
          } else {
            resolve({ statusCode: res.statusCode, headers: res.headers, body: data });
          }
        } catch (e) {
          resolve({ statusCode: res.statusCode, headers: res.headers, body: data });
        }
      });
    });

    req.on('error', reject);

    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('================================================================');
  console.log('STARTING 5-STEP QR VALIDATION AND EXPIRATION SUITE');
  console.log('Rule: Keep exact 2-minute (120s) expiration unchanged.');
  console.log('================================================================\n');

  // Teacher credentials for starting session
  const teacherHeaders = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer demo_token_teacher_admin_1_teacher',
    'X-User-Uid': 'teacher_admin_1',
    'X-User-Email': 'teacher@university.edu',
    'X-User-Role': 'teacher'
  };

  // Student credentials for access validation
  const studentHeaders = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer demo_token_student_test_1_student',
    'X-User-Uid': 'student_test_1',
    'X-User-Email': 'student_test_1@university.edu',
    'X-User-Role': 'student'
  };

  const classroomLat = 12.971598;
  const classroomLon = 77.594566;

  console.log('--- Step 0: Initializing Feedback Session ---');
  const startRes = await httpRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/sessions/start',
    method: 'POST',
    headers: teacherHeaders
  }, {
    classId: 'CSE',
    subjectGroupId: 'Core CSE Subjects',
    latitude: classroomLat,
    longitude: classroomLon,
    radiusMeters: 50
  });

  assert.strictEqual(startRes.statusCode, 201, `Failed to start session: ${JSON.stringify(startRes.body)}`);
  assert(startRes.body.success, 'Session creation failed');

  const session = startRes.body.session;
  const sessionId = session.id;
  const initialToken = session.currentQrToken;
  const initialFeedbackUrl = session.feedbackUrl;

  console.log(`[SESSION CREATED] ID: ${sessionId}`);
  console.log(`[INITIAL TOKEN]  ${initialToken.substring(0, 16)}...`);
  console.log(`[FEEDBACK URL]   ${initialFeedbackUrl}`);
  console.log(`[CREATED AT]     ${session.startedAt}`);
  console.log(`[EXPIRES AT]     ${session.currentQrExpiresAt}\n`);

  // =================================================================
  // TEST 1: Generate a new QR. Immediately scan it. Expected: VALID.
  // =================================================================
  console.log('----------------------------------------------------------------');
  console.log('TEST 1: Generate a new QR. Immediately scan it.');
  console.log('Expected: VALID');
  console.log('----------------------------------------------------------------');

  const verify1 = await httpRequest({
    hostname: 'localhost',
    port: 3000,
    path: `/api/sessions/${encodeURIComponent(sessionId)}/verify-token?token=${encodeURIComponent(initialToken)}`,
    method: 'GET'
  });

  console.log('Test 1 /verify-token response:', verify1.statusCode, verify1.body);
  assert.strictEqual(verify1.statusCode, 200, 'Immediate scan should return HTTP 200');
  assert.strictEqual(verify1.body.success, true, 'Immediate scan should be successful');
  assert(verify1.body.remainingSeconds >= 115, `Remaining time should be near 120s, got ${verify1.body.remainingSeconds}`);

  // Also verify through student validate-access endpoint
  const access1 = await httpRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/feedback/validate-access',
    method: 'POST',
    headers: studentHeaders
  }, {
    sessionId,
    qrToken: initialToken,
    location: { latitude: classroomLat, longitude: classroomLon, accuracy: 5 }
  });

  console.log('Test 1 /validate-access response:', access1.statusCode, access1.body.success);
  assert.strictEqual(access1.statusCode, 200);
  assert.strictEqual(access1.body.success, true);
  assert(Array.isArray(access1.body.data.courses), 'Should return active courses');
  console.log('>>> TEST 1 RESULT: PASSED (VALID)\n');

  // =================================================================
  // TEST 2: Wait until approximately 1 minute has passed. Scan same QR.
  // Expected: VALID.
  // =================================================================
  console.log('----------------------------------------------------------------');
  console.log('TEST 2: Wait until approximately 1 minute has passed (60s).');
  console.log('Scan the SAME QR code.');
  console.log('Expected: VALID');
  console.log('----------------------------------------------------------------');
  console.log('Waiting 60 seconds (progress update every 10s)...');

  for (let s = 10; s <= 60; s += 10) {
    await sleep(10000);
    console.log(`  ... ${s}s elapsed out of 60s`);
  }

  const verify2 = await httpRequest({
    hostname: 'localhost',
    port: 3000,
    path: `/api/sessions/${encodeURIComponent(sessionId)}/verify-token?token=${encodeURIComponent(initialToken)}`,
    method: 'GET'
  });

  console.log('Test 2 /verify-token response:', verify2.statusCode, verify2.body);
  assert.strictEqual(verify2.statusCode, 200, 'Scan at ~1 min should return HTTP 200');
  assert.strictEqual(verify2.body.success, true, 'Scan at ~1 min should be valid');
  assert(verify2.body.remainingSeconds > 0 && verify2.body.remainingSeconds <= 65,
    `Remaining time should be ~55-60s, got ${verify2.body.remainingSeconds}`);

  const access2 = await httpRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/feedback/validate-access',
    method: 'POST',
    headers: studentHeaders
  }, {
    sessionId,
    qrToken: initialToken,
    location: { latitude: classroomLat, longitude: classroomLon, accuracy: 5 }
  });

  assert.strictEqual(access2.statusCode, 200);
  assert.strictEqual(access2.body.success, true);
  console.log('>>> TEST 2 RESULT: PASSED (VALID)\n');

  // =================================================================
  // TEST 3: After 2 minutes, scan the old QR. Expected: EXPIRED.
  // =================================================================
  console.log('----------------------------------------------------------------');
  console.log('TEST 3: Wait until 2 minutes (120s total) have elapsed.');
  console.log('Scan the OLD initial QR code.');
  console.log('Expected: EXPIRED');
  console.log('----------------------------------------------------------------');
  console.log('Waiting another 63 seconds so total elapsed time > 120s...');

  for (let s = 10; s <= 60; s += 10) {
    await sleep(10000);
    console.log(`  ... +${s}s elapsed`);
  }
  await sleep(3000); // 63s total
  console.log('Total time elapsed since session start is now > 123 seconds (surpassing 2-min limit).');

  const verify3 = await httpRequest({
    hostname: 'localhost',
    port: 3000,
    path: `/api/sessions/${encodeURIComponent(sessionId)}/verify-token?token=${encodeURIComponent(initialToken)}`,
    method: 'GET'
  });

  console.log('Test 3 /verify-token response:', verify3.statusCode, verify3.body);
  assert.strictEqual(verify3.statusCode, 400, 'Old QR scan after 2 minutes must be rejected with HTTP 400');
  assert.strictEqual(verify3.body.success, false, 'Old QR scan must return success: false');
  assert(verify3.body.error.includes('expired or invalid'), `Error message must indicate expiration, got: ${verify3.body.error}`);

  const access3 = await httpRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/feedback/validate-access',
    method: 'POST',
    headers: studentHeaders
  }, {
    sessionId,
    qrToken: initialToken,
    location: { latitude: classroomLat, longitude: classroomLon, accuracy: 5 }
  });

  console.log('Test 3 /validate-access response:', access3.statusCode, access3.body);
  assert(access3.statusCode === 403 || access3.statusCode === 400, `Expected 403 or 400, got ${access3.statusCode}`);
  assert.strictEqual(access3.body.success, false);
  assert(access3.body.error.includes('expired or invalid'));
  console.log('>>> TEST 3 RESULT: PASSED (EXPIRED)\n');

  // =================================================================
  // TEST 4: After QR rotation, scan the new QR. Expected: VALID.
  // =================================================================
  console.log('----------------------------------------------------------------');
  console.log('TEST 4: After QR rotation, scan the new QR.');
  console.log('Expected: VALID');
  console.log('----------------------------------------------------------------');

  // Fetch updated session state to obtain rotated token
  const stateRes = await httpRequest({
    hostname: 'localhost',
    port: 3000,
    path: `/api/sessions/${encodeURIComponent(sessionId)}`,
    method: 'GET'
  });

  assert.strictEqual(stateRes.statusCode, 200);
  const updatedSession = stateRes.body.session;
  const newRotatedToken = updatedSession.currentQrToken;

  console.log(`[OLD TOKEN]     ${initialToken.substring(0, 16)}...`);
  console.log(`[NEW TOKEN]     ${newRotatedToken.substring(0, 16)}...`);
  assert.notStrictEqual(newRotatedToken, initialToken, 'New token must be different from old initial token');

  const verify4 = await httpRequest({
    hostname: 'localhost',
    port: 3000,
    path: `/api/sessions/${encodeURIComponent(sessionId)}/verify-token?token=${encodeURIComponent(newRotatedToken)}`,
    method: 'GET'
  });

  console.log('Test 4 /verify-token response:', verify4.statusCode, verify4.body);
  assert.strictEqual(verify4.statusCode, 200, 'Rotated new QR must return HTTP 200');
  assert.strictEqual(verify4.body.success, true, 'Rotated new QR must be valid');
  assert(verify4.body.remainingSeconds > 0, 'Rotated token must have remaining lifetime');

  const access4 = await httpRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/feedback/validate-access',
    method: 'POST',
    headers: studentHeaders
  }, {
    sessionId,
    qrToken: newRotatedToken,
    location: { latitude: classroomLat, longitude: classroomLon, accuracy: 5 }
  });

  assert.strictEqual(access4.statusCode, 200);
  assert.strictEqual(access4.body.success, true);
  console.log('>>> TEST 4 RESULT: PASSED (VALID)\n');

  // =================================================================
  // TEST 5: Open the QR URL manually immediately after generation.
  // Expected: Student Feedback Portal opens and token is VALID.
  // =================================================================
  console.log('----------------------------------------------------------------');
  console.log('TEST 5: Open the QR URL manually immediately after generation.');
  console.log('Expected: Student Feedback Portal opens and token is VALID.');
  console.log('----------------------------------------------------------------');

  // Start a fresh session to get a newly generated QR URL
  const freshSessionRes = await httpRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/sessions/start',
    method: 'POST',
    headers: teacherHeaders
  }, {
    classId: 'CSE',
    subjectGroupId: 'Core CSE Subjects',
    latitude: classroomLat,
    longitude: classroomLon,
    radiusMeters: 50
  });

  const freshSession = freshSessionRes.body.session;
  const qrUrlString = freshSession.feedbackUrl;
  console.log(`Fresh QR URL generated: ${qrUrlString}`);

  // Parse the QR URL
  const parsedUrl = new URL(qrUrlString);
  const portalPath = parsedUrl.pathname + parsedUrl.search;
  const urlSessionParam = parsedUrl.searchParams.get('session');
  const urlTokenParam = parsedUrl.searchParams.get('token');

  console.log(`HTTP GET to: ${portalPath}`);
  console.log(`URL session param: ${urlSessionParam}`);
  console.log(`URL token param:   ${urlTokenParam.substring(0, 16)}...`);

  // 1. Check that the portal page loads (HTTP GET /student/feedback?...)
  const pageRes = await httpRequest({
    hostname: 'localhost',
    port: 3000,
    path: portalPath,
    method: 'GET'
  });

  assert.strictEqual(pageRes.statusCode, 200, 'Student Feedback Portal route should return HTTP 200');
  assert(typeof pageRes.body === 'string', 'Portal route should return HTML string');
  assert(pageRes.body.includes('Student Feedback Portal'), 'HTML should contain "Student Feedback Portal"');
  assert(pageRes.body.includes('validateQrTokenInitially'), 'HTML should contain verification logic');

  // 2. Validate token read from URL with the backend
  const verify5 = await httpRequest({
    hostname: 'localhost',
    port: 3000,
    path: `/api/sessions/${encodeURIComponent(urlSessionParam)}/verify-token?token=${encodeURIComponent(urlTokenParam)}`,
    method: 'GET'
  });

  console.log('Test 5 token validation response:', verify5.statusCode, verify5.body);
  assert.strictEqual(verify5.statusCode, 200, 'Token from fresh QR URL must be HTTP 200');
  assert.strictEqual(verify5.body.success, true, 'Token from fresh QR URL must be VALID');
  assert(verify5.body.remainingSeconds >= 115, 'Token from fresh QR URL must have full ~2m remaining');

  console.log('>>> TEST 5 RESULT: PASSED (Student Feedback Portal opens and token is VALID)\n');

  console.log('================================================================');
  console.log('🎉 ALL 5 TESTS COMPLETED AND PASSED PERFECTLY!');
  console.log('  Test 1 (Immediate scan): VALID ✅');
  console.log('  Test 2 (~1 minute scan): VALID ✅');
  console.log('  Test 3 (2 minutes scan): EXPIRED ✅');
  console.log('  Test 4 (Rotated scan):   VALID ✅');
  console.log('  Test 5 (Manual QR URL):  OPENS & VALID ✅');
  console.log('================================================================');
}

runTests().catch(err => {
  console.error('\n❌ TEST SUITE FAILED WITH ERROR:', err);
  process.exit(1);
});
